import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput, Switch, Alert } from "react-native";
import { useStripe } from "@stripe/stripe-react-native";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";

interface Tsedaka { id: string; name: string; category: string | null; is_platform: boolean; }

const PRESETS = [100, 200, 500, 1000]; // en centimes : 1€, 2€, 5€, 10€

// Pilier 2 · Tsedaka : don quotidien ultra-rapide (Apple Pay / Google Pay / carte
// via Stripe PaymentSheet), choix de l'association, anonymat, suivi du maasser.
export default function Tsedaka() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [assos, setAssos] = useState<Tsedaka[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useState(200); // centimes
  const [custom, setCustom] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [isMaaser, setIsMaaser] = useState(true);
  const [monthTotal, setMonthTotal] = useState(0);
  const [yearTotal, setYearTotal] = useState(0);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase.from("tsedakot")
      .select("id, name, category, is_platform").eq("is_active", true)
      .order("is_platform", { ascending: false });
    const list = (data as Tsedaka[]) ?? [];
    setAssos(list);
    if (!selected && list.length) setSelected(list[0].id);
    const { data: sum } = await supabase.rpc("maaser_summary");
    for (const r of (sum as { period: string; amount_eur: number }[]) ?? []) {
      if (r.period === "month") setMonthTotal(r.amount_eur);
      if (r.period === "year") setYearTotal(r.amount_eur);
    }
  }
  useEffect(() => { load(); }, []);

  const finalAmount = custom ? Math.round(parseFloat(custom.replace(",", ".")) * 100) : amount;

  async function donate() {
    if (!selected) return Alert.alert("Choisissez une association");
    if (!finalAmount || finalAmount < 50) return Alert.alert("Montant minimum : 0,50 €");
    setBusy(true);
    try {
      // 1) créer le PaymentIntent côté serveur
      const { data, error } = await supabase.functions.invoke("create_donation", {
        body: { tsedaka_id: selected, amount_cents: finalAmount, is_anonymous: anonymous, is_maaser: isMaaser },
      });
      if (error || !data?.client_secret) throw new Error(data?.reason ?? error?.message ?? "Erreur");

      // 2) PaymentSheet natif (Apple Pay / Google Pay / carte)
      const init = await initPaymentSheet({
        paymentIntentClientSecret: data.client_secret,
        merchantDisplayName: "MitzvaNOW",
        applePay: { merchantCountryCode: "FR" },
        googlePay: { merchantCountryCode: "FR", currencyCode: "EUR", testEnv: true },
        allowsDelayedPaymentMethods: false,
      });
      if (init.error) throw new Error(init.error.message);

      const res = await presentPaymentSheet();
      if (res.error) { setBusy(false); return; } // annulé / erreur affichée par la sheet

      Alert.alert("Merci 🙏", "Don effectué. Que ce soit un mérite.");
      load();
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.c} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={styles.h}>Tsedaka du jour</Text>
      <Text style={styles.sub}>Accomplissez votre maasser en quelques secondes.</Text>

      {/* suivi maasser */}
      <View style={styles.tracker}>
        <View style={styles.trackerCol}><Text style={styles.tVal}>{monthTotal.toFixed(0)} €</Text><Text style={styles.tLbl}>ce mois</Text></View>
        <View style={styles.sep} />
        <View style={styles.trackerCol}><Text style={styles.tVal}>{yearTotal.toFixed(0)} €</Text><Text style={styles.tLbl}>cette année</Text></View>
      </View>

      {/* montant */}
      <Text style={styles.label}>Montant</Text>
      <View style={styles.chips}>
        {PRESETS.map((c) => (
          <Pressable key={c} style={[styles.chip, !custom && amount === c && styles.chipOn]}
            onPress={() => { setAmount(c); setCustom(""); }}>
            <Text style={[styles.chipT, !custom && amount === c && styles.chipTOn]}>{c / 100} €</Text>
          </Pressable>
        ))}
        <TextInput style={styles.customInput} placeholder="Autre €" keyboardType="decimal-pad"
          value={custom} onChangeText={setCustom} />
      </View>

      {/* association */}
      <Text style={styles.label}>Association</Text>
      {assos.map((a) => (
        <Pressable key={a.id} style={[styles.asso, selected === a.id && styles.assoOn]} onPress={() => setSelected(a.id)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.assoName}>{a.name}{a.is_platform ? "  ⭐" : ""}</Text>
            <Text style={styles.assoCat}>{a.is_platform ? "Soutenir le projet MitzvaNOW" : (a.category ?? "Association")}</Text>
          </View>
          <View style={[styles.radio, selected === a.id && styles.radioOn]} />
        </Pressable>
      ))}

      {/* options */}
      <View style={styles.opt}>
        <Text style={styles.optT}>Don anonyme</Text>
        <Switch value={anonymous} onValueChange={setAnonymous} />
      </View>
      <View style={styles.opt}>
        <Text style={styles.optT}>Au titre du maasser (reçu)</Text>
        <Switch value={isMaaser} onValueChange={setIsMaaser} />
      </View>

      <Pressable style={[styles.cta, busy && { opacity: 0.6 }]} onPress={donate} disabled={busy}>
        <Text style={styles.ctaT}>{busy ? "…" : ` Donner ${(finalAmount / 100).toFixed(2)} €`}</Text>
      </Pressable>
      <Text style={styles.pay}>Apple Pay · Google Pay · carte — paiement sécurisé</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg },
  h: { color: colors.text, fontSize: 24, fontWeight: "800", marginTop: 6 },
  sub: { color: colors.muted, marginTop: 3, marginBottom: 16 },
  tracker: { flexDirection: "row", backgroundColor: colors.primary, borderRadius: 16, padding: 18, marginBottom: 20 },
  trackerCol: { flex: 1, alignItems: "center" },
  sep: { width: 1, backgroundColor: "rgba(255,255,255,.3)" },
  tVal: { color: "#fff", fontSize: 26, fontWeight: "900" },
  tLbl: { color: "#dbe7ff", fontSize: 12, marginTop: 2 },
  label: { color: colors.text, fontWeight: "700", marginBottom: 8, marginTop: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  chip: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipT: { color: colors.text, fontWeight: "700" },
  chipTOn: { color: "#fff" },
  customInput: { flex: 1, minWidth: 90, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, color: colors.text },
  asso: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginBottom: 8 },
  assoOn: { borderColor: colors.primary, backgroundColor: colors.surfaceAlt },
  assoName: { color: colors.text, fontWeight: "700" },
  assoCat: { color: colors.muted, fontSize: 12, marginTop: 2 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  radioOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  opt: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginTop: 8 },
  optT: { color: colors.text, fontSize: 14 },
  cta: { backgroundColor: colors.primary, borderRadius: 14, padding: 17, alignItems: "center", marginTop: 20 },
  ctaT: { color: "#fff", fontWeight: "800", fontSize: 17 },
  pay: { color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 10 },
});
