const CONTEXT_WINDOW = 200_000;
const REFRESH_MS = 2500;
let lastData = null;

// ── Trend tracking ──
const HIST_SIZE = 8;
const hist = { ctx: [], tot: [], out: [] };
let prevTurns = -1;

function pushH(arr, v) {
  arr.push(v);
  if (arr.length > HIST_SIZE) arr.shift();
}

function sparkStr(arr) {
  if (arr.length < 2) return "";
  const lo = Math.min(...arr), hi = Math.max(...arr);
  const r = hi - lo || 1;
  return arr.map(v => "▁▂▃▄▅▆▇█"[Math.round(((v - lo) / r) * 7)]).join("");
}

function deltaInfo(arr) {
  if (arr.length < 2) return null;
  const cur = arr[arr.length - 1], ref = arr[0];
  if (!ref) return null;
  const p = Math.round(((cur - ref) / Math.abs(ref)) * 100);
  return { p, dir: p > 3 ? "up" : p < -3 ? "down" : "flat" };
}

function applyTrend(sparkId, deltaId, rowId, arr, scheme) {
  if (arr.length < 2) return;
  document.getElementById(sparkId).textContent = sparkStr(arr);
  const d = deltaInfo(arr);
  const el = document.getElementById(deltaId);
  if (!d || d.dir === "flat") {
    el.textContent = "→ stable";
    el.className = "trend-delta flat";
  } else {
    const arrow = d.dir === "up" ? "↑" : "↓";
    const sign  = d.p > 0 ? "+" : "";
    const n     = arr.length - 1;
    el.textContent = `${arrow} ${sign}${d.p}% · ${n}t`;
    el.className   = scheme === "ctx"
      ? `trend-delta ${d.dir === "up" ? "trend-bad" : "trend-good"}`
      : "trend-delta trend-neutral";
  }
  show(rowId);
}

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

let ctxPctCurrent = 0;
let ctxPctRaf = null;
let ctxHasLoaded = false;

function animateCtxPercent(targetPct, targetFraction) {
  if (ctxPctRaf) cancelAnimationFrame(ctxPctRaf);

  const el        = document.getElementById("ctxPercent");
  const barEl     = document.getElementById("ctxBar");
  const startPct  = ctxHasLoaded ? ctxPctCurrent : 0;
  const startBar  = ctxHasLoaded ? (parseFloat(barEl.style.width) || 0) : 0;
  ctxHasLoaded    = true;
  const endBar    = targetFraction * 100;
  const duration  = 1400;
  const startTime = performance.now();

  // Set color class immediately so CSS color transition fires in parallel
  barEl.classList.remove("yellow", "red");
  if (targetFraction >= 0.9)       barEl.classList.add("red");
  else if (targetFraction >= 0.65) barEl.classList.add("yellow");

  function tick(now) {
    const t    = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent    = Math.round(startPct + (targetPct - startPct) * ease) + "%";
    barEl.style.width = (startBar + (endBar - startBar) * ease) + "%";
    if (t < 1) {
      ctxPctRaf = requestAnimationFrame(tick);
    } else {
      ctxPctCurrent = targetPct;
      ctxPctRaf = null;
    }
  }
  ctxPctRaf = requestAnimationFrame(tick);
}

function show(id)  { document.getElementById(id).style.display = ""; }
function hide(id)  { document.getElementById(id).style.display = "none"; }
function set(id, v) {
  const el = document.getElementById(id);
  if (el.textContent === String(v)) return;
  el.textContent = v;
  el.classList.remove("val-updated");
  void el.offsetWidth;
  el.classList.add("val-updated");
}

function setWarn(id, msg, level) {
  const el = document.getElementById(id);
  if (msg) {
    el.style.display = "";
    el.className = `warn-bar warn-${level}`;
    document.getElementById(id + "Text").textContent = msg;
  } else {
    el.style.display = "none";
  }
}

function flashBtn(id, label) {
  const btn = document.getElementById(id);
  const iconEl = btn.querySelector(".action-icon");
  const labelEl = btn.querySelector(".action-label");
  const prevIcon = iconEl.textContent, prevLabel = labelEl.textContent;
  iconEl.textContent = "✓";
  labelEl.textContent = label;
  btn.classList.add("success");
  setTimeout(() => {
    iconEl.textContent = prevIcon;
    labelEl.textContent = prevLabel;
    btn.classList.remove("success");
  }, 1500);
}

