// ============================================================================
// Edge Function : enroll_face
// ----------------------------------------------------------------------------
// Enrôle la photo de référence du POSEUR. On stocke le CHEMIN Storage de la photo
// (face_ref_path) : elle sert au modèle de vision, à chaque mise, pour confirmer
// que c'est bien le poseur sur la photo (comparaison faciale Image de réf ↔
// photo de mise).
//
// Optionnel : si un service de reconnaissance faciale (FACE_API) est configuré,
// on calcule aussi une empreinte (vector 128) stockée via set_face_reference —
// utile pour d'autres contrôles. La vérification du poseur ne dépend PAS de cet
// embedding (elle est faite par le modèle de vision côté submit_session).
//
// Env requis : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.
// Env optionnel : FACE_API_URL, FACE_API_KEY.
//
// Déploiement : supabase functions deploy enroll_face
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

type Body = { photo_path: string };

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const { photo_path } = (await req.json()) as Body;
    if (!photo_path) return json({ ok: false, reason: "photo_path_required" }, 400);

    const asUser = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: u } = await asUser.auth.getUser();
    if (!u.user) return json({ ok: false, reason: "not_authenticated" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // La photo de référence doit exister et être lisible.
    const { data: file, error: dlErr } = await admin.storage.from("mivtza-proofs").download(photo_path);
    if (dlErr || !file) return json({ ok: false, reason: "reference_not_found" }, 422);

    // Stocke le chemin de la photo de référence + marque l'enrôlement fait.
    const { error: upErr } = await admin.from("profiles")
      .update({ face_ref_path: photo_path, face_enrolled: true })
      .eq("id", u.user.id);
    if (upErr) return json({ ok: false, reason: upErr.message }, 500);

    // Optionnel : empreinte faciale via un service dédié (n'échoue pas la mise).
    const embedding = await faceEmbedding(file);
    if (embedding) {
      // pgvector attend la forme texte "[...]" via PostgREST (pas un tableau JSON).
      await asUser.rpc("set_face_reference", { embedding: "[" + embedding.join(",") + "]" });
    }

    return json({ ok: true, embedding_stored: !!embedding });
  } catch (e) {
    return json({ ok: false, reason: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
}

// Empreinte faciale du poseur via un service de reconnaissance dédié (FACE_API).
// Renvoie null s'il n'est pas configuré : l'enrôlement reste valide (le modèle de
// vision fait la comparaison à partir de la photo de référence).
async function faceEmbedding(file: Blob | null): Promise<number[] | null> {
  const url = Deno.env.get("FACE_API_URL");
  if (!url || !file) return null;
  try {
    const b64 = encodeBase64(new Uint8Array(await file.arrayBuffer()));
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(Deno.env.get("FACE_API_KEY") ? { authorization: `Bearer ${Deno.env.get("FACE_API_KEY")}` } : {}),
      },
      body: JSON.stringify({ image: b64, target: "poseur" }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const vec = data.embedding ?? data.poseur_embedding;
    return Array.isArray(vec) ? vec : null;
  } catch {
    return null;
  }
}
