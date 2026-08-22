# MitzvaNOW

App mobile iOS + Android réunissant **deux mitzvot** :
- **Pilier 1 · Tefillin** — faire/mettre les tefillin à la demande (« VTC des tefillin »)
  et collecter des récompenses.
- **Pilier 2 · Tsedaka / Maasser** — donner la tsedaka en quelques secondes chaque jour
  (Apple Pay / Google Pay / PayPal), anonyme ou non, à l'association de son choix
  (dont MitzvaNOW), avec suivi du maasser.

> **MitzvaNOW** — *mitzva* + *now* : la mitsva, à la demande. Logo : le Shin (ש) du tefillin shel rosh.

## Structure

```
tefillin-app/
├── docs/
│   └── CONCEPTION.md          # Vision, parcours, anti-fraude, récompenses, archi
├── supabase/
│   ├── migrations/
│   │   └── 0001_init.sql      # Schéma Postgres + PostGIS + RLS
│   └── functions/
│       └── validate_session/  # Edge Function : co-présence + score de risque
└── mobile/                    # App Expo (React Native + TypeScript, expo-router)
    ├── app/                   # Écrans (auth, carte, récompenses, profil, validate)
    └── lib/                   # Client Supabase + types
```

## Stack

- **Mobile** : Expo (React Native, TS) · expo-router · react-native-maps · expo-location/camera/notifications
- **Backend** : Supabase — Auth (OTP SMS) · Postgres + PostGIS · Realtime · Storage · Edge Functions
- **Sécurité** : RLS partout ; logique anti-fraude uniquement côté serveur (Edge Functions / RPC)

## Démarrage (une fois un projet Supabase créé)

1. **Supabase**
   - Créer un projet, activer **PostGIS**.
   - Appliquer la migration : `supabase db push` (ou coller `0001_init.sql` dans le SQL editor).
   - Activer le provider **Phone (SMS OTP)** dans Auth (brancher un fournisseur SMS).
   - Déployer la fonction : `supabase functions deploy validate_session`.
2. **App mobile**
   - `cd mobile && npm install`
   - Renseigner `supabaseUrl` / `supabaseAnonKey` dans `app.json > expo.extra`.
   - `npx expo start` (puis i / a, ou Expo Go).
   - Build stores : `eas build` (EAS).

## État

✅ Conception · ✅ Schéma & RLS (PostGIS + pgvector) · ✅ Edge Functions
anti-fraude (`submit_session`) et clearing (`clear_rewards`).
✅ Thème **blanc & bleu** centralisé (`lib/theme.ts`).
✅ **Preuve par selfie LIVE** (`capture`) : photo in-app du poseur + posé avec
tefillin (tête + bras) → upload Storage privé → analyse serveur (vision +
empreinte faciale anti-farming + score de risque). **Plus de QR.**
✅ **Vision réelle branchée** : `submit_session` appelle le modèle Claude
(`claude-opus-5`, SDK Anthropic, sortie structurée JSON schema) pour vérifier la
scène (2 personnes, poseur visible, tefillin tête + bras **sur le posé**, liveness)
**et** authentifier le poseur (comparaison à sa photo de référence `face_ref_path`).
Le poseur enrôle sa référence via `enroll_face`. Le dédoublonnage « 1×/jour » du posé
utilise un service de reconnaissance dédié (`FACE_API`) ; s'il est absent → revue manuelle.
✅ App Expo : auth OTP, **carte react-native-maps** des poseurs proches,
récompenses, **catalogue partenaires** (échange de points → bon via `issue_voucher`),
profil (mode poseur).
✅ **Flux "VTC" temps réel** : le demandeur crée une demande (`request`) et suit
le poseur en direct ; le poseur reçoit les demandes proches en direct (`incoming`),
les accepte (RPC `accept_request`), puis prend la photo de la mise (`capture`).

✅ **Pilier Tsedaka** : onglet Tsedaka (don express Apple Pay / Google Pay / carte via
Stripe PaymentSheet), annuaire d'associations (dont MitzvaNOW), anonymat, suivi du maasser
(`money_donations`, `create_donation`, `maaser_summary`), **rappel quotidien** (notification).

✅ **Récompense du poseur ET du posé** : pour une mise validée, le posé (s'il a un
compte) reçoit aussi des points, plafonné à 1×/jour par la reconnaissance faciale
(modèle de récompenses généralisé : `rewards.recipient_id` + `role`).
✅ **Durcissement production** : migrations `0001→0012` qui s'appliquent de bout en
bout, RLS renforcée (biométrie/anti-fraude en service-role only), `submit_session`
qui autorise l'appelant, **webhook Stripe** (dons → `succeeded`), cron de clearing
(pg_cron), seed de démo isolé (`supabase/seed.sql`), build mobile débloqué
(`babel.config.js`, `app.config.ts`, icônes/splash), **CI** (typecheck + deno check).

🔜 Dépend de toi (voir [`docs/PRODUCTION.md`](docs/PRODUCTION.md)) : comptes & clés,
validation rabbinique, RGPD (conservation biométrie), soumission stores. Optionnel :
brancher un `FACE_API` externe ; notifications push (FCM/APNs) ; back-office d'audit web.

**Secrets** : voir [`.env.example`](.env.example) et le runbook
[`docs/PRODUCTION.md`](docs/PRODUCTION.md) (Supabase, Stripe + webhook, Anthropic,
SMS, Google Maps, `CRON_SECRET`).

Voir [`docs/CONCEPTION.md`](docs/CONCEPTION.md) pour le détail — **dont les points
à trancher** : nature halachique de la récompense, et le fournisseur SMS.
