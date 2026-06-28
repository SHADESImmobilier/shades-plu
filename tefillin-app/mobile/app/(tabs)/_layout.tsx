import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: "#f5c542" }}>
      <Tabs.Screen name="index" options={{ title: "Carte" }} />
      <Tabs.Screen name="rewards" options={{ title: "Récompenses" }} />
      <Tabs.Screen name="profile" options={{ title: "Profil" }} />
    </Tabs>
  );
}
