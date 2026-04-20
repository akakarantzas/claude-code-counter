#!/bin/bash
# Claude Code Counter — installer for macOS and Linux
# Usage: bash install.sh [--extension-id CHROME_EXTENSION_ID]
set -e

EXTENSION_ID="${EXTENSION_ID:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_SCRIPT="$SCRIPT_DIR/native-host/claude_counter_host.py"
HOST_JSON="$SCRIPT_DIR/native-host/com.claudecounter.host.json"

BOLD="\033[1m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

echo ""
echo -e "${BOLD}Claude Code Counter Installer${RESET}"
echo "──────────────────────────────────"

# ── Parse args ──
while [[ $# -gt 0 ]]; do
  case "$1" in
    --extension-id) EXTENSION_ID="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# ── Get extension ID if not provided ──
if [[ -z "$EXTENSION_ID" ]]; then
  echo ""
  echo -e "${YELLOW}Paste your Chrome extension ID (found on chrome://extensions after loading unpacked):${RESET}"
  read -r EXTENSION_ID
fi

if [[ -z "$EXTENSION_ID" ]]; then
  echo -e "${RED}Error: Extension ID is required.${RESET}"
  exit 1
fi

# ── Check Python ──
PYTHON_BIN="$(which python3 2>/dev/null || which python 2>/dev/null)"
if [[ -z "$PYTHON_BIN" ]]; then
  echo -e "${RED}Error: Python 3 not found. Please install Python 3.9+.${RESET}"
  exit 1
fi

PYTHON_VERSION="$($PYTHON_BIN --version 2>&1)"
echo -e "  Python: ${GREEN}$PYTHON_VERSION${RESET} ($PYTHON_BIN)"

# ── Install host script ──
HOST_INSTALL_DIR="$HOME/.claude-counter"
mkdir -p "$HOST_INSTALL_DIR"
cp "$HOST_SCRIPT" "$HOST_INSTALL_DIR/claude_counter_host.py"
chmod +x "$HOST_INSTALL_DIR/claude_counter_host.py"

# Create wrapper script so the host uses the right Python
WRAPPER="$HOST_INSTALL_DIR/run_host.sh"
cat > "$WRAPPER" <<EOF
#!/bin/bash
exec "$PYTHON_BIN" "$HOST_INSTALL_DIR/claude_counter_host.py" "\$@"
EOF
chmod +x "$WRAPPER"

echo -e "  Host:   ${GREEN}$HOST_INSTALL_DIR/claude_counter_host.py${RESET}"

# ── Write manifest with actual paths ──
OS="$(uname -s)"
if [[ "$OS" == "Darwin" ]]; then
  CHROME_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
  CHROME_CANARY_DIR="$HOME/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts"
  FIREFOX_DIR="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
elif [[ "$OS" == "Linux" ]]; then
  CHROME_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
  FIREFOX_DIR="$HOME/.mozilla/native-messaging-hosts"
else
  echo -e "${RED}Unsupported OS: $OS. Use install.ps1 on Windows.${RESET}"
  exit 1
fi

MANIFEST=$(cat <<EOF
{
  "name": "com.claudecounter.host",
  "description": "Claude Code Counter native messaging host",
  "path": "$WRAPPER",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF
)

# Install for Chrome
mkdir -p "$CHROME_DIR"
echo "$MANIFEST" > "$CHROME_DIR/com.claudecounter.host.json"
echo -e "  Chrome: ${GREEN}$CHROME_DIR${RESET}"

# Install for Chrome Canary (macOS)
if [[ "$OS" == "Darwin" ]] && [[ -d "$HOME/Library/Application Support/Google/Chrome Canary" ]]; then
  mkdir -p "$CHROME_CANARY_DIR"
  echo "$MANIFEST" > "$CHROME_CANARY_DIR/com.claudecounter.host.json"
  echo -e "  Canary: ${GREEN}$CHROME_CANARY_DIR${RESET}"
fi

# Firefox manifest uses different key name
FIREFOX_MANIFEST=$(cat <<EOF
{
  "name": "com.claudecounter.host",
  "description": "Claude Code Counter native messaging host",
  "path": "$WRAPPER",
  "type": "stdio",
  "allowed_extensions": [
    "claude-counter@extension"
  ]
}
EOF
)

mkdir -p "$FIREFOX_DIR"
echo "$FIREFOX_MANIFEST" > "$FIREFOX_DIR/com.claudecounter.host.json"
echo -e "  Firefox: ${GREEN}$FIREFOX_DIR${RESET}"

echo ""
echo -e "${GREEN}${BOLD}Installation complete!${RESET}"
echo ""
echo "  Next steps:"
echo "  1. Open Chrome → chrome://extensions"
echo "  2. Enable 'Developer mode' (top right)"
echo "  3. Click 'Load unpacked' → select the 'extension' folder"
echo "  4. The Claude Code Counter icon should appear in your toolbar"
echo ""
