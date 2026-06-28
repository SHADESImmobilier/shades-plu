# Hineni — Tefillin Connect

App mobile iOS + Android pour **faire des Mivtzaïm tefillin** et **collecter des
récompenses**, avec un mode « VTC des tefillin » (appeler le poseur disponible
le plus proche).

> Nom de travail provisoire : **Hineni** (הנני).

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

✅ Conception · ✅ Schéma & RLS · ✅ Edge Function anti-fraude · ✅ Scaffold app
(auth OTP, carte poseurs proches, validation par QR, récompenses, profil).

🔜 À implémenter : carte react-native-maps, flux de demande complet, génération
QR côté poseur, empreinte appareil/hash téléphone réels, clearing différé (cron),
back-office d'audit, catalogue partenaires.

Voir [`docs/CONCEPTION.md`](docs/CONCEPTION.md) pour le détail — **dont les points
à trancher** : nature halachique de la récompense, et le fournisseur SMS.
