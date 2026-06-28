import { useEffect, useState } from "react";
import { View, Text, Switch, Pressable, StyleSheet } from "react-native";
import { supabase } from "@/lib/supabase";
import { Profile } from "@/lib/types";
import { colors } from "@/lib/theme";

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    supabase.from("profiles").select("*").single().then(({ data }) => setProfile(data as Profile));
  }, []);

  async function togglePoseur(v: boolean) {
    if (!profile) return;
    setProfile({ ...profile, is_poseur: v });
    await supabase.from("profiles").update({ is_poseur: v }).eq("id", profile.id);
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
