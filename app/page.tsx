"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

type PlanItem = { if: string; then: string; risk: string };
type Plan = {
  bias: "bullish" | "bearish" | "neutral";
  thesis: string;
  playbook: PlanItem[];
  danger_zones: string[];
  confidence: number; // kept for compatibility, but UI uses momentum_score -> 1-5 label
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
  market_open: false,
  using_last_session_data: true,
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
    session_high: 505.1,
    session_low: 498.9,
    high_60m: 504.4,
    low_60m: 497.8
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

function safeTicker(raw: string) {
  return raw.toUpperCase().trim().replace(/\s+/g, "");
}
function isValidTicker(sym: string) {
  return /^[A-Z.\-]{1,10}$/.test(sym);
}
function fmtTime(tsISO: string) {
  return new Date(tsISO).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

  // Default: let TradingView auto-detect exchange.
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
    <div className="h-[520px] w-full overflow-hidden rounded-2xl border border-white/10 bg-black/20">
      <iframe title="chart" src={src} className="h-full w-full border-0" allowFullScreen />
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
      ? plan.playbook.map((p: any) => ({
          ...p,
          if: replaceSym(p.if),
          then: replaceSym(p.then),
          risk: replaceSym(p.risk)
        }))
      : plan.playbook,
    danger_zones: Array.isArray(plan.danger_zones) ? plan.danger_zones.map(replaceSym) : plan.danger_zones
  };
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

function formatXAlert(alert: BiasFlipAlert) {
  const t = new Date(alert.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const p = typeof alert.price === "number" ? alert.price.toFixed(2) : "—";
  const s = typeof alert.score === "number" ? alert.score.toFixed(1) : "—";
  return [`⚡ Bias Flip Alert: ${alert.symbol}`, `${alert.from.toUpperCase()} → ${alert.to.toUpperCase()} @ ${t}`, `Price: ${p} • Score: ${s}`, ``, `Not financial advice.`].join(
    "\n"
  );
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

function Metric({ label, value }: { label: string; value: any }) {
  return (
    <Card className="border-white/10 bg-white/5">
      <CardContent className="p-4">
        <div className="text-xs text-slate-400">{label}</div>
        <div className="mt-2 text-lg font-semibold">{value ?? "—"}</div>
      </CardContent>
    </Card>
  );
}

export default function Page() {
  const [symbol, setSymbol] = useState("SPY");
  const [inputJsonText, setInputJsonText] = useState(JSON.stringify(defaultInput, null, 2));
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState("");

  const [marketOpen, setMarketOpen] = useState(false);
  const [usingLastSession, setUsingLastSession] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Auto refresh
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshSeconds, setRefreshSeconds] = useState(60);
  const inFlightRef = useRef(false);

  // AI cooldown
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

  // Bias flip
  const [biasFlip, setBiasFlip] = useState<BiasFlipAlert | null>(null);
  const [biasFlipSound, setBiasFlipSound] = useState(true);
  const lastFlipKeyRef = useRef<string>("");

  // Settings
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Risk
  const [acctSize, setAcctSize] = useState<number>(5000);
  const [riskPct, setRiskPct] = useState<number>(1);
  const [entry, setEntry] = useState<number>(0);
  const [stop, setStop] = useState<number>(0);
  const [direction, setDirection] = useState<"long" | "short">("long");

  // Load persisted
  useEffect(() => {
    try {
      const wl = localStorage.getItem("rw_watchlist_v1");
      if (wl) {
        const parsed = JSON.parse(wl);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.map((x) => safeTicker(String(x))).filter((x) => isValidTicker(x));
          if (cleaned.length) setWatchlist(Array.from(new Set(cleaned)));
        }
      }
    } catch {}
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setHistory(parsed);
      }
    } catch {}
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
      localStorage.setItem("rw_watchlist_v1", JSON.stringify(watchlist));
    } catch {}
  }, [watchlist]);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {}
  }, [history]);

  useEffect(() => {
    try {
      localStorage.setItem("rw_risk_v1", JSON.stringify({ acctSize, riskPct, entry, stop, direction }));
    } catch {}
  }, [acctSize, riskPct, entry, stop, direction]);

  const inputObj = useMemo(() => {
    try {
      return JSON.parse(inputJsonText);
    } catch {
      return null;
    }
  }, [inputJsonText]);

  const momentumScore = typeof inputObj?.momentum_score === "number" ? inputObj.momentum_score : undefined;
  const confLevel = normalizeConfidence(momentumScore);
  const confText = confidenceLabel(confLevel);
  const biasGuess = biasGuessFromScore(typeof momentumScore === "number" ? momentumScore : null);

  const symbolHistory = useMemo(() => {
    const sym = safeTicker(symbol);
    return history.filter((h) => h.symbol === sym).slice(0, HISTORY_PER_SYMBOL_MAX);
  }, [history, symbol]);

  const xPost = useMemo(() => {
    if (!inputObj || !plan) return "";
    return formatXPost(inputObj, plan);
  }, [inputObj, plan]);

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
    toast(`Bias flip: ${flip.symbol} ${flip.from.toUpperCase()} → ${flip.to.toUpperCase()}`);
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
    try {
      const sym = safeTicker(forSymbol || symbol);
      if (!isValidTicker(sym)) {
        toast.error("Invalid ticker");
        return;
      }

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

      if (!entry && typeof snap?.price === "number") setEntry(snap.price);

      toast(`${s} snapshot updated`);
    } catch (e: any) {
      setError(e?.message || "Unknown error");
      toast.error(e?.message || "Snapshot error");
    } finally {
      inFlightRef.current = false;
    }
  }

  async function runAIWithSnapshot() {
    if (aiInFlightRef.current) return;
    if (Date.now() < aiCooldownUntil) {
      toast("AI cooling down… (quota / rate limit)");
      return;
    }

    await refreshSnapshotOnly();

    let snap: any = null;
    try {
      snap = JSON.parse(inputJsonText);
    } catch {}
    if (!snap) {
      setError("Snapshot JSON invalid.");
      toast.error("Snapshot JSON invalid");
      return;
    }

    aiInFlightRef.current = true;
    setError("");
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
      toast.success("AI plan generated");
    } catch (e: any) {
      const msg = e?.message || "AI error";
      if (String(msg).includes("429") || String(msg).toLowerCase().includes("quota")) {
        setAiCooldownUntil(Date.now() + 35_000);
      }
      setError(msg);
      toast.error(msg);
    } finally {
      aiInFlightRef.current = false;
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  // Auto refresh loop
  useEffect(() => {
    if (!autoRefresh) return;
    const secs = Math.max(10, Math.min(600, Number(refreshSeconds) || 60));
    const id = window.setInterval(() => refreshSnapshotOnly(), secs * 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, refreshSeconds, symbol]);

  function addToWatchlist() {
    const t = safeTicker(newTicker);
    if (!t) return;
    if (!isValidTicker(t)) return toast.error("Invalid ticker");
    setWatchlist((prev) => Array.from(new Set([t, ...prev])));
    setNewTicker("");
    toast.success(`${t} added`);
  }

  function removeFromWatchlist(ticker: string) {
    setWatchlist((prev) => prev.filter((x) => x !== ticker));
    toast(`${ticker} removed`);
  }

  async function selectFromWatchlist(ticker: string) {
    const t = safeTicker(ticker);
    setSymbol(t);
    setPlan(null);
    await refreshSnapshotOnly(t);
    if (autoAiOnWatchClick) await runAIWithSnapshot();
  }

  function clearHistoryForSymbol(sym: string) {
    const s = safeTicker(sym);
    setHistory((prev) => prev.filter((h) => h.symbol !== s));
    toast(`Cleared history: ${s}`);
  }

  function loadHistoryItem(item: SnapshotHistoryItem) {
    setPlan(null);
    setSymbol(item.symbol);
    setInputJsonText(JSON.stringify(item.snapshot, null, 2));
    setLastUpdated(fmtTime(item.ts));
    if (typeof item.price === "number") setEntry(item.price);
    toast(`Loaded ${item.symbol} @ ${fmtTime(item.ts)}`);
  }

  // Risk calculations
  const riskDollars = useMemo(() => (acctSize && riskPct ? acctSize * (riskPct / 100) : null), [acctSize, riskPct]);

  const stopDistance = useMemo(() => {
    if (!entry || !stop) return null;
    const dist = Math.abs(entry - stop);
    return dist > 0 ? dist : null;
  }, [entry, stop]);

  const shares = useMemo(() => {
    if (!riskDollars || !stopDistance) return null;
    const raw = riskDollars / stopDistance;
    return raw > 0 ? Math.floor(raw) : null;
  }, [riskDollars, stopDistance]);

  const positionValue = useMemo(() => {
    if (!shares || !entry) return null;
    return shares * entry;
  }, [shares, entry]);

  const rTargets = useMemo(() => {
    if (!stopDistance || !entry) return null;
    const d = stopDistance;
    const mk = (r: number) => (direction === "long" ? entry + d * r : entry - d * r);
    return { r1: mk(1), r2: mk(2), r3: mk(3) };
  }, [stopDistance, entry, direction]);

  const biasBadgeVariant = (b: string) => {
    const s = b.toLowerCase();
    if (s === "bullish") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    if (s === "bearish") return "bg-rose-500/15 text-rose-300 border-rose-500/30";
    return "bg-slate-500/15 text-slate-200 border-slate-500/30";
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100">
      {/* TopBar */}
      <div className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-400/20">
              RP
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">Retail Weapon Pack</div>
              <div className="text-xs text-slate-400">Bias • Alerts • Risk • Posting</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-white/10 bg-white/5">
              {symbol}
            </Badge>
            <Badge variant="outline" className="border-white/10 bg-white/5">
              {marketOpen ? "Market: OPEN" : "Market: CLOSED"}
            </Badge>
            <Badge variant="outline" className="border-white/10 bg-white/5">
              {usingLastSession ? "Data: LAST SESSION" : "Data: LIVE"}
            </Badge>

            <Button variant="secondary" onClick={() => refreshSnapshotOnly()} className="bg-white/5 border border-white/10">
              Fetch
            </Button>
            <Button onClick={runAIWithSnapshot} className="bg-cyan-500/20 border border-cyan-400/30 text-cyan-100 hover:bg-cyan-500/25">
              Run AI
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (plan && inputObj) copyToClipboard(formatXPost(inputObj, plan));
                else toast("No plan to copy yet");
              }}
              className="bg-white/5 border border-white/10"
            >
              Copy X
            </Button>

            {/* Settings */}
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary" className="bg-white/5 border border-white/10">
                  Settings
                </Button>
              </DialogTrigger>
              <DialogContent className="border-white/10 bg-slate-950 text-slate-100">
                <DialogHeader>
                  <DialogTitle>Settings</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">Auto refresh</div>
                      <div className="text-xs text-slate-400">Auto fetch snapshot on a timer.</div>
                    </div>
                    <Switch checked={autoRefresh} onCheckedChange={(v) => setAutoRefresh(v)} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Refresh interval (sec)</div>
                      <Input
                        type="number"
                        value={refreshSeconds}
                        onChange={(e) => setRefreshSeconds(Number(e.target.value))}
                        className="bg-white/5 border-white/10"
                        min={10}
                        max={600}
                      />
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Flip alert sound</div>
                      <div className="flex items-center gap-2">
                        <Switch checked={biasFlipSound} onCheckedChange={(v) => setBiasFlipSound(v)} />
                        <span className="text-sm">{biasFlipSound ? "On" : "Off"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">Auto AI on watchlist click</div>
                      <div className="text-xs text-slate-400">Consumes Gemini quota.</div>
                    </div>
                    <Switch checked={autoAiOnWatchClick} onCheckedChange={(v) => setAutoAiOnWatchClick(v)} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">Show Advanced JSON</div>
                      <div className="text-xs text-slate-400">Developer view for debugging.</div>
                    </div>
                    <Switch checked={showAdvanced} onCheckedChange={(v) => setShowAdvanced(v)} />
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-12 gap-4 px-4 py-6">
        {/* Sidebar */}
        <div className="col-span-12 lg:col-span-3 space-y-4">
          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-sm">Symbol</CardTitle>
              <CardDescription>Search any ticker supported by your data feed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase().trim())}
                className="bg-white/5 border-white/10"
                placeholder="SPY"
              />
              <div className="flex gap-2">
                <Button variant="secondary" className="w-full bg-white/5 border border-white/10" onClick={() => refreshSnapshotOnly()}>
                  Fetch Snapshot
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span>Updated:</span>
                <span className="text-slate-200">{lastUpdated ?? "—"}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Bias guess</span>
                <Badge variant="outline" className={`border ${biasBadgeVariant(biasGuess)}`}>
                  {biasGuess.toUpperCase()}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-sm">Watchlist</CardTitle>
              <CardDescription>Click to load. Optional auto-AI in Settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={newTicker}
                  onChange={(e) => setNewTicker(e.target.value)}
                  className="bg-white/5 border-white/10"
                  placeholder="Add ticker (META)"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addToWatchlist();
                  }}
                />
                <Button onClick={addToWatchlist} className="bg-cyan-500/20 border border-cyan-400/30 text-cyan-100 hover:bg-cyan-500/25">
                  Add
                </Button>
              </div>

              <div className="space-y-2">
                {watchlist.map((t) => (
                  <div key={t} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                    <button onClick={() => selectFromWatchlist(t)} className="text-left text-sm font-semibold hover:opacity-90">
                      {t}
                    </button>
                    <Button size="sm" variant="secondary" className="bg-white/5 border border-white/10" onClick={() => removeFromWatchlist(t)}>
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm">Snapshot History</CardTitle>
                <CardDescription>Click an item to reload snapshot.</CardDescription>
              </div>
              <Button size="sm" variant="secondary" className="bg-white/5 border border-white/10" onClick={() => clearHistoryForSymbol(symbol)}>
                Clear
              </Button>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[360px] pr-2">
                <div className="space-y-2">
                  {symbolHistory.length === 0 && <div className="text-sm text-slate-400">No history yet. Fetch a snapshot.</div>}
                  {symbolHistory.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => loadHistoryItem(h)}
                      className="w-full rounded-xl border border-white/10 bg-black/20 p-3 text-left hover:bg-black/30"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold">
                          {h.symbol} <span className="ml-2 text-xs text-slate-400">{fmtTime(h.ts)}</span>
                        </div>
                        <Badge variant="outline" className={`border ${biasBadgeVariant(h.bias_guess)}`}>
                          {h.bias_guess.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="mt-2 text-xs text-slate-300 flex flex-wrap gap-3">
                        <span>Px: <b>{h.price ?? "—"}</b></span>
                        <span>VWAP: <b>{h.vwap ?? "—"}</b></span>
                        <span>Score: <b>{typeof h.momentum_score === "number" ? h.momentum_score.toFixed(1) : "—"}</b></span>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Main */}
        <div className="col-span-12 lg:col-span-6 space-y-4">
          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-sm">Chart</CardTitle>
              <CardDescription>TradingView embed. Ticker maps common ETFs/indices.</CardDescription>
            </CardHeader>
            <CardContent>
              <TradingViewChart symbol={symbol} />
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-sm">Snapshot</CardTitle>
              <CardDescription>Clean tiles — no JSON needed for normal use.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <Metric label="Price" value={inputObj?.price} />
              <Metric label="VWAP" value={inputObj?.vwap} />
              <Metric label="VWAP State" value={inputObj?.vwap_state} />
              <Metric label="EMA Trend (5m)" value={inputObj?.ema_trend_5m} />
              <Metric label="EMA Trend (15m)" value={inputObj?.ema_trend_15m} />
              <Metric label="RSI (1m)" value={inputObj?.rsi_1m} />
              <Metric label="Volume" value={inputObj?.volume_state} />
              <Metric label="Momentum Score" value={inputObj?.momentum_score} />
              <Metric label="Confidence" value={`${confText} (${confLevel}/5)`} />
              <Metric label="Session High" value={inputObj?.key_levels?.session_high} />
              <Metric label="Session Low" value={inputObj?.key_levels?.session_low} />
              <Metric label="60m High" value={inputObj?.key_levels?.high_60m} />
              <Metric label="60m Low" value={inputObj?.key_levels?.low_60m} />
              <Metric label="Data Source" value={usingLastSession ? "Last Session" : "Live"} />
              <Metric label="Market" value={marketOpen ? "Open" : "Closed"} />
            </CardContent>
          </Card>

          {error && (
            <Card className="border-rose-500/30 bg-rose-500/10">
              <CardContent className="p-4 text-rose-200">
                <div className="text-sm font-semibold">Error</div>
                <div className="text-sm opacity-90">{error}</div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right panel */}
        <div className="col-span-12 lg:col-span-3 space-y-4">
          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-sm">Control Panel</CardTitle>
              <CardDescription>Run the pack → copy post → monitor alerts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Button variant="secondary" className="w-full bg-white/5 border border-white/10" onClick={() => refreshSnapshotOnly()}>
                  Fetch
                </Button>
                <Button className="w-full bg-cyan-500/20 border border-cyan-400/30 text-cyan-100 hover:bg-cyan-500/25" onClick={runAIWithSnapshot}>
                  Run AI
                </Button>
              </div>

              <Separator className="bg-white/10" />

              <Tabs defaultValue="plan" className="w-full">
                <TabsList className="grid w-full grid-cols-4 bg-white/5 border border-white/10">
                  <TabsTrigger value="plan">Plan</TabsTrigger>
                  <TabsTrigger value="alerts">Alerts</TabsTrigger>
                  <TabsTrigger value="risk">Risk</TabsTrigger>
                  <TabsTrigger value="adv">Adv</TabsTrigger>
                </TabsList>

                <TabsContent value="plan" className="mt-4 space-y-3">
                  {!plan ? (
                    <div className="text-sm text-slate-400">
                      No plan yet. Click <b>Run AI</b>.
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className={`border ${biasBadgeVariant(plan.bias)}`}>
                          {plan.bias.toUpperCase()}
                        </Badge>
                        <Button variant="secondary" className="bg-white/5 border border-white/10" onClick={() => copyToClipboard(xPost)} disabled={!xPost}>
                          Copy X Post
                        </Button>
                      </div>

                      <Card className="border-white/10 bg-black/20">
                        <CardContent className="p-4">
                          <div className="text-xs text-slate-400">THESIS</div>
                          <div className="mt-2 text-sm leading-relaxed">{plan.thesis}</div>
                        </CardContent>
                      </Card>

                      <div className="space-y-2">
                        <div className="text-xs text-slate-400">PLAYBOOK</div>
                        {plan.playbook?.map((p, idx) => (
                          <Card key={idx} className="border-white/10 bg-black/20">
                            <CardContent className="p-4 space-y-2">
                              <div className="text-sm"><b>IF</b> {p.if}</div>
                              <div className="text-sm"><b>THEN</b> {p.then}</div>
                              <div className="text-sm text-slate-300"><b>RISK</b> {p.risk}</div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>

                      <Card className="border-white/10 bg-black/20">
                        <CardContent className="p-4">
                          <div className="text-xs text-slate-400">DANGER ZONES</div>
                          <ul className="mt-2 list-disc pl-5 text-sm text-slate-200 space-y-1">
                            {plan.danger_zones?.map((d, idx) => (
                              <li key={idx}>{d}</li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>

                      <Card className="border-white/10 bg-black/20">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-xs text-slate-400">X POST</div>
                              <div className="text-xs text-slate-500">Edit before posting.</div>
                            </div>
                            <div className="text-xs text-slate-400">{xPost.length} chars</div>
                          </div>
                          <Textarea value={xPost} readOnly className="mt-3 bg-white/5 border-white/10 min-h-[180px]" />
                        </CardContent>
                      </Card>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="alerts" className="mt-4 space-y-3">
                  <div className="text-sm text-slate-300">
                    Bias flips trigger when bias_guess changes (bull/neutral/bear) on new snapshots.
                  </div>

                  {!biasFlip ? (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">
                      No flip yet. Keep fetching or turn on Auto refresh.
                    </div>
                  ) : (
                    <Card className="border-white/10 bg-black/20">
                      <CardContent className="p-4 space-y-2">
                        <div className="text-sm font-semibold">⚡ Bias Flip</div>
                        <div className="text-sm">
                          <b>{biasFlip.symbol}</b> {biasFlip.from.toUpperCase()} → {biasFlip.to.toUpperCase()}
                        </div>
                        <div className="text-xs text-slate-400">
                          {fmtTime(biasFlip.ts)} • Price {typeof biasFlip.price === "number" ? biasFlip.price.toFixed(2) : "—"} • Score{" "}
                          {typeof biasFlip.score === "number" ? biasFlip.score.toFixed(1) : "—"}
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button
                            variant="secondary"
                            className="bg-white/5 border border-white/10"
                            onClick={() => copyToClipboard(formatXAlert(biasFlip))}
                          >
                            Copy Alert for X
                          </Button>
                          <Button variant="secondary" className="bg-white/5 border border-white/10" onClick={() => setBiasFlip(null)}>
                            Dismiss
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="risk" className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Account Size ($)</div>
                      <Input type="number" value={acctSize} onChange={(e) => setAcctSize(Number(e.target.value))} className="bg-white/5 border-white/10" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Risk %</div>
                      <Input type="number" value={riskPct} onChange={(e) => setRiskPct(Number(e.target.value))} className="bg-white/5 border-white/10" step={0.25} />
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Entry</div>
                      <Input type="number" value={entry} onChange={(e) => setEntry(Number(e.target.value))} className="bg-white/5 border-white/10" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Stop</div>
                      <Input type="number" value={stop} onChange={(e) => setStop(Number(e.target.value))} className="bg-white/5 border-white/10" />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      className="bg-white/5 border border-white/10 w-full"
                      onClick={() => {
                        const p = Number(inputObj?.price);
                        if (isFinite(p) && p > 0) {
                          setEntry(p);
                          toast.success("Entry set to current price");
                        } else toast("Fetch snapshot first");
                      }}
                    >
                      Use Current Price
                    </Button>
                    <Button
                      variant="secondary"
                      className="bg-white/5 border border-white/10 w-full"
                      onClick={() => {
                        const v = Number(inputObj?.vwap);
                        if (isFinite(v) && v > 0) {
                          setStop(v);
                          toast.success("Stop set to VWAP");
                        } else toast("No VWAP yet");
                      }}
                    >
                      Use VWAP as Stop
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant={direction === "long" ? "default" : "secondary"}
                      className={direction === "long" ? "bg-cyan-500/20 border border-cyan-400/30 text-cyan-100 hover:bg-cyan-500/25 w-full" : "bg-white/5 border border-white/10 w-full"}
                      onClick={() => setDirection("long")}
                    >
                      Long
                    </Button>
                    <Button
                      variant={direction === "short" ? "default" : "secondary"}
                      className={direction === "short" ? "bg-cyan-500/20 border border-cyan-400/30 text-cyan-100 hover:bg-cyan-500/25 w-full" : "bg-white/5 border border-white/10 w-full"}
                      onClick={() => setDirection("short")}
                    >
                      Short
                    </Button>
                  </div>

                  <Separator className="bg-white/10" />

                  <div className="grid grid-cols-2 gap-3">
                    <Metric label="Risk ($)" value={fmtMoney(riskDollars)} />
                    <Metric label="Stop Distance" value={stopDistance ? fmtNum(stopDistance, 2) : "—"} />
                    <Metric label="Shares" value={shares ?? "—"} />
                    <Metric label="Position $" value={positionValue ? fmtMoney(positionValue) : "—"} />
                  </div>

                  <Card className="border-white/10 bg-black/20">
                    <CardContent className="p-4">
                      <div className="text-xs text-slate-400">Targets (R multiples)</div>
                      <div className="mt-2 text-sm text-slate-200">
                        {rTargets ? (
                          <>
                            1R: <b>{fmtNum(rTargets.r1, 2)}</b> • 2R: <b>{fmtNum(rTargets.r2, 2)}</b> • 3R: <b>{fmtNum(rTargets.r3, 2)}</b>
                          </>
                        ) : (
                          "—"
                        )}
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        Shares = Risk$ ÷ |Entry − Stop|. Options sizing (premium/delta) can be added next.
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="adv" className="mt-4 space-y-3">
                  {!showAdvanced ? (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">
                      Advanced JSON is off. Enable it in Settings.
                    </div>
                  ) : (
                    <Card className="border-white/10 bg-black/20">
                      <CardContent className="p-4 space-y-3">
                        <div className="text-xs text-slate-400">Snapshot JSON</div>
                        <Textarea
                          value={inputJsonText}
                          onChange={(e) => setInputJsonText(e.target.value)}
                          className="bg-white/5 border-white/10 min-h-[260px]"
                        />
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5">
            <CardContent className="p-4 text-xs text-slate-400 leading-relaxed">
              <div className="font-semibold text-slate-200">Gumroad Ready Notes</div>
              <div className="mt-1">
                Next: add a /help page (FAQ + methodology) + a changelog.
              </div>
              <div className="mt-2 text-slate-500">
                Not financial advice • Data delayed depending on feed • Built by @bptrades
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-slate-500">
        <div className="flex items-center justify-between border-t border-white/10 pt-4">
          <div>Retail Weapon Pack • v0.1.0</div>
          <div>© {new Date().getFullYear()} bptrades</div>
        </div>
      </footer>
    </div>
  );
}