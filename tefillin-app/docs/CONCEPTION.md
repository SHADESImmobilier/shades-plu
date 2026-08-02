# MitzvaNOW · Conception produit & technique

> **MitzvaNOW** — *mitzva* + *now* : la mitsva, à la demande. Logo : le **Shin (ש)** gravé
> sur le boîtier du tefillin shel rosh, avec les lanières (retsouot).
> Application mobile iOS + Android réunissant **deux mitzvot** :
> **Pilier 1 — Tefillin** : faire/mettre les tefillin (mode « VTC des tefillin »).
> **Pilier 2 — Tsedaka / Maasser** : donner la tsedaka en quelques secondes, chaque jour.

---

## 1. Vision produit

MitzvaNOW rassemble **deux mitzvot du quotidien** dans une seule app :

- **Pilier 1 · Tefillin** — une marketplace à deux faces pour mettre les tefillin à la
  demande (détaillée ci-dessous).
- **Pilier 2 · Tsedaka / Maasser** — un rituel de don **quotidien, ultra-rapide** (Apple Pay
  / PayPal en quelques secondes), avec choix de l'association et suivi du maasser
  (voir §5ter).

Les deux piliers se renforcent : la récompense d'une mise de tefillin peut être **reversée en
tsedaka** (§5), et le don quotidien ancre un usage récurrent de l'app.

### Pilier 1 — deux faces d'une même marketplace :

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
> La **vision** vérifie que les tefillin sont **sur le posé** (tête + bras) et que le
> **poseur est visible** ; la **reconnaissance faciale** authentifie le **poseur** (vs sa
> photo de profil) et garantit qu'un **posé n'est validé qu'une fois par jour**.

### 4.1 Les barrières

1. **Identité téléphonique unique (OTP SMS).**
   Un compte poseur = un numéro vérifié. (Le posé n'a plus besoin de compte : sa preuve
   est la photo + son empreinte faciale anonymisée + son consentement à l'écran.)

2. **Capture LIVE uniquement (anti-rejeu / liveness).**
   La photo est prise **par l'appareil photo de l'app**, horodatée et géotaguée côté
   appareil. **Import depuis la galerie interdit** ; on capture une courte rafale /
   métadonnées caméra pour détecter les photos d'écran ou réutilisées.
   → Casse « je renvoie une vieille photo ».

3. **Vision — les tefillin sont portés par le POSÉ, et le poseur est visible.**
   Le modèle de vision contrôle automatiquement que :
   - le **posé (le bénéficiaire)** porte les tefillin **sur la tête** (chel rosh) **et sur le
     bras** (chel yad) — les tefillin doivent être **attribués au posé**, pas au poseur ;
   - le **poseur est présent** sur la même photo (≥ 2 visages).
   Si la scène n'est pas conforme → revue manuelle (pas de crédit auto).
   → Casse « selfie sans tefillin » et « tefillin portés par le poseur seul ».

4. **Double reconnaissance faciale.**
   - **(a) Poseur authentifié** : le visage du poseur sur la photo est comparé à sa
     **photo de référence enrôlée sur son profil** (empreinte faciale). On confirme que
     **c'est bien lui** qui réalise la mise → empêche prête-nom / partage de compte / farming.
   - **(b) Posé unique, une fois par jour** : on met les tefillin **une seule fois par
     jour**, donc un même **visage de posé ne peut être validé qu'une fois par jour**.
     → Casse « refaire la même personne » et la collusion en boucle.
   ⚠️ **Donnée biométrique** : consentement du posé, **enrôlement volontaire** du poseur,
   finalité strictement anti-fraude, conservation limitée, droit à l'effacement (cf. §8).

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

## 5ter. Pilier Tsedaka / Maasser (dons réels)

> Deuxième mitzva de MitzvaNOW : **donner la tsedaka**, et suivre son **maasser**
> (le dixième que l'on met de côté). Objectif : rendre le don **quotidien, instantané et
> sans friction** — quelques secondes, quelques taps.

### 5ter.1 Parcours « don quotidien »
```
Notification quotidienne (heure choisie) : « C'est l'heure de la tsedaka 🙏 »
   → Ouvre l'écran Tsedaka (montant pré-suggéré : 1€, 2€, 5€, 10€, libre)
   → Choix de l'association (favoris, causes, ou MitzvaNOW pour soutenir le projet)
   → Anonyme ou non (nom affiché à l'association / au mur de dons, ou masqué)
   → Payer : Apple Pay / Google Pay / PayPal / carte  (2 taps, Face ID)
   → Reçu + compteur de maasser mis à jour
```

### 5ter.2 Fonctionnalités clés
- **Rappel quotidien** configurable (heure), via notification push. Idéal avant une heure
  de prière ou en fin de journée.
- **Don express** : montants pré-réglés + montant libre ; **don récurrent** possible (ex.
  chaque jour / semaine / avant Shabbat).
- **Annuaire d'associations** : plusieurs causes (aide aux familles, étude/yéchivot,
  hachnasat kala, malades, MitzvaNOW pour soutenir le projet…). Favoris + recherche.
- **Anonyme ou nominatif** : le donateur choisit, par don, s'il apparaît (mur de dons /
  reçu association) ou reste anonyme.
- **Suivi du maasser** : tableau de bord « donné ce mois / cette année », objectif de
  maasser (10 % d'un revenu déclaré, optionnel), historique, **reçus** téléchargeables.
- **Soutien à la plateforme** : « donner à MitzvaNOW » comme association parmi les autres.

### 5ter.3 Paiement (recommandation)
- **Stripe** = rail principal : `@stripe/stripe-react-native` → **PaymentSheet** natif qui
  expose **Apple Pay + Google Pay + cartes** en une intégration ; dons récurrents ; reçus.
- **PayPal** en alternative (donateurs qui le préfèrent).
- **HelloAsso** pour les associations françaises : **gratuit pour l'asso** et **émet les
  reçus fiscaux** (essentiel pour la déductibilité côté donateur).
- **Stripe Connect (destination charges)** : les fonds vont **directement sur le compte de
  chaque association** ; MitzvaNOW ne détient pas l'argent (bien plus simple juridiquement)
  et peut prélever une **commission de plateforme** optionnelle (ou 0).

### 5ter.4 Conformité (dons réels)
- MitzvaNOW se positionne en **intermédiaire technique**, pas en collecteur de fonds :
  via Stripe Connect / HelloAsso, l'argent ne transite pas par ses comptes.
- **Reçus fiscaux** émis par l'association habilitée (pas par MitzvaNOW) ; on stocke la
  référence du reçu et le statut « au titre du maasser ».
- KYC/anti-blanchiment gérés par le PSP (Stripe/HelloAsso). RGPD : minimisation, choix
  d'anonymat respecté jusque dans les données transmises à l'association.

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
