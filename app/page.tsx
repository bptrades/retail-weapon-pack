"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type PlanItem = { if: string; then: string; risk: string };
type Plan = {
  bias: "bullish" | "bearish" | "neutral";
  thesis: string;
  playbook: PlanItem[];
  danger_zones: string[];
  confidence: number;
};

type SnapshotHistoryItem = {
  id: string;
  ts: string;
  symbol: string;
  price: number | null;
  vwap: number | null;
  vwap_state: string | null;
  ema_trend_5m: string | null;
  ema_trend_15m: string | null;
  rsi_1m: number | null;
  volume_state: string | null;
  momentum_score: number | null;
  bias_guess: "bullish" | "bearish" | "neutral";
  snapshot: any;
};

type BiasFlipAlert = {
  id: string;
  symbol: string;
  from: "bullish" | "bearish" | "neutral";
  to: "bullish" | "bearish" | "neutral";
  ts: string;
  price: number | null;
  score: number | null;
};

const defaultInput = {
  symbol: "SPY",
  timestamp: "2026-02-17T12:00:00-05:00",
  price: 502.85,
  vwap: 501.9,
  vwap_state: "above",
  ema_trend_5m: "bull",
  ema_trend_15m: "bull",
  rsi_1m: 58.2,
  rsi_state: "neutral_to_bull",
  atr_14: 2.1,
  expected_move_today: 2.1,
  volume_state: "above_avg",
  key_levels: {
    premarket_high: 505.1,
    premarket_low: 498.9,
    yesterday_high: 504.4,
    yesterday_low: 497.8
  },
  momentum_score: 7.4
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function computeMomentumScore(input: any) {
  let score = 5;

  if (input?.vwap_state === "above") score += 2.5;
  if (input?.vwap_state === "below") score -= 2.5;

  if (input?.ema_trend_5m === "bull") score += 1.5;
  if (input?.ema_trend_5m === "bear") score -= 1.5;

  if (input?.ema_trend_15m === "bull") score += 1.5;
  if (input?.ema_trend_15m === "bear") score -= 1.5;

  const rsiState = String(input?.rsi_state || "").toLowerCase();
  if (rsiState.includes("bull")) score += 1;
  if (rsiState.includes("bear")) score -= 1;

  const volState = String(input?.volume_state || "").toLowerCase();
  if (volState.includes("above")) score += 0.75;
  if (volState.includes("below")) score -= 0.75;

  return Number(clamp(score, 0, 10).toFixed(1));
}

function normalizeConfidence(score: number | undefined) {
  if (typeof score !== "number") return 3;
  const fiveScale = Math.round((score / 10) * 5);
  return Math.max(1, Math.min(5, fiveScale));
}

function confidenceLabel(level: number) {
  if (level <= 2) return "Low";
  if (level === 3) return "Moderate";
  if (level === 4) return "Strong";
  return "High Conviction";
}

function biasGuessFromScore(score: number | null | undefined): "bullish" | "bearish" | "neutral" {
  if (typeof score !== "number") return "neutral";
  if (score >= 6.5) return "bullish";
  if (score <= 3.5) return "bearish";
  return "neutral";
}

function formatBias(b: "bullish" | "bearish" | "neutral") {
  return b.toUpperCase();
}

function formatXAlert(alert: BiasFlipAlert) {
  const t = new Date(alert.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const p = typeof alert.price === "number" ? alert.price.toFixed(2) : "—";
  const s = typeof alert.score === "number" ? alert.score.toFixed(1) : "—";
  return [
    `⚡ Bias Flip Alert: ${alert.symbol}`,
    `${formatBias(alert.from)} → ${formatBias(alert.to)} @ ${t}`,
    `Price: ${p} • Score: ${s}`,
    ``,
    `Not financial advice.`
  ].join("\n");
}

function formatXPost(input: any, plan: Plan) {
  const symbol = String(input?.symbol || "SPY").toUpperCase();
  const levels = input?.key_levels || {};
  const vwap = input?.vwap;

  const high = levels.session_high ?? levels.yesterday_high ?? levels.high_lookback ?? levels.premarket_high;
  const low = levels.session_low ?? levels.yesterday_low ?? levels.low_lookback ?? levels.premarket_low;
  const high60 = levels.high_60m ?? levels.premarket_high ?? levels.yesterday_high;
  const low60 = levels.low_60m ?? levels.premarket_low ?? levels.yesterday_low;

  const ms = typeof input?.momentum_score === "number" ? input.momentum_score : undefined;
  const confLevel = normalizeConfidence(ms);
  const confText = confidenceLabel(confLevel);

  const header = symbol === "SPY" ? `${symbol} 0-DTE Bias` : `${symbol} Intraday Bias`;

  return [
    `${header}: ${String(plan.bias).toUpperCase()} • Confidence: ${confText} (${confLevel}/5) • Score: ${ms ?? "N/A"}`,
    ``,
    `${plan.thesis}`,
    ``,
    `Key levels: VWAP ${vwap} | High ${high} | Low ${low} | 60m High ${high60} | 60m Low ${low60}`,
    ``,
    `Playbook:`,
    ...plan.playbook.map((p) => `• IF ${p.if} THEN ${p.then} (Risk: ${p.risk})`),
    ``,
    `Avoid:`,
    ...plan.danger_zones.map((d) => `• ${d}`)
  ].join("\n");
}

function pillToneFromBias(bias?: string) {
  const b = String(bias || "").toLowerCase();
  if (b === "bullish") return { bg: "#ecfdf5", border: "#34d399", text: "#065f46" };
  if (b === "bearish") return { bg: "#fef2f2", border: "#f87171", text: "#7f1d1d" };
  return { bg: "#f3f4f6", border: "#9ca3af", text: "#111827" };
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(0,0,0,0.20)"
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.7 }}>{label}</div>
      <div style={{ marginTop: 6, fontWeight: 700 }}>{value ?? "—"}</div>
    </div>
  );
}

