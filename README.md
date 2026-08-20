# SHADES · Déploiement

## Fichiers inclus

| Fichier | Description | URL après déploiement |
|---|---|---|
| `index.html` | Site vitrine principal | `/` |
| `shades_fiche_bien_ultra.html` | Analyse bien + IA | `/fiche-bien` |
| `shades_crm.html` | CRM prospects | `/crm` |
| `shades_carte_idf.html` | Carte IDF interactive | `/carte` |
| `shades_quel_bien.html` | Recommandation budget | `/quel-bien` |
| `shades_equilibrage.html` | Assistant d'équilibrage hydraulique (chauffage / ECS) | `/equilibrage` |
| `paris_haussmann.mp4` | Vidéo hero (optionnel) | — |

## Déploiement Netlify

1. Va sur **app.netlify.com**
2. "Add new site" → "Deploy manually"
3. Glisse-dépose ce dossier entier
4. Ton site est en ligne en 30 secondes ✓

## Configurer le formulaire de contact (Formspree)

1. Va sur **formspree.io** → crée un compte gratuit
2. "New Form" → nom : "SHADES Contact"
3. Copie ton Form ID (ex: `xyzabcde`)
4. Dans `index.html`, cherche `YOUR_FORM_ID` et remplace par ton ID
5. Redéploie sur Netlify

## Domaine personnalisé

Dans Netlify : Site settings → Domain management → Add custom domain
Puis configure tes DNS chez OVH / Gandi / Namecheap :
- Type A → 75.2.60.5
- Type CNAME www → ton-site.netlify.app

## Mettre à jour le site

Il suffit de reglisser-déposer le dossier mis à jour sur Netlify.
Ou connecte un repo GitHub pour les déploiements automatiques.

---
*SHADES · Apporteur d'affaire · Paris & IDF*

---

## Assistant d'équilibrage hydraulique (`/equilibrage`)

Application autonome (un seul fichier HTML, aucune dépendance serveur) qui guide
pas à pas un chauffagiste dans l'équilibrage d'un réseau de chaleur, d'un réseau
d'ECS bouclée, en chauffage collectif comme en industriel.

**Contenu**
- Arborescence multi-niveaux : plusieurs chaufferies, réseaux, bâtiments, colonnes, émetteurs.
- Calcul des débits nominaux (puissance/ΔT, débit direct, déperditions de boucle ECS), correction eau glycolée.
- Bibliothèque de vannes : IMI/TA, Oventrop, STABIFLO, Danfoss, Caleffi, HERZ, Giacomini, BROEN, FRESE, Honeywell/Resideo, COMAP, génériques — statiques, Venturi, limiteurs, DPCV, PICV, thermostatiques ECS.
- Bibliothèque d'appareils de mesure : MIDOR 817, TA-SCOPE / TA-CBI, OV-DMC 3, Danfoss PFM, débitmètre à ultrasons, thermomètre de contact, rotamètres.
- Assistants guidés : méthode proportionnelle, méthode compensée, vérification des organes dynamiques, préréglage calculé, équilibrage ECS par température.
- Saisie et mémorisation des abaques Kv constructeur (réutilisés d'un chantier à l'autre).
- Diagnostic symptôme → cause → action, guide et glossaire.
- **Visite filmée** : on filme l'installation, l'IA l'analyse, pose les questions manquantes et construit le chantier.
- **Parcours guidé** en 6 étapes (mode simple par défaut, mode expert au choix).
- **Assistant IA** (API Claude) qui accompagne les trois phases : étude, exécution, contrôle.
- PV d'équilibrage imprimable, exports CSV et JSON.

**Données** : tout est stocké dans le `localStorage` du navigateur. Aucune donnée
n'est transmise à un serveur. Prévoir un export JSON régulier.

**Réserve technique** : les abaques Kv détaillés ne sont pas pré-chargés (ils sont
propres à chaque référence exacte). L'application calcule le Kv réel à partir de la
mesure — `Kv = Q / (100 × √Δp)` — ce qui la rend utilisable sur n'importe quelle
vanne. Les caractéristiques marquées « à confirmer » doivent être vérifiées dans la
notice du fabricant avant usage contractuel.

### Assistant IA

L'onglet **Assistant IA** appelle l'API Claude via la fonction Netlify déjà présente
dans le dépôt : `netlify/functions/claude-proxy.js`. La clé reste côté serveur.

**Prérequis** : définir les variables d'environnement dans Netlify
(Site settings → Environment variables), puis redéployer :

