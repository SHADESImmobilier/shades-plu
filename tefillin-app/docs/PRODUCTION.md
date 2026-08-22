# MitzvaNOW — Runbook de mise en production

Ce document décrit, pas à pas, comment passer du code au **service en ligne** puis à
l'app publiée. Il distingue clairement ce qui est **automatisable** de ce qui **dépend
d'une décision humaine** (comptes, clés, validation rabbinique, juridique, stores).

---

## 0. Architecture (rappel)

- **App mobile** : React Native / Expo (SDK 51, expo-router), `tefillin-app/mobile`.
- **Backend** : Supabase — Postgres + PostGIS (géo) + pgvector (empreintes), Auth OTP
  SMS, Realtime, Storage (bucket privé `mivtza-proofs`), Edge Functions (Deno).
- **Paiements** : Stripe (PaymentSheet + Stripe Connect vers les associations) + webhook.
- **Vision anti-fraude** : Claude (`claude-opus-5`) appelé depuis `submit_session`.

---

## 1. Ce qui dépend de toi (blocages humains)

| # | Élément | Pourquoi c'est toi |
|---|---------|--------------------|
| 1 | Comptes : Supabase, Stripe (+ Connect), fournisseur SMS OTP, clé API Anthropic, Google Maps | Création de comptes + facturation |
| 2 | **Validation rabbinique** écrite sur la nature de la récompense | Décision d'autorité (point halachique ouvert) |
| 3 | Juridique/RGPD : mentions légales, politique de conservation des **données biométriques**, statut de l'association | Responsabilité légale |
| 4 | Comptes développeur **Apple** (99 $/an) et **Google Play** (25 $) + soumission | Identité légale de l'éditeur |
| 5 | Contenu : vraies associations & vrais partenaires cachers | Partenariats réels |

Tout le reste ci-dessous est prêt / automatisable.

---

## 2. Secrets (où va quoi)

Voir `tefillin-app/.env.example`. Deux familles :

**Client (public, embarqué dans l'app)** — via variables `EXPO_PUBLIC_*` (lues par
`mobile/app.config.ts`) ou secrets EAS :
- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (carte Android)

**Serveur (secrets, jamais côté client)** — via `supabase secrets set` :
- `ANTHROPIC_API_KEY` (vision — requis)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (paiements — requis)
- `CRON_SECRET` (protège `clear_rewards`)
- `FACE_API_URL`, `FACE_API_KEY` (reconnaissance faciale du posé — optionnel ; à
  défaut, les mises partent en revue manuelle)
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` sont injectés
  automatiquement par Supabase.

---

## 3. Déploiement backend (Supabase)

```bash
cd tefillin-app
supabase link --project-ref <ref-du-projet>

# 3.1 Appliquer le schéma (les migrations s'appliquent de bout en bout)
supabase db push
#  -> active pg_cron (0012). Si refus, active l'extension dans
#     Dashboard > Database > Extensions puis relance.

# 3.2 (DEV/DÉMO uniquement) charger des données d'exemple
#     supabase db reset   # exécute supabase/seed.sql sur une base fraîche
#     En PROD : ne pas seeder ; ajouter les vraies assos/partenaires via le back-office.

# 3.3 Secrets serveur
supabase secrets set ANTHROPIC_API_KEY=... STRIPE_SECRET_KEY=... \
  STRIPE_WEBHOOK_SECRET=... CRON_SECRET=... \
  FACE_API_URL=... FACE_API_KEY=...      # les deux derniers optionnels

# 3.4 Déployer les Edge Functions
supabase functions deploy submit_session
supabase functions deploy enroll_face
supabase functions deploy create_donation
supabase functions deploy clear_rewards   --no-verify-jwt
supabase functions deploy stripe_webhook  --no-verify-jwt
```

**Auth OTP SMS** : configurer le fournisseur SMS dans Dashboard > Authentication >
Providers > Phone. Mettre `site_url`/redirect sur `mitzvanow://` (déjà dans
`config.toml`).

**Cron** : `0012` planifie `clear_due_rewards()` chaque heure via pg_cron. (Le endpoint
`clear_rewards` reste utile pour un déclenchement manuel, protégé par `x-cron-secret`.)

---

## 4. Stripe

1. Activer **Stripe Connect** (comptes connectés pour les associations). Chaque asso
   éligible reçoit un `stripe_account_id` stocké dans `tsedakot.stripe_account_id`
   (routage `transfer_data.destination`). Sans compte connecté, l'encaissement se fait
   sur la plateforme (« donner à MitzvaNOW »).
2. Créer l'**endpoint webhook** pointant vers la fonction `stripe_webhook`
   (`https://<ref>.functions.supabase.co/stripe_webhook`), écouter au minimum :
   `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `payment_intent.canceled`, `charge.refunded`. Copier le *signing secret* dans
   `STRIPE_WEBHOOK_SECRET`.
3. Reçus fiscaux FR : envisager HelloAsso pour les dons déductibles (hors périmètre code).

---

## 5. Build & publication mobile (EAS)

```bash
cd tefillin-app/mobile
npm install
npx expo install --fix          # aligne les versions natives sur le SDK

# Secrets de build (ou un .env local pour le dev)
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value ...
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value ...
eas secret:create --name EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY --value ...
eas secret:create --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY --value ...

eas build --profile preview --platform all      # test interne (dev-client/APK)
eas build --profile production --platform all    # builds stores
eas submit --profile production --platform ios    # nécessite compte Apple
eas submit --profile production --platform android # nécessite compte Play
```

Pré-requis natifs : Apple Push/merchantId (`merchant.com.shades.mitzvanow`) et clé
Google Maps activée pour Android.

---

## 6. Sécurité & RGPD (à maintenir)

- Données **biométriques** (empreintes faciales du poseur et du posé) : consentement
  explicite (déjà demandé à l'écran), **finalité strictement anti-fraude**, conservation
  limitée, droit à l'effacement. Documenter une **durée de rétention** et un job de purge.
- RLS : `beneficiary_faces`, `beneficiaries`, `fraud_signals` = service role only ;
  `profiles` = lecture de soi (la carte passe par la RPC `nearby_poseurs`).
- Preuves Storage : bucket privé, upload scoppé au dossier `<uid>/…`.

---

## 7. Feuille de route de lancement

1. **MVP interne** : projet Supabase de staging, quelques poseurs certifiés, paiements
   Stripe en test, vision branchée. Valider le parcours de bout en bout.
2. **Bêta fermée** (TestFlight / Play internal) : 1 ville, 10–50 poseurs, associations
   réelles, revue manuelle systématique des premières mises.
3. **Lancement public** : ouverture progressive par ville, monitoring anti-fraude,
   barème de points ajusté côté serveur.

## 8. Inducteurs de coût

- Vision Claude : ~1 appel `claude-opus-5` par mise (2 images). À suivre par mise validée.
- Supabase (DB/Storage/Realtime/Functions), Stripe (commissions), SMS OTP (par envoi),
  Google Maps (par chargement), reconnaissance faciale (si `FACE_API` externe).

---

## 9. État du code (au dernier passage)

- ✅ Migrations `0001→0012` s'appliquent de bout en bout ; RLS durcie ; seed déplacé.
- ✅ Récompense du **poseur ET du posé** (posé plafonné à 1×/jour par la reconnaissance).
- ✅ `submit_session` autorise l'appelant, vision réelle (max_tokens 4096), webhook Stripe.
- ✅ Mobile : build débloqué (babel/app.config/assets), flux « appeler un poseur » réparé.
- 🔜 Dépend de toi : comptes/clés, validation rabbinique, RGPD, soumission stores.
