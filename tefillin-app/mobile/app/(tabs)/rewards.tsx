import { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { supabase } from "@/lib/supabase";
import { Reward } from "@/lib/types";
import { colors } from "@/lib/theme";

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
  c: { flex: 1, padding: 16, backgroundColor: colors.bg },
  balanceBox: { backgroundColor: colors.primary, borderRadius: 16, padding: 24, alignItems: "center", marginBottom: 24 },
  balanceLabel: { color: "#dbe7ff" },
  balance: { color: colors.onPrimary, fontSize: 48, fontWeight: "900" },
  hint: { color: "#dbe7ff", textAlign: "center", marginTop: 8 },
  h: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 12 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 24 },
  row: { flexDirection: "row", justifyContent: "space-between", backgroundColor: colors.surface, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  pts: { color: colors.text, fontWeight: "700" },
  status: { color: colors.muted },
});
