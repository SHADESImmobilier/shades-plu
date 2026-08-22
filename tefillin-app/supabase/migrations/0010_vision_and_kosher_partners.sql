-- ============================================================================
-- 0010 · Support vision (photo de référence du poseur) + partenaires cachers
-- ============================================================================

-- Chemin Storage de la photo de référence du poseur (pour la comparaison faciale
-- par le modèle de vision, en plus de l'embedding).
alter table profiles
  add column if not exists face_ref_path text;

-- ---------------------------------------------------------------------------
-- Partenaires cachers (bons de réduction) : les DONNÉES DE DÉMO ont été
-- déplacées vers `supabase/seed.sql` (dev/local uniquement). En production, les
-- vrais partenaires s'ajoutent via le back-office — pas de seed dans les
-- migrations de prod.
-- ---------------------------------------------------------------------------
