import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from "react-native";
import MapView, { Marker, Region } from "react-native-maps";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";

type Phase = "creating" | "waiting" | "accepted" | "cancelled";

// Côté DEMANDEUR : crée une demande "VTC", attend qu'un poseur accepte, puis
// suit son approche en temps réel (Supabase Realtime).
export default function RequestScreen() {
  const [phase, setPhase] = useState<Phase>("creating");
  const [region, setRegion] = useState<Region | null>(null);
  const [poseurLoc, setPoseurLoc] = useState<{ latitude: number; longitude: number } | null>(null);
  const requestId = useRef<string | null>(null);
  const channels = useRef<RealtimeChannel[]>([]);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { Alert.alert("Localisation requise"); router.back(); return; }
      const loc = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = loc.coords;
      setRegion({ latitude, longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 });

      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { Alert.alert("Session expirée"); router.back(); return; }
      const { data, error } = await supabase
        .from("tefillin_requests")
        .insert({
          beneficiary_id: u.user.id,
          location: `SRID=4326;POINT(${longitude} ${latitude})`,
        })
        .select("id").single();
      if (error || !data) { Alert.alert("Erreur", error?.message ?? ""); router.back(); return; }
      requestId.current = data.id;
      setPhase("waiting");
      subscribe(data.id);
    })();
    return () => { channels.current.forEach((c) => supabase.removeChannel(c)); };
  }, []);

  function subscribe(id: string) {
    // 1) écoute l'acceptation de la demande
    const reqCh = supabase
      .channel(`request:${id}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "tefillin_requests", filter: `id=eq.${id}` },
        (payload) => {
          const row = payload.new as { status: string; poseur_id: string | null };
          if (row.status === "accepted" && row.poseur_id) {
            setPhase("accepted");
            trackPoseur(row.poseur_id);
          }
        })
      .subscribe();
    channels.current.push(reqCh);
  }

  function trackPoseur(poseurId: string) {
    // position initiale (colonnes lat/lng dénormalisées)
    supabase.from("poseur_availability")
      .select("location_lat, location_lng").eq("poseur_id", poseurId).single()
      .then(({ data }) => {
        const p = data as { location_lat: number | null; location_lng: number | null } | null;
        if (p?.location_lat != null && p?.location_lng != null) {
          setPoseurLoc({ latitude: p.location_lat, longitude: p.location_lng });
        }
      });
    // 2) suit la position du poseur en temps réel (lat/lng dénormalisés)
    const ch = supabase
      .channel(`poseur:${poseurId}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "poseur_availability", filter: `poseur_id=eq.${poseurId}` },
        (payload) => {
          const n = payload.new as { location_lat: number | null; location_lng: number | null };
          if (n.location_lat != null && n.location_lng != null) {
            setPoseurLoc({ latitude: n.location_lat, longitude: n.location_lng });
          }
        })
      .subscribe();
    channels.current.push(ch);
  }

  async function cancel() {
    if (requestId.current) {
      await supabase.from("tefillin_requests").update({ status: "cancelled" }).eq("id", requestId.current);
    }
    router.back();
  }

  return (
    <View style={styles.c}>
      {region && (
        <MapView style={styles.map} initialRegion={region} showsUserLocation>
          {poseurLoc && <Marker coordinate={poseurLoc} title="Poseur" pinColor="#f5c542" />}
        </MapView>
      )}

      <View style={styles.panel}>
        {phase === "creating" && <Loader text="Création de la demande…" />}
        {phase === "waiting" && <Loader text="Recherche d'un poseur disponible…" />}
        {phase === "accepted" && (
          <>
            <Text style={styles.title}>Un poseur arrive vers vous 🙏</Text>
            <Text style={styles.sub}>
              Une fois ensemble, le poseur prendra une photo de vous deux avec les
              tefillin (avec votre accord) pour valider la mise.
            </Text>
          </>
        )}
        <Pressable style={styles.cancel} onPress={cancel}>
          <Text style={styles.cancelT}>Annuler</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Loader({ text }: { text: string }) {
  return (
    <View style={{ alignItems: "center" }}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.sub}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg },
  map: { ...StyleSheet.absoluteFillObject },
  panel: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: colors.surface, padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 12, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
  title: { color: colors.text, fontSize: 18, fontWeight: "800", textAlign: "center" },
  sub: { color: colors.muted, textAlign: "center", marginTop: 6 },
  cta: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: "center" },
  ctaT: { color: colors.onPrimary, fontWeight: "700", fontSize: 16 },
  cancel: { padding: 12, alignItems: "center" },
  cancelT: { color: colors.danger, fontWeight: "600" },
});
