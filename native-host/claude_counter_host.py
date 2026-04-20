#!/usr/bin/env python3
"""
Claude Code Counter — Native Messaging Host
Reads Claude Code session files and returns token stats to the browser extension.

This script is launched automatically by Chrome/Firefox when the extension
connects. It communicates via stdin/stdout using the Native Messaging protocol
(4-byte little-endian length prefix + JSON payload).
"""

import json
import os
import sys
import struct
import hashlib
import logging
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime, timezone, timedelta

# Log to a file (stdout is reserved for native messaging protocol)
log_path = Path.home() / ".claude" / "counter_host.log"
logging.basicConfig(
    filename=str(log_path),
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)


# ── Native Messaging I/O ──────────────────────────────────────────────────────

def read_message():
    """Read one native message from stdin."""
    raw_len = sys.stdin.buffer.read(4)
    if not raw_len or len(raw_len) < 4:
        return None
    msg_len = struct.unpack("<I", raw_len)[0]
    raw_msg = sys.stdin.buffer.read(msg_len)
    if not raw_msg:
        return None
    return json.loads(raw_msg.decode("utf-8"))


def send_message(data: dict):
    """Send one native message to stdout."""
    encoded = json.dumps(data).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


# ── Session parsing ───────────────────────────────────────────────────────────

CONTEXT_WINDOW = 200_000


