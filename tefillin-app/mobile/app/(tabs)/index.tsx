import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, FlatList } from "react-native";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { NearbyPoseur } from "@/lib/types";

// Écran principal "VTC" : trouve les poseurs disponibles à proximité.
// (La carte react-native-maps s'ajoute ici ; on liste d'abord les résultats.)
export default function Home() {
  const [poseurs, setPoseurs] = useState<NearbyPoseur[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function findNearby() {
    setLoading(true);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") { setLoading(false); return; }
    const loc = await Location.getCurrentPositionAsync({});
    const { data } = await supabase.rpc("nearby_poseurs", {
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      radius_m: 3000,
    });
    setPoseurs((data as NearbyPoseur[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { findNearby(); }, []);

  return (
    <View style={styles.c}>
      <Text style={styles.h}>Mettre les tefillin maintenant</Text>
      <Text style={styles.sub}>Poseurs disponibles près de vous</Text>

      <FlatList
        data={poseurs}
        keyExtractor={(p) => p.poseur_id}
        refreshing={loading}
        onRefresh={findNearby}
        ListEmptyComponent={<Text style={styles.empty}>Aucun poseur disponible à proximité pour l'instant.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View>
              <Text style={styles.name}>{item.display_name ?? "Poseur"}</Text>
              <Text style={styles.meta}>
                {Math.round(item.distance_m)} m · {item.trust === "certified" ? "✓ certifié" : item.trust}
              </Text>
            </View>
            <Pressable style={styles.req}><Text style={styles.reqT}>Appeler</Text></Pressable>
          </View>
        )}
      />

      <Pressable style={styles.cta} onPress={() => router.push("/validate")}>
        <Text style={styles.ctaT}>Je suis poseur · valider une mise</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, padding: 16, backgroundColor: "#0b1320" },
  h: { fontSize: 22, fontWeight: "700", color: "#fff", marginTop: 8 },
  sub: { color: "#9fb0c7", marginBottom: 16 },
  empty: { color: "#9fb0c7", textAlign: "center", marginTop: 40 },
  card: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#16203a", borderRadius: 12, padding: 16, marginBottom: 10 },
  name: { color: "#fff", fontSize: 16, fontWeight: "600" },
  meta: { color: "#9fb0c7", marginTop: 2 },
  req: { backgroundColor: "#f5c542", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16 },
  reqT: { color: "#0b1320", fontWeight: "700" },
  cta: { backgroundColor: "#1f2d4d", borderRadius: 12, padding: 16, alignItems: "center" },
  ctaT: { color: "#f5c542", fontWeight: "700" },
});
