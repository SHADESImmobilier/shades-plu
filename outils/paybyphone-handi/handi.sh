#!/bin/bash
# Prise quotidienne du ticket HANDI sur PayByPhone, lancé par launchd.
# paybybot3 renvoie toujours le code 0 : on lit donc sa sortie pour savoir si ça a marché.
set -u

BASE="$HOME/.paybyphone-handi"
VENV="$BASE/venv"
LOGDIR="$BASE/logs"
mkdir -p "$LOGDIR"
LOG="$LOGDIR/handi-$(date +%Y-%m-%d).log"

# shellcheck disable=SC1090
source "$BASE/handi.env"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG"; }

if [ -z "${RATE:-}" ]; then
  log "ERREUR : RATE n'est pas renseigné dans $BASE/handi.env"
  exit 2
fi

status=0
for cfg in $CONFIGS; do
  log "== $cfg : ticket HANDI $DURATION $UNIT, zone $LOCATION, tarif $RATE"
  # Aucun mot de passe n'apparaît dans la sortie : paybybot3 ne journalise pas les identifiants.
  out="$("$VENV/bin/paybybot3" pay "$cfg" --location "$LOCATION" --rate "$RATE" \
          --duration "$DURATION" --unit "$UNIT" 2>&1)"
  echo "$out" >> "$LOG"
  if echo "$out" | grep -qE "Payment succeeded|Already registered"; then
    log "OK : $cfg couvert."
  else
    log "ECHEC : $cfg — déclare le ticket à la main aujourd'hui."
    status=1
  fi
done

if [ "$status" -ne 0 ] && [ -n "${FALLBACK_NOTIFY:-}" ]; then
  "$VENV/bin/apprise" -t "PayByPhone HANDI : échec" \
    -b "Le ticket HANDI n'a pas pu être pris automatiquement ($(date '+%d/%m/%Y')). Déclare-le à la main. Détail : $LOG" \
    "$FALLBACK_NOTIFY" >> "$LOG" 2>&1 || true
fi

# Ménage : on garde 60 jours de journaux
find "$LOGDIR" -name 'handi-*.log' -mtime +60 -delete 2>/dev/null
exit "$status"
