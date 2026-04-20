# Claude Code Counter

Ever wonder how many tokens you're burning in a Claude Code session? I kept hitting Claude Code's context limit mid-session with no warning, so I built a browser extension that shows your token usage in real time.
Context window usage, token counts, cache stats, all sitting in your toolbar while you work.

## Installation

### Step 1: Load the extension in Chrome

1. Clone or download this repo
2. Open `chrome://extensions`
3. Turn on **Developer mode** (top right)
4. Click **Load unpacked** and select the `extension/` folder
5. Copy the extension ID from the card that appears

### Step 2: Install the native host

The extension can't read your local files directly (browser security), so it talks to a small Python script running in the background. Takes 30 seconds to set up.

**macOS / Linux:**
```bash
git clone https://github.com/akakarantzas/claude-code-counter
cd claude-code-counter
bash scripts/install.sh --extension-id YOUR_EXTENSION_ID
```

**Windows (PowerShell):**
```powershell
git clone https://github.com/akakarantzas/claude-code-counter
cd claude-code-counter
.\scripts\install.ps1 -ExtensionId YOUR_EXTENSION_ID
```

That's it. Click the icon in your toolbar and you'll see your token usage update every 2.5 seconds.

## What it tracks

| Metric | Description |
|--------|-------------|
| **Context window** | How full your context is (avg tokens per turn vs 200k limit) |
| **Session tokens** | Input, output, and total for the whole session |
| **Prompt cache** | How much of your input is being served from cache |
| **Activity** | Turn count, tool calls, how long the session has been running |

## How it works

Claude Code saves every session as a `.jsonl` file in `~/.claude/projects/`. Each turn has a `usage` block with exact token counts straight from the API. The Python script reads the latest session file and passes the data to the extension using Chrome's Native Messaging API. No network requests, no accounts, nothing leaves your machine.

## Requirements

- Python 3.9+
- Chrome 88+
- Claude Code

## Uninstall

**macOS / Linux:**
```bash
bash scripts/uninstall.sh
```

Then remove the extension from `chrome://extensions`.

## License

MIT