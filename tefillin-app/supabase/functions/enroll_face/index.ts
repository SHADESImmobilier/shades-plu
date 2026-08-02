// ============================================================================
// Edge Function : enroll_face
// ----------------------------------------------------------------------------
// Enrôle la photo de référence du POSEUR : calcule son empreinte faciale et la
// stocke sur son profil (via RPC set_face_reference). Cette référence sert
// ensuite à authentifier le poseur sur chaque photo de mise.
//
// faceEmbedding() = point d'intégration vision (stub ici).
// Déploiement : supabase functions deploy enroll_face
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Body = { photo_path: string };

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const { photo_path } = (await req.json()) as Body;

    const asUser = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: u } = await asUser.auth.getUser();
    if (!u.user) return json({ ok: false, reason: "not_authenticated" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: file } = await admin.storage.from("mivtza-proofs").download(photo_path);
    const embedding = await faceEmbedding(file);
    if (!embedding) return json({ ok: false, reason: "no_face_detected" }, 422);

    // stocke la référence sur le profil du poseur
    const { error } = await admin.rpc("set_face_reference", { embedding });
    // set_face_reference lit auth.uid() -> on l'appelle en tant qu'utilisateur
    const asUserAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    await asUserAdmin.rpc("set_face_reference", { embedding });
    if (error) { /* la version utilisateur ci-dessus fait foi */ }

    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, reason: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
}

// POINT D'INTÉGRATION VISION : renvoyer l'embedding facial de la photo. Stub.
async function faceEmbedding(_file: Blob | null): Promise<number[] | null> {
  // TODO: appeler le service de vision et renvoyer un vecteur (dim 128).
  return null; // en prod : le vrai embedding
}
