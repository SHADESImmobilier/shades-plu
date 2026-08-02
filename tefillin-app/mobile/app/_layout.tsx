import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { Session } from "@supabase/supabase-js";
import { StripeProvider } from "@stripe/stripe-react-native";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";

const stripeKey = (Constants.expoConfig?.extra?.stripePublishableKey as string) ?? "";

// Gate d'authentification : redirige vers (auth) si pas de session.
export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === "(auth)";
    if (!session && !inAuth) router.replace("/(auth)/login");
    else if (session && inAuth) router.replace("/(tabs)");
  }, [ready, session, segments]);

  return (
    <StripeProvider publishableKey={stripeKey} merchantIdentifier="merchant.com.shades.mitzvanow">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="request" options={{ presentation: "modal", headerShown: true, title: "Mettre les tefillin" }} />
        <Stack.Screen name="incoming" options={{ presentation: "modal", headerShown: true, title: "Demandes reçues" }} />
        <Stack.Screen name="capture" options={{ presentation: "modal", headerShown: true, title: "Photo de la mise" }} />
        <Stack.Screen name="donate" options={{ presentation: "modal", headerShown: true, title: "Donner mon solde" }} />
      </Stack>
    </StripeProvider>
  );
}
