// ============================================================================
// Edge Function : stripe_webhook
// ----------------------------------------------------------------------------
// Reçoit les événements Stripe et fait avancer le don (money_donations) :
//   payment_intent.succeeded        -> 'succeeded'  (compte pour le maasser)
//   payment_intent.payment_failed   -> 'failed'
//   charge.refunded / *.canceled    -> 'refunded'
//
// La signature est vérifiée avec STRIPE_WEBHOOK_SECRET (obligatoire). Cette
// fonction est appelée par Stripe, PAS par l'app -> `verify_jwt = false`
// (voir supabase/config.toml). On utilise le service role pour l'écriture.
//
// Secrets requis : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
// Déploiement : supabase functions deploy stripe_webhook --no-verify-jwt
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@16?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!sig || !secret) return new Response("missing_signature", { status: 400 });

  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, sig, secret, undefined, cryptoProvider);
  } catch (e) {
    console.error("stripe_webhook signature error:", e);
    return new Response("invalid_signature", { status: 400 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const setStatus = async (paymentIntentId: string, status: string) => {
    await admin.from("money_donations").update({ status }).eq("provider_ref", paymentIntentId);
  };

  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await setStatus((event.data.object as Stripe.PaymentIntent).id, "succeeded");
        break;
      case "payment_intent.payment_failed":
        await setStatus((event.data.object as Stripe.PaymentIntent).id, "failed");
        break;
      case "payment_intent.canceled":
        await setStatus((event.data.object as Stripe.PaymentIntent).id, "refunded");
        break;
      case "charge.refunded": {
        const pi = (event.data.object as Stripe.Charge).payment_intent;
        if (pi) await setStatus(typeof pi === "string" ? pi : pi.id, "refunded");
        break;
      }
      default:
        break; // événements non gérés : accusé de réception sans action
    }
  } catch (e) {
    console.error("stripe_webhook handler error:", e);
    return new Response("handler_error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { "content-type": "application/json" },
  });
});
