import { useEffect, useState } from "react";
import { View, Text, Switch, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { Profile } from "@/lib/types";
import { colors } from "@/lib/theme";
import { enableDailyTsedakaReminder, disableDailyTsedakaReminder } from "@/lib/notifications";

const REMINDER_HOUR = 18; // rappel par défaut à 18h (configurable plus tard)

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [reminder, setReminder] = useState(false);
  const [faceEnrolled, setFaceEnrolled] = useState(false);
  const router = useRouter();

  useEffect(() => {
    supabase.from("profiles").select("*").single().then(({ data }) => {
      const p = data as any;
      setProfile(p);
      setReminder(!!p?.tsedaka_reminder_enabled);
      setFaceEnrolled(!!p?.face_enrolled);
    });
  }, []);

  async function togglePoseur(v: boolean) {
    if (!profile) return;
    setProfile({ ...profile, is_poseur: v });
    await supabase.from("profiles").update({ is_poseur: v }).eq("id", profile.id);
  }

  async function toggleReminder(v: boolean) {
    if (!profile) return;
    if (v) {
      const ok = await enableDailyTsedakaReminder(REMINDER_HOUR);
      if (!ok) return; // permission refusée
    } else {
      await disableDailyTsedakaReminder();
    }
    setReminder(v);
    await supabase.from("profiles")
      .update({ tsedaka_reminder_enabled: v, tsedaka_reminder_hour: v ? REMINDER_HOUR : null })
      .eq("id", profile.id);
  }

  return (
    <View style={styles.c}>
      <Text style={styles.name}>{profile?.display_name ?? "Mon profil"}</Text>
      <Text style={styles.trust}>Niveau de confiance : {profile?.trust ?? "—"}</Text>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Mode poseur</Text>
          <Text style={styles.help}>Activez pour recevoir des demandes et faire Mivtzaïm.</Text>
        </View>
        <Switch value={profile?.is_poseur ?? false} onValueChange={togglePoseur} />
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Rappel quotidien de tsedaka</Text>
          <Text style={styles.help}>Une notification chaque jour à {REMINDER_HOUR}h pour donner.</Text>
        </View>
        <Switch value={reminder} onValueChange={toggleReminder} />
      </View>

      <Pressable style={styles.row} onPress={() => router.push({ pathname: "/capture", params: { mode: "enroll" } })}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Vérification du visage (poseur)</Text>
          <Text style={styles.help}>
            {faceEnrolled ? "✓ Enregistré — requis pour valider vos mises." : "À faire : selfie de référence pour valider vos mises."}
          </Text>
        </View>
        <Text style={{ color: faceEnrolled ? colors.success : colors.primary, fontWeight: "700" }}>
          {faceEnrolled ? "✓" : "›"}
        </Text>
      </Pressable>

      <Pressable style={styles.logout} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.logoutT}>Se déconnecter</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, padding: 16, backgroundColor: colors.bg },
  name: { color: colors.text, fontSize: 24, fontWeight: "800", marginTop: 8 },
  trust: { color: colors.muted, marginBottom: 24 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  label: { color: colors.text, fontSize: 16, fontWeight: "600" },
  help: { color: colors.muted, marginTop: 2 },
  logout: { marginTop: "auto", padding: 16, alignItems: "center" },
  logoutT: { color: colors.danger, fontWeight: "600" },
});
