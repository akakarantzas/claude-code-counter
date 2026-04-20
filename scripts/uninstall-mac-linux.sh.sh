#!/bin/bash
# Claude Code Counter — uninstaller
set -e

BOLD="\033[1m"; GREEN="\033[32m"; RESET="\033[0m"
OS="$(uname -s)"

echo -e "\n${BOLD}Uninstalling Claude Code Counter${RESET}"

rm -rf "$HOME/.claude-counter"
echo -e "  Removed ${GREEN}~/.claude-counter${RESET}"

if [[ "$OS" == "Darwin" ]]; then
  rm -f "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.claudecounter.host.json"
  rm -f "$HOME/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts/com.claudecounter.host.json"
  rm -f "$HOME/Library/Application Support/Mozilla/NativeMessagingHosts/com.claudecounter.host.json"
elif [[ "$OS" == "Linux" ]]; then
  rm -f "$HOME/.config/google-chrome/NativeMessagingHosts/com.claudecounter.host.json"
  rm -f "$HOME/.mozilla/native-messaging-hosts/com.claudecounter.host.json"
fi

echo -e "  Removed native messaging manifests"
echo -e "\n${GREEN}Done.${RESET} You can also remove the extension from chrome://extensions.\n"
