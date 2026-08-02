import { useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert, Image, ActivityIndicator } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { deviceFingerprint } from "@/lib/identity";
import { colors } from "@/lib/theme";

type Phase = "consent" | "camera" | "preview" | "sending" | "done";

// Côté POSEUR : preuve d'une mise par SELFIE LIVE (poseur + posé, tefillin
// tête + bras). Capture in-app uniquement — pas d'import galerie. La photo part
// au serveur (vision + reconnaissance faciale anti-farming + score de risque).
export default function Capture() {
  const [perm, requestPerm] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>("consent");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const cam = useRef<CameraView>(null);
  const router = useRouter();
  const { request_id, mode } = useLocalSearchParams<{ request_id?: string; mode?: string }>();
  const isEnroll = mode === "enroll";

  async function startCamera() {
    if (!perm?.granted) {
      const r = await requestPerm();
      if (!r.granted) return Alert.alert("Caméra requise");
    }
    setPhase("camera");
  }

  async function take() {
    const shot = await cam.current?.takePictureAsync({ quality: 0.6, skipProcessing: false });
    if (shot?.uri) { setPhotoUri(shot.uri); setPhase("preview"); }
  }

  async function submit() {
    if (!photoUri) return;
    setPhase("sending");
    try {
      const b64all = await FileSystem.readAsStringAsync(photoUri, { encoding: "base64" });

      // --- Mode ENRÔLEMENT : photo de référence du visage du poseur ----------
      if (isEnroll) {
        const { data: u } = await supabase.auth.getUser();
        const path = `faces/${u.user?.id}.jpg`;
        const { error: eu } = await supabase.storage.from("mivtza-proofs")
          .upload(path, decode(b64all), { contentType: "image/jpeg", upsert: true });
        if (eu) throw eu;
        const { data, error } = await supabase.functions.invoke("enroll_face", { body: { photo_path: path } });
        if (error) throw error;
        setResult(data?.ok
          ? "Visage enregistré ✓ Vous pouvez désormais valider vos mises."
          : `Échec : ${data?.reason ?? "aucun visage détecté"}`);
        setPhase("done");
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") throw new Error("Localisation requise.");
      const loc = await Location.getCurrentPositionAsync({});

      // 1) ouvrir la session (poseur)
      const { data: s, error: e1 } = await supabase.rpc("create_session", {
        lat: loc.coords.latitude, lng: loc.coords.longitude,
        request_id: request_id ?? null,
      });
      if (e1) throw e1;
      const sessionId = (Array.isArray(s) ? s[0] : s).session_id;

      // 2) uploader la photo (capture live) dans Storage
      const b64 = await FileSystem.readAsStringAsync(photoUri, { encoding: "base64" });
      const path = `sessions/${sessionId}.jpg`;
      const { error: e2 } = await supabase.storage.from("mivtza-proofs")
        .upload(path, decode(b64), { contentType: "image/jpeg", upsert: true });
      if (e2) throw e2;

      // 3) soumettre pour analyse (vision + reconnaissance faciale + score)
      const fp = await deviceFingerprint();
      const { data, error: e3 } = await supabase.functions.invoke("submit_session", {
        body: {
          session_id: sessionId, photo_path: path,
          lat: loc.coords.latitude, lng: loc.coords.longitude,
          poseur_device: fp, consent: true,
        },
      });
      if (e3) throw e3;

      setResult(
        data?.status === "confirmed" ? "Mise enregistrée ! Récompense en attente de validation 🙏"
        : data?.status === "under_review" ? "Reçu — en cours de vérification par notre équipe."
        : `Refusée : ${data?.reason ?? "scène non conforme"}`,
      );
      setPhase("done");
    } catch (err: any) {
      Alert.alert("Erreur", err.message ?? String(err));
      setPhase("preview");
    }
  }

  // ---- écrans ----
  if (phase === "consent") {
    return (
      <View style={styles.c}>
        <Text style={styles.h}>{isEnroll ? "Vérifier mon visage" : "Photo de la mise"}</Text>
        {isEnroll ? (
          <>
            <Text style={styles.p}>
              Prenez un <Text style={styles.b}>selfie de référence</Text>. Il sert à confirmer
              que c'est bien <Text style={styles.b}>vous</Text> sur chaque photo de mise.
            </Text>
            <View style={styles.notice}>
              <Text style={styles.noticeT}>
                🔒 Empreinte faciale conservée uniquement pour l'anti-fraude. Vous pouvez la
                supprimer à tout moment.
              </Text>
            </View>
            <Pressable style={styles.cta} onPress={startCamera}>
              <Text style={styles.ctaT}>Prendre mon selfie de référence</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.p}>
              Prenez une photo <Text style={styles.b}>en direct</Text> : les tefillin
              (<Text style={styles.b}>tête et bras</Text>) sur le <Text style={styles.b}>posé</Text>,
              et <Text style={styles.b}>vous</Text> (le poseur) visible sur la même photo.
            </Text>
            <View style={styles.notice}>
              <Text style={styles.noticeT}>
                🔒 Le posé accepte d'être pris en photo. Votre visage est comparé à votre profil,
                et un posé ne peut être validé qu'une fois par jour. Anti-fraude uniquement.
              </Text>
            </View>
            <Pressable style={styles.cta} onPress={startCamera}>
              <Text style={styles.ctaT}>Le posé est d'accord · ouvrir l'appareil photo</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  if (phase === "camera") {
    return (
      <View style={{ flex: 1 }}>
        <CameraView ref={cam} style={{ flex: 1 }} facing={isEnroll ? "front" : "back"} />
        <View style={styles.guide}><Text style={styles.guideT}>
          {isEnroll ? "Cadrez bien votre visage" : "Posé avec tefillin (tête & bras) + vous, poseur"}
        </Text></View>
        <Pressable style={styles.shutter} onPress={take} />
      </View>
    );
  }

  if (phase === "preview" && photoUri) {
    return (
      <View style={styles.c}>
        <Image source={{ uri: photoUri }} style={styles.preview} />
        <Pressable style={styles.cta} onPress={submit}><Text style={styles.ctaT}>Envoyer</Text></Pressable>
        <Pressable style={styles.again} onPress={() => setPhase("camera")}><Text style={styles.againT}>Reprendre</Text></Pressable>
      </View>
    );
  }

  if (phase === "sending") {
    return <View style={styles.c}><ActivityIndicator color={colors.primary} /><Text style={styles.p}>Analyse en cours…</Text></View>;
  }

  return <View style={styles.c}><Text style={styles.h}>{result}</Text>
    <Pressable style={styles.cta} onPress={() => router.replace("/(tabs)")}><Text style={styles.ctaT}>Terminer</Text></Pressable></View>;
}

// base64 -> Uint8Array (upload Storage)
function decode(b64: string): Uint8Array {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const len = b64.length;
  let bufLen = len * 0.75;
  if (b64[len - 1] === "=") bufLen--;
  if (b64[len - 2] === "=") bufLen--;
  const bytes = new Uint8Array(bufLen);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e1 = lookup[b64.charCodeAt(i)], e2 = lookup[b64.charCodeAt(i + 1)];
    const e3 = lookup[b64.charCodeAt(i + 2)], e4 = lookup[b64.charCodeAt(i + 3)];
    bytes[p++] = (e1 << 2) | (e2 >> 4);
    if (p < bufLen) bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (p < bufLen) bytes[p++] = ((e3 & 3) << 6) | (e4 & 63);
  }
  return bytes;
}

const styles = StyleSheet.create({
  c: { flex: 1, padding: 24, justifyContent: "center", backgroundColor: colors.bg },
  h: { color: colors.text, fontSize: 22, fontWeight: "800", textAlign: "center" },
  p: { color: colors.muted, textAlign: "center", marginTop: 12, fontSize: 15, lineHeight: 22 },
  b: { color: colors.text, fontWeight: "700" },
  notice: { backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: 14, marginVertical: 24 },
  noticeT: { color: colors.primaryDark, fontSize: 13, lineHeight: 19 },
  cta: { backgroundColor: colors.primary, borderRadius: 13, padding: 16, alignItems: "center", marginTop: 8 },
  ctaT: { color: colors.onPrimary, fontWeight: "700", fontSize: 15, textAlign: "center" },
  again: { padding: 14, alignItems: "center" },
  againT: { color: colors.primary, fontWeight: "600" },
  preview: { width: "100%", aspectRatio: 3 / 4, borderRadius: 16, marginBottom: 16 },
  guide: { position: "absolute", top: 60, left: 20, right: 20, alignItems: "center" },
  guideT: { color: "#fff", backgroundColor: "rgba(0,0,0,.6)", padding: 12, borderRadius: 10, textAlign: "center" },
  shutter: { position: "absolute", bottom: 40, alignSelf: "center", width: 74, height: 74, borderRadius: 37, backgroundColor: "#fff", borderWidth: 5, borderColor: colors.primary },
});
