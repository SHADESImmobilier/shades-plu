import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import MapView, { Marker, Region } from "react-native-maps";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { NearbyPoseur } from "@/lib/types";

// Écran principal "VTC" : carte des poseurs disponibles à proximité.
export default function Home() {
  const [poseurs, setPoseurs] = useState<NearbyPoseur[]>([]);
  const [region, setRegion] = useState<Region | null>(null);
  const router = useRouter();

  async function refresh() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return;
    const loc = await Location.getCurrentPositionAsync({});
    const { latitude, longitude } = loc.coords;
    setRegion({ latitude, longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 });
    const { data } = await supabase.rpc("nearby_poseurs", {
      lat: latitude, lng: longitude, radius_m: 5000,
    });
    setPoseurs((data as NearbyPoseur[]) ?? []);
  }

  useEffect(() => { refresh(); }, []);

  return (
    <View style={styles.c}>
      {region && (
        <MapView style={StyleSheet.absoluteFill} initialRegion={region} showsUserLocation>
          {poseurs.map((p) => (
            <Marker
              key={p.poseur_id}
              coordinate={{ latitude: p.lat_p, longitude: p.lng_p }}
              title={p.display_name ?? "Poseur"}
              description={`${Math.round(p.distance_m)} m${p.trust === "certified" ? " · ✓ certifié" : ""}`}
            />
          ))}
        </MapView>
      )}

      <View style={styles.panel}>
        <Text style={styles.count}>
          {poseurs.length > 0
            ? `${poseurs.length} poseur(s) disponible(s) près de vous`
            : "Aucun poseur disponible pour l'instant"}
        </Text>
        <Pressable style={styles.cta} onPress={refresh}>
          <Text style={styles.ctaT}>Mettre les tefillin maintenant</Text>
        </Pressable>
        <View style={styles.actions}>
          <Pressable style={styles.secondary} onPress={() => router.push("/serve")}>
            <Text style={styles.secondaryT}>Je suis poseur · ouvrir une mise</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => router.push("/validate")}>
            <Text style={styles.secondaryT}>Scanner un QR</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: "#0b1320" },
  panel: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#0b1320", padding: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  count: { color: "#9fb0c7", textAlign: "center", marginBottom: 12 },
  cta: { backgroundColor: "#f5c542", borderRadius: 12, padding: 16, alignItems: "center" },
  ctaT: { color: "#0b1320", fontWeight: "700", fontSize: 16 },
  actions: { flexDirection: "row", gap: 10, marginTop: 10 },
  secondary: { flex: 1, backgroundColor: "#1f2d4d", borderRadius: 12, padding: 14, alignItems: "center" },
  secondaryT: { color: "#f5c542", fontWeight: "600", fontSize: 13, textAlign: "center" },
});
