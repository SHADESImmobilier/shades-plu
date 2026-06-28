// Types partagés (miroir du schéma Supabase). À régénérer plus tard avec
// `supabase gen types typescript` une fois le projet branché.

export type TrustLevel = "probation" | "standard" | "certified" | "flagged";

export type SessionStatus =
  | "created"
  | "awaiting_confirmation"
  | "confirmed"
  | "under_review"
  | "validated"
  | "rewarded"
  | "rejected";

export type RewardStatus =
  | "pending"
  | "cleared"
  | "redeemed"
  | "expired"
  | "revoked";

export interface Profile {
  id: string;
  display_name: string | null;
  city: string | null;
  is_poseur: boolean;
  trust: TrustLevel;
  points_balance: number;
}

export interface NearbyPoseur {
  poseur_id: string;
  display_name: string | null;
  trust: TrustLevel;
  distance_m: number;
  lat_p: number;
  lng_p: number;
}

export interface Reward {
  id: string;
  session_id: string;
  points: number;
  status: RewardStatus;
  created_at: string;
}