| Variable | Sert à | Sans elle |
|---|---|---|
| `ANTHROPIC_API_KEY` | analyse des images, questions, construction du chantier, assistant | l'application reste utilisable, sans IA |
| `OPENAI_API_KEY` | transcription du commentaire parlé | repli sur la reconnaissance vocale du navigateur |

À chaque question, l'assistant reçoit automatiquement :
- la base de connaissances de l'application (formules, méthodes, organes, appareils) ;
- un instantané complet du chantier : arborescence, débits nominaux, vannes affectées,
  dernières mesures, rapports L, relevés ECS, checklist et écran/étape en cours.

Trois modes : **Étude** (dimensionnement, choix des organes), **Exécution** (guidage
geste par geste) et **Contrôle** (analyse des écarts, diagnostic, rédaction du PV).
Un bouton ✨ contextuel est disponible depuis la barre du haut, depuis chaque étape de
l'assistant d'équilibrage, depuis le diagnostic et depuis le PV.

L'assistant a pour consigne explicite de **ne jamais inventer une donnée constructeur**
(Kv, Kvs, nombre de tours, dp mini) et de renvoyer à la notice ou au Kv déduit de la mesure.

### Visite filmée analysée par l'IA

L'onglet **📹 Visite** permet de partir de zéro sans rien connaître de l'installation.

**Comment ça marche techniquement** — l'API Claude n'accepte pas de fichier vidéo.
L'application procède donc ainsi, entièrement côté navigateur :

1. capture caméra (`getUserMedia` + `MediaRecorder`) ou import d'une vidéo / de photos ;
2. extraction d'images clés (une toutes les 3 s + photos manuelles), redimensionnées à
   1024 px, compressées en JPEG, et **dédoublonnées** par empreinte 16×16 en niveaux de gris ;
3. transcription du commentaire parlé via la reconnaissance vocale du navigateur
   (`SpeechRecognition`), avec repli sur une saisie texte si elle est indisponible ;
4. envoi à Claude **par lots de 3 images** (pour tenir dans la durée d'exécution d'une
   fonction Netlify), 12 images au maximum, puis un appel de synthèse ;
5. Claude renvoie une sortie structurée (`tool_use`) : synthèse, matériel identifié avec
   niveau de confiance, alertes, et 4 à 12 questions en langage simple ;
6. les questions sont posées **une par une**, avec « pourquoi c'est utile », « où trouver
   la réponse » et un bouton « je ne sais pas » ;
7. un dernier appel construit l'arborescence complète du chantier, affichée pour validation
   avant application, avec les hypothèses et les réserves.

**Le film ne quitte jamais l'appareil** : seules les images clés et le texte sont transmis.

**Tout est automatique après l'appui sur stop** : transcription du son, correction du
vocabulaire, lecture des images, synthèse et questions s'enchaînent sans intervention.
L'utilisateur n'a plus qu'à répondre aux questions et à valider le chantier proposé.

**Transcription du son** — l'audio est enregistré séparément à 32 kbit/s pendant le film
(et extrait du fichier pour une vidéo importée), décodé dans le navigateur, ramené en
mono 16 kHz, découpé en tranches de 60 s puis envoyé à `netlify/functions/transcribe.js`.
Le vocabulaire de l'application (toutes les marques, tous les modèles, les unités et les
termes du métier) est passé en amorce au moteur de transcription : c'est ce qui évite
« vanne stade » au lieu de STAD. Modèle par défaut `gpt-4o-mini-transcribe`
(~0,003 $/minute), repli possible sur `gpt-4o-transcribe` ou `whisper-1`.

**Prérequis** : variable d'environnement `OPENAI_API_KEY` dans Netlify. Sans elle,
l'application le signale et se rabat sur la reconnaissance vocale du navigateur, puis
fait relire ce texte par Claude avec le même vocabulaire. Le texte reste éditable avant
analyse, et les corrections effectuées sont listées pour pouvoir en refuser une.

**Garde-fous côté application** : identifiants de vanne inconnus ignorés, DN invalides
écartés, boucles de parenté impossibles, éléments orphelins rattachés à la chaufferie,
débit fourni par l'IA prioritaire sur une liste d'émetteurs forcément incomplète.
Les hypothèses et réserves sont recopiées dans les notes du chantier et dans le PV.

### Mode simple / mode expert

Par défaut l'application démarre en **mode simple** : écran d'accueil « Parcours » en
6 étapes, onglets techniques masqués, écran de bienvenue au premier lancement.
Le basculement en **mode expert** (dernier onglet) réaffiche Débits, Vannes et Outils.
