import { Tabs } from "expo-router";
import { colors } from "@/lib/theme";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.primary }}>
      <Tabs.Screen name="index" options={{ title: "Carte" }} />
      <Tabs.Screen name="partners" options={{ title: "Partenaires" }} />
      <Tabs.Screen name="rewards" options={{ title: "Récompenses" }} />
      <Tabs.Screen name="profile" options={{ title: "Profil" }} />
    </Tabs>
  );
}
