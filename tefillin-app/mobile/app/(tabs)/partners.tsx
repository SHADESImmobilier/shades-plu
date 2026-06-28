import { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from "react-native";
import { supabase } from "@/lib/supabase";

interface Offer {
  id: string;
  title: string;
  description: string | null;
  cost_points: number;
  partners: { name: string; category: string | null } | null;
}

// Catalogue partenaires : échange de points contre des bons / réductions.
export default function Partners() {
  const [offers, setOffers] = useState<Offer[]>([]);

  useEffect(() => {
    supabase
      .from("partner_offers")
      .select("id, title, description, cost_points, partners(name, category)")
      .eq("is_active", true)
      .order("cost_points")
      .then(({ data }) => setOffers((data as unknown as Offer[]) ?? []));
  }, []);

  async function redeem(offer: Offer) {
    // Génération du bon côté serveur (RPC issue_voucher, à implémenter) pour
    // garantir l'anti-rejeu et le débit atomique des points.
    const { data, error } = await supabase.rpc("issue_voucher", { offer_id: offer.id });
    if (error) return Alert.alert("Indisponible", error.message);
    Alert.alert("Bon généré", `Votre code : ${data?.code ?? "—"}`);
  }

  return (
    <View style={styles.c}>
      <Text style={styles.h}>Nos partenaires</Text>
      <FlatList
        data={offers}
        keyExtractor={(o) => o.id}
        ListEmptyComponent={<Text style={styles.empty}>Aucune offre pour le moment.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.partner}>{item.partners?.name ?? "Partenaire"}</Text>
            <Text style={styles.title}>{item.title}</Text>
            {item.description && <Text style={styles.desc}>{item.description}</Text>}
            <View style={styles.bottom}>
              <Text style={styles.cost}>{item.cost_points} pts</Text>
              <Pressable style={styles.btn} onPress={() => redeem(item)}>
                <Text style={styles.btnT}>Échanger</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, padding: 16, backgroundColor: "#0b1320" },
  h: { color: "#fff", fontSize: 22, fontWeight: "700", marginBottom: 16 },
  empty: { color: "#9fb0c7", textAlign: "center", marginTop: 40 },
  card: { backgroundColor: "#16203a", borderRadius: 12, padding: 16, marginBottom: 12 },
  partner: { color: "#9fb0c7", fontSize: 12, textTransform: "uppercase" },
  title: { color: "#fff", fontSize: 16, fontWeight: "700", marginTop: 4 },
  desc: { color: "#9fb0c7", marginTop: 4 },
  bottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  cost: { color: "#f5c542", fontWeight: "700", fontSize: 16 },
  btn: { backgroundColor: "#f5c542", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 18 },
  btnT: { color: "#0b1320", fontWeight: "700" },
});