function formatStatsCopy(d) {
  const total = d.input_tokens + d.output_tokens;
  const avg   = d.turns > 0 ? Math.round((d.input_tokens + d.cache_read) / d.turns) : 0;
  const ctxP  = Math.round(pct(avg, CONTEXT_WINDOW) * 100);
  const ti    = d.input_tokens + d.cache_read;
  const hit   = ti > 0 ? Math.round((d.cache_read / ti) * 100) : 0;
  const now   = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return [
    `Claude Code Session — ${now}`,
    `Context: ${ctxP}%  (${fmtTokens(avg)} / ${fmtTokens(CONTEXT_WINDOW)} avg/turn)`,
    `Tokens:  ${fmtTokens(total)} total · ${fmtTokens(d.input_tokens)} in · ${fmtTokens(d.output_tokens)} out`,
    `Session: ${d.turns} turns · ${fmtDuration(d.duration_secs)} · ${d.tool_calls ?? 0} tool calls`,
    d.cache_read > 0 ? `Cache:   ${hit}% hit rate · ${fmtTokens(d.cache_read)} tokens saved` : null,
    d.session_id ? `ID:      ${d.session_id}` : null,
  ].filter(Boolean).join("\n");
}

function exportJson(d) {
  const avg  = d.turns > 0 ? Math.round((d.input_tokens + d.cache_read) / d.turns) : 0;
  const ti   = d.input_tokens + d.cache_read;
  const payload = {
    exported_at: new Date().toISOString(),
    session_id:  d.session_id ?? null,
    context: {
      avg_tokens_per_turn: avg,
      limit: CONTEXT_WINDOW,
      usage_pct: Math.round(pct(avg, CONTEXT_WINDOW) * 100),
    },
    tokens: {
      input: d.input_tokens,
      output: d.output_tokens,
      total: d.input_tokens + d.output_tokens,
      cache_read: d.cache_read,
      cache_write: d.cache_write,
      cache_hit_rate_pct: ti > 0 ? Math.round((d.cache_read / ti) * 100) : 0,
    },
    session: {
      turns: d.turns,
      tool_calls: d.tool_calls ?? 0,
      duration_secs: d.duration_secs ?? 0,
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), {
    href: url,
    download: `claude-session-${new Date().toISOString().slice(0, 10)}.json`,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderStats(data) {
  lastData = data;
  hide("disconnected");
  hide("noSession");
  show("stats");

  document.getElementById("statusDot").className = "status-dot connected";

  const { input_tokens, output_tokens, cache_read, cache_write,
          turns, tool_calls, duration_secs, session_id } = data;

  const total = input_tokens + output_tokens;
  const avgTotal = turns > 0 ? Math.round((input_tokens + cache_read) / turns) : 0;
  const ctxFraction = pct(avgTotal, CONTEXT_WINDOW);

  // Context hero
  const pctVal = Math.round(ctxFraction * 100);
  animateCtxPercent(pctVal, ctxFraction);
  set("ctxTokens",    "Avg per turn: ~" + fmtTokens(avgTotal) + " / 200k");
  set("ctxRemaining", fmtTokens(CONTEXT_WINDOW - avgTotal) + " remaining");

  const statusEl = document.getElementById("ctxStatus");
  if (ctxFraction >= 0.85) {
    statusEl.textContent = "⚠ Critical";
    statusEl.className = "ctx-status critical";
  } else if (ctxFraction >= 0.65) {
    statusEl.textContent = "! Tight";
    statusEl.className = "ctx-status tight";
  } else if (ctxFraction >= 0.25) {
    statusEl.textContent = "Healthy";
    statusEl.className = "ctx-status healthy";
  } else {
    statusEl.textContent = "Stable";
    statusEl.className = "ctx-status stable";
  }

  // Tokens
  set("inputTokens",  fmtTokens(input_tokens));
  set("outputTokens", fmtTokens(output_tokens));
  set("totalTokens",  fmtTokens(total));
  set("turns",        turns);

  // Cache Efficiency
  if (cache_read > 0 || cache_write > 0) {
    show("cacheSection");
    const totalInput = input_tokens + cache_read;
    const hitRate = totalInput > 0 ? Math.round((cache_read / totalInput) * 100) : 0;
    set("cacheHitRate",    hitRate + "%");
    set("cacheTokensSaved", fmtTokens(cache_read));
    const gradeEl = document.getElementById("cacheGrade");
    if (hitRate >= 75) {
      gradeEl.textContent = "Excellent"; gradeEl.className = "cache-grade excellent";
    } else if (hitRate >= 50) {
      gradeEl.textContent = "Good";      gradeEl.className = "cache-grade good";
    } else if (hitRate >= 25) {
      gradeEl.textContent = "Moderate";  gradeEl.className = "cache-grade moderate";
    } else {
      gradeEl.textContent = "Low";       gradeEl.className = "cache-grade low";
    }

    // Cache efficiency warning
    if (hitRate < 20 && turns > 3) {
      setWarn("cacheWarn", "Cache efficiency low — responses may be slower and costlier", "yellow");
    } else {
      setWarn("cacheWarn", null);
    }
  } else {
    hide("cacheSection");
  }

  // Trends — record one point per new completed turn
  if (turns > 0 && turns !== prevTurns) {
    prevTurns = turns;
    pushH(hist.ctx, Math.round(ctxFraction * 100));
    pushH(hist.tot, avgTotal);
    pushH(hist.out, Math.round(output_tokens / turns));
  }
  applyTrend("ctxSpark",  "ctxDelta",  "ctxTrend",  hist.ctx, "ctx");
  applyTrend("totSpark",  "totDelta",  "totTrend",  hist.tot, "neutral");
  applyTrend("outSpark",  "outDelta",  "outTrend",  hist.out, "neutral");

  // ── Warnings ──

  // Context limit
  if (ctxFraction >= 0.85) {
    setWarn("ctxWarn", "Approaching context limit — run /compact to free space", "red");
  } else if (ctxFraction >= 0.70) {
    setWarn("ctxWarn", "Context filling up — consider /compact soon", "yellow");
  } else {
    setWarn("ctxWarn", null);
  }

  // Output spike — unusually large response vs session average
  if (hist.out.length >= 3) {
    const latest  = hist.out[hist.out.length - 1];
    const prevAvg = hist.out.slice(0, -1).reduce((a, b) => a + b, 0) / (hist.out.length - 1);
    if (latest > prevAvg * 2.5 && latest > 2000) {
      setWarn("outWarn", "Output spike — unusually large response this turn", "yellow");
    } else {
      setWarn("outWarn", null);
    }
  } else {
    setWarn("outWarn", null);
  }

  // Footer stats
  set("toolCalls", tool_calls ?? "—");
  set("duration",  fmtDuration(duration_secs));

  // Session ID row
  const sessionEl = document.getElementById("sessionId");
  if (session_id) {
    sessionEl.textContent = session_id.slice(0, 16) + "…";
    sessionEl.dataset.full = session_id;
    show("footerSession");
  } else {
    hide("footerSession");
  }

  // Timestamp
  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  set("lastUpdated", "Updated " + now);
}

function renderDisconnected() {
  show("disconnected");
  hide("noSession");
  hide("stats");
  document.getElementById("statusDot").className = "status-dot disconnected";
  set("toolCalls", "—");
  set("duration", "—");
  set("lastUpdated", "");
  hide("footerSession");
}

function renderNoSession() {
  hide("disconnected");
  show("noSession");
  hide("stats");
  document.getElementById("statusDot").className = "status-dot connected";
  set("toolCalls", "—");
  set("duration", "—");
  set("lastUpdated", "");
  hide("footerSession");
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

document.getElementById("copyStatsBtn").addEventListener("click", () => {
  if (!lastData) return;
  navigator.clipboard.writeText(formatStatsCopy(lastData))
    .then(() => flashBtn("copyStatsBtn", "Copied"));
});

document.getElementById("exportJsonBtn").addEventListener("click", () => {
  if (!lastData) return;
  exportJson(lastData);
  flashBtn("exportJsonBtn", "Saved");
});

document.getElementById("copySessionBtn").addEventListener("click", () => {
  const full = document.getElementById("sessionId").dataset.full;
  if (!full) return;
  navigator.clipboard.writeText(full).then(() => {
    const btn = document.getElementById("copySessionBtn");
    btn.textContent = "✓";
    btn.classList.add("copied");
    setTimeout(() => { btn.textContent = "⧉"; btn.classList.remove("copied"); }, 1500);
  });
});

// Initial load + auto-refresh while popup is open
requestStats();
const interval = setInterval(requestStats, REFRESH_MS);
window.addEventListener("unload", () => clearInterval(interval));
