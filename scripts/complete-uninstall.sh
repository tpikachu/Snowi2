#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "This script will stop Snowy, remove the installed app, and delete caches, databases, and preferences."
read -r -p "Continue with the full uninstall? [y/N]: " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

remove_target() {
  local target="$1"
  if [[ -e "$target" ]]; then
    echo "Removing $target"
    rm -rf "$target" 2>/dev/null || sudo rm -rf "$target"
  fi
}

echo "Stopping running Snowy/Electron processes..."
pkill -f "Snowy" 2>/dev/null || true
pkill -f "Electron Helper.*Snowy" 2>/dev/null || true

echo "Removing /Applications/Snowy.app (requires admin)..."
remove_target "/Applications/Snowy.app"

echo "Purging Application Support data..."
remove_target "$HOME/Library/Application Support/Snowy"
remove_target "$HOME/Library/Application Support/Snowy-development"
remove_target "$HOME/Library/Application Support/Snowy-staging"
remove_target "$HOME/Library/Application Support/com.snowball.money"

echo "Removing caches, logs, and saved state..."
remove_target "$HOME/Library/Caches/Snowy"
remove_target "$HOME/Library/Caches/com.snowball.money"
remove_target "$HOME/Library/Preferences/com.snowball.money.plist"
remove_target "$HOME/Library/Preferences/com.snowball.money.helper.plist"
remove_target "$HOME/Library/Logs/Snowy"
remove_target "$HOME/Library/Saved Application State/com.snowball.money.savedState"
remove_target "$HOME/.cache/snowy"

echo "Cleaning temporary files..."
shopt -s nullglob
for tmp in /tmp/snowy*; do
  remove_target "$tmp"
done
for crash in "$HOME/Library/Application Support/CrashReporter"/Snowy_*; do
  remove_target "$crash"
done
shopt -u nullglob

read -r -p "Remove downloaded Whisper models and caches (~/.cache/whisper, ~/Library/Application Support/whisper)? [y/N]: " wipe_models
if [[ "$wipe_models" =~ ^[Yy]$ ]]; then
  remove_target "$HOME/.cache/whisper"
  remove_target "$HOME/Library/Application Support/whisper"
  remove_target "$HOME/Library/Application Support/Snowy/models"
fi

ENV_FILE="$PROJECT_ROOT/.env"
if [[ -f "$ENV_FILE" ]]; then
  read -r -p "Remove the local environment file at $ENV_FILE? [y/N]: " wipe_env
  if [[ "$wipe_env" =~ ^[Yy]$ ]]; then
    echo "Removing $ENV_FILE"
    rm -f "$ENV_FILE"
  fi
fi

cat <<'EOF'
macOS keeps microphone, screen recording, and accessibility approvals even after files are removed.
Reset them if you want a truly fresh start:
  tccutil reset Microphone com.snowball.money
  tccutil reset Accessibility com.snowball.money
  tccutil reset ScreenCapture com.snowball.money

Full uninstall complete. Reboot if you removed permissions, then reinstall or run npm scripts on a clean tree.
EOF
