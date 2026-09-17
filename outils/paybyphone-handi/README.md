# Ticket HANDI PayByPhone automatique (Paris, CMI-S)

Kit pour déclarer chaque jour le ticket « Handi – toutes zones » dans PayByPhone,
pour les véhicules **non référencés Handi'Stat**, via `paybybot3` et `launchd` sur macOS.

> **Avertissements**
> - L'API PayByPhone utilisée par `paybybot3` n'est pas officielle. Elle peut cesser de
>   fonctionner à n'importe quelle mise à jour de leur côté, et son usage est à tes risques
>   au regard de leurs conditions d'utilisation. Garde toujours l'appli sous la main.
> - Ne déclare que les véhicules réellement stationnés en voirie.
> - Le mot de passe PayByPhone n'existe qu'à un seul endroit : `~/.config/paybybot3.yml`.
>   Il n'est jamais écrit dans les journaux (`paybybot3` ne journalise pas les identifiants,
>   et la plaque y est masquée dans les notifications).

## 1. Installation (une fois)

Dans le Terminal, depuis ce dossier :

```bash
bash install.sh
```

Cela crée `~/.paybyphone-handi/` (environnement virtuel Python + scripts + journaux)
et copie un modèle de configuration dans `~/.config/paybybot3.yml`.

## 2. Configuration

Ouvre `~/.config/paybybot3.yml` (par exemple `open -e ~/.config/paybybot3.yml`) et renseigne :

- `login` : ton numéro PayByPhone au format `+336...`
- `password` : ton mot de passe PayByPhone
- `plate` : la plaque du véhicule (une entrée `voitureN` par véhicule non référencé Handi'Stat)
- `apprise` : où envoyer les alertes d'échec (e-mail, Telegram, Pushover…)

Puis vérifie la connexion et la liste des véhicules :

```bash
~/.paybyphone-handi/venv/bin/paybybot3 vehicles voiture1
```

Récupère le `paymentAccountId` (obligatoire pour `pay`, même si le tarif HANDI est gratuit)
et reporte-le dans le YAML :

```bash
~/.paybyphone-handi/venv/bin/paybybot3 payment-accounts voiture1
```

## 3. Trouver le tarif HANDI

```bash
~/.paybyphone-handi/venv/bin/paybybot3 rate-options voiture1 --location 75001
```

Repère la ligne dont le `name` contient **HANDI** ou **CMI** et note son `ratePolicyId`.
Écris-le dans `~/.paybyphone-handi/handi.env` (`RATE="..."`), et liste dans `CONFIGS`
les entrées à déclarer chaque jour (ex. `CONFIGS="voiture1 voiture2"`).

## 4. Premier test manuel

```bash
bash ~/.paybyphone-handi/handi.sh
~/.paybyphone-handi/venv/bin/paybybot3 check voiture1 --location 75001
```

`handi.sh` affiche `OK : voiture1 couvert.` si une session est active (nouvelle ou déjà en
cours), sinon `ECHEC`. `check` doit montrer la session avec son `expireTime`.
Vérifie aussi dans l'appli PayByPhone que le ticket apparaît bien.

## 5. Activer l'automatisation (lundi → samedi, 9h00)

```bash
bash activer.sh
```

Pour lancer tout de suite sans attendre 9h :

```bash
launchctl kickstart gui/$(id -u)/com.shades.paybyphone-handi
```

Pour changer l'heure ou les jours : édite `com.shades.paybyphone-handi.plist`
(`Weekday` 1 = lundi … 6 = samedi, 0 = dimanche) puis relance `bash activer.sh`.

## 6. Notifications d'échec

- `paybybot3` envoie lui-même une alerte via Apprise (`broadcast-warning` si le paiement
  n'a pas abouti, `broadcast-failure` sur erreur technique).
- En secours, `FALLBACK_NOTIFY` dans `handi.env` envoie une alerte même si `paybybot3`
  a planté avant de pouvoir prévenir.

Sur alerte : déclare le ticket à la main dans l'appli ce jour-là.

## 7. Où sont les fichiers et comment vérifier

| Quoi | Où |
|---|---|
| Identifiants et plaques | `~/.config/paybybot3.yml` (droits 600) |
| Paramètres du ticket (tarif, durée, véhicules) | `~/.paybyphone-handi/handi.env` |
| Script lancé chaque jour | `~/.paybyphone-handi/handi.sh` |
| Journaux par jour | `~/.paybyphone-handi/logs/handi-AAAA-MM-JJ.log` |
| Journal brut de paybybot3 | `~/paybybot3.log` |
| Tâche launchd | `~/Library/LaunchAgents/com.shades.paybyphone-handi.plist` |

Vérifier que ça a tourné aujourd'hui :

```bash
cat ~/.paybyphone-handi/logs/handi-$(date +%Y-%m-%d).log
launchctl print gui/$(id -u)/com.shades.paybyphone-handi | grep -E "last exit|state"
```

Désactiver :

```bash
bash desactiver.sh
```

## 8. Mac éteint ou en veille à 9h

`launchd` rattrape une exécution manquée **si le Mac était en veille** : elle part au
réveil. Si le Mac était **éteint**, l'exécution du jour est perdue.

Options :

1. Réveil programmé : *Réglages Système → Économiseur d'énergie / Batterie → Planifier*
   (ou `sudo pmset repeat wakeorpoweron MTWRFS 08:55:00`). Le Mac se réveille à 8h55
   et la tâche part à 9h.
2. Empêcher la veille la nuit sur un Mac branché : `sudo pmset -c sleep 0`.
3. Hébergement ailleurs, si le Mac est souvent éteint : un Raspberry Pi ou un petit VPS
   (≈ 4 €/mois) sous Linux, avec le même `paybybot3` et une ligne `cron` :
   `0 9 * * 1-6 /home/user/.paybyphone-handi/handi.sh`. Le fichier YAML doit alors être
   copié sur cette machine, avec les mêmes précautions.

## Comment ça marche

`handi.sh` lance `paybybot3 pay` pour chaque entrée de `CONFIGS`. `pay` vérifie d'abord si
une session est déjà en cours pour cette plaque (dans ce cas il ne fait rien), sinon il
prend un ticket de 24 h au tarif HANDI, attend 20 s, et revérifie. Comme `paybybot3`
renvoie toujours le code 0 même en cas d'erreur, `handi.sh` lit sa sortie pour décider
OK / ECHEC et renvoie un code d'erreur exploitable par `launchd`.
