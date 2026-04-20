const CONTEXT_WINDOW = 200_000;
const REFRESH_MS = 2500;

function fmtTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function fmtDuration(secs) {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m`;
  return `${secs}s`;
}

function pct(val, total) {
  if (!total) return 0;
  return Math.min(val / total, 1);
}

function setBar(el, fraction) {
  const p = Math.round(fraction * 100);
  el.style.width = p + "%";
  el.classList.remove("yellow", "red");
  if (fraction >= 0.9)      el.classList.add("red");
  else if (fraction >= 0.65) el.classList.add("yellow");
}

function show(id)  { document.getElementById(id).style.display = ""; }
function hide(id)  { document.getElementById(id).style.display = "none"; }
function set(id, v){ document.getElementById(id).textContent = v; }

function renderStats(data) {
  hide("disconnected");
  hide("noSession");
  show("stats");

  document.getElementById("statusDot").className = "status-dot connected";

  const { input_tokens, output_tokens, cache_read, cache_write,
          turns, tool_calls, duration_secs, session_id } = data;

  const total = input_tokens + output_tokens;
  const avgInput = turns > 0 ? Math.round(input_tokens / turns) : 0;
  const ctxFraction = pct(avgInput, CONTEXT_WINDOW);

  // Context bar
  setBar(document.getElementById("ctxBar"), ctxFraction);
  set("ctxMeta",  Math.round(ctxFraction * 100) + "%");
  set("ctxUsed",  fmtTokens(avgInput) + " avg/turn");
  set("ctxTotal", fmtTokens(CONTEXT_WINDOW) + " limit");

  // Tokens
  set("inputTokens",  fmtTokens(input_tokens));
  set("outputTokens", fmtTokens(output_tokens));
  set("totalTokens",  fmtTokens(total));
  set("turns",        turns);

  // Cache
  if (cache_read > 0 || cache_write > 0) {
    show("cacheSection");
    const cacheFraction = pct(cache_write, CONTEXT_WINDOW);
    setBar(document.getElementById("cacheBar"), cacheFraction);
    const savings = input_tokens > 0 ? Math.round((cache_read / input_tokens) * 100) : 0;
    set("cacheSavings", savings + "% saved");
    set("cacheRead",  fmtTokens(cache_read));
    set("cacheWrite", fmtTokens(cache_write));
  } else {
    hide("cacheSection");
  }

  // Activity
  set("toolCalls", tool_calls ?? "—");
  set("duration",  fmtDuration(duration_secs));
  set("sessionId", session_id ? session_id.slice(0, 8) + "…" : "—");

  // Timestamp
  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  set("lastUpdated", "Updated " + now);
}

function renderDisconnected() {
  show("disconnected");
  hide("noSession");
  hide("stats");
  document.getElementById("statusDot").className = "status-dot disconnected";
  set("lastUpdated", "");
}

function renderNoSession() {
  hide("disconnected");
  show("noSession");
  hide("stats");
  document.getElementById("statusDot").className = "status-dot connected";
  set("lastUpdated", "");
}

// ── Native messaging via background service worker ──

function requestStats() {
  chrome.runtime.sendMessage({ type: "GET_STATS" }, (response) => {
    if (chrome.runtime.lastError) {
      renderDisconnected();
      return;
    }
    if (!response) {
      renderDisconnected();
      return;
    }
    if (response.error === "disconnected") {
      renderDisconnected();
      return;
    }
    if (response.error === "no_session") {
      renderNoSession();
      return;
    }
    renderStats(response.data);
  });
}

document.getElementById("refreshBtn").addEventListener("click", requestStats);

// Initial load + auto-refresh while popup is open
requestStats();
const interval = setInterval(requestStats, REFRESH_MS);
window.addEventListener("unload", () => clearInterval(interval));