function tvSymbolForInput(raw: string) {
  const sym = raw.toUpperCase().trim();

  const indexMap: Record<string, string> = {
    SPX: "SP:SPX",
    NDX: "NASDAQ:NDX",
    VIX: "CBOE:VIX",
    DJI: "DJ:DJI",
    RUT: "RUSSELL:RUT"
  };
  if (indexMap[sym]) return indexMap[sym];

  const etfMap: Record<string, string> = {
    SPY: "AMEX:SPY",
    QQQ: "NASDAQ:QQQ",
    IWM: "AMEX:IWM",
    DIA: "AMEX:DIA"
  };
  if (etfMap[sym]) return etfMap[sym];

  return sym;
}

function TradingViewChart({ symbol }: { symbol: string }) {
  const tvSymbol = tvSymbolForInput(symbol);
  const src =
    `https://s.tradingview.com/widgetembed/?` +
    `symbol=${encodeURIComponent(tvSymbol)}` +
    `&interval=5` +
    `&hidesidetoolbar=1` +
    `&symboledit=1` +
    `&saveimage=0` +
    `&toolbarbg=0F172A` +
    `&studies=%5B%5D` +
    `&theme=dark` +
    `&style=1` +
    `&timezone=America%2FNew_York` +
    `&withdateranges=1` +
    `&hidevolume=0`;

  return (
    <div
      style={{
        height: 420,
        borderRadius: 16,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(0,0,0,0.25)"
      }}
    >
      <iframe title="chart" src={src} style={{ width: "100%", height: "100%", border: 0 }} allowFullScreen />
    </div>
  );
}

function applySymbolToPlan(plan: any, symbol: string) {
  const sym = symbol.toUpperCase();
  if (!plan) return plan;

  const replaceSym = (s: any) =>
    typeof s === "string" ? s.replaceAll("SPY", sym).replaceAll("Spy", sym).replaceAll("spy", sym) : s;

  return {
    ...plan,
    thesis: replaceSym(plan.thesis),
    playbook: Array.isArray(plan.playbook)
      ? plan.playbook.map((p: any) => ({ ...p, if: replaceSym(p.if), then: replaceSym(p.then), risk: replaceSym(p.risk) }))
      : plan.playbook,
    danger_zones: Array.isArray(plan.danger_zones) ? plan.danger_zones.map(replaceSym) : plan.danger_zones
  };
}

function safeTicker(raw: string) {
  return raw.toUpperCase().trim().replace(/\s+/g, "");
}

function isValidTicker(sym: string) {
  return /^[A-Z.\-]{1,10}$/.test(sym);
}

function fmtTime(tsISO: string) {
  const d = new Date(tsISO);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function playBeep() {
  try {
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.04;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, 140);
  } catch {}
}

