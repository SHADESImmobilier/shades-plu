import { useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { supabase } from "@/lib/supabase";
import { deviceFingerprint, phoneHash } from "@/lib/identity";

// Écran de validation (double confirmation à proximité).
// Côté BÉNÉFICIAIRE : scanne le QR affiché par le poseur -> appelle l'Edge
// Function validate_session, qui vérifie co-présence + score de risque.
export default function Validate() {
  const [perm, requestPerm] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function onScan({ data: token }: { data: string }) {
    if (busy || done) return;
    setBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") throw new Error("Localisation requise pour prouver la présence.");
      const loc = await Location.getCurrentPositionAsync({});

      // Identifiants anti-fraude réels : empreinte appareil + hash du numéro
      // vérifié du bénéficiaire (récupéré de sa session auth).
      const { data: auth } = await supabase.auth.getUser();
      const fp = await deviceFingerprint();
      const ph = await phoneHash(auth.user?.phone ?? "");

      const { data, error } = await supabase.functions.invoke("validate_session", {
        body: {
          token,
          beneficiary_lat: loc.coords.latitude,
          beneficiary_lng: loc.coords.longitude,
          device_fingerprint: fp,
          beneficiary_phone_hash: ph,
        },
      });
      if (error) throw error;
      setDone(data?.ok ? "Mise confirmée ! Yasher koach 🙏" : `Refusée : ${data?.reason ?? data?.status}`);
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!perm?.granted) {
    return (
      <View style={styles.c}>
        <Text style={styles.t}>Autorisez la caméra pour scanner le QR de confirmation.</Text>
        <Pressable style={styles.btn} onPress={requestPerm}><Text style={styles.btnT}>Autoriser</Text></Pressable>
      </View>
    );
  }

  if (done) {
    return <View style={styles.c}><Text style={styles.t}>{done}</Text></View>;
  }

  return (
    <View style={{ flex: 1 }}>
      <CameraView
        style={{ flex: 1 }}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={onScan}
      />
      <View style={styles.overlay}>
        <Text style={styles.hint}>Scannez le QR affiché par le poseur, à ses côtés.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#0b1320" },
  t: { color: "#fff", fontSize: 18, textAlign: "center", marginBottom: 16 },
  btn: { backgroundColor: "#f5c542", borderRadius: 12, padding: 16 },
  btnT: { color: "#0b1320", fontWeight: "700" },
  overlay: { position: "absolute", bottom: 48, left: 0, right: 0, alignItems: "center" },
  hint: { color: "#fff", backgroundColor: "rgba(0,0,0,0.6)", padding: 12, borderRadius: 10 },
});
