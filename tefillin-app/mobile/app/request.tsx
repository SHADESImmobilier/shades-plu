import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from "react-native";
import MapView, { Marker, Region } from "react-native-maps";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

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

      const { data, error } = await supabase
        .from("tefillin_requests")
        .insert({ location: `SRID=4326;POINT(${longitude} ${latitude})` })
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
    supabase.from("poseur_availability").select("location").eq("poseur_id", poseurId).single()
      .then(() => {/* position initiale via REST si besoin */});
    // 2) suit la position du poseur en temps réel
    const ch = supabase
      .channel(`poseur:${poseurId}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "poseur_availability", filter: `poseur_id=eq.${poseurId}` },
        (payload) => {
          // location renvoyée en WKB/GeoJSON selon config ; ici on attend lat/lng dénormalisés
          const loc = (payload.new as any).location;
          if (loc?.coordinates) setPoseurLoc({ latitude: loc.coordinates[1], longitude: loc.coordinates[0] });
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
            <Text style={styles.sub}>Quand vous êtes ensemble, scannez son QR.</Text>
            <Pressable style={styles.cta} onPress={() => router.replace("/validate")}>
              <Text style={styles.ctaT}>Scanner le QR du poseur</Text>
            </Pressable>
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
      <ActivityIndicator color="#f5c542" />
      <Text style={styles.sub}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: "#0b1320" },
  map: { ...StyleSheet.absoluteFillObject },
  panel: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#0b1320", padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 12 },
  title: { color: "#fff", fontSize: 18, fontWeight: "700", textAlign: "center" },
  sub: { color: "#9fb0c7", textAlign: "center", marginTop: 6 },
  cta: { backgroundColor: "#f5c542", borderRadius: 12, padding: 16, alignItems: "center" },
  ctaT: { color: "#0b1320", fontWeight: "700", fontSize: 16 },
  cancel: { padding: 12, alignItems: "center" },
  cancelT: { color: "#ff6b6b", fontWeight: "600" },
});
