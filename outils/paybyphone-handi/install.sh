#!/bin/bash
# Installation de paybybot3 dans un environnement virtuel propre (macOS).
# Usage : bash install.sh
set -euo pipefail

BASE="$HOME/.paybyphone-handi"
VENV="$BASE/venv"

echo "==> Vérification de Python 3"
if ! command -v python3 >/dev/null; then
  echo "Python 3 introuvable. Installe-le avec : xcode-select --install  (ou brew install python)"
  exit 1
fi
python3 --version

echo "==> Création de $BASE"
mkdir -p "$BASE/logs"

echo "==> Création de l'environnement virtuel"
python3 -m venv "$VENV"
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet "paybybot3==0.2.0"

echo "==> Copie des scripts"
DIR="$(cd "$(dirname "$0")" && pwd)"
cp "$DIR/handi.sh" "$BASE/handi.sh"
cp "$DIR/handi.env.example" "$BASE/handi.env.example"
chmod +x "$BASE/handi.sh"
[ -f "$BASE/handi.env" ] || cp "$BASE/handi.env.example" "$BASE/handi.env"

echo "==> Fichier de configuration"
CFG="$HOME/.config/paybybot3.yml"
mkdir -p "$HOME/.config"
if [ ! -f "$CFG" ]; then
  cp "$DIR/paybybot3.example.yml" "$CFG"
  chmod 600 "$CFG"
  echo "Modèle copié dans $CFG : ouvre-le et renseigne login, mot de passe et plaques."
else
  echo "$CFG existe déjà, je n'y touche pas."
fi

echo
echo "Installation terminée."
echo "Test de connexion : $VENV/bin/paybybot3 vehicles voiture1"
