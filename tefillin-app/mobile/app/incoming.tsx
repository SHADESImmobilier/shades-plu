import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, FlatList, Alert } from "react-native";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";

interface PendingRequest {
  id: string;
  distance_m: number;
  note: string | null;
}

// Côté POSEUR : reçoit en temps réel les demandes à proximité et les accepte.
export default function Incoming() {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const coords = useRef<{ lat: number; lng: number } | null>(null);
  const channel = useRef<RealtimeChannel | null>(null);
  const router = useRouter();

  async function loadNearby() {
    if (!coords.current) return;
    const { data } = await supabase.rpc("nearby_requests", {
      lat: coords.current.lat, lng: coords.current.lng, radius_m: 5000,
    });
    setRequests((data as PendingRequest[]) ?? []);
  }

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { Alert.alert("Localisation requise"); router.back(); return; }
      const loc = await Location.getCurrentPositionAsync({});
      coords.current = { lat: loc.coords.latitude, lng: loc.coords.longitude };

      // se déclarer disponible + publier sa position (pour le matching/suivi)
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        await supabase.from("poseur_availability").upsert({
          poseur_id: u.user.id,
          is_available: true,
          location: `SRID=4326;POINT(${coords.current.lng} ${coords.current.lat})`,
        });
      }

      await loadNearby();

      // temps réel : toute nouvelle demande "pending" rafraîchit la liste
      channel.current = supabase
        .channel("incoming-requests")
        .on("postgres_changes",
          { event: "*", schema: "public", table: "tefillin_requests" },
          () => loadNearby())
        .subscribe();
    })();
    return () => { if (channel.current) supabase.removeChannel(channel.current); };
  }, []);

  async function accept(id: string) {
    const { error } = await supabase.rpc("accept_request", { req_id: id });
    if (error) { Alert.alert("Indisponible", "Demande déjà prise ou expirée."); loadNearby(); return; }
    // une fois ensemble, le poseur prend la photo de la mise
    router.replace({ pathname: "/capture", params: { request_id: id } });
  }

  return (
    <View style={styles.c}>
      <Text style={styles.h}>Demandes près de vous</Text>
      <Text style={styles.sub}>Vous êtes en ligne · les demandes arrivent en direct.</Text>
      <FlatList
        data={requests}
        keyExtractor={(r) => r.id}
        ListEmptyComponent={<Text style={styles.empty}>Aucune demande pour l'instant. Restez disponible 🙂</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dist}>{Math.round(item.distance_m)} m</Text>
              {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
            </View>
            <Pressable style={styles.btn} onPress={() => accept(item.id)}>
              <Text style={styles.btnT}>Accepter</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, padding: 16, backgroundColor: colors.bg },
  h: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 8 },
  sub: { color: colors.muted, marginBottom: 16 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 40 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  dist: { color: colors.text, fontSize: 16, fontWeight: "700" },
  note: { color: colors.muted, marginTop: 4 },
  btn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  btnT: { color: colors.onPrimary, fontWeight: "700" },
});
