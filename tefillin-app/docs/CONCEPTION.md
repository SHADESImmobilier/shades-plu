# Mitsv'APP · Conception produit & technique

> **Mitsv'APP** — de *mitsva* + *app*. Logo : le **Shin (ש)** gravé sur le boîtier du
> tefillin shel rosh, avec les lanières (retsouot).
> Application mobile iOS + Android permettant de **faire des Mivtzaïm tefillin** et de
> **collecter des récompenses**, avec un mode **« VTC des tefillin »** : un Juif qui veut
> mettre les tefillin peut appeler le poseur disponible le plus proche.

---

## 1. Vision produit

Deux problèmes résolus, deux faces d'une même marketplace :

| Face | Persona | Besoin | Ce que l'app apporte |
|------|---------|--------|----------------------|
| **Offre** | Le **Poseur** (possède une paire de tefillin, fait Mivtzaïm) | Faire mettre les tefillin à un maximum de Juifs, être valorisé | Trouve des demandeurs proches, logue ses mises, gagne des récompenses |
| **Demande** | Le **Demandeur** (Juif qui veut mettre les tefillin) | Mettre les tefillin facilement, où qu'il soit | Appelle le poseur disponible le plus proche, « à la Uber » |

> ⚠️ Une seule personne peut être **les deux** (un poseur reste un Juif qui peut aussi être demandeur). Le rôle est un **mode**, pas un type de compte figé.

### Deux flux d'usage principaux

1. **Flux « VTC » (à la demande)** — le demandeur ouvre l'app → voit les poseurs dispo sur la carte → envoie une demande → le poseur le plus proche accepte → ils se rencontrent → mise des tefillin → **selfie live de validation** → récompense créditée au poseur.
2. **Flux « Mivtza de rue » (spontané)** — le poseur aborde quelqu'un dans la rue / sur un stand. Pour valider, il prend un **selfie live des deux** avec les tefillin (consentement du posé), et la session est enregistrée.

L'anti-fraude (section 4) est commun aux deux flux.

---

## 2. Périmètre du MVP vs. plus tard

### MVP (V1)
- Auth par téléphone (OTP SMS via Supabase Auth).
- Profil + activation du **mode poseur** (avec vérification renforcée, cf. §4).
- Carte temps réel des poseurs disponibles (PostGIS + Supabase Realtime).
- Demande à la demande + acceptation par le poseur le plus proche.
- Validation d'une session **Mivtza** par selfie live (vision + reconnaissance faciale).
- Portefeuille de récompenses (points / cashback en attente → validé).
- Catalogue partenaires + génération de bons (codes de réduction).
- **Don du solde à la tsedaka** (tout ou partie, déductible du maasser).
- File d'audit anti-fraude côté back-office.

### Plus tard (V2+)
- Endossement par organisations (Beth Habad, Mosdot) → poseurs « certifiés ».
- Classements / gamification (badges, séries, défis communautaires).
- Statistiques globales de Mivtzaïm (impact communautaire).
- Paiement réel du cashback (intégration PSP / cartes cadeaux).
- Mode hors-ligne pour stands / événements.
- Parrainage, contenu (horaires, rappel quotidien, localisation des tefillin perdus/à réparer).

---

## 3. Parcours utilisateur (résumé)

### 3.1 Demandeur — flux VTC
```
Ouvre l'app → "Mettre les tefillin maintenant"
   → Géoloc → carte des poseurs proches (ETA, distance, note)
   → Envoie la demande (point de RDV = position actuelle)
   → Poseur accepte → suivi en temps réel de l'approche
   → Rencontre → mise des tefillin
   → Demandeur confirme dans l'app (proximité vérifiée) → reçu / bracha
```

### 3.2 Poseur — disponibilité + acceptation
```
Active "mode poseur" (vérifié) → bascule "Disponible"
   → Notification push : demande à 300 m
   → Accepte → navigation vers le demandeur
   → Mise des tefillin → ouvre l'appareil photo (capture LIVE)
   → Selfie poseur + posé côte à côte, tefillin visibles (tête + bras)
   → Consentement du posé à l'écran → envoi → session "pending"
   → Récompense créditée (en attente de clearing anti-fraude)
```

### 3.3 Mivtza de rue
```
Poseur dans la rue → "Nouvelle mise"
   → Appareil photo LIVE (pas d'import galerie)
   → Selfie poseur + posé, tefillin tête + bras visibles
   → Consentement du posé → envoi (GPS + horodatage) → session "pending"
```

---

## 4. Système anti-fraude (le cœur du sujet)

> Objectif : **les récompenses ne récompensent que de vraies mises de tefillin, à de
> vraies personnes**, en empêchant : (a) les mises fictives, (b) la collusion (deux amis
> qui se « valident » en boucle), (c) la multiplication de faux comptes.

Le principe directeur : **aucune confiance unilatérale.** Une session n'est jamais
récompensée sur la seule déclaration du poseur. Elle doit franchir plusieurs barrières
indépendantes, et la récompense reste **« en attente » (pending)** jusqu'au *clearing*.

