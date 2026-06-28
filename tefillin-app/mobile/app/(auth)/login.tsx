import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from "react-native";
import { supabase } from "@/lib/supabase";

// Auth par OTP SMS (un compte = un numéro vérifié → barrière anti-fraude #1).
export default function Login() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function sendCode() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone });
    setLoading(false);
    if (error) return Alert.alert("Erreur", error.message);
    setSent(true);
  }

  async function verify() {
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: "sms" });
    setLoading(false);
    if (error) return Alert.alert("Erreur", error.message);
    // la redirection est gérée par le gate dans _layout.tsx
  }

  return (
    <View style={styles.c}>
      <Text style={styles.title}>הנני</Text>
      <Text style={styles.sub}>Tefillin Connect</Text>
      <Text style={styles.p}>
        Mettez les tefillin, faites-les mettre, et participez aux Mivtzaïm.
      </Text>

      {!sent ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="+33 6 12 34 56 78"
            keyboardType="phone-pad"
            autoComplete="tel"
            value={phone}
            onChangeText={setPhone}
          />
          <Pressable style={styles.btn} onPress={sendCode} disabled={loading}>
            <Text style={styles.btnText}>Recevoir le code</Text>
          </Pressable>
        </>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="Code à 6 chiffres"
            keyboardType="number-pad"
            value={code}
            onChangeText={setCode}
          />
          <Pressable style={styles.btn} onPress={verify} disabled={loading}>
            <Text style={styles.btnText}>Vérifier</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#0b1320" },
  title: { fontSize: 56, color: "#f5c542", textAlign: "center", fontWeight: "700" },
  sub: { fontSize: 18, color: "#e8eef7", textAlign: "center", marginBottom: 16 },
  p: { color: "#9fb0c7", textAlign: "center", marginBottom: 32 },
  input: { backgroundColor: "#16203a", color: "#fff", borderRadius: 12, padding: 16, fontSize: 16, marginBottom: 12 },
  btn: { backgroundColor: "#f5c542", borderRadius: 12, padding: 16, alignItems: "center" },
  btnText: { color: "#0b1320", fontWeight: "700", fontSize: 16 },
});
