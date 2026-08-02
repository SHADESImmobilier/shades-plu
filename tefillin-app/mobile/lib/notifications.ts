import * as Notifications from "expo-notifications";

// Rappel quotidien de tsedaka (notification locale planifiée).
// En prod, on peut aussi pousser côté serveur (Expo Push) pour des messages
// personnalisés ; ici une notification locale récurrente suffit pour le rituel.

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false,
  }),
});

export async function enableDailyTsedakaReminder(hour: number): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return false;
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "C'est l'heure de la tsedaka 🙏",
      body: "Donnez en quelques secondes et accomplissez votre maasser du jour.",
      data: { screen: "tsedaka" },
    },
    trigger: { hour, minute: 0, repeats: true },
  });
  return true;
}

export async function disableDailyTsedakaReminder(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
