#!/bin/bash
# Installe et active la tâche launchd (lundi→samedi 9h). Usage : bash activer.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/Library/LaunchAgents/com.shades.paybyphone-handi.plist"
mkdir -p "$HOME/Library/LaunchAgents"
sed "s#__HOME__#$HOME#g" "$DIR/com.shades.paybyphone-handi.plist" > "$DEST"
launchctl bootout "gui/$(id -u)" "$DEST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$DEST"
launchctl enable "gui/$(id -u)/com.shades.paybyphone-handi"
echo "Tâche activée. Prochaine exécution : lundi→samedi à 9h00."
echo "Test immédiat : launchctl kickstart gui/$(id -u)/com.shades.paybyphone-handi"
