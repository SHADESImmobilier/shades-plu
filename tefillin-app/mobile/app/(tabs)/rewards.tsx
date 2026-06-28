import { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { supabase } from "@/lib/supabase";
import { Reward } from "@/lib/types";

const LABEL: Record<string, string> = {
  pending: "En attente (anti-fraude)",
  cleared: "Validée",
  redeemed: "Utilisée",
  expired: "Expirée",
  revoked: "Annulée",
};

export default function Rewards() {
  const [balance, setBalance] = useState(0);
  const [rewards, setRewards] = useState<Reward[]>([]);

  useEffect(() => {
    (async () => {
      const { data: prof } = await supabase.from("profiles").select("points_balance").single();
      setBalance(prof?.points_balance ?? 0);
      const { data } = await supabase
        .from("rewards").select("id, session_id, points, status, created_at")
        .order("created_at", { ascending: false });
      setRewards((data as Reward[]) ?? []);
    })();
  }, []);

  return (
    <View style={styles.c}>
      <View style={styles.balanceBox}>
        <Text style={styles.balanceLabel}>Solde de points</Text>
        <Text style={styles.balance}>{balance}</Text>
        <Text style={styles.hint}>Échangez vos points contre des bons chez nos partenaires.</Text>
      </View>

      <Text style={styles.h}>Historique</Text>
      <FlatList
        data={rewards}
        keyExtractor={(r) => r.id}
        ListEmptyComponent={<Text style={styles.empty}>Pas encore de récompense. Faites votre première mise !</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.pts}>+{item.points} pts</Text>
            <Text style={styles.status}>{LABEL[item.status] ?? item.status}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, padding: 16, backgroundColor: "#0b1320" },
  balanceBox: { backgroundColor: "#16203a", borderRadius: 16, padding: 24, alignItems: "center", marginBottom: 24 },
  balanceLabel: { color: "#9fb0c7" },
  balance: { color: "#f5c542", fontSize: 48, fontWeight: "800" },
  hint: { color: "#9fb0c7", textAlign: "center", marginTop: 8 },
  h: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 12 },
  empty: { color: "#9fb0c7", textAlign: "center", marginTop: 24 },
  row: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#16203a", borderRadius: 10, padding: 14, marginBottom: 8 },
  pts: { color: "#fff", fontWeight: "700" },
  status: { color: "#9fb0c7" },
});
