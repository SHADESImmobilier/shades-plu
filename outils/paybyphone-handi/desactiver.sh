#!/bin/bash
# Désactive la tâche launchd. Usage : bash desactiver.sh
DEST="$HOME/Library/LaunchAgents/com.shades.paybyphone-handi.plist"
launchctl bootout "gui/$(id -u)" "$DEST" 2>/dev/null || true
rm -f "$DEST"
echo "Automatisation désactivée (les fichiers dans ~/.paybyphone-handi sont conservés)."