function fmtMoney(n: number | null | undefined) {
  if (typeof n !== "number" || !isFinite(n)) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function fmtNum(n: number | null | undefined, digits = 2) {
  if (typeof n !== "number" || !isFinite(n)) return "—";
  return n.toFixed(digits);
}

export default function Home() {
  const [symbol, setSymbol] = useState("SPY");
  const [inputJsonText, setInputJsonText] = useState(JSON.stringify(defaultInput, null, 2));

  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState("");

  const [marketOpen, setMarketOpen] = useState(false);
  const [usingLastSession, setUsingLastSession] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

  // Auto refresh
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshSeconds, setRefreshSeconds] = useState(60);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const inFlightRef = useRef(false);

  // AI quota guardrails
  const [aiCooldownUntil, setAiCooldownUntil] = useState<number>(0);
  const aiInFlightRef = useRef(false);

  // Watchlist
  const [watchlist, setWatchlist] = useState<string[]>(["SPY", "QQQ", "AAPL", "TSLA", "NVDA"]);
  const [newTicker, setNewTicker] = useState("");
  const [autoAiOnWatchClick, setAutoAiOnWatchClick] = useState(false);

  // History
  const [history, setHistory] = useState<SnapshotHistoryItem[]>([]);
  const HISTORY_KEY = "rw_history_v1";
  const HISTORY_MAX = 120;
  const HISTORY_PER_SYMBOL_MAX = 25;

  // Bias flip alerts
  const [biasFlip, setBiasFlip] = useState<BiasFlipAlert | null>(null);
  const [biasFlipSound, setBiasFlipSound] = useState(true);
  const lastFlipKeyRef = useRef<string>("");

  // ✅ Step 5: Risk calculator state
  const [acctSize, setAcctSize] = useState<number>(5000);
  const [riskPct, setRiskPct] = useState<number>(1); // %
  const [entry, setEntry] = useState<number>(0);
  const [stop, setStop] = useState<number>(0);
  const [direction, setDirection] = useState<"long" | "short">("long");

  // Persist risk settings (nice UX)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("rw_risk_v1");
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p?.acctSize === "number") setAcctSize(p.acctSize);
        if (typeof p?.riskPct === "number") setRiskPct(p.riskPct);
        if (typeof p?.entry === "number") setEntry(p.entry);
        if (typeof p?.stop === "number") setStop(p.stop);
        if (p?.direction === "long" || p?.direction === "short") setDirection(p.direction);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("rw_risk_v1", JSON.stringify({ acctSize, riskPct, entry, stop, direction }));
    } catch {}
  }, [acctSize, riskPct, entry, stop, direction]);

  // Load watchlist
  useEffect(() => {
    try {
      const raw = localStorage.getItem("rw_watchlist_v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          const cleaned = parsed.map((x) => safeTicker(String(x))).filter((x) => isValidTicker(x));
          if (cleaned.length) setWatchlist(Array.from(new Set(cleaned)));
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("rw_watchlist_v1", JSON.stringify(watchlist));
    } catch {}
  }, [watchlist]);

  // Load history
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setHistory(parsed);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {}
  }, [history]);

  const inputObj = useMemo(() => {
    try {
      return JSON.parse(inputJsonText);
    } catch {
      return null;
    }
  }, [inputJsonText]);

  const xPost = useMemo(() => {
    if (!inputObj || !plan) return "";
    return formatXPost(inputObj, plan);
  }, [inputObj, plan]);

  const momentumScore = typeof inputObj?.momentum_score === "number" ? inputObj.momentum_score : undefined;
  const confLevel = normalizeConfidence(momentumScore);
  const confText = confidenceLabel(confLevel);

  const symbolHistory = useMemo(() => {
    const sym = safeTicker(symbol);
    return history.filter((h) => h.symbol === sym).slice(0, HISTORY_PER_SYMBOL_MAX);
  }, [history, symbol]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  }

  function nowMs() {
    return Date.now();
  }

  function maybeTriggerBiasFlip(prevBias: SnapshotHistoryItem["bias_guess"] | null, nextItem: SnapshotHistoryItem) {
    if (!prevBias) return;
    if (prevBias === nextItem.bias_guess) return;

    const flip: BiasFlipAlert = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      symbol: nextItem.symbol,
      from: prevBias,
      to: nextItem.bias_guess,
      ts: nextItem.ts,
      price: nextItem.price ?? null,
      score: nextItem.momentum_score ?? null
    };

    const minuteKey = new Date(flip.ts).toISOString().slice(0, 16);
    const flipKey = `${flip.symbol}_${flip.from}_${flip.to}_${minuteKey}`;
    if (lastFlipKeyRef.current === flipKey) return;
    lastFlipKeyRef.current = flipKey;

    setBiasFlip(flip);
    if (biasFlipSound) playBeep();
  }

  function addSnapshotToHistory(snap: any) {
    try {
      const sym = safeTicker(String(snap?.symbol || symbol));
      const score = typeof snap?.momentum_score === "number" ? snap.momentum_score : null;

      const prev = history.find((h) => h.symbol === sym);
      const prevBias = prev?.bias_guess ?? null;

      const item: SnapshotHistoryItem = {
        id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        ts: new Date().toISOString(),
        symbol: sym,
        price: typeof snap?.price === "number" ? snap.price : null,
        vwap: typeof snap?.vwap === "number" ? snap.vwap : null,
        vwap_state: snap?.vwap_state ?? null,
        ema_trend_5m: snap?.ema_trend_5m ?? null,
        ema_trend_15m: snap?.ema_trend_15m ?? null,
        rsi_1m: typeof snap?.rsi_1m === "number" ? snap.rsi_1m : null,
        volume_state: snap?.volume_state ?? null,
        momentum_score: score,
        bias_guess: biasGuessFromScore(score),
        snapshot: snap
      };

      maybeTriggerBiasFlip(prevBias, item);

      setHistory((prevArr) => {
        const next = [item, ...prevArr];
        const perSymbolCount: Record<string, number> = {};
        const filtered: SnapshotHistoryItem[] = [];
        for (const h of next) {
          perSymbolCount[h.symbol] = (perSymbolCount[h.symbol] ?? 0) + 1;
          if (perSymbolCount[h.symbol] <= HISTORY_PER_SYMBOL_MAX) filtered.push(h);
        }
        return filtered.slice(0, HISTORY_MAX);
      });
    } catch {}
  }

  async function refreshSnapshotOnly(forSymbol?: string) {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    setError("");
    setLoading(true);

    try {
      const sym = safeTicker(forSymbol || symbol);
      const snapRes = await fetch(`/api/snapshot?symbol=${encodeURIComponent(sym)}`);
      const snap = await snapRes.json();
      if (!snapRes.ok) throw new Error(snap?.error || "Snapshot failed");

      const s = String(snap?.symbol || sym).toUpperCase();
      setSymbol(s);

      setUsingLastSession(!!snap.using_last_session_data);
      setMarketOpen(!!snap.market_open);
      setInputJsonText(JSON.stringify(snap, null, 2));
      setLastUpdated(new Date().toLocaleTimeString());

      addSnapshotToHistory(snap);

      // helpful: keep risk entry near price if user hasn’t set it
      if (!entry && typeof snap?.price === "number") setEntry(snap.price);
    } catch (e: any) {
      setError(e?.message || "Unknown error");
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }

  async function generatePlanFromLatestSnapshot() {
    const t = nowMs();
    if (aiInFlightRef.current) return;
    if (t < aiCooldownUntil) {
      const secs = Math.ceil((aiCooldownUntil - t) / 1000);
      showToast(`AI cooling down (${secs}s)`);
      return;
    }

    await refreshSnapshotOnly();

    let snap: any = null;
    try {
      snap = JSON.parse(inputJsonText);
    } catch {
      snap = null;
    }
    if (!snap) {
      setError("Snapshot JSON is invalid.");
      return;
    }

    aiInFlightRef.current = true;
    setError("");
    setLoading(true);
    setPlan(null);

    try {
      const planRes = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputJson: snap })
      });

      const planData = await planRes.json();
      if (!planRes.ok) throw new Error(planData?.error || "Plan failed");

      const s = String(snap?.symbol || symbol).toUpperCase();
      setPlan(applySymbolToPlan(planData, s) as Plan);
      showToast("AI plan generated.");
    } catch (e: any) {
      const msg = e?.message || "AI error";
      if (String(msg).includes("429") || String(msg).toLowerCase().includes("quota")) {
        setAiCooldownUntil(Date.now() + 35_000);
        showToast("AI quota hit — cooling down.");
      }
      setError(msg);
    } finally {
      setLoading(false);
      aiInFlightRef.current = false;
    }
  }

  async function generatePlan() {
    const t = nowMs();
    if (aiInFlightRef.current) return;
    if (t < aiCooldownUntil) {
      const secs = Math.ceil((aiCooldownUntil - t) / 1000);
      showToast(`AI cooling down (${secs}s)`);
      return;
    }

    setError("");
    setPlan(null);

    if (!inputObj) {
      setError("Your snapshot JSON is not valid.");
      return;
    }

    aiInFlightRef.current = true;
    setLoading(true);

    try {
      const scoredInput = { ...inputObj, momentum_score: computeMomentumScore(inputObj) };

      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputJson: scoredInput })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");

      const s = String(scoredInput?.symbol || symbol).toUpperCase();
      setPlan(applySymbolToPlan(data, s) as Plan);
      showToast("AI plan generated.");
    } catch (e: any) {
      const msg = e?.message || "AI error";
      if (String(msg).includes("429") || String(msg).toLowerCase().includes("quota")) {
        setAiCooldownUntil(Date.now() + 35_000);
        showToast("AI quota hit — cooling down.");
      }
      setError(msg);
    } finally {
      setLoading(false);
      aiInFlightRef.current = false;
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied to clipboard.");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showToast("Copied to clipboard.");
    }
  }

  useEffect(() => {
    if (!autoRefresh) return;

    const secs = Math.max(10, Math.min(600, Number(refreshSeconds) || 60));
    const id = window.setInterval(() => {
      refreshSnapshotOnly();
    }, secs * 1000);

    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, refreshSeconds, symbol]);

  function addToWatchlist() {
    const t = safeTicker(newTicker);
    if (!t) return;
    if (!isValidTicker(t)) {
      showToast("Invalid ticker format");
      return;
    }
    setWatchlist((prev) => Array.from(new Set([t, ...prev])));
    setNewTicker("");
    showToast(`${t} added`);
  }

  function removeFromWatchlist(ticker: string) {
    setWatchlist((prev) => prev.filter((x) => x !== ticker));
    showToast(`${ticker} removed`);
  }

  async function selectFromWatchlist(ticker: string) {
    const t = safeTicker(ticker);
    setSymbol(t);
    setPlan(null);
    await refreshSnapshotOnly(t);
    showToast(`${t} loaded`);
    if (autoAiOnWatchClick) {
      await generatePlanFromLatestSnapshot();
    }
  }

  function clearHistoryForSymbol(sym: string) {
    const s = safeTicker(sym);
    setHistory((prev) => prev.filter((h) => h.symbol !== s));
    showToast(`Cleared history: ${s}`);
  }

  function loadHistoryItem(item: SnapshotHistoryItem) {
    setPlan(null);
    setSymbol(item.symbol);
    setInputJsonText(JSON.stringify(item.snapshot, null, 2));
    setLastUpdated(fmtTime(item.ts));
    showToast(`Loaded ${item.symbol} @ ${fmtTime(item.ts)}`);

    // smart fill risk entry
    if (typeof item.price === "number") setEntry(item.price);
  }

  // ✅ Risk calculations
  const riskDollars = useMemo(() => {
    if (!acctSize || !riskPct) return null;
    return (acctSize * (riskPct / 100));
  }, [acctSize, riskPct]);

  const stopDistance = useMemo(() => {
    if (!entry || !stop) return null;
    const dist = Math.abs(entry - stop);
    if (!isFinite(dist) || dist <= 0) return null;
    return dist;
  }, [entry, stop]);

  const shares = useMemo(() => {
    if (!riskDollars || !stopDistance) return null;
    const raw = riskDollars / stopDistance;
    if (!isFinite(raw) || raw <= 0) return null;
    return Math.floor(raw);
  }, [riskDollars, stopDistance]);

  const positionValue = useMemo(() => {
    if (!shares || !entry) return null;
    return shares * entry;
  }, [shares, entry]);

  const rTargets = useMemo(() => {
    if (!stopDistance || !entry) return null;
    const dist = stopDistance;

    const mk = (r: number) => {
      if (direction === "long") return entry + dist * r;
      return entry - dist * r;
    };

    return {
      r1: mk(1),
      r2: mk(2),
      r3: mk(3)
    };
  }, [stopDistance, entry, direction]);

  const styles = {
    page: {
      minHeight: "100vh",
      background: "linear-gradient(180deg, #0b1220 0%, #0b1220 35%, #0f172a 100%)",
      color: "#e5e7eb"
    } as React.CSSProperties,
    shell: { maxWidth: 1200, margin: "0 auto", padding: "22px 16px 40px" } as React.CSSProperties,
    headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" } as React.CSSProperties,
    title: { fontSize: 28, margin: 0, letterSpacing: "-0.02em" } as React.CSSProperties,
    subtitle: { margin: "8px 0 0", opacity: 0.85, maxWidth: 820, lineHeight: 1.35 } as React.CSSProperties,
    mainGrid: { display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, marginTop: 16, alignItems: "start" } as React.CSSProperties,
    cardGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" } as React.CSSProperties,
    card: {
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: 16,
      padding: 16,
      boxShadow: "0 10px 30px rgba(0,0,0,0.25)"
    } as React.CSSProperties,
    cardTitle: { fontSize: 15, margin: "0 0 10px", opacity: 0.9, letterSpacing: "0.02em" } as React.CSSProperties,
    label: { fontSize: 12, opacity: 0.75 } as React.CSSProperties,
    input: {
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(0,0,0,0.25)",
      color: "#e5e7eb",
      outline: "none"
    } as React.CSSProperties,
    textarea: {
      width: "100%",
      padding: 12,
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(0,0,0,0.25)",
      color: "#e5e7eb",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 12,
      lineHeight: 1.4,
      outline: "none"
    } as React.CSSProperties,
    btnRow: { display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" } as React.CSSProperties,
    btn: {
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(255,255,255,0.08)",
      color: "#e5e7eb",
      cursor: "pointer"
    } as React.CSSProperties,
    btnPrimary: {
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid rgba(56,189,248,0.45)",
      background: "rgba(56,189,248,0.18)",
      color: "#e5e7eb",
      cursor: "pointer"
    } as React.CSSProperties,
    btnDanger: {
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid rgba(248,113,113,0.35)",
      background: "rgba(248,113,113,0.12)",
      color: "#e5e7eb",
      cursor: "pointer"
    } as React.CSSProperties,
    pillRow: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 } as React.CSSProperties,
    pill: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "7px 10px",
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(0,0,0,0.20)",
      fontSize: 12
    } as React.CSSProperties,
    banner: {
      marginTop: 12,
      padding: "10px 12px",
      borderRadius: 14,
      border: "1px solid rgba(251,191,36,0.35)",
      background: "rgba(251,191,36,0.14)",
      color: "#fde68a",
      fontSize: 13
    } as React.CSSProperties,
    monoSmall: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, opacity: 0.85 } as React.CSSProperties
  };

  const biasTone = pillToneFromBias(plan?.bias);

  return (
    <div style={styles.page}>
      <main style={styles.shell}>
        {/* Bias Flip Banner */}
        {biasFlip && (
          <div
            style={{
              marginBottom: 12,
              padding: "12px 14px",
              borderRadius: 16,
              border: "1px solid rgba(56,189,248,0.35)",
              background: "rgba(56,189,248,0.12)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap"
            }}
          >
            <div style={{ lineHeight: 1.35 }}>
              <div style={{ fontWeight: 800 }}>
                ⚡ Bias Flip: {biasFlip.symbol} — {formatBias(biasFlip.from)} → {formatBias(biasFlip.to)}
              </div>
              <div style={{ opacity: 0.8, fontSize: 12 }}>
                {fmtTime(biasFlip.ts)} • Price {typeof biasFlip.price === "number" ? biasFlip.price.toFixed(2) : "—"} • Score{" "}
                {typeof biasFlip.score === "number" ? biasFlip.score.toFixed(1) : "—"}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={() => copyToClipboard(formatXAlert(biasFlip))} style={styles.btnPrimary}>
                Copy Alert for X
              </button>
              <button onClick={() => setBiasFlip(null)} style={styles.btn}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>Intraday Bias Engine</h1>
            <p style={styles.subtitle}>
              Step 5 ✅ Risk calculator. Fast position sizing from account risk + stop distance.
            </p>

            <div style={styles.pillRow}>
              <span style={styles.pill}>
                Market: <b>{marketOpen ? "OPEN" : "CLOSED"}</b>
              </span>
              <span style={styles.pill}>
                Data: <b>{usingLastSession ? "LAST SESSION" : "LIVE"}</b>
              </span>
              {typeof momentumScore === "number" && (
                <span style={styles.pill}>
                  Momentum: <b>{momentumScore.toFixed(1)}</b>/10
                </span>
              )}
              {inputObj && (
                <span style={styles.pill}>
                  Confidence: <b>{confText}</b>
                  <span style={styles.monoSmall}>
                    {"█".repeat(confLevel)}{"░".repeat(5 - confLevel)} ({confLevel}/5)
                  </span>
                </span>
              )}
              <span style={styles.pill}>
                Updated: <b>{lastUpdated ?? "—"}</b>
              </span>
              <span style={styles.pill}>
                Symbol: <b>{symbol}</b>
              </span>
            </div>

            {usingLastSession && <div style={styles.banner}>Using last available session data (market likely closed).</div>}
          </div>

          <div style={{ opacity: 0.85, fontSize: 12, textAlign: "right" }}>
            <div style={{ fontWeight: 700 }}>Retail Weapon Pack</div>
            <div style={{ opacity: 0.75 }}>by @bptrades</div>
          </div>
        </div>

        <div style={styles.mainGrid}>
          {/* LEFT SIDEBAR */}
          <aside style={styles.card}>
            <h2 style={styles.cardTitle}>Watchlist</h2>

            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input
                value={newTicker}
                onChange={(e) => setNewTicker(e.target.value)}
                placeholder="Add ticker (e.g. META)"
                style={{ ...styles.input, flex: 1 }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addToWatchlist();
                }}
              />
              <button onClick={addToWatchlist} style={styles.btnPrimary} disabled={loading}>
                Add
              </button>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
              <span style={styles.label}>Auto AI on click</span>
              <button
                onClick={() => {
                  setAutoAiOnWatchClick((v) => !v);
                  showToast(!autoAiOnWatchClick ? "Auto AI on click ON" : "Auto AI on click OFF");
                }}
                style={autoAiOnWatchClick ? styles.btnPrimary : styles.btn}
                disabled={loading}
              >
                {autoAiOnWatchClick ? "ON" : "OFF"}
              </button>
              <span style={{ ...styles.label, opacity: 0.65 }}>(uses Gemini quota)</span>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
              <span style={styles.label}>Flip sound</span>
              <button
                onClick={() => {
                  setBiasFlipSound((v) => !v);
                  showToast(!biasFlipSound ? "Flip sound ON" : "Flip sound OFF");
                }}
                style={biasFlipSound ? styles.btnPrimary : styles.btn}
              >
                {biasFlipSound ? "ON" : "OFF"}
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {watchlist.map((t) => {
                const active = t === symbol;
                return (
                  <div
                    key={t}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 10px",
                      borderRadius: 12,
                      border: active ? "1px solid rgba(56,189,248,0.60)" : "1px solid rgba(255,255,255,0.10)",
                      background: active ? "rgba(56,189,248,0.12)" : "rgba(0,0,0,0.20)",
                      cursor: "pointer"
                    }}
                  >
                    <div onClick={() => selectFromWatchlist(t)} style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                      <b>{t}</b>
                      {active && <span style={{ fontSize: 11, opacity: 0.75 }}>ACTIVE</span>}
                    </div>

                    <button
                      onClick={() => removeFromWatchlist(t)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(0,0,0,0.25)",
                        color: "#e5e7eb",
                        cursor: "pointer"
                      }}
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>

            {/* SNAPSHOT HISTORY */}
            <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.10)", paddingTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <h2 style={{ ...styles.cardTitle, margin: 0 }}>Snapshot History</h2>
                <button onClick={() => clearHistoryForSymbol(symbol)} style={{ ...styles.btn, padding: "8px 10px" }} disabled={loading}>
                  Clear
                </button>
              </div>

              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {symbolHistory.length === 0 && <div style={{ opacity: 0.7, fontSize: 12 }}>No history yet. Fetch a snapshot.</div>}

                {symbolHistory.map((h) => {
                  const tone = pillToneFromBias(h.bias_guess);
                  return (
                    <div
                      key={h.id}
                      onClick={() => loadHistoryItem(h)}
                      style={{
                        cursor: "pointer",
                        padding: "10px 10px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(0,0,0,0.20)"
                      }}
                      title="Click to load this snapshot"
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                        <div style={{ fontWeight: 700 }}>
                          {h.symbol} <span style={{ opacity: 0.65, fontWeight: 400 }}>{fmtTime(h.ts)}</span>
                        </div>
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: 999,
                            border: `1px solid ${tone.border}`,
                            background: tone.bg,
                            color: tone.text,
                            fontSize: 11
                          }}
                        >
                          {h.bias_guess.toUpperCase()}
                        </span>
                      </div>

                      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <span>
                          Price: <b>{h.price ?? "—"}</b>
                        </span>
                        <span>
                          VWAP: <b>{h.vwap ?? "—"}</b>
                        </span>
                        <span>
                          Score: <b>{typeof h.momentum_score === "number" ? h.momentum_score.toFixed(1) : "—"}</b>
                        </span>
                      </div>

                      <div style={{ marginTop: 4, fontSize: 11, opacity: 0.65 }}>
                        VWAP {h.vwap_state ?? "—"} • 5m {h.ema_trend_5m ?? "—"} • 15m {h.ema_trend_15m ?? "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ✅ RISK CALCULATOR */}
            <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.10)", paddingTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <h2 style={{ ...styles.cardTitle, margin: 0 }}>Risk Calculator</h2>
                <button
                  onClick={() => {
                    const p = Number(inputObj?.price);
                    if (isFinite(p) && p > 0) {
                      setEntry(p);
                      showToast("Entry set to current price");
                    } else {
                      showToast("No current price yet — fetch snapshot");
                    }
                  }}
                  style={{ ...styles.btn, padding: "8px 10px" }}
                >
                  Use Current Price
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                <div>
                  <div style={styles.label}>Account Size ($)</div>
                  <input
                    type="number"
                    value={acctSize}
                    onChange={(e) => setAcctSize(Number(e.target.value))}
                    style={{ ...styles.input, width: "100%" }}
                  />
                </div>
                <div>
                  <div style={styles.label}>Risk %</div>
                  <input
                    type="number"
                    value={riskPct}
                    onChange={(e) => setRiskPct(Number(e.target.value))}
                    style={{ ...styles.input, width: "100%" }}
                    step={0.25}
                  />
                </div>

                <div>
                  <div style={styles.label}>Direction</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <button onClick={() => setDirection("long")} style={direction === "long" ? styles.btnPrimary : styles.btn}>
                      Long
                    </button>
                    <button onClick={() => setDirection("short")} style={direction === "short" ? styles.btnPrimary : styles.btn}>
                      Short
                    </button>
                  </div>
                </div>

                <div>
                  <div style={styles.label}>Risk ($)</div>
                  <div
                    style={{
                      marginTop: 6,
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(0,0,0,0.25)",
                      fontWeight: 800
                    }}
                  >
                    {fmtMoney(riskDollars)}
                  </div>
                </div>

                <div>
                  <div style={styles.label}>Entry</div>
                  <input type="number" value={entry} onChange={(e) => setEntry(Number(e.target.value))} style={{ ...styles.input, width: "100%" }} />
                </div>
                <div>
                  <div style={styles.label}>Stop</div>
                  <input type="number" value={stop} onChange={(e) => setStop(Number(e.target.value))} style={{ ...styles.input, width: "100%" }} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                <Stat label="Stop Distance" value={stopDistance ? fmtNum(stopDistance, 2) : "—"} />
                <Stat label="Shares Size" value={shares ?? "—"} />
                <Stat label="Position $" value={positionValue ? fmtMoney(positionValue) : "—"} />
                <Stat label="1R / 2R / 3R Targets" value={rTargets ? `${fmtNum(rTargets.r1, 2)} • ${fmtNum(rTargets.r2, 2)} • ${fmtNum(rTargets.r3, 2)}` : "—"} />
              </div>

              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65, lineHeight: 1.35 }}>
                Size is based on <b>shares</b>: Shares = Risk$ ÷ |Entry − Stop|. Options sizing is coming later (premium-based).
              </div>
            </div>
          </aside>

          {/* MAIN CONTENT */}
          <div style={styles.cardGrid}>
            {/* DASHBOARD */}
            <section style={styles.card}>
              <h2 style={styles.cardTitle}>Dashboard</h2>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                <span style={styles.label}>Symbol</span>
                <input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase().trim())}
                  placeholder="SPY"
                  style={{ ...styles.input, width: 120 }}
                />

                <span style={{ ...styles.label, marginLeft: 6 }}>Auto refresh</span>
                <button
                  onClick={() => {
                    setAutoRefresh((v) => !v);
                    showToast(!autoRefresh ? "Auto refresh ON" : "Auto refresh OFF");
                  }}
                  style={autoRefresh ? styles.btnPrimary : styles.btn}
                  disabled={loading}
                >
                  {autoRefresh ? "ON" : "OFF"}
                </button>

                <span style={styles.label}>Every</span>
                <input
                  type="number"
                  value={refreshSeconds}
                  onChange={(e) => setRefreshSeconds(Number(e.target.value))}
                  min={10}
                  max={600}
                  style={{ ...styles.input, width: 90 }}
                />
                <span style={styles.label}>sec</span>
              </div>

              <TradingViewChart symbol={symbol} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                <Stat label="Price" value={inputObj?.price} />
                <Stat label="VWAP" value={inputObj?.vwap} />
                <Stat label="VWAP State" value={inputObj?.vwap_state} />
                <Stat label="EMA Trend 5m" value={inputObj?.ema_trend_5m} />
                <Stat label="EMA Trend 15m" value={inputObj?.ema_trend_15m} />
                <Stat label="RSI (1m)" value={inputObj?.rsi_1m} />
                <Stat label="Volume" value={inputObj?.volume_state} />
                <Stat label="Momentum Score" value={inputObj?.momentum_score} />
              </div>

              <div style={styles.btnRow}>
                <button onClick={() => refreshSnapshotOnly()} disabled={loading} style={styles.btn}>
                  Fetch Snapshot
                </button>

                <button onClick={generatePlanFromLatestSnapshot} disabled={loading} style={styles.btnPrimary}>
                  {loading ? "Working..." : "Run Weapon Pack (AI)"}
                </button>

                <button onClick={generatePlan} disabled={loading} style={styles.btn}>
                  Generate Plan (from JSON)
                </button>

                <button
                  onClick={() => {
                    setAutoRefresh(false);
                    setUsingLastSession(false);
                    setMarketOpen(false);
                    setPlan(null);
                    setError("");
                    setLastUpdated(null);
                    setInputJsonText(JSON.stringify({ ...defaultInput, symbol }, null, 2));
                    showToast("Reset.");
                  }}
                  disabled={loading}
                  style={styles.btnDanger}
                >
                  Reset
                </button>
              </div>

              {error && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 10,
                    borderRadius: 14,
                    background: "rgba(248,113,113,0.12)",
                    border: "1px solid rgba(248,113,113,0.25)"
                  }}
                >
                  <b style={{ color: "#fecaca" }}>Error:</b> <span style={{ color: "#fecaca" }}>{error}</span>
                </div>
              )}

              <details style={{ marginTop: 14 }}>
                <summary style={{ cursor: "pointer", opacity: 0.85 }}>Advanced: show snapshot JSON</summary>
                <textarea
                  value={inputJsonText}
                  onChange={(e) => setInputJsonText(e.target.value)}
                  rows={14}
                  style={{ ...styles.textarea, marginTop: 10 }}
                />
              </details>
            </section>

            {/* AI OUTPUT */}
            <section style={styles.card}>
              <h2 style={styles.cardTitle}>AI Plan Output</h2>

              {!plan && !loading && (
                <div style={{ opacity: 0.75, lineHeight: 1.4 }}>
                  Click <b>Run Weapon Pack (AI)</b> to generate the plan.
                </div>
              )}

              {plan && (
                <>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "7px 10px",
                        borderRadius: 999,
                        border: `1px solid ${biasTone.border}`,
                        background: biasTone.bg,
                        color: biasTone.text,
                        fontSize: 12
                      }}
                    >
                      Bias: <b>{plan.bias}</b>
                    </span>
                    <span style={styles.pill}>
                      Symbol: <b>{String(inputObj?.symbol || symbol).toUpperCase()}</b>
                    </span>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>THESIS</div>
                    <div style={{ lineHeight: 1.45 }}>{plan.thesis}</div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>PLAYBOOK</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {plan.playbook?.map((p, idx) => (
                        <div
                          key={idx}
                          style={{
                            borderRadius: 14,
                            border: "1px solid rgba(255,255,255,0.12)",
                            background: "rgba(0,0,0,0.22)",
                            padding: 12
                          }}
                        >
                          <div style={{ marginBottom: 6 }}>
                            <b>IF</b> {p.if}
                          </div>
                          <div style={{ marginBottom: 6 }}>
                            <b>THEN</b> {p.then}
                          </div>
                          <div style={{ opacity: 0.85 }}>
                            <b>RISK</b> {p.risk}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>DANGER ZONES</div>
                    <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
                      {plan.danger_zones?.map((d, idx) => (
                        <li key={idx}>{d}</li>
                      ))}
                    </ul>
                  </div>

                  <div style={{ marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>COPY-TO-X POST</div>
                        <div style={{ fontSize: 12, opacity: 0.65 }}>Optimized for a single post — edit before posting.</div>
                      </div>
                      <button onClick={() => copyToClipboard(xPost)} disabled={!xPost} style={styles.btnPrimary}>
                        Copy X Post
                      </button>
                    </div>

                    <textarea value={xPost} readOnly rows={10} style={{ ...styles.textarea, marginTop: 10 }} />

                    <div style={{ marginTop: 12, fontSize: 12, opacity: 0.55 }}>
                      Not financial advice • Data may be delayed depending on feed • Built by @bptrades
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        </div>

        {toast && (
          <div
            style={{
              position: "fixed",
              bottom: 20,
              left: "50%",
              transform: "translateX(-50%)",
              padding: "10px 12px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(0,0,0,0.65)",
              color: "#e5e7eb",
              fontSize: 13,
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)"
            }}
          >
            {toast}
          </div>
        )}
      </main>
    </div>
  );
}