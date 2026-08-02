// ============================================================================
// Edge Function : create_donation
// ----------------------------------------------------------------------------
// Crée un don en argent réel via Stripe (Apple Pay / Google Pay / carte).
// Renvoie le client_secret d'un PaymentIntent que l'app confirme avec le
// PaymentSheet natif (@stripe/stripe-react-native).
//
// Stripe Connect : les fonds vont directement sur le compte de l'association
// (transfer_data.destination) ; MitzvaNOW peut prélever une commission
// optionnelle (application_fee_amount). Si l'asso n'a pas de compte Connect,
// on encaisse sur le compte plateforme (ex. "donner à MitzvaNOW").
//
// Secrets requis : STRIPE_SECRET_KEY.
// Le webhook Stripe (fonction séparée) passera le don à 'succeeded'.
//
// Déploiement : supabase functions deploy create_donation
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PLATFORM_FEE_BPS = 0; // commission plateforme en points de base (0 = aucune)

type Body = {
  tsedaka_id: string;
  amount_cents: number;
  is_anonymous?: boolean;
  is_maaser?: boolean;
  recurring?: "daily" | "weekly" | "pre_shabbat" | null;
};

Deno.serve(async (req) => {
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const body = (await req.json()) as Body;
    if (!body.amount_cents || body.amount_cents < 50) {
      return json({ ok: false, reason: "amount_too_low" }, 400);
    }

    // Client "utilisateur" pour identifier le donateur (respecte la RLS).
    const asUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: u } = await asUser.auth.getUser();
    if (!u.user) return json({ ok: false, reason: "not_authenticated" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: asso } = await admin
      .from("tsedakot")
      .select("id, accepts_donations, stripe_account_id")
      .eq("id", body.tsedaka_id).single();
    if (!asso?.accepts_donations) return json({ ok: false, reason: "asso_unavailable" }, 400);

    // 1) enregistrer le don en 'created'
    const { data: donation } = await admin.from("money_donations").insert({
      user_id: u.user.id, tsedaka_id: body.tsedaka_id,
      amount_cents: body.amount_cents, is_anonymous: !!body.is_anonymous,
      is_maaser: body.is_maaser ?? true, recurring: body.recurring ?? null,
      provider: "stripe", status: "created",
    }).select("id").single();

    // 2) créer le PaymentIntent Stripe (Apple Pay/Google Pay/carte via PaymentSheet)
    const params = new URLSearchParams();
    params.set("amount", String(body.amount_cents));
    params.set("currency", "eur");
    params.set("automatic_payment_methods[enabled]", "true");
    params.set("metadata[donation_id]", donation!.id);
    params.set("metadata[user_id]", u.user.id);
    // Stripe Connect : router les fonds vers l'association si elle a un compte
    if (asso.stripe_account_id) {
      params.set("transfer_data[destination]", asso.stripe_account_id);
      if (PLATFORM_FEE_BPS > 0) {
        params.set("application_fee_amount",
          String(Math.floor((body.amount_cents * PLATFORM_FEE_BPS) / 10000)));
      }
    }

    const resp = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    const pi = await resp.json();
    if (!resp.ok) return json({ ok: false, reason: pi.error?.message ?? "stripe_error" }, 502);

    await admin.from("money_donations")
      .update({ provider_ref: pi.id }).eq("id", donation!.id);

    return json({ ok: true, client_secret: pi.client_secret, donation_id: donation!.id });
  } catch (e) {
    return json({ ok: false, reason: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
}
