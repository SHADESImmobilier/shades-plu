import { Tabs } from "expo-router";
import { colors } from "@/lib/theme";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.primary }}>
      <Tabs.Screen name="index" options={{ title: "Tefillin" }} />
      <Tabs.Screen name="tsedaka" options={{ title: "Tsedaka" }} />
      <Tabs.Screen name="rewards" options={{ title: "Récompenses" }} />
      <Tabs.Screen name="profile" options={{ title: "Profil" }} />
      {/* Partenaires reste accessible (depuis Récompenses) mais sans onglet dédié */}
      <Tabs.Screen name="partners" options={{ href: null, title: "Partenaires" }} />
    </Tabs>
  );
}
