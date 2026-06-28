import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";

// Empreinte d'appareil stable (anti multi-comptes / collusion).
// iOS : identifierForVendor ; Android : ANDROID_ID. Hashée pour ne jamais
// stocker l'identifiant brut.
export async function deviceFingerprint(): Promise<string> {
  let raw: string | null = null;
  if (Platform.OS === "ios") {
    raw = await Application.getIosIdForVendorAsync();
  } else if (Platform.OS === "android") {
    raw = Application.getAndroidId();
  }
  raw = raw ?? "unknown-device";
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
}

// Hash d'un numéro de téléphone (normalisé E.164) — RGPD : on ne stocke jamais
// le numéro en clair côté métier (anti-farming par hash).
export async function phoneHash(phoneE164: string): Promise<string> {
  const normalized = phoneE164.replace(/\s+/g, "");
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, normalized);
}
