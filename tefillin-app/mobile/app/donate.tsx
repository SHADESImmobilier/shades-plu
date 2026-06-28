import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, TextInput, FlatList, Alert, Switch } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";

interface Tsedaka { id: string; name: string; description: string | null; tax_receipt_eligible: boolean; }

// Don de tout ou partie du solde de points à une tsedaka (déductible du maasser).
export default function Donate() {
  const [tsedakot, setTsedakot] = useState<Tsedaka[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [points, setPoints] = useState("");
  const [isMaaser, setIsMaaser] = useState(true);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data: prof } = await supabase.from("profiles").select("points_balance").single();
      setBalance(prof?.points_balance ?? 0);
      const { data } = await supabase.from("tsedakot").select("*").eq("is_active", true);
      setTsedakot((data as Tsedaka[]) ?? []);
    })();
  }, []);

  async function donate() {
    const pts = parseInt(points, 10);
    if (!selected) return Alert.alert("Choisissez une association");
    if (!pts || pts <= 0 || pts > balance) return Alert.alert("Montant invalide");
    const { data, error } = await supabase.rpc("donate_to_tsedaka", {
      tsedaka_id: selected, points: pts, is_maaser: isMaaser,
    });
    if (error) return Alert.alert("Erreur", error.message);
    const r = Array.isArray(data) ? data[0] : data;
    Alert.alert("Merci 🙏", `Don de ${r.amount_eur} € enregistré.\nReçu : ${r.receipt_code}`,
      [{ text: "OK", onPress: () => router.back() }]);
  }

  return (
    <View style={styles.c}>
      <Text style={styles.h}>Donner à la tsedaka</Text>
      <Text style={styles.sub}>Solde disponible : {balance} pts</Text>

      <Text style={styles.label}>Association</Text>
      <FlatList
        data={tsedakot}
        scrollEnabled={false}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.card, selected === item.id && styles.cardOn]}
            onPress={() => setSelected(item.id)}>
            <Text style={styles.name}>{item.name}</Text>
            {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
            {item.tax_receipt_eligible && <Text style={styles.receipt}>Reçu fiscal possible</Text>}
          </Pressable>
        )}
      />

      <Text style={styles.label}>Montant (points)</Text>
      <View style={styles.amountRow}>
        <TextInput style={styles.input} keyboardType="number-pad" placeholder="0"
          value={points} onChangeText={setPoints} />
        <Pressable style={styles.all} onPress={() => setPoints(String(balance))}>
          <Text style={styles.allT}>Tout</Text>
        </Pressable>
      </View>

      <View style={styles.maaser}>
        <Text style={styles.maaserT}>Je déclare ce don au titre du maasser</Text>
        <Switch value={isMaaser} onValueChange={setIsMaaser} />
      </View>

      <Pressable style={styles.cta} onPress={donate}>
        <Text style={styles.ctaT}>Confirmer le don</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, padding: 16, backgroundColor: colors.bg },
  h: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 6 },
  sub: { color: colors.muted, marginTop: 4, marginBottom: 16 },
  label: { color: colors.text, fontWeight: "700", marginTop: 12, marginBottom: 8 },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  cardOn: { borderColor: colors.primary, backgroundColor: colors.surfaceAlt },
  name: { color: colors.text, fontWeight: "700" },
  desc: { color: colors.muted, marginTop: 2, fontSize: 13 },
  receipt: { color: colors.success, fontSize: 12, marginTop: 4, fontWeight: "600" },
  amountRow: { flexDirection: "row", gap: 10 },
  input: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, fontSize: 18, color: colors.text },
  all: { justifyContent: "center", paddingHorizontal: 18, backgroundColor: colors.surfaceAlt, borderRadius: 12 },
  allT: { color: colors.primary, fontWeight: "700" },
  maaser: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16, backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
  maaserT: { color: colors.text, flex: 1, fontSize: 14 },
  cta: { backgroundColor: colors.primary, borderRadius: 13, padding: 16, alignItems: "center", marginTop: "auto" },
  ctaT: { color: colors.onPrimary, fontWeight: "700", fontSize: 16 },
});
