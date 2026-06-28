import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import MapView, { Marker, Region } from "react-native-maps";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { NearbyPoseur } from "@/lib/types";
import { colors } from "@/lib/theme";

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
        <Pressable style={styles.cta} onPress={() => router.push("/request")}>
          <Text style={styles.ctaT}>Mettre les tefillin maintenant</Text>
        </Pressable>
        <View style={styles.actions}>
          <Pressable style={styles.secondary} onPress={() => router.push("/incoming")}>
            <Text style={styles.secondaryT}>Je suis poseur · demandes reçues</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => router.push("/capture")}>
            <Text style={styles.secondaryT}>Nouvelle mise · photo</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg },
  panel: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: colors.surface, padding: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
  count: { color: colors.muted, textAlign: "center", marginBottom: 12 },
  cta: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: "center" },
  ctaT: { color: colors.onPrimary, fontWeight: "700", fontSize: 16 },
  actions: { flexDirection: "row", gap: 10, marginTop: 10 },
  secondary: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: 14, alignItems: "center" },
  secondaryT: { color: colors.primary, fontWeight: "600", fontSize: 13, textAlign: "center" },
});
