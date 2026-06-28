import { useEffect, useState, useCallback } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import QRCode from "react-native-qrcode-svg";
import * as Location from "expo-location";
import { supabase } from "@/lib/supabase";

// Côté POSEUR : ouvre une session et affiche un QR éphémère (60 s) que le
// bénéficiaire scanne pour la double confirmation à proximité.
export default function Serve() {
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const openSession = useCallback(async () => {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") throw new Error("Localisation requise.");
      const loc = await Location.getCurrentPositionAsync({});
      const { data, error } = await supabase.rpc("create_session", {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setToken(row.token);
      setCode(row.code ?? null);
      setSecondsLeft(60);
    } catch (e) {
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { openSession(); }, [openSession]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  const expired = secondsLeft <= 0;

  return (
    <View style={styles.c}>
      <Text style={styles.h}>Présentez ce QR au bénéficiaire</Text>
      <Text style={styles.sub}>Il le scanne depuis son téléphone, à vos côtés.</Text>

      <View style={styles.qrBox}>
        {loading ? (
          <ActivityIndicator color="#0b1320" />
        ) : token && !expired ? (
          <QRCode value={token} size={220} />
        ) : (
          <Text style={styles.expired}>QR expiré</Text>
        )}
      </View>

      {token && !expired && (
        <>
          {code && <Text style={styles.code}>Code manuel : {code}</Text>}
          <Text style={styles.timer}>Expire dans {secondsLeft} s</Text>
        </>
      )}

      <Pressable style={styles.btn} onPress={openSession} disabled={loading}>
        <Text style={styles.btnT}>{expired ? "Régénérer un QR" : "Nouveau QR"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#0b1320" },
  h: { color: "#fff", fontSize: 20, fontWeight: "700", textAlign: "center" },
  sub: { color: "#9fb0c7", textAlign: "center", marginTop: 6, marginBottom: 28 },
  qrBox: { width: 264, height: 264, borderRadius: 16, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  expired: { color: "#0b1320", fontWeight: "700" },
  code: { color: "#f5c542", fontSize: 18, fontWeight: "700", marginTop: 20, letterSpacing: 2 },
  timer: { color: "#9fb0c7", marginTop: 8 },
  btn: { marginTop: 28, backgroundColor: "#f5c542", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
  btnT: { color: "#0b1320", fontWeight: "700" },
});
