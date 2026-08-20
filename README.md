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

**Prérequis** : définir la variable d'environnement `ANTHROPIC_API_KEY` dans Netlify
(Site settings → Environment variables), puis redéployer. Sans elle, l'assistant
affiche un message explicite et l'application reste entièrement utilisable sans lui.

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
