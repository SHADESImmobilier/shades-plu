# SHADES · Déploiement

## Fichiers inclus

| Fichier | Description | URL après déploiement |
|---|---|---|
| `index.html` | Site vitrine principal | `/` |
| `shades_fiche_bien_ultra.html` | Analyse bien + IA | `/fiche-bien` |
| `shades_crm.html` | CRM prospects | `/crm` |
| `shades_carte_idf.html` | Carte IDF interactive | `/carte` |
| `shades_quel_bien.html` | Recommandation budget | `/quel-bien` |
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
