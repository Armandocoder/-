#!/bin/bash
# Installe (ou réinstalle) le service launchd du hub Editing OS.
# Après ça, http://localhost:4200 répond dès l'ouverture de session, et se
# relance tout seul s'il tombe. Relancer ce script après une mise à jour de node (nvm).
set -euo pipefail
V2="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
NODE_DIR="$(dirname "$NODE_BIN")"
LABEL="com.editing-os.hub"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/EditingOS"
sed -e "s#__NODE__#$NODE_BIN#g" -e "s#__NODEDIR__#$NODE_DIR#g" -e "s#__V2__#$V2#g" -e "s#__HOME__#$HOME#g" \
  "$V2/service/$LABEL.plist.modele" > "$PLIST"
plutil -lint "$PLIST"
# décharger une version précédente sans bruit, puis charger
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart -k "gui/$(id -u)/$LABEL"
sleep 2
if curl -s --max-time 3 http://localhost:4200/api/health >/dev/null; then
  echo "Service installé : http://localhost:4200 répond. Journal : ~/Library/Logs/EditingOS/hub.log"
else
  echo "Service installé mais le hub ne répond pas encore. Regarde : tail -n 40 ~/Library/Logs/EditingOS/hub.launchd.log" >&2
  exit 1
fi