> **Modèle V2 (décision produit) : preuve par SELFIE LIVE + reconnaissance faciale.**
> On abandonne le QR/double-confirmation (trop complexe pour l'utilisateur). La preuve
> d'une mise est désormais **une photo prise en direct dans l'app** (jamais importée de
> la galerie) montrant **le poseur et le posé côte à côte, avec les tefillin (tête + bras)**.
> La **vision par ordinateur** vérifie la scène et la **reconnaissance faciale** sert
> surtout à l'**anti-farming** (un même posé ne peut pas être réutilisé en boucle).

### 4.1 Les barrières

1. **Identité téléphonique unique (OTP SMS).**
   Un compte poseur = un numéro vérifié. (Le posé n'a plus besoin de compte : sa preuve
   est la photo + son empreinte faciale anonymisée + son consentement à l'écran.)

2. **Capture LIVE uniquement (anti-rejeu / liveness).**
   La photo est prise **par l'appareil photo de l'app**, horodatée et géotaguée côté
   appareil. **Import depuis la galerie interdit** ; on capture une courte rafale /
   métadonnées caméra pour détecter les photos d'écran ou réutilisées.
   → Casse « je renvoie une vieille photo ».

3. **Vérification de la scène par vision (le posé + les tefillin).**
   Un modèle de vision contrôle automatiquement sur la photo :
   - **≥ 2 visages** distincts (poseur + posé) ;
   - **tefillin détectés sur la tête** (chel rosh) **et sur le bras** (chel yad).
   Si la scène n'est pas conforme → la session part en revue manuelle (pas de crédit auto).
   → Casse « selfie sans tefillin / sans seconde personne ».

4. **Reconnaissance faciale = anti-farming du posé.**
   Pour chaque posé, on calcule une **empreinte faciale (embedding)** stockée de façon
   sécurisée (pas la photo brute pour le matching). On l'utilise pour :
   - **dédupliquer** : récompense pleine pour un posé **nouveau** ; **cooldown** si le même
     visage revient (ex. 1 fois / 30 jours, dégressif) ;
   - détecter la **collusion** (mêmes 2 visages qui se répètent, ronde de visages, etc.).
   → Casse « deux amis se prennent en photo en boucle ».
   ⚠️ **Donnée biométrique** : consentement explicite du posé, finalité limitée
   (anti-fraude), durée de conservation courte, droit à l'effacement (cf. §8).

5. **Co-présence géographique & horodatage.**
   GPS + heure de capture : vélocité impossible (50 mises en 5 min à travers la ville),
   rafales nocturnes, position incohérente → signaux de risque.

6. **Score de risque & détection d'anomalies.**
   Agrège tout : scène non conforme, visage déjà vu (cooldown), même appareil poseur/posé,
   vélocité géo, numéros séquentiels, IP/appareil partagés → score `low/medium/high`.

7. **Niveaux de confiance & probation.**
   - Nouveau poseur = **probation** : récompenses gelées plus longtemps, plus d'audits,
     **toutes** ses premières sessions passent en revue manuelle.
   - Poseur **certifié** (endossé par une organisation reconnue, cf. V2) = clearing rapide.
   - Le niveau monte avec l'historique propre ; il chute en cas de signaux frauduleux.

8. **File d'audit + clearing différé.**
   Toute récompense naît **`pending`**. Clearing :
   - **auto** après X h si `risk=low`, scène conforme et poseur établi ;
   - **revue manuelle** (back-office, la photo est revue par un humain) si `risk≥medium`,
     probation, scène non conforme, ou tirage aléatoire.
   Sanctions graduées : avertissement → gel → bannissement + récupération des récompenses.

### 4.2 Cycle de vie d'une session

```
created                     (le poseur ouvre la caméra)
  → submitted               (selfie live envoyé + consentement du posé)
  → confirmed               (vision conforme + visage nouveau + risk=low)
  → under_review            (scène douteuse, visage déjà vu, ou tirage audit)  ─┐
  → validated               (a passé le clearing)                               │
  → rewarded                (récompense créditée et clearée)                    │
  → rejected                (scène non conforme / fraude avérée)             ◄──┘
```

### 4.3 Ce qu'on NE fait pas (anti-patterns)
- ❌ Créditer **automatiquement** sur la seule photo : la vision pré-filtre, mais le doute
  va toujours en **revue humaine** avant crédit.
- ❌ Accepter une image importée de la galerie (capture live obligatoire).
- ❌ Faire confiance au GPS seul (spoofable) — toujours combiné scène + visage + temps.
- ❌ Stocker des empreintes faciales sans **consentement explicite** ni base légale.

---

## 5. Récompenses

- **Unité interne** : *points* (ex. 1 mise validée = N points), pour découpler de l'argent.
- **Conversion** :
  - **Cashback** (cagnotte → virement / carte cadeau via PSP en V2),
  - **Bons d'achat / réductions** chez **partenaires** (épiceries, librairies juives,
    restaurants, sofer/réparation tefillin, etc.) → génération de **codes de réduction**.
  - **Don à la tsedaka** : l'utilisateur peut reverser **tout ou partie** de son solde
    à une association habilitée. Les points sont convertis en valeur monétaire reversée,
    et un **reçu** est émis ; si l'association est éligible, ce don peut être **déductible
    et déclaré au titre du maasser**. Forte valeur communautaire + simplifie la question
    halachique (la récompense peut intégralement devenir tsedaka).
- **États d'une récompense** : `pending` (anti-fraude) → `cleared` → `redeemed` / `expired`.
- **Barème modulable** côté serveur (config), pas en dur dans l'app.
- Garde-fous : plafonds quotidiens, expiration des bons, anti-rejeu des codes.

> ⚠️ **Point d'attention halachique/éthique à trancher avec une autorité rabbinique :**
> récompenser financièrement une mitzva peut poser question (lishma / שלא לשמה).
> Pistes : présenter la récompense comme un **remboursement de frais / encouragement
> communautaire** plutôt qu'un « paiement à l'acte », plafonds symboliques, dons reversés
> à une tsedaka au choix de l'utilisateur. **À cadrer avant lancement.**

---

## 6. Architecture technique

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  App mobile (Expo / RN, TS)  │        │   Back-office admin (web)    │
│  - expo-router               │        │   - file d'audit fraude      │
│  - react-native-maps         │        │   - partenaires / barèmes    │
│  - expo-location / camera    │        │   (Next.js ou Supabase Studio)│
│  - expo-notifications        │        └───────────────┬──────────────┘
└──────────────┬──────────────┘                        │
               │ supabase-js (Auth/Realtime/RPC)        │
               ▼                                         ▼
        ┌───────────────────────────────────────────────────────┐
        │                       Supabase                         │
        │  Auth (OTP SMS)  │  Postgres + PostGIS  │  Realtime    │
        │  Storage (photos)│  Row Level Security  │  Edge Funcs  │
        └───────────────────────────────────────────────────────┘
                 │ Edge Functions (Deno) pour la logique sensible :
                 │  - validate_session (proximité + score risque)
                 │  - clear_rewards (clearing différé, cron)
                 │  - issue_voucher (génération code partenaire)
```

### Choix clés
- **Mobile** : **React Native via Expo** (TS, expo-router). Build cloud **EAS**.
- **Backend** : **Supabase** — Auth OTP, Postgres + **PostGIS** (géo/matching), Realtime
  (positions/poseurs dispo), Storage (photos d'audit), **RLS** partout, **Edge Functions**
  (Deno) pour la logique anti-fraude qui ne doit **jamais** tourner côté client.
- **Sécurité** : la validation/score/clearing/émission de bons se font **uniquement** dans
  des Edge Functions/RPC `SECURITY DEFINER`, jamais en clientside.

---

## 7. Modèle de données (vue d'ensemble)

Détaillé en SQL : `../supabase/migrations/0001_init.sql`. Tables principales :

- `profiles` — extension de `auth.users` (nom, ville, `is_poseur`, `trust_level`, org).
- `organizations` — Beth Habad / Mosdot (endossement, V2).
- `poseur_availability` — disponibilité + dernière position (geography), pour le matching.
- `tefillin_requests` — demandes « VTC » (statut, position, poseur assigné, expiration).
- `mivtza_sessions` — la mise elle-même (poseur, bénéficiaire, positions, statut, preuves).
- `session_tokens` — QR/codes éphémères signés pour la double confirmation.
- `beneficiaries` — suivi anti-farming (hash téléphone + empreinte appareil, compteurs).
- `devices` — empreintes d'appareils par utilisateur (anti multi-comptes).
- `fraud_signals` — signaux/score par session.
- `rewards` + `reward_ledger` — récompenses et solde (points), états.
- `partners` + `partner_offers` + `redemptions` — catalogue et bons générés.

RLS : chacun ne voit que ses données ; la logique sensible passe par des RPC/Functions.

---

## 8. Conformité & risques à traiter

- **RGPD** : minimisation (hash des numéros bénéficiaires), consentement photo, durée de
  conservation des photos d'audit, droit à l'effacement, registre des traitements.
- **Stores** : géoloc en arrière-plan justifiée, permissions caméra/localisation, politique
  de confidentialité obligatoire (App Store / Play).
- **Halacha/éthique** : cf. §5 — cadrer la nature de la « récompense ».
- **Sécurité financière** : KYC léger si cashback réel (V2), lutte anti-blanchiment basique.
- **Modération/sécurité physique** : signalement, blocage, pas de mineurs non encadrés.

---

## 9. Prochaines étapes

1. Valider stack (RN/Expo + Supabase) et le nom.
2. Trancher le point halachique sur la récompense (autorité rabbinique).
3. Scaffold MVP (✅ fourni dans ce dépôt : `mobile/` + `supabase/`).
4. Brancher un vrai projet Supabase (Auth OTP + migration SQL).
5. Implémenter l'Edge Function `validate_session` (proximité + score).
6. Pilote sur une ville / une communauté pour calibrer le barème et l'anti-fraude.