def find_claude_dir() -> Path | None:
    candidates = [
        Path.home() / ".claude",
        Path(os.environ.get("CLAUDE_CONFIG_DIR", "~/.claude")).expanduser(),
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


def find_latest_session(claude_dir: Path) -> Path | None:
    """Return the most recently modified .jsonl session file."""
    projects_dir = claude_dir / "projects"
    if not projects_dir.exists():
        return None

    files = list(projects_dir.glob("**/*.jsonl"))
    if not files:
        return None

    return max(files, key=lambda f: f.stat().st_mtime)


def parse_session(filepath: Path) -> dict:
    stats = {
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_read": 0,
        "cache_write": 0,
        "turns": 0,
        "tool_calls": 0,
        "start_time": None,
        "last_time": None,
        "session_id": filepath.stem,
    }

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                # Timestamps
                ts_raw = entry.get("timestamp") or entry.get("ts")
                if ts_raw:
                    try:
                        ts = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
                        if stats["start_time"] is None:
                            stats["start_time"] = ts
                        stats["last_time"] = ts
                    except Exception:
                        pass

                if entry.get("type") == "assistant":
                    msg = entry.get("message", {})
                    usage = msg.get("usage", {})
                    if usage:
                        stats["turns"] += 1
                        stats["input_tokens"]  += usage.get("input_tokens", 0)
                        stats["output_tokens"] += usage.get("output_tokens", 0)
                        stats["cache_read"]    += usage.get("cache_read_input_tokens", 0)
                        stats["cache_write"]   += usage.get("cache_creation_input_tokens", 0)

                    for block in msg.get("content", []):
                        if isinstance(block, dict) and block.get("type") == "tool_use":
                            stats["tool_calls"] += 1

    except (PermissionError, FileNotFoundError, OSError) as e:
        log.error("Error reading session %s: %s", filepath, e)

    # Compute duration
    duration_secs = None
    if stats["start_time"] and stats["last_time"]:
        duration_secs = int((stats["last_time"] - stats["start_time"]).total_seconds())

    return {
        "input_tokens":   stats["input_tokens"],
        "output_tokens":  stats["output_tokens"],
        "cache_read":     stats["cache_read"],
        "cache_write":    stats["cache_write"],
        "turns":          stats["turns"],
        "tool_calls":     stats["tool_calls"],
        "duration_secs":  duration_secs,
        "session_id":     stats["session_id"],
    }


# ── Usage quota ───────────────────────────────────────────────────────────────

def read_credentials(claude_dir: Path) -> dict | None:
    try:
        with open(claude_dir / ".credentials.json", "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, PermissionError):
        return None


def fetch_oauth_usage(access_token: str) -> dict | None:
    try:
        req = urllib.request.Request(
            "https://api.anthropic.com/api/oauth/usage",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        log.info("OAuth usage response keys: %s", list(data.keys()))

        # Normalize — try known field name patterns
        weekly_pct = (
            data.get("weekly_pct") or data.get("weeklyUsagePct") or
            data.get("weekly_usage_pct") or data.get("week_pct")
        )
        session_pct = (
            data.get("session_pct") or data.get("sessionUsagePct") or
            data.get("session_usage_pct")
        )
        if weekly_pct is None and session_pct is None:
            log.warning("Unknown OAuth usage format: %s", data)
            return None

        result = {"source": "oauth"}
        if weekly_pct is not None:
            result["weekly_pct"] = float(weekly_pct)
        if session_pct is not None:
            result["session_pct"] = float(session_pct)
        return result

    except urllib.error.HTTPError as e:
        log.warning("OAuth usage API HTTP %s", e.code)
        return None
    except Exception as e:
        log.warning("OAuth usage API failed: %s", e)
        return None


def compute_local_usage(claude_dir: Path) -> dict:
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=7)
    today_tokens = 0
    week_tokens = 0

    projects_dir = claude_dir / "projects"
    if not projects_dir.exists():
        return {"source": "local", "today_tokens": 0, "week_tokens": 0}

    for jsonl_file in projects_dir.glob("**/*.jsonl"):
        # Skip files untouched in the last 7 days
        try:
            if jsonl_file.stat().st_mtime < week_start.timestamp():
                continue
        except OSError:
            continue

        seen_ids = set()
        try:
            with open(jsonl_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    if entry.get("type") != "assistant":
                        continue

                    msg = entry.get("message", {})
                    msg_id = msg.get("id")
                    if msg_id:
                        if msg_id in seen_ids:
                            continue
                        seen_ids.add(msg_id)

                    ts_raw = entry.get("timestamp")
                    if not ts_raw:
                        continue
                    try:
                        ts = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
                    except Exception:
                        continue

                    if ts < week_start:
                        continue

                    usage = msg.get("usage", {})
                    tokens = (
                        usage.get("input_tokens", 0) +
                        usage.get("output_tokens", 0) +
                        usage.get("cache_creation_input_tokens", 0)
                    )
                    week_tokens += tokens
                    if ts >= today_start:
                        today_tokens += tokens

        except (PermissionError, FileNotFoundError, OSError):
            continue

    return {"source": "local", "today_tokens": today_tokens, "week_tokens": week_tokens}


def get_usage_info(claude_dir: Path) -> dict | None:
    creds = read_credentials(claude_dir)
    if creds:
        token = creds.get("accessToken") or creds.get("access_token")
        if token:
            result = fetch_oauth_usage(token)
            if result:
                return result
    return compute_local_usage(claude_dir)


# ── Main loop ─────────────────────────────────────────────────────────────────

def handle_get_stats() -> dict:
    claude_dir = find_claude_dir()
    if not claude_dir:
        log.warning("~/.claude not found")
        return {"error": "no_claude_dir"}

    session_file = find_latest_session(claude_dir)
    if not session_file:
        log.info("No session files found")
        return {"error": "no_session"}

    data = parse_session(session_file)
    if data["turns"] == 0:
        return {"error": "no_session"}

    data["usage_quota"] = get_usage_info(claude_dir)

    log.info("Returning stats: %d turns, %d input tokens", data["turns"], data["input_tokens"])
    return {"data": data}


def main():
    log.info("Native host started (pid %d)", os.getpid())
    while True:
        try:
            message = read_message()
            if message is None:
                log.info("stdin closed, exiting")
                break

            action = message.get("action", "")
            log.info("Received action: %s", action)

            if action == "get_stats":
                response = handle_get_stats()
            else:
                response = {"error": "unknown_action"}

            send_message(response)

        except (BrokenPipeError, EOFError):
            log.info("Pipe closed, exiting")
            break
        except Exception as e:
            log.exception("Unexpected error: %s", e)
            try:
                send_message({"error": str(e)})
            except Exception:
                break


if __name__ == "__main__":
    main()
