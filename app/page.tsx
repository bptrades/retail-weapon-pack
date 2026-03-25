"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button }      from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input }       from "@/components/ui/input";
import { Badge }       from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator }   from "@/components/ui/separator";
import { Switch }      from "@/components/ui/switch";
import { Textarea }    from "@/components/ui/textarea";
import { ScrollArea }  from "@/components/ui/scroll-area";
import EconomicCalendar from "@/components/EconomicCalendar";
import OptionsFlow       from "@/components/OptionsFlow";
import TradeJournal      from "@/components/TradeJournal";

import NewsFeed             from "@/components/NewsFeed";
import CorrelationDashboard from "@/components/CorrelationDashboard";
import GammaLevels          from "@/components/GammaLevels";
import PreMarketBrief       from "@/components/PreMarketBrief";
import SetupCard            from "@/components/SetupCard";
import WatchlistGroups      from "@/components/WatchlistGroups";

import ScoreDelta     from "@/components/ScoreDelta";
import WinRateHeatmap from "@/components/WinRateHeatmap";

// ─── Types ────────────────────────────────────────────────────────────────────

type PlanItem = { if: string; then: string; risk: string };
type Plan = {
  bias: "bullish" | "bearish" | "neutral";
  thesis: string;
  playbook: PlanItem[];
  danger_zones: string[];
  confidence: number;
};

type SnapshotHistoryItem = {
  id: string; ts: string; symbol: string;
  price: number | null; vwap: number | null;
  vwap_state: string | null; ema_trend_5m: string | null;
  ema_trend_15m: string | null; rsi_1m: number | null;
  volume_state: string | null; momentum_score: number | null;
  bias_guess: "bullish" | "bearish" | "neutral"; snapshot: any;
};

type BiasFlipAlert = {
  id: string; symbol: string;
  from: "bullish" | "bearish" | "neutral";
  to:   "bullish" | "bearish" | "neutral";
  ts: string; price: number | null; score: number | null;
};

// ─── Constants / defaults ─────────────────────────────────────────────────────

const defaultInput = {
  symbol: "SPY", timestamp: "2026-02-17T12:00:00-05:00",
  market_open: false, using_last_session_data: true,
  price: 502.85, vwap: 501.9, vwap_state: "above",
  ema_trend_5m: "bull", ema_trend_15m: "bull",
  rsi_1m: 58.2, rsi_state: "neutral_to_bull",
  atr_14: 2.1, expected_move_today: 2.1, volume_state: "above_avg",
  key_levels: { session_high: 505.1, session_low: 498.9, high_60m: 504.4, low_60m: 497.8 },
  momentum_score: 7.4,
};

// ─── Pure helpers ──────────────────────────────────────────────────────────────

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

function computeMomentumScore(input: any): number {
  let score = 5;

  const price = typeof input?.price === "number" ? input.price : null;
  const vwap  = typeof input?.vwap  === "number" ? input.vwap  : null;
  const atr   = typeof input?.atr_14 === "number" ? input.atr_14
              : typeof input?.expected_move_today === "number" ? input.expected_move_today
              : null;

  if (price != null && vwap != null) {
    const vwapDiff = price - vwap;
    if (atr && atr > 0) {
      const atrRatio = vwapDiff / atr;
      if      (atrRatio >= 0.5)  score += 2.5;
      else if (atrRatio >= 0.1)  score += 1.5;
      else if (atrRatio >= -0.1) score += 0;
      else if (atrRatio >= -0.5) score -= 1.5;
      else                       score -= 2.5;
    } else {
      if (input?.vwap_state === "above") score += 2.0;
      if (input?.vwap_state === "below") score -= 2.0;
    }
  } else {
    if (input?.vwap_state === "above") score += 2.0;
    if (input?.vwap_state === "below") score -= 2.0;
  }

  const ema5  = input?.ema_trend_5m;
  const ema15 = input?.ema_trend_15m;
  const emaBullCount = [ema5 === "bull", ema15 === "bull"].filter(Boolean).length;
  const emaBearCount = [ema5 === "bear", ema15 === "bear"].filter(Boolean).length;

  if      (emaBullCount === 2) score += 2.5;
  else if (emaBullCount === 1) score += 1.0;
  else if (emaBearCount === 2) score -= 2.5;
  else if (emaBearCount === 1) score -= 1.0;

  const rsiNum = typeof input?.rsi_1m === "number" ? input.rsi_1m : null;
  if (rsiNum != null) {
    if      (rsiNum >= 65)                score += 1.5;
    else if (rsiNum >= 55 && rsiNum < 65) score += 0.75;
    else if (rsiNum > 45 && rsiNum < 55)  score += 0;
    else if (rsiNum >= 35 && rsiNum <= 45)score -= 0.75;
    else                                  score -= 1.5;
  } else {
    const rsiStr = String(input?.rsi_state || "").toLowerCase();
    if (rsiStr.includes("bull") || rsiStr.includes("overbought")) score += 1.0;
    if (rsiStr.includes("bear") || rsiStr.includes("oversold"))   score -= 1.0;
  }

  const volRatio = typeof input?.volume_ratio === "number" ? input.volume_ratio : null;
  if (volRatio != null) {
    if      (volRatio >= 2.0) score += 1.0;
    else if (volRatio >= 1.2) score += 0.5;
    else if (volRatio >= 0.8) score += 0;
    else                      score -= 0.5;
  } else {
    const volStr = String(input?.volume_state || "").toLowerCase();
    if (volStr.includes("above") || volStr.includes("surge")) score += 0.75;
    if (volStr.includes("below") || volStr.includes("thin"))  score -= 0.75;
  }

  if (atr != null && price != null) {
    const atrPct = atr / price;
    if      (atrPct >= 0.025) score += 0.5;
    else if (atrPct <= 0.005) score -= 0.5;
  }

  const ts = input?.timestamp ? new Date(input.timestamp) : new Date();
  const etHour    = ts.getUTCHours() - 4;
  const etMinute  = ts.getUTCMinutes();
  const etDecimal = etHour + etMinute / 60;
  if      (etDecimal >= 9.5  && etDecimal <= 10.5) score += 0.5;
  else if (etDecimal >= 15.0 && etDecimal <= 16.0) score += 0.5;
  else if (etDecimal >= 12.0 && etDecimal <= 13.5) score -= 0.5;

  return Number(clamp(score, 0, 10).toFixed(1));
}

function normalizeConfidence(score: number | undefined) {
  if (typeof score !== "number") return 3;
  return Math.max(1, Math.min(5, Math.round((score / 10) * 5)));
}

function confidenceLabel(level: number) {
  if (level <= 2) return "Low"; if (level === 3) return "Moderate";
  if (level === 4) return "Strong"; return "High Conviction";
}

function biasGuessFromScore(score: number | null | undefined): "bullish" | "bearish" | "neutral" {
  if (typeof score !== "number") return "neutral";
  if (score >= 6.5) return "bullish"; if (score <= 3.5) return "bearish"; return "neutral";
}

function safeTicker(raw: string) { return raw.toUpperCase().trim().replace(/\s+/g, ""); }
function isValidTicker(sym: string) { return /^[A-Z.\-]{1,10}$/.test(sym); }
function fmtTime(tsISO: string) { return new Date(tsISO).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function fmtMoney(n: number | null | undefined) {
  if (typeof n !== "number" || !isFinite(n)) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}
function fmtNum(n: number | null | undefined, digits = 2) {
  if (typeof n !== "number" || !isFinite(n)) return "—"; return n.toFixed(digits);
}

function tvSymbolForInput(raw: string) {
  const sym = raw.toUpperCase().trim();
  const indexMap: Record<string, string> = { SPX: "SP:SPX", NDX: "NASDAQ:NDX", VIX: "CBOE:VIX", DJI: "DJ:DJI", RUT: "RUSSELL:RUT" };
  if (indexMap[sym]) return indexMap[sym];
  const etfMap: Record<string, string> = { SPY: "AMEX:SPY", QQQ: "NASDAQ:QQQ", IWM: "AMEX:IWM", DIA: "AMEX:DIA" };
  if (etfMap[sym]) return etfMap[sym];
  return sym;
}

function applySymbolToPlan(plan: any, symbol: string) {
  const sym = symbol.toUpperCase();
  if (!plan) return plan;
  const replaceSym = (s: any) => typeof s === "string" ? s.replaceAll("SPY", sym).replaceAll("Spy", sym).replaceAll("spy", sym) : s;
  return {
    ...plan,
    thesis: replaceSym(plan.thesis),
    playbook: Array.isArray(plan.playbook) ? plan.playbook.map((p: any) => ({ ...p, if: replaceSym(p.if), then: replaceSym(p.then), risk: replaceSym(p.risk) })) : plan.playbook,
    danger_zones: Array.isArray(plan.danger_zones) ? plan.danger_zones.map(replaceSym) : plan.danger_zones,
  };
}

function formatXPost(input: any, plan: Plan) {
  const symbol = String(input?.symbol || "SPY").toUpperCase();
  const levels = input?.key_levels || {};
  const vwap = input?.vwap;
  const high = levels.session_high ?? levels.yesterday_high ?? levels.high_lookback ?? levels.premarket_high;
  const low  = levels.session_low  ?? levels.yesterday_low  ?? levels.low_lookback  ?? levels.premarket_low;
  const high60 = levels.high_60m ?? levels.premarket_high ?? levels.yesterday_high;
  const low60  = levels.low_60m  ?? levels.premarket_low  ?? levels.yesterday_low;
  const ms = typeof input?.momentum_score === "number" ? input.momentum_score : undefined;
  const confLevel = normalizeConfidence(ms);
  const confText  = confidenceLabel(confLevel);
  const header = symbol === "SPY" ? `${symbol} 0-DTE Bias` : `${symbol} Intraday Bias`;
  return [
    `${header}: ${String(plan.bias).toUpperCase()} • Confidence: ${confText} (${confLevel}/5) • Score: ${ms ?? "N/A"}`,
    ``, `${plan.thesis}`, ``,
    `Key levels: VWAP ${vwap} | High ${high} | Low ${low} | 60m High ${high60} | 60m Low ${low60}`,
    ``, `Playbook:`,
    ...plan.playbook.map((p) => `• IF ${p.if} THEN ${p.then} (Risk: ${p.risk})`),
    ``, `Avoid:`,
    ...plan.danger_zones.map((d) => `• ${d}`),
  ].join("\n");
}

function formatXAlert(alert: BiasFlipAlert) {
  const t = new Date(alert.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const p = typeof alert.price === "number" ? alert.price.toFixed(2) : "—";
  const s = typeof alert.score === "number" ? alert.score.toFixed(1) : "—";
  return [`⚡ Bias Flip Alert: ${alert.symbol}`, `${alert.from.toUpperCase()} → ${alert.to.toUpperCase()} @ ${t}`, `Price: ${p} • Score: ${s}`, ``, `Not financial advice.`].join("\n");
}

function playBeep() {
  try {
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "sine"; o.frequency.value = 880; g.gain.value = 0.04;
    o.connect(g); g.connect(ctx.destination); o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, 140);
  } catch {}
}

function isBullishRSI(rsi: number | null | undefined, state?: string | null) {
  if (typeof rsi === "number") return rsi >= 55;
  return String(state || "").toLowerCase().includes("bull");
}
function isBearishRSI(rsi: number | null | undefined, state?: string | null) {
  if (typeof rsi === "number") return rsi <= 45;
  return String(state || "").toLowerCase().includes("bear");
}

function checklistFromSnapshot(snap: any) {
  const aboveVWAP = snap?.vwap_state === "above";
  const bull5     = snap?.ema_trend_5m === "bull";
  const bull15    = snap?.ema_trend_15m === "bull";
  const rsiBull   = isBullishRSI(snap?.rsi_1m, snap?.rsi_state);
  const volBull   = String(snap?.volume_state || "").toLowerCase().includes("above");
  const count     = [aboveVWAP, bull5, bull15, rsiBull, volBull].filter(Boolean).length;
  const read = count >= 4
    ? "Strong momentum alignment. Favor continuation setups; avoid fading unless key level breaks."
    : count === 3 ? "Moderate alignment. Take A+ setups only; expect chop near VWAP/levels."
    : count === 2 ? "Weak alignment. Reduce size; wait for confirmation or cleaner structure."
    : "Low alignment. Market likely choppy/mean-reverting. Be defensive.";
  return {
    count,
    items: [
      { label: "Above VWAP", ok: aboveVWAP, detail: aboveVWAP ? "Price > VWAP" : "Price < VWAP" },
      { label: "5m Trend",   ok: bull5,     detail: bull5     ? "EMA9 > EMA21" : "EMA9 < EMA21" },
      { label: "15m Trend",  ok: bull15,    detail: bull15    ? "EMA9 > EMA21" : "EMA9 < EMA21" },
      { label: "RSI Support",ok: rsiBull,   detail: rsiBull   ? "RSI supportive" : "RSI weak/neutral" },
      { label: "Volume",     ok: volBull,   detail: volBull   ? "Above avg" : "Below avg" },
    ],
    read,
  };
}

type TemplateMode = "trend" | "vwap_reclaim" | "mean_reversion";

function round2(n: any) { const x = Number(n); if (!isFinite(x)) return null; return Number(x.toFixed(2)); }

function getLevelsFromSnap(snap: any) {
  const levels = snap?.key_levels || {};
  return {
    vwap:   round2(snap?.vwap),
    high:   round2(levels.session_high ?? levels.yesterday_high ?? levels.high_lookback ?? levels.premarket_high),
    low:    round2(levels.session_low  ?? levels.yesterday_low  ?? levels.low_lookback  ?? levels.premarket_low),
    high60: round2(levels.high_60m ?? levels.premarket_high ?? levels.yesterday_high),
    low60:  round2(levels.low_60m  ?? levels.premarket_low  ?? levels.yesterday_low),
    atr:    round2(snap?.atr_14 ?? snap?.expected_move_today),
  };
}

function toBiasFromSignals(snap: any): "bullish" | "bearish" | "neutral" {
  const score = typeof snap?.momentum_score === "number" ? snap.momentum_score : computeMomentumScore(snap);
  return biasGuessFromScore(score);
}

function buildTemplatePlan(snap: any, mode: TemplateMode): Plan {
  const symbol = String(snap?.symbol || "SPY").toUpperCase();
  const price  = round2(snap?.price);
  const { vwap, high, low, high60, low60, atr } = getLevelsFromSnap(snap);
  const bias   = toBiasFromSignals(snap);
  const atrHalf = atr ? round2(atr * 0.5) : null;
  const thesis  = [
    `${symbol} snapshot: price ${price ?? "—"} vs VWAP ${vwap ?? "—"}; 5m/15m trend ${snap?.ema_trend_5m ?? "—"}/${snap?.ema_trend_15m ?? "—"}; volume ${snap?.volume_state ?? "—"}.`,
    bias === "bullish" ? "Bias leans bullish while above VWAP and trends hold."
    : bias === "bearish" ? "Bias leans bearish while below VWAP and trends hold."
    : "Bias is neutral—expect chop near VWAP/levels.",
  ].join(" ");
  const danger = [
    vwap ? `${round2(vwap - 0.2)} - ${round2(vwap + 0.2)} (VWAP chop zone)` : "VWAP area (chop zone)",
    high && low ? `${high} / ${low} (session extremes—expect reactions)` : "Session extremes (expect reactions)",
  ];
  if (mode === "trend") {
    const t1 = high ?? (price && atrHalf ? round2(price + atrHalf) : null);
    const t2 = high && atr ? round2(high + atr * 0.25) : (price && atr ? round2(price + atr) : null);
    return { bias, thesis: `${thesis} Template: Trend Continuation.`, playbook: [
      { if: `${symbol} holds ${vwap ?? "VWAP"} and continues making higher highs/lows with rising volume`, then: `Trade with trend. Target ${t1 ?? "next resistance"} then ${t2 ?? "trail into extension"}`, risk: `Exit on clean break back below ${vwap ?? "VWAP"} OR 5m trend flip` },
      { if: `${symbol} breaks and holds above session high ${high ?? "—"} with confirming volume`, then: `Momentum add. Target ${t2 ?? "next resistance"}; partials along the way`, risk: `If it reclaims back under ${high ?? "session high"} quickly, cut the add` },
    ], danger_zones: danger, confidence: 3 };
  }
  if (mode === "vwap_reclaim") {
    const rt = high60 ?? high ?? (price && atrHalf ? round2(price + atrHalf) : null);
    const sl = vwap ? round2(vwap - 0.25) : null;
    return { bias, thesis: `${thesis} Template: VWAP Reclaim / Hold.`, playbook: [
      { if: `${symbol} dips to VWAP ${vwap ?? "—"} then reclaims with bullish candle + volume`, then: `Enter on reclaim. Target ${rt ?? "recent high"} (scale out into strength)`, risk: `Stop on 1m/5m close below ${sl ?? "VWAP reclaim failure"}` },
      { if: `${symbol} consolidates above VWAP and RSI improves back to neutral/bull`, then: `Continuation entry. Target session high ${high ?? "—"} then extension`, risk: `Exit if VWAP breaks and 5m/15m trends turn bearish` },
    ], danger_zones: danger, confidence: 3 };
  }
  const bt = vwap ?? (price && atrHalf ? round2(price + atrHalf) : null);
  const ft = vwap ?? (price && atrHalf ? round2(price - atrHalf) : null);
  return { bias, thesis: `${thesis} Template: Mean Reversion (fade extremes; smaller size).`, playbook: [
    { if: `${symbol} tags session low ${low ?? "—"} or 60m low ${low60 ?? "—"} and shows reversal candle`, then: `Spec long for mean reversion back toward ${bt ?? "VWAP"}`, risk: `Tight stop just below the low` },
    { if: `${symbol} tags session high ${high ?? "—"} or 60m high ${high60 ?? "—"} and momentum stalls`, then: `Spec short for mean reversion back toward ${ft ?? "VWAP"}`, risk: `Tight stop just above the high` },
  ], danger_zones: danger, confidence: 2 };
}

function biasBadgeClass(b: string) {
  const s = b.toLowerCase();
  if (s === "bullish") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  if (s === "bearish") return "bg-rose-500/15 text-rose-300 border-rose-500/30";
  return "bg-slate-500/15 text-slate-200 border-slate-500/30";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TradingViewChart({ symbol }: { symbol: string }) {
  const tvSymbol = tvSymbolForInput(symbol);
  const src = `https://s.tradingview.com/widgetembed/?` +
    `symbol=${encodeURIComponent(tvSymbol)}&interval=5&hidesidetoolbar=1&symboledit=1` +
    `&saveimage=0&toolbarbg=0F172A&studies=%5B%5D&theme=dark&style=1` +
    `&timezone=America%2FNew_York&withdateranges=1&hidevolume=0`;
  return (
    <div className="h-[480px] w-full overflow-hidden rounded-2xl border border-white/10 bg-black/20">
      <iframe title="chart" src={src} className="h-full w-full border-0" allowFullScreen />
    </div>
  );
}

function Sparkline({ values, color = "#34d399" }: { values: number[]; color?: string }) {
  if (!values || values.length < 2) return null;
  const w = 64; const h = 24;
  const min = Math.min(...values); const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} className="opacity-80">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PriceHero({ price, vwap, bias, symbol, score }: {
  price: number | null; vwap: number | null;
  bias: "bullish" | "bearish" | "neutral"; symbol: string; score: number | null;
}) {
  const pxVsVwap = price && vwap ? price - vwap : null;
  const isAbove   = pxVsVwap != null && pxVsVwap > 0;
  const priceColor = bias === "bullish" ? "text-emerald-300" : bias === "bearish" ? "text-rose-300" : "text-slate-100";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-black p-5">
      <div className={`absolute -top-8 -left-8 h-32 w-32 rounded-full blur-3xl opacity-20 ${
        bias === "bullish" ? "bg-emerald-500" : bias === "bearish" ? "bg-rose-500" : "bg-slate-500"
      }`} />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="text-xs text-slate-500 font-medium tracking-widest uppercase mb-1">{symbol} · Last Price</div>
          <div className={`text-5xl font-black tracking-tight tabular-nums ${priceColor}`}>
            {price != null ? price.toFixed(2) : "—"}
          </div>
          {pxVsVwap != null && (
            <div className={`text-sm font-semibold mt-1.5 ${isAbove ? "text-emerald-400" : "text-rose-400"}`}>
              {isAbove ? "▲" : "▼"} {Math.abs(pxVsVwap).toFixed(2)} vs VWAP
            </div>
          )}
        </div>
        <div className="text-right space-y-2">
          <Badge variant="outline" className={`border text-xs font-bold px-2.5 py-1 ${biasBadgeClass(bias)}`}>
            {bias.toUpperCase()}
          </Badge>
          {score != null && (
            <div>
              <div className="text-[10px] text-slate-600 text-right">SCORE</div>
              <div className={`text-2xl font-black tabular-nums ${
                score >= 6.5 ? "text-emerald-400" : score <= 3.5 ? "text-rose-400" : "text-amber-400"
              }`}>{score.toFixed(1)}</div>
            </div>
          )}
        </div>
      </div>
      {score != null && (
        <div className="mt-4">
          <div className="flex justify-between text-[10px] text-slate-600 mb-1">
            <span>BEAR</span><span>NEUTRAL</span><span>BULL</span>
          </div>
          <div className="relative h-1.5 w-full rounded-full bg-white/5">
            <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-500 opacity-30 w-full" />
            <div
              className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-slate-950 shadow-lg transition-all duration-500"
              style={{
                left: `calc(${(score / 10) * 100}% - 6px)`,
                background: score >= 6.5 ? "#34d399" : score <= 3.5 ? "#f87171" : "#fbbf24",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SignalRow({ label, value, ok, detail, extra }: {
  label: string; value: string; ok?: boolean; detail?: string; extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-2.5">
        {ok !== undefined && (
          <div className={`h-2 w-2 rounded-full flex-shrink-0 ${ok ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-rose-400 shadow-[0_0_6px_#f87171]"}`} />
        )}
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {extra}
        {detail && <span className="text-[10px] text-slate-600">{detail}</span>}
        <span className={`text-sm font-semibold tabular-nums ${
          ok === true ? "text-emerald-300" : ok === false ? "text-rose-300" : "text-slate-200"
        }`}>{value}</span>
      </div>
    </div>
  );
}

function SignalGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-1">
      <div className="text-[10px] font-bold tracking-widest text-slate-600 uppercase pt-3 pb-1">{title}</div>
      {children}
    </div>
  );
}

function SnapshotPanel({ inputObj, history }: { inputObj: any; history: SnapshotHistoryItem[] }) {
  const price  = inputObj?.price;
  const vwap   = inputObj?.vwap;
  const score  = typeof inputObj?.momentum_score === "number" ? inputObj.momentum_score : null;
  const bias   = biasGuessFromScore(score);
  const symbol = String(inputObj?.symbol || "SPY").toUpperCase();

  const sparkPrices = useMemo(() => {
    return history
      .filter((h) => h.symbol === symbol && h.price != null)
      .slice(0, 10)
      .map((h) => h.price!)
      .reverse();
  }, [history, symbol]);

  const rsi    = inputObj?.rsi_1m;
  const rsiOk  = isBullishRSI(rsi, inputObj?.rsi_state);
  const rsiBad = isBearishRSI(rsi, inputObj?.rsi_state);
  const volAbove = String(inputObj?.volume_state || "").toLowerCase().includes("above");
  const levels = inputObj?.key_levels || {};

  return (
    <div className="space-y-3">
      <PriceHero price={price} vwap={vwap} bias={bias} symbol={symbol} score={score} />
      <SignalGroup title="Price Action">
        <SignalRow
          label="Last Price" value={price != null ? `$${price.toFixed(2)}` : "—"}
          extra={sparkPrices.length >= 2 ? <Sparkline values={sparkPrices} color={bias === "bearish" ? "#f87171" : "#34d399"} /> : undefined}
        />
        <SignalRow label="VWAP"      value={vwap != null ? `$${vwap.toFixed(2)}` : "—"} />
        <SignalRow
          label="VWAP State"
          value={inputObj?.vwap_state ?? "—"}
          ok={inputObj?.vwap_state === "above"}
          detail={inputObj?.vwap_state === "above" ? "Bullish" : "Bearish"}
        />
      </SignalGroup>
      <SignalGroup title="Trend">
        <SignalRow label="EMA 5m"  value={inputObj?.ema_trend_5m  ?? "—"} ok={inputObj?.ema_trend_5m  === "bull"} detail="EMA9 vs EMA21" />
        <SignalRow label="EMA 15m" value={inputObj?.ema_trend_15m ?? "—"} ok={inputObj?.ema_trend_15m === "bull"} detail="EMA9 vs EMA21" />
      </SignalGroup>
      <SignalGroup title="Momentum">
        <SignalRow
          label="RSI (1m)"
          value={rsi != null ? rsi.toFixed(1) : "—"}
          ok={rsiOk ? true : rsiBad ? false : undefined}
          detail={inputObj?.rsi_state ?? ""}
        />
        <SignalRow
          label="Volume"
          value={inputObj?.volume_state ?? "—"}
          ok={volAbove}
          detail={volAbove ? "Institutional" : "Retail thin"}
        />
        <SignalRow label="ATR (14)" value={inputObj?.atr_14 != null ? inputObj.atr_14.toFixed(2) : "—"} />
      </SignalGroup>
      <SignalGroup title="Key Levels">
        <SignalRow label="Session High" value={levels.session_high  != null ? `$${levels.session_high.toFixed(2)}`  : "—"} />
        <SignalRow label="Session Low"  value={levels.session_low   != null ? `$${levels.session_low.toFixed(2)}`   : "—"} />
        <SignalRow label="60m High"     value={levels.high_60m      != null ? `$${levels.high_60m.toFixed(2)}`      : "—"} />
        <SignalRow label="60m Low"      value={levels.low_60m       != null ? `$${levels.low_60m.toFixed(2)}`       : "—"} />
      </SignalGroup>
      <SignalGroup title="Market">
        <SignalRow label="Session"    value={inputObj?.market_open ? "Open" : "Closed"} ok={!!inputObj?.market_open} />
        <SignalRow label="Data"       value={inputObj?.using_last_session_data ? "Last Session" : "Live"} />
        <SignalRow label="Confidence" value={`${confidenceLabel(normalizeConfidence(score ?? undefined))} (${normalizeConfidence(score ?? undefined)}/5)`} />
      </SignalGroup>
    </div>
  );
}

// ─── Scanner Panel ────────────────────────────────────────────────────────────

interface ScanResult {
  symbol: string; score: number;
  bias: "bullish" | "bearish" | "neutral";
  vwap_state: string | null; ema_trend_5m: string | null;
  ema_trend_15m: string | null; price: number | null;
  vwap: number | null; atr: number | null; inPlay: boolean; error?: string;
}

function ScannerPanel({ watchlist, onSelect }: { watchlist: string[]; onSelect: (t: string) => void }) {
  const [results,  setResults]  = useState<ScanResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);

  async function runScan() {
    if (scanning || !watchlist.length) return;
    setScanning(true); setResults([]);
    const settled: ScanResult[] = [];
    for (const sym of watchlist) {
      try {
        const res  = await fetch(`/api/snapshot?symbol=${encodeURIComponent(sym)}`);
        const snap = await res.json();
        if (!res.ok) throw new Error(snap?.error || "Snapshot failed");
        const score = computeMomentumScore(snap);
        const atr   = typeof snap?.atr_14 === "number" ? snap.atr_14 : typeof snap?.expected_move_today === "number" ? snap.expected_move_today : null;
        const price = typeof snap?.price === "number" ? snap.price : null;
        const atrPct  = atr && price ? atr / price : 0;
        const volHigh = String(snap?.volume_state || "").toLowerCase().includes("above");
        settled.push({
          symbol: sym, score, bias: biasGuessFromScore(score),
          vwap_state: snap?.vwap_state ?? null, ema_trend_5m: snap?.ema_trend_5m ?? null,
          ema_trend_15m: snap?.ema_trend_15m ?? null, price, vwap: typeof snap?.vwap === "number" ? snap.vwap : null,
          atr, inPlay: atrPct >= 0.015 && volHigh,
        });
      } catch (e: any) {
        settled.push({ symbol: sym, score: 5, bias: "neutral", vwap_state: null, ema_trend_5m: null, ema_trend_15m: null, price: null, vwap: null, atr: null, inPlay: false, error: e?.message });
      }
      await new Promise(r => setTimeout(r, 300));
    }
    settled.sort((a, b) => {
      const aS = a.bias === "bullish" ? a.score : a.bias === "bearish" ? (10 - a.score) : 5;
      const bS = b.bias === "bullish" ? b.score : b.bias === "bearish" ? (10 - b.score) : 5;
      return bS - aS;
    });
    setResults(settled); setLastScan(new Date().toLocaleTimeString()); setScanning(false);
    toast.success(`Scan complete — ${settled.length} tickers`);
  }

  function trendIcon(trend: string | null) {
    if (trend === "bull") return <span className="text-emerald-400 text-xs font-bold">▲</span>;
    if (trend === "bear") return <span className="text-rose-400 text-xs font-bold">▼</span>;
    return <span className="text-slate-600 text-xs">—</span>;
  }

  function scoreBar(score: number) {
    const pct   = (score / 10) * 100;
    const color = score >= 6.5 ? "bg-emerald-500" : score <= 3.5 ? "bg-rose-500" : "bg-amber-500";
    return (
      <div className="h-1 w-16 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-300 font-semibold">Watchlist Scanner</div>
          <div className="text-[10px] text-slate-600 mt-0.5">
            {lastScan ? `Last scan: ${lastScan}` : `${watchlist.length} tickers queued`}
          </div>
        </div>
        <Button onClick={runScan} disabled={scanning || !watchlist.length}
          className="bg-cyan-500/20 border border-cyan-400/30 text-cyan-100 hover:bg-cyan-500/30 text-xs h-8">
          {scanning ? <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />Scanning…</span> : "⚡ Scan Now"}
        </Button>
      </div>
      {scanning && (
        <div className="space-y-1.5">
          {watchlist.map((sym) => {
            const done = results.find(r => r.symbol === sym);
            return (
              <div key={sym} className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 transition-all ${done ? "border-emerald-500/20 bg-emerald-500/5" : "border-white/5 bg-black/10"}`}>
                <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${done ? "bg-emerald-400" : "bg-slate-700 animate-pulse"}`} />
                <span className="text-xs font-mono text-slate-400">{sym}</span>
                {done && <span className="ml-auto text-[10px] text-emerald-400 font-bold">{done.score.toFixed(1)}</span>}
              </div>
            );
          })}
        </div>
      )}
      {!scanning && results.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-[10px] text-slate-600 pb-1">
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Bullish</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-rose-400" />Bearish</span>
            <span className="flex items-center gap-1"><span className="text-amber-400">⚡</span>In Play</span>
          </div>
          {results.map((r) => (
            <button key={r.symbol} onClick={() => { if (!r.error) onSelect(r.symbol); }} disabled={!!r.error}
              className={`w-full rounded-xl border px-3 py-2.5 text-left transition-all ${
                r.error ? "border-white/5 bg-black/10 opacity-40 cursor-not-allowed"
                : r.bias === "bullish" ? "border-emerald-500/25 bg-emerald-500/5 hover:bg-emerald-500/10"
                : r.bias === "bearish" ? "border-rose-500/25 bg-rose-500/5 hover:bg-rose-500/10"
                : "border-white/10 bg-black/20 hover:bg-black/30"
              }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-black font-mono text-slate-100">{r.symbol}</span>
                  {r.inPlay && <span className="text-amber-400 text-xs" title="In play">⚡</span>}
                  {r.error && <span className="text-[10px] text-slate-600">error</span>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-right">
                    <div className={`text-sm font-black tabular-nums ${r.bias === "bullish" ? "text-emerald-300" : r.bias === "bearish" ? "text-rose-300" : "text-amber-300"}`}>{r.score.toFixed(1)}</div>
                    {scoreBar(r.score)}
                  </div>
                </div>
              </div>
              {!r.error && (
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-500">
                  <span>VWAP <span className={r.vwap_state === "above" ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>{r.vwap_state ?? "—"}</span></span>
                  <span className="flex items-center gap-0.5">5m {trendIcon(r.ema_trend_5m)}</span>
                  <span className="flex items-center gap-0.5">15m {trendIcon(r.ema_trend_15m)}</span>
                  {r.price != null && <span className="ml-auto text-slate-600 font-mono">${r.price.toFixed(2)}</span>}
                </div>
              )}
            </button>
          ))}
          <div className="text-[10px] text-slate-700 text-center pt-1">Click any ticker to load it into the main view</div>
        </div>
      )}
      {!scanning && results.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-center space-y-2">
          <div className="text-2xl">⚡</div>
          <div className="text-sm text-slate-400">Click Scan Now to rank your watchlist.</div>
          <div className="text-xs text-slate-600">Uses your upgraded scoring engine across all {watchlist.length} tickers.</div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Page() {
  const [symbol,        setSymbol]        = useState("SPY");
  const [inputJsonText, setInputJsonText] = useState(JSON.stringify(defaultInput, null, 2));
  const [plan,          setPlan]          = useState<Plan | null>(null);
  const [error,         setError]         = useState("");

  const [marketOpen,       setMarketOpen]       = useState(false);
  const [usingLastSession, setUsingLastSession] = useState(false);
  const [lastUpdated,      setLastUpdated]      = useState<string | null>(null);

  const [autoRefresh,    setAutoRefresh]    = useState(false);
  const [refreshSeconds, setRefreshSeconds] = useState(60);
  const inFlightRef   = useRef(false);
  const [aiCooldownUntil, setAiCooldownUntil] = useState<number>(0);
  const aiInFlightRef = useRef(false);

  const [watchlist,          setWatchlist]          = useState<string[]>(["SPY", "QQQ", "AAPL", "TSLA", "NVDA"]);
  const [newTicker,          setNewTicker]          = useState("");
  const [autoAiOnWatchClick, setAutoAiOnWatchClick] = useState(false);
  const [templateMode,       setTemplateMode]       = useState<TemplateMode>("trend");

  const [history,       setHistory]       = useState<SnapshotHistoryItem[]>([]);
  const [biasFlip,      setBiasFlip]      = useState<BiasFlipAlert | null>(null);
  const [biasFlipSound, setBiasFlipSound] = useState(true);
  const lastFlipKeyRef = useRef<string>("");

  const [showAdvanced, setShowAdvanced] = useState(false);

  const [acctSize,  setAcctSize]  = useState<number>(5000);
  const [riskPct,   setRiskPct]   = useState<number>(1);
  const [entry,     setEntry]     = useState<number>(0);
  const [stop,      setStop]      = useState<number>(0);
  const [direction, setDirection] = useState<"long" | "short">("long");

  const [alertEnabled,   setAlertEnabled]   = useState(true);
  const [alertThreshold, setAlertThreshold] = useState(7.5);
  const [lastAlertScore, setLastAlertScore] = useState<number | null>(null);
  const [activeSignal,   setActiveSignal]   = useState<{score:number; bias:string; ts:string} | null>(null);
  const alertFiredRef = useRef<string>("");

  const [overlayTickers, setOverlayTickers] = useState<string[]>(["SPY", "QQQ", "VIX"]);
  const [overlayData,    setOverlayData]    = useState<Record<string, {score:number; bias:string; vwap_state:string|null; price:number|null; ema5:string|null; ema15:string|null}>>({});
  const [overlayLoading, setOverlayLoading] = useState(false);
  const overlayInFlight  = useRef(false);

  const [strikePick, setStrikePick] = useState<{type:"call"|"put"; strike:number; expiry:string; rationale:string} | null>(null);

  const HISTORY_KEY            = "rw_history_v1";
  const HISTORY_MAX            = 120;
  const HISTORY_PER_SYMBOL_MAX = 25;

  useEffect(() => {
    try { const wl = localStorage.getItem("rw_watchlist_v1"); if (wl) { const p = JSON.parse(wl); if (Array.isArray(p)) { const c = p.map((x) => safeTicker(String(x))).filter(isValidTicker); if (c.length) setWatchlist(Array.from(new Set(c))); } } } catch {}
    try { const raw = localStorage.getItem(HISTORY_KEY); if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) setHistory(p); } } catch {}
    try { const raw = localStorage.getItem("rw_risk_v1"); if (raw) { const p = JSON.parse(raw); if (typeof p?.acctSize === "number") setAcctSize(p.acctSize); if (typeof p?.riskPct === "number") setRiskPct(p.riskPct); if (typeof p?.entry === "number") setEntry(p.entry); if (typeof p?.stop === "number") setStop(p.stop); if (p?.direction === "long" || p?.direction === "short") setDirection(p.direction); } } catch {}
  }, []);

  useEffect(() => { try { localStorage.setItem("rw_watchlist_v1", JSON.stringify(watchlist)); } catch {} }, [watchlist]);
  useEffect(() => { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch {} }, [history]);
  useEffect(() => { try { localStorage.setItem("rw_risk_v1", JSON.stringify({ acctSize, riskPct, entry, stop, direction })); } catch {} }, [acctSize, riskPct, entry, stop, direction]);

  const inputObj      = useMemo(() => { try { return JSON.parse(inputJsonText); } catch { return null; } }, [inputJsonText]);
  const momentumScore = typeof inputObj?.momentum_score === "number" ? inputObj.momentum_score : undefined;
  const confLevel     = normalizeConfidence(momentumScore);
  const biasGuess     = biasGuessFromScore(typeof momentumScore === "number" ? momentumScore : null);
  const symbolHistory = useMemo(() => history.filter((h) => h.symbol === safeTicker(symbol)).slice(0, HISTORY_PER_SYMBOL_MAX), [history, symbol]);
  const xPost         = useMemo(() => { if (!inputObj || !plan) return ""; return formatXPost(inputObj, plan); }, [inputObj, plan]);

  function maybeTriggerBiasFlip(prevBias: SnapshotHistoryItem["bias_guess"] | null, nextItem: SnapshotHistoryItem) {
    if (!prevBias || prevBias === nextItem.bias_guess) return;
    const flip: BiasFlipAlert = { id: `${Date.now()}_${Math.random().toString(16).slice(2)}`, symbol: nextItem.symbol, from: prevBias, to: nextItem.bias_guess, ts: nextItem.ts, price: nextItem.price ?? null, score: nextItem.momentum_score ?? null };
    const minuteKey = new Date(flip.ts).toISOString().slice(0, 16);
    const flipKey   = `${flip.symbol}_${flip.from}_${flip.to}_${minuteKey}`;
    if (lastFlipKeyRef.current === flipKey) return;
    lastFlipKeyRef.current = flipKey;
    setBiasFlip(flip);
    if (biasFlipSound) playBeep();
    toast(`Bias flip: ${flip.symbol} ${flip.from.toUpperCase()} → ${flip.to.toUpperCase()}`);
  }

  function addSnapshotToHistory(snap: any) {
    try {
      const sym   = safeTicker(String(snap?.symbol || symbol));
      const score = typeof snap?.momentum_score === "number" ? snap.momentum_score : null;
      const prev  = history.find((h) => h.symbol === sym);
      const item: SnapshotHistoryItem = {
        id: `${Date.now()}_${Math.random().toString(16).slice(2)}`, ts: new Date().toISOString(),
        symbol: sym, price: typeof snap?.price === "number" ? snap.price : null,
        vwap: typeof snap?.vwap === "number" ? snap.vwap : null,
        vwap_state: snap?.vwap_state ?? null, ema_trend_5m: snap?.ema_trend_5m ?? null,
        ema_trend_15m: snap?.ema_trend_15m ?? null, rsi_1m: typeof snap?.rsi_1m === "number" ? snap.rsi_1m : null,
        volume_state: snap?.volume_state ?? null, momentum_score: score, bias_guess: biasGuessFromScore(score), snapshot: snap,
      };
      maybeTriggerBiasFlip(prev?.bias_guess ?? null, item);
      setHistory((prevArr) => {
        const next = [item, ...prevArr];
        const counts: Record<string, number> = {};
        const filtered: SnapshotHistoryItem[] = [];
        for (const h of next) { counts[h.symbol] = (counts[h.symbol] ?? 0) + 1; if (counts[h.symbol] <= HISTORY_PER_SYMBOL_MAX) filtered.push(h); }
        return filtered.slice(0, HISTORY_MAX);
      });
    } catch {}
  }

  async function refreshSnapshotOnly(forSymbol?: string) {
    if (inFlightRef.current) return;
    inFlightRef.current = true; setError("");
    try {
      const sym = safeTicker(forSymbol || symbol);
      if (!isValidTicker(sym)) { toast.error("Invalid ticker"); return; }
      const snapRes = await fetch(`/api/snapshot?symbol=${encodeURIComponent(sym)}`);
      const snap    = await snapRes.json();
      if (!snapRes.ok) throw new Error(snap?.error || "Snapshot failed");
      const s = String(snap?.symbol || sym).toUpperCase();
      setSymbol(s); setUsingLastSession(!!snap.using_last_session_data); setMarketOpen(!!snap.market_open);
      setInputJsonText(JSON.stringify(snap, null, 2)); setLastUpdated(new Date().toLocaleTimeString());
      addSnapshotToHistory(snap);
      if (!entry && typeof snap?.price === "number") setEntry(snap.price);
      toast(`${s} snapshot updated`);
    } catch (e: any) { setError(e?.message || "Unknown error"); toast.error(e?.message || "Snapshot error"); }
    finally { inFlightRef.current = false; }
  }

  async function runAIWithSnapshot() {
    if (aiInFlightRef.current) return;
    if (Date.now() < aiCooldownUntil) { toast("AI cooling down…"); return; }
    await refreshSnapshotOnly();
    let snap: any = null;
    try { snap = JSON.parse(inputJsonText); } catch {}
    if (!snap) { setError("Snapshot JSON invalid."); toast.error("Snapshot JSON invalid"); return; }
    aiInFlightRef.current = true; setError(""); setPlan(null);
    try {
      const planRes  = await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputJson: snap }) });
      const planData = await planRes.json();
      if (!planRes.ok) throw new Error(planData?.error || "Plan failed");
      setPlan(applySymbolToPlan(planData, String(snap?.symbol || symbol).toUpperCase()) as Plan);
      toast.success("AI plan generated");
    } catch (e: any) {
      const msg     = e?.message || "AI error";
      const isQuota = String(msg).includes("429") || String(msg).toLowerCase().includes("quota") || String(msg).toLowerCase().includes("rate");
      if (isQuota) { setAiCooldownUntil(Date.now() + 35_000); toast("AI quota hit — using template plan."); }
      else toast("AI failed — using template plan.");
      try {
        let s: any = null; try { s = JSON.parse(inputJsonText); } catch {}
        if (!s) throw new Error("Snapshot JSON invalid");
        const tpl = buildTemplatePlan(s, templateMode);
        setPlan(applySymbolToPlan(tpl, String(s?.symbol || symbol)) as Plan);
        setError(isQuota ? "AI quota hit. Using template plan." : `AI error: ${msg}. Using template plan.`);
      } catch (tplErr: any) { setError(`AI error: ${msg} (template fallback failed: ${tplErr?.message || "unknown"})`); toast.error("Fallback plan failed."); }
    } finally { aiInFlightRef.current = false; }
  }

  async function copyToClipboard(text: string) { try { await navigator.clipboard.writeText(text); toast.success("Copied"); } catch { toast.error("Copy failed"); } }

  useEffect(() => {
    if (!autoRefresh) return;
    const secs = Math.max(10, Math.min(600, Number(refreshSeconds) || 60));
    const id   = window.setInterval(() => refreshSnapshotOnly(), secs * 1000);
    return () => window.clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, refreshSeconds, symbol]);

  useEffect(() => {
    if (!alertEnabled || !inputObj) return;
    const score = computeMomentumScore(inputObj);
    const bias  = biasGuessFromScore(score);
    if (bias === "neutral") return;
    const alertKey = `${symbol}_${score.toFixed(1)}_${bias}`;
    if (alertFiredRef.current === alertKey) return;
    if (score >= alertThreshold && bias === "bullish") {
      alertFiredRef.current = alertKey;
      setActiveSignal({ score, bias, ts: new Date().toLocaleTimeString() });
      toast.success(`🎯 Entry Signal: ${symbol} BULLISH — Score ${score.toFixed(1)}`, { duration: 6000 });
      setLastAlertScore(score);
    } else if (score <= (10 - alertThreshold) && bias === "bearish") {
      alertFiredRef.current = alertKey;
      setActiveSignal({ score, bias, ts: new Date().toLocaleTimeString() });
      toast.error(`🎯 Entry Signal: ${symbol} BEARISH — Score ${score.toFixed(1)}`, { duration: 6000 });
      setLastAlertScore(score);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputObj, alertEnabled, alertThreshold, symbol]);

  async function fetchOverlay() {
    if (overlayInFlight.current) return;
    overlayInFlight.current = true; setOverlayLoading(true);
    const results: typeof overlayData = {};
    for (const sym of overlayTickers) {
      try {
        const res  = await fetch(`/api/snapshot?symbol=${encodeURIComponent(sym)}`);
        const snap = await res.json();
        if (!res.ok) continue;
        const score = computeMomentumScore(snap);
        results[sym] = { score, bias: biasGuessFromScore(score), vwap_state: snap?.vwap_state ?? null, price: typeof snap?.price === "number" ? snap.price : null, ema5: snap?.ema_trend_5m ?? null, ema15: snap?.ema_trend_15m ?? null };
      } catch {}
      await new Promise(r => setTimeout(r, 250));
    }
    setOverlayData(results); setOverlayLoading(false); overlayInFlight.current = false;
  }

  function computeStrikePick() {
    if (!inputObj) return;
    const price  = typeof inputObj.price  === "number" ? inputObj.price  : null;
    const vwap   = typeof inputObj.vwap   === "number" ? inputObj.vwap   : null;
    const atr    = typeof inputObj.atr_14 === "number" ? inputObj.atr_14 : typeof inputObj.expected_move_today === "number" ? inputObj.expected_move_today : null;
    const bias   = biasGuessFromScore(computeMomentumScore(inputObj));
    const levels = inputObj?.key_levels || {};
    if (!price || !atr || bias === "neutral") { toast("Need a clear bias + price data to pick a strike."); return; }
    const now    = new Date();
    const isOpen = !!inputObj?.market_open;
    const expiry = isOpen ? now.toISOString().split("T")[0] : (() => { const d = new Date(now); d.setDate(d.getDate() + 1); return d.toISOString().split("T")[0]; })();
    if (bias === "bullish") {
      const sessionHigh   = levels.session_high ?? (price + atr);
      const otmStrike     = Math.ceil(price / 1) * 1 + 1;
      const potentialMove = sessionHigh - price;
      setStrikePick({ type: "call", strike: otmStrike, expiry, rationale: `Bullish bias score ${computeMomentumScore(inputObj).toFixed(1)}. Price $${price.toFixed(2)} targeting session high ~$${sessionHigh.toFixed(2)} (+$${potentialMove.toFixed(2)}). 1 strike OTM call gives leverage with defined risk. Stop if price breaks back below VWAP $${vwap?.toFixed(2) ?? "—"}.` });
    } else {
      const sessionLow    = levels.session_low  ?? (price - atr);
      const otmStrike     = Math.floor(price / 1) * 1 - 1;
      const potentialMove = price - sessionLow;
      setStrikePick({ type: "put", strike: otmStrike, expiry, rationale: `Bearish bias score ${computeMomentumScore(inputObj).toFixed(1)}. Price $${price.toFixed(2)} targeting session low ~$${sessionLow.toFixed(2)} (-$${potentialMove.toFixed(2)}). 1 strike OTM put gives leverage with defined risk. Stop if price reclaims VWAP $${vwap?.toFixed(2) ?? "—"}.` });
    }
    toast.success("Strike picked!");
  }

  function addToWatchlist() {
    const t = safeTicker(newTicker); if (!t) return;
    if (!isValidTicker(t)) return toast.error("Invalid ticker");
    setWatchlist((prev) => Array.from(new Set([t, ...prev]))); setNewTicker(""); toast.success(`${t} added`);
  }

  async function selectFromWatchlist(ticker: string) {
    const t = safeTicker(ticker); setSymbol(t); setPlan(null);
    await refreshSnapshotOnly(t); if (autoAiOnWatchClick) await runAIWithSnapshot();
  }

  function clearHistoryForSymbol(sym: string) { const s = safeTicker(sym); setHistory((prev) => prev.filter((h) => h.symbol !== s)); toast(`Cleared history: ${s}`); }

  function loadHistoryItem(item: SnapshotHistoryItem) {
    setPlan(null); setSymbol(item.symbol); setInputJsonText(JSON.stringify(item.snapshot, null, 2));
    setLastUpdated(fmtTime(item.ts)); if (typeof item.price === "number") setEntry(item.price);
    toast(`Loaded ${item.symbol} @ ${fmtTime(item.ts)}`);
  }

  const riskDollars   = useMemo(() => acctSize && riskPct ? acctSize * (riskPct / 100) : null, [acctSize, riskPct]);
  const stopDistance  = useMemo(() => { if (!entry || !stop) return null; const d = Math.abs(entry - stop); return d > 0 ? d : null; }, [entry, stop]);
  const shares        = useMemo(() => { if (!riskDollars || !stopDistance) return null; const r = riskDollars / stopDistance; return r > 0 ? Math.floor(r) : null; }, [riskDollars, stopDistance]);
  const positionValue = useMemo(() => shares && entry ? shares * entry : null, [shares, entry]);
  const rTargets      = useMemo(() => { if (!stopDistance || !entry) return null; const d = stopDistance; const mk = (r: number) => direction === "long" ? entry + d * r : entry - d * r; return { r1: mk(1), r2: mk(2), r3: mk(3) }; }, [stopDistance, entry, direction]);

  return (
    <div className="min-h-screen" style={{background:"var(--bg-1)",color:"var(--t-1)"}}>

      {/* ── Dashboard action bar (sits below GlobalNav from layout.tsx) ── */}
      <div style={{
        background: "var(--bg-0)", borderBottom: "1px solid var(--border-0)",
        padding: "0 16px", height: 40,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 8,
      }}>
        {/* Status pills */}
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <span className={`pill ${marketOpen ? "open" : "closed"}`}>
            <span className={`pill-dot ${marketOpen ? "green pulse-dot" : "muted"}`}/>
            {marketOpen ? "OPEN" : "CLOSED"}
          </span>
          <span className={`pill ${usingLastSession ? "stale" : "live"}`}>{usingLastSession ? "STALE" : "LIVE"}</span>
          <span className="pill sym" style={{fontFamily:"var(--font-mono)",fontWeight:700}}>{symbol}</span>
          {lastUpdated && <span style={{fontFamily:"var(--font-mono)",fontSize:9,color:"var(--t-4)"}}>Updated {lastUpdated}</span>}
        </div>

        {/* Quick actions */}
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <EconomicCalendar watchlist={watchlist} />
          <TradeJournal currentSymbol={symbol} currentPrice={inputObj?.price ?? null} />
          <button className="btn btn-ghost" style={{fontSize:10}} onClick={() => refreshSnapshotOnly()}>Fetch</button>
          <button className="btn btn-primary" style={{fontSize:10}} onClick={runAIWithSnapshot}>Run AI</button>
          <button className="btn btn-ghost" style={{fontSize:10}} onClick={() => { if (plan && inputObj) copyToClipboard(formatXPost(inputObj, plan)); else toast("No plan yet"); }}>Copy X</button>
          <Dialog>
            <DialogTrigger asChild>
              <button className="btn btn-ghost" style={{fontSize:10}}>Settings</button>
            </DialogTrigger>
            <DialogContent style={{background:"var(--bg-2)",border:"1px solid var(--border-2)",color:"var(--t-1)"}}>
              <DialogHeader><DialogTitle style={{fontFamily:"var(--font-sans)"}}>Settings</DialogTitle></DialogHeader>
              <div style={{display:"flex",flexDirection:"column",gap:16}}>
                {[
                  { label: "Auto refresh",              desc: "Auto fetch snapshot on a timer.", val: autoRefresh,        set: setAutoRefresh        },
                  { label: "Flip alert sound",           desc: "Beep on bias change.",           val: biasFlipSound,      set: setBiasFlipSound      },
                  { label: "Auto AI on watchlist click", desc: "Consumes Gemini quota.",         val: autoAiOnWatchClick, set: setAutoAiOnWatchClick },
                  { label: "Show Advanced JSON",         desc: "Developer debug view.",          val: showAdvanced,       set: setShowAdvanced       },
                ].map(({ label, desc, val, set }) => (
                  <div key={label} style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div>
                      <div style={{fontSize:12,fontWeight:500,color:"var(--t-1)"}}>{label}</div>
                      <div style={{fontSize:10,color:"var(--t-3)",marginTop:2}}>{desc}</div>
                    </div>
                    <Switch checked={val} onCheckedChange={set} />
                  </div>
                ))}
                <div>
                  <div className="label-xs" style={{marginBottom:6}}>Refresh interval (sec)</div>
                  <input className="inp" type="number" value={refreshSeconds} onChange={(e) => setRefreshSeconds(Number(e.target.value))} min={10} max={600} />
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ── Multi-ticker overlay bar ── */}
      <div className="overlay-strip">
        <div className="overlay-inner">
          {overlayTickers.map((sym) => {
            const d = overlayData[sym];
            return (
              <button key={sym} onClick={() => { setSymbol(sym); setPlan(null); refreshSnapshotOnly(sym); }}
                className={`ov-tile ${!d ? "" : d.bias === "bullish" ? "bull" : d.bias === "bearish" ? "bear" : ""}`}>
                <span style={{fontSize:11,fontWeight:700,color:"var(--t-1)",letterSpacing:"0.04em"}}>{sym}</span>
                {d ? (
                  <>
                    <span style={{fontSize:10,color:"var(--t-3)",fontVariantNumeric:"tabular-nums"}}>${d.price?.toFixed(2) ?? "—"}</span>
                    <span style={{fontSize:10,fontWeight:700,color: d.bias==="bullish" ? "var(--green-text)" : d.bias==="bearish" ? "var(--red-text)" : "var(--amber-text)"}}>{d.score.toFixed(1)}</span>
                    <span style={{fontSize:10,color:"var(--t-3)"}}>
                      {d.ema5==="bull" ? "▲" : d.ema5==="bear" ? "▼" : "—"}{d.ema15==="bull" ? "▲" : d.ema15==="bear" ? "▼" : "—"}
                    </span>
                  </>
                ) : <span style={{fontSize:10,color:"var(--t-4)"}}>—</span>}
              </button>
            );
          })}
          <button className="btn btn-ghost" onClick={fetchOverlay} disabled={overlayLoading} style={{marginLeft:"auto",fontSize:10,padding:"4px 9px"}}>
            {overlayLoading ? "⟳" : "⟳ Refresh"}
          </button>
          {overlayTickers.map((sym, i) => (
            <input key={i} className="inp" value={sym}
              onChange={(e) => { const t=[...overlayTickers]; t[i]=e.target.value.toUpperCase().trim(); setOverlayTickers(t); }}
              style={{width:52,height:26,fontSize:10,padding:"0 6px",textAlign:"center"}} maxLength={5} />
          ))}
        </div>
      </div>

      {/* ── Active signal banner ── */}
      {activeSignal && (
        <div className={`signal-banner ${activeSignal.bias === "bullish" ? "bull" : "bear"}`}>
          <div className="signal-banner-inner">
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:12,fontWeight:700,color:"var(--t-1)"}}>
                {activeSignal.bias === "bullish" ? "🎯 ENTRY SIGNAL — BULLISH" : "🎯 ENTRY SIGNAL — BEARISH"}
              </span>
              <span className={`badge ${activeSignal.bias === "bullish" ? "bull" : "bear"}`}>
                Score {activeSignal.score.toFixed(1)} · {activeSignal.ts}
              </span>
              <span style={{fontSize:10,color:"var(--t-3)"}}>Threshold {alertThreshold}</span>
            </div>
            <button onClick={() => setActiveSignal(null)} style={{fontSize:10,color:"var(--t-3)",cursor:"pointer",background:"none",border:"none"}}>✕ Dismiss</button>
          </div>
        </div>
      )}

      {/* ── Main grid ── */}
      <div className="main-grid">

        {/* ── Left sidebar ── */}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>

          {/* Symbol */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-label">Symbol</span>
              <span className={`badge ${biasGuess === "bullish" ? "bull" : biasGuess === "bearish" ? "bear" : "neut"}`}>{biasGuess.toUpperCase()}</span>
            </div>
            <div className="panel-body" style={{display:"flex",flexDirection:"column",gap:8}}>
              <input className="inp" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase().trim())} placeholder="SPY" style={{fontSize:18,fontWeight:700,letterSpacing:"0.04em",height:40}} />
              <button className="btn btn-ghost btn-full" onClick={() => refreshSnapshotOnly()}>Fetch Snapshot</button>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span className="label-xs">Updated</span>
                <span style={{fontFamily:"var(--font-mono)",fontSize:10,color:"var(--t-2)",fontVariantNumeric:"tabular-nums"}}>{lastUpdated ?? "—"}</span>
              </div>
            </div>
          </div>

          {/* Watchlist */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-label">Watchlist</span>
            </div>
            <div className="panel-body">
              <WatchlistGroups onSelect={(sym) => selectFromWatchlist(sym)} activeSymbol={symbol} />
            </div>
          </div>

          {/* History */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-label">History</span>
              <button className="btn btn-ghost" style={{fontSize:9,padding:"3px 8px"}} onClick={() => clearHistoryForSymbol(symbol)}>Clear</button>
            </div>
            <div style={{padding:"8px 10px"}}>
              <ScrollArea className="h-[280px]" style={{paddingRight:4}}>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {symbolHistory.length === 0 && (
                    <div style={{textAlign:"center",padding:"20px 0",color:"var(--t-3)",fontSize:11}}>No history yet.</div>
                  )}
                  {symbolHistory.map((h) => (
                    <button key={h.id} className="hist-row" onClick={() => loadHistoryItem(h)}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <span style={{fontFamily:"var(--font-mono)",fontSize:10,fontWeight:700,color:"var(--t-1)"}}>
                          {h.symbol} <span style={{color:"var(--t-3)",fontWeight:400}}>{fmtTime(h.ts)}</span>
                        </span>
                        <span className={`badge ${h.bias_guess === "bullish" ? "bull" : h.bias_guess === "bearish" ? "bear" : "neut"}`}>{h.bias_guess.toUpperCase()}</span>
                      </div>
                      <div style={{display:"flex",gap:12,marginTop:2}}>
                        <span style={{fontSize:9,color:"var(--t-3)",fontFamily:"var(--font-mono)"}}>Px <b style={{color:"var(--t-2)"}}>{h.price ?? "—"}</b></span>
                        <span style={{fontSize:9,color:"var(--t-3)",fontFamily:"var(--font-mono)"}}>VWAP <b style={{color:"var(--t-2)"}}>{h.vwap ?? "—"}</b></span>
                        <span style={{fontSize:9,color:"var(--t-3)",fontFamily:"var(--font-mono)"}}>Score <b style={{color: typeof h.momentum_score === "number" ? (h.momentum_score >= 6.5 ? "var(--green-text)" : h.momentum_score <= 3.5 ? "var(--red-text)" : "var(--amber-text)") : "var(--t-2)"}}>{typeof h.momentum_score === "number" ? h.momentum_score.toFixed(1) : "—"}</b></span>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>

        {/* ── Center column ── */}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>

          {/* Chart */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-label">Chart · 5m default</span>
              <span className={`badge ${biasGuess === "bullish" ? "bull" : biasGuess === "bearish" ? "bear" : "neut"}`}>{biasGuess.toUpperCase()}</span>
            </div>
            <div style={{padding:0}}><TradingViewChart symbol={symbol} /></div>
          </div>

          {/* Snapshot */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-label">Snapshot</span>
              <span style={{fontSize:9,color:"var(--t-3)"}}>Live market signals</span>
            </div>
            <div style={{padding:0}}>
              <SnapshotPanel inputObj={inputObj} history={history} />
            </div>
          </div>

          {/* Options Flow */}
          <OptionsFlow symbol={symbol} />

          {/* News Feed */}
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-3">News & Market Regime</div>
            <NewsFeed symbol={symbol} inputObj={inputObj} />
          </div>

          {/* Correlation Dashboard */}
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-3">Correlation & Sectors</div>
            <CorrelationDashboard activeSymbol={symbol} onSelectSymbol={(sym) => { setSymbol(sym); refreshSnapshotOnly(sym); }} />
          </div>

          {/* Bias Checklist */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-label">Bias Checklist</span>
              {(() => {
                const c = checklistFromSnapshot(inputObj);
                return <span className={`badge ${c.count >= 4 ? "bull" : c.count === 3 ? "cyan" : "neut"}`}>{c.count >= 4 ? "Aligned" : c.count === 3 ? "Mixed" : "Chop Risk"}</span>;
              })()}
            </div>
            <div className="panel-body" style={{display:"flex",flexDirection:"column",gap:8}}>
              {(() => {
                const c = checklistFromSnapshot(inputObj);
                return (
                  <>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <span style={{fontSize:11,color:"var(--t-2)"}}>Signals: <b style={{color:"var(--t-1)"}}>{c.count}/5</b></span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{width:`${(c.count/5)*100}%`,background: c.count >= 4 ? "var(--green)" : c.count === 3 ? "var(--cyan)" : "var(--red)"}}/>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:3}}>
                      {c.items.map((it, idx) => (
                        <div key={idx} className="sig-row">
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span className={`sig-dot ${it.ok ? "bull" : "bear"}`}/>
                            <span style={{fontSize:11,fontWeight:500,color:"var(--t-1)"}}>{it.label}</span>
                          </div>
                          <span style={{fontSize:10,color:"var(--t-3)",fontFamily:"var(--font-mono)"}}>{it.detail}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{background:"var(--bg-3)",border:"1px solid var(--border-0)",borderRadius:7,padding:"10px 12px"}}>
                      <div className="label-xs" style={{marginBottom:4}}>Read</div>
                      <div style={{fontSize:11,color:"var(--t-2)",lineHeight:1.55}}>{c.read}</div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {error && (
            <div className="danger-card">
              <div style={{fontSize:11,fontWeight:700,color:"var(--red-text)",marginBottom:4}}>Error</div>
              <div style={{fontSize:11,color:"var(--t-2)"}}>{error}</div>
            </div>
          )}
        </div>

        {/* ── Right panel ── */}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div className="panel">
            <div className="panel-header">
              <span className="panel-label">Control Panel</span>
              <span style={{fontSize:9,color:"var(--t-3)"}}>Run · Copy · Monitor</span>
            </div>
            <div className="panel-body" style={{display:"flex",flexDirection:"column",gap:10}}>

              {/* Action buttons */}
              <div style={{display:"flex",gap:6}}>
                <button className="btn btn-ghost btn-full" onClick={() => refreshSnapshotOnly()}>Fetch</button>
                <button className="btn btn-primary btn-full" onClick={runAIWithSnapshot}>Run AI</button>
              </div>

              {/* Template fallback */}
              <div style={{background:"var(--bg-3)",border:"1px solid var(--border-0)",borderRadius:7,padding:"10px 12px",display:"flex",flexDirection:"column",gap:7}}>
                <div className="label-xs">Fallback Template</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5}}>
                  {(["trend", "vwap_reclaim", "mean_reversion"] as TemplateMode[]).map((m) => (
                    <button key={m} className="btn btn-ghost"
                      style={{fontSize:9,padding:"4px 6px", ...(templateMode === m ? {borderColor:"var(--cyan-border)",color:"var(--cyan-text)",background:"var(--cyan-bg)"} : {})}}
                      onClick={() => setTemplateMode(m)}>
                      {m === "trend" ? "Trend" : m === "vwap_reclaim" ? "VWAP" : "MR"}
                    </button>
                  ))}
                </div>
                <div style={{fontSize:9,color:"var(--t-4)"}}>Auto-used if AI errors or quota hits.</div>
              </div>

              <div className="sep" />

              {/* ── Tabs — ALL TabsTrigger must be inside TabsList ── */}
              <Tabs defaultValue="plan" className="w-full">
                <TabsList className="grid w-full grid-cols-7 bg-white/5 border border-white/10 h-9">
                  <TabsTrigger value="plan"    className="text-[9px] px-0">Plan</TabsTrigger>
                  <TabsTrigger value="alerts"  className="text-[9px] px-0">Alerts</TabsTrigger>
                  <TabsTrigger value="risk"    className="text-[9px] px-0">Risk</TabsTrigger>
                  <TabsTrigger value="scanner" className="text-[9px] px-0">Scan</TabsTrigger>
                  <TabsTrigger value="gamma"   className="text-[9px] px-0">Gamma</TabsTrigger>
                  <TabsTrigger value="delta"   className="text-[9px] px-0">Delta</TabsTrigger>
                  <TabsTrigger value="adv"     className="text-[9px] px-0">Adv</TabsTrigger>
                </TabsList>

                {/* ── Plan tab ── */}
                <TabsContent value="plan" className="mt-4 space-y-3">
                  {!plan ? (
                    <div className="empty-state">
                      <div style={{fontSize:22,marginBottom:8}}>◎</div>
                      <div style={{fontSize:12,color:"var(--t-3)",marginBottom:4}}>No plan yet.</div>
                      <div style={{fontSize:10,color:"var(--t-4)"}}>Click <b style={{color:"var(--cyan-text)"}}>Run AI</b> to generate.</div>
                    </div>
                  ) : (
                    <>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <span className={`badge ${plan.bias === "bullish" ? "bull" : plan.bias === "bearish" ? "bear" : "neut"}`} style={{fontSize:10,padding:"4px 10px"}}>{plan.bias.toUpperCase()}</span>
                        <button className="btn btn-ghost" style={{fontSize:9}} onClick={() => copyToClipboard(xPost)} disabled={!xPost}>Copy X Post</button>
                      </div>
                      <div style={{background:"var(--bg-3)",border:"1px solid var(--border-0)",borderRadius:7,padding:"11px 13px"}}>
                        <div className="label-xs" style={{marginBottom:5}}>Thesis</div>
                        <div style={{fontSize:11,lineHeight:1.6,color:"var(--t-2)"}}>{plan.thesis}</div>
                      </div>
                      <div className="label-xs">Playbook</div>
                      {plan.playbook?.map((p, idx) => (
                        <div key={idx} className={`play-card ${idx === 0 ? "primary" : idx === 1 ? "secondary" : "counter"}`}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontFamily:"var(--font-mono)",fontSize:8,fontWeight:700,color:"var(--t-4)",background:"var(--bg-4)",border:"1px solid var(--border-1)",borderRadius:3,padding:"2px 5px"}}>#{idx+1}</span>
                            <span style={{fontFamily:"var(--font-mono)",fontSize:8,fontWeight:700,color:"var(--t-3)",letterSpacing:"0.08em"}}>{idx===0?"PRIMARY":idx===1?"SECONDARY":"COUNTER"}</span>
                          </div>
                          <div style={{fontSize:11}}><span style={{fontFamily:"var(--font-mono)",fontWeight:700,color:"var(--cyan-text)",fontSize:9}}>IF </span><span style={{color:"var(--t-2)"}}>{p.if}</span></div>
                          <div style={{fontSize:11}}><span style={{fontFamily:"var(--font-mono)",fontWeight:700,color:"var(--green-text)",fontSize:9}}>THEN </span><span style={{color:"var(--t-2)"}}>{p.then}</span></div>
                          <div style={{fontSize:11}}><span style={{fontFamily:"var(--font-mono)",fontWeight:700,color:"var(--red-text)",fontSize:9}}>RISK </span><span style={{color:"var(--t-2)"}}>{p.risk}</span></div>
                        </div>
                      ))}
                      <div className="danger-card">
                        <div className="label-xs" style={{color:"var(--red-text)",marginBottom:6,opacity:0.7}}>⚠ Danger Zones</div>
                        <div style={{display:"flex",flexDirection:"column",gap:4}}>
                          {plan.danger_zones?.map((d, idx) => (
                            <div key={idx} style={{display:"flex",gap:7,fontSize:11,color:"var(--t-2)"}}>
                              <span style={{color:"var(--red-text)",opacity:0.4,flexShrink:0}}>•</span>{d}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="strike-card">
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                          <div className="label-xs" style={{color:"var(--cyan-text)",opacity:0.8}}>⚡ Strike Picker</div>
                          <button className="btn btn-primary" style={{fontSize:9,padding:"3px 9px"}} onClick={computeStrikePick}>Pick Strike</button>
                        </div>
                        {strikePick ? (
                          <div style={{display:"flex",flexDirection:"column",gap:6}}>
                            <div style={{display:"flex",alignItems:"center",gap:7}}>
                              <span className={`badge ${strikePick.type === "call" ? "bull" : "bear"}`} style={{fontSize:11,padding:"4px 10px",fontWeight:800}}>
                                {symbol} ${strikePick.strike} {strikePick.type.toUpperCase()}
                              </span>
                              <span style={{fontSize:9,color:"var(--t-3)",fontFamily:"var(--font-mono)"}}>{strikePick.expiry}</span>
                            </div>
                            <div style={{fontSize:10,color:"var(--t-2)",lineHeight:1.55}}>{strikePick.rationale}</div>
                            <div style={{fontSize:9,color:"var(--t-4)"}}>Not financial advice. Verify with live chain.</div>
                          </div>
                        ) : (
                          <div style={{fontSize:10,color:"var(--t-3)"}}>Run AI to get a bias, then click Pick Strike.</div>
                        )}
                      </div>
                      <div style={{background:"var(--bg-3)",border:"1px solid var(--border-0)",borderRadius:7,padding:"11px 13px"}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                          <div className="label-xs">X Post</div>
                          <span style={{fontSize:9,color:"var(--t-4)",fontFamily:"var(--font-mono)"}}>{xPost.length} chars</span>
                        </div>
                        <Textarea value={xPost} readOnly style={{background:"var(--bg-4)",border:"1px solid var(--border-0)",borderRadius:6,minHeight:140,fontSize:10,fontFamily:"var(--font-mono)",color:"var(--t-2)",resize:"vertical"}} />
                      </div>
                      {/* Setup Card */}
                      <div className="pt-2 border-t border-white/10">
                        <SetupCard
                          symbol={symbol}
                          price={inputObj?.price ?? null}
                          score={inputObj ? computeMomentumScore(inputObj) : null}
                          bias={biasGuess}
                          vwap={inputObj?.vwap ?? null}
                          plan={plan}
                          inputObj={inputObj}
                        />
                      </div>
                    </>
                  )}
                </TabsContent>

                {/* ── Alerts tab ── */}
                <TabsContent value="alerts" className="mt-4 space-y-3">
                  <div style={{fontSize:10,color:"var(--t-3)",lineHeight:1.5}}>Bias flips trigger when bias_guess changes between snapshots.</div>
                  {!biasFlip ? (
                    <div className="empty-state">
                      <div style={{fontSize:11,color:"var(--t-3)"}}>No flip detected yet.</div>
                    </div>
                  ) : (
                    <div style={{background:"var(--amber-bg)",border:"1px solid var(--amber-border)",borderRadius:8,padding:"12px 14px",display:"flex",flexDirection:"column",gap:7}}>
                      <div style={{fontSize:12,fontWeight:700,color:"var(--amber-text)"}}>⚡ Bias Flip</div>
                      <div style={{fontSize:11,color:"var(--t-2)"}}><b style={{color:"var(--t-1)"}}>{biasFlip.symbol}</b> <span>{biasFlip.from.toUpperCase()}</span> → <b style={{color:"var(--t-1)"}}>{biasFlip.to.toUpperCase()}</b></div>
                      <div style={{fontFamily:"var(--font-mono)",fontSize:9,color:"var(--t-3)"}}>{fmtTime(biasFlip.ts)} · Px {typeof biasFlip.price === "number" ? biasFlip.price.toFixed(2) : "—"} · Score {typeof biasFlip.score === "number" ? biasFlip.score.toFixed(1) : "—"}</div>
                      <div style={{display:"flex",gap:6}}>
                        <button className="btn btn-ghost" style={{fontSize:9}} onClick={() => copyToClipboard(formatXAlert(biasFlip))}>Copy Alert</button>
                        <button className="btn btn-ghost" style={{fontSize:9}} onClick={() => setBiasFlip(null)}>Dismiss</button>
                      </div>
                    </div>
                  )}
                  <div className="sep" />
                  <div style={{background:"var(--bg-3)",border:"1px solid var(--border-0)",borderRadius:8,padding:"12px 14px",display:"flex",flexDirection:"column",gap:10}}>
                    <div className="label-xs" style={{marginBottom:0}}>🎯 Entry Signal Alerts</div>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div>
                        <div style={{fontSize:11,fontWeight:500,color:"var(--t-1)"}}>Alert enabled</div>
                        <div style={{fontSize:9,color:"var(--t-3)",marginTop:2}}>Toast when score crosses threshold</div>
                      </div>
                      <Switch checked={alertEnabled} onCheckedChange={setAlertEnabled} />
                    </div>
                    <div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                        <span className="label-xs">Score threshold</span>
                        <span style={{fontFamily:"var(--font-mono)",fontSize:10,fontWeight:700,color:"var(--cyan-text)"}}>{alertThreshold.toFixed(1)}</span>
                      </div>
                      <input type="range" min={6} max={9.5} step={0.5} value={alertThreshold} onChange={e => setAlertThreshold(Number(e.target.value))} />
                      <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                        <span style={{fontSize:9,color:"var(--t-4)",fontFamily:"var(--font-mono)"}}>6.0 sensitive</span>
                        <span style={{fontSize:9,color:"var(--t-4)",fontFamily:"var(--font-mono)"}}>9.5 strict</span>
                      </div>
                    </div>
                    {lastAlertScore && (
                      <div style={{fontSize:9,color:"var(--t-3)",fontFamily:"var(--font-mono)"}}>
                        Last fired at score <span style={{color:"var(--cyan-text)",fontWeight:700}}>{lastAlertScore.toFixed(1)}</span>
                      </div>
                    )}
                    {activeSignal && (
                      <div style={{background: activeSignal.bias === "bullish" ? "var(--green-bg)" : "var(--red-bg)", border:`1px solid ${activeSignal.bias === "bullish" ? "var(--green-border)" : "var(--red-border)"}`, borderRadius:7, padding:"9px 11px", display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <div>
                          <div style={{fontSize:11,fontWeight:700,color:"var(--t-1)"}}>🎯 Active Signal</div>
                          <div style={{fontSize:9,color:"var(--t-3)",fontFamily:"var(--font-mono)",marginTop:2}}>{activeSignal.bias.toUpperCase()} · {activeSignal.score.toFixed(1)} · {activeSignal.ts}</div>
                        </div>
                        <button onClick={() => setActiveSignal(null)} style={{fontSize:10,color:"var(--t-3)",background:"none",border:"none",cursor:"pointer"}}>✕</button>
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* ── Risk tab ── */}
                <TabsContent value="risk" className="mt-4 space-y-3">
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
                    {[
                      { label: "Account ($)", val: acctSize, set: setAcctSize },
                      { label: "Risk %",      val: riskPct,  set: setRiskPct, step: 0.25 },
                      { label: "Entry",       val: entry,    set: setEntry },
                      { label: "Stop",        val: stop,     set: setStop },
                    ].map(({ label, val, set, step }) => (
                      <div key={label}>
                        <div className="label-xs" style={{marginBottom:4}}>{label}</div>
                        <input className="inp" type="number" value={val} onChange={(e) => (set as any)(Number(e.target.value))} step={step} />
                      </div>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button className="btn btn-ghost btn-full" style={{fontSize:10}} onClick={() => { const p = Number(inputObj?.price); if (isFinite(p) && p > 0) { setEntry(p); toast.success("Entry set"); } else toast("Fetch first"); }}>Use Price</button>
                    <button className="btn btn-ghost btn-full" style={{fontSize:10}} onClick={() => { const v = Number(inputObj?.vwap);  if (isFinite(v) && v > 0) { setStop(v);  toast.success("Stop = VWAP"); } else toast("No VWAP yet"); }}>VWAP Stop</button>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    {(["long", "short"] as const).map((d) => (
                      <button key={d} className="btn btn-ghost btn-full" style={{fontSize:11, ...(direction===d ? {borderColor:"var(--cyan-border)",color:"var(--cyan-text)",background:"var(--cyan-bg)"} : {})}} onClick={() => setDirection(d)}>{d.charAt(0).toUpperCase() + d.slice(1)}</button>
                    ))}
                  </div>
                  <div className="sep" />
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                    {[
                      { label: "Risk $",     val: fmtMoney(riskDollars) },
                      { label: "Stop Dist",  val: stopDistance ? fmtNum(stopDistance, 2) : "—" },
                      { label: "Shares",     val: shares ?? "—" },
                      { label: "Position $", val: positionValue ? fmtMoney(positionValue) : "—" },
                    ].map(({ label, val }) => (
                      <div key={label} className="metric-tile">
                        <div className="label-xs" style={{marginBottom:5}}>{label}</div>
                        <div style={{fontFamily:"var(--font-mono)",fontSize:13,fontWeight:700,color:"var(--t-1)",fontVariantNumeric:"tabular-nums"}}>{String(val)}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{background:"var(--bg-3)",border:"1px solid var(--border-0)",borderRadius:8,padding:"11px 13px"}}>
                    <div className="label-xs" style={{marginBottom:8}}>R Targets</div>
                    {rTargets ? (
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,textAlign:"center"}}>
                        {[{label:"1R",val:rTargets.r1,color:"var(--green-text)"},{label:"2R",val:rTargets.r2,color:"var(--cyan-text)"},{label:"3R",val:rTargets.r3,color:"#a78bfa"}].map(({label,val,color}) => (
                          <div key={label}>
                            <div style={{fontSize:9,color:"var(--t-4)",fontFamily:"var(--font-mono)",marginBottom:3}}>{label}</div>
                            <div style={{fontFamily:"var(--font-mono)",fontSize:13,fontWeight:700,color,fontVariantNumeric:"tabular-nums"}}>{fmtNum(val,2)}</div>
                          </div>
                        ))}
                      </div>
                    ) : <div style={{fontSize:11,color:"var(--t-4)",textAlign:"center",padding:"8px 0"}}>Set entry + stop first.</div>}
                  </div>
                </TabsContent>

                {/* ── Scanner tab ── */}
                <TabsContent value="scanner" className="mt-4 space-y-3">
                  <ScannerPanel watchlist={watchlist} onSelect={(ticker) => { setSymbol(ticker); setPlan(null); refreshSnapshotOnly(ticker); }} />
                </TabsContent>

                {/* ── Gamma tab ── */}
                <TabsContent value="gamma" className="mt-4">
                  <GammaLevels symbol={symbol} currentPrice={inputObj?.price ?? null} atr={inputObj?.atr_14 ?? null} />
                </TabsContent>

                {/* ── Delta tab ── */}
                <TabsContent value="delta" className="mt-4">
                  <ScoreDelta history={symbolHistory} symbol={symbol} deltaThreshold={2.0} lookback={12} />
                </TabsContent>

                {/* ── Advanced tab ── */}
                <TabsContent value="adv" className="mt-4">
                  {!showAdvanced ? (
                    <div className="empty-state">
                      <div style={{fontSize:11,color:"var(--t-3)"}}>Enable Advanced JSON in Settings.</div>
                    </div>
                  ) : (
                    <div style={{background:"var(--bg-3)",border:"1px solid var(--border-0)",borderRadius:8,padding:"12px 13px",display:"flex",flexDirection:"column",gap:6}}>
                      <div className="label-xs">Snapshot JSON</div>
                      <Textarea value={inputJsonText} onChange={(e) => setInputJsonText(e.target.value)}
                        style={{background:"var(--bg-4)",border:"1px solid var(--border-0)",borderRadius:6,minHeight:240,fontSize:10,fontFamily:"var(--font-mono)",color:"var(--t-2)",resize:"vertical"}} />
                    </div>
                  )}
                </TabsContent>

              </Tabs>

              {/* Win Rate Heatmap — below tabs, full width */}
              <div className="sep" />
              <div>
                <div className="label-xs" style={{marginBottom:8}}>📊 Edge Analysis</div>
                <WinRateHeatmap />
              </div>

            </div>
          </div>

          {/* Footer note */}
          <div style={{background:"var(--bg-2)",border:"1px solid var(--border-0)",borderRadius:8,padding:"10px 14px"}}>
            <div style={{fontSize:10,fontWeight:600,color:"var(--t-2)",marginBottom:3}}>Not financial advice</div>
            <div style={{fontSize:9,color:"var(--t-3)"}}>Data delayed depending on feed. Built by @bptrades</div>
          </div>
        </div>
      </div>

      <footer style={{maxWidth:1280,margin:"0 auto",padding:"12px 20px 28px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",borderTop:"1px solid var(--border-0)",paddingTop:12}}>
          <div style={{fontFamily:"var(--font-mono)",fontSize:9,color:"var(--t-4)",letterSpacing:"0.06em"}}>RETAIL WEAPON PACK · v0.2.0</div>
          <div style={{fontFamily:"var(--font-mono)",fontSize:9,color:"var(--t-4)"}}>© {new Date().getFullYear()} bptrades</div>
        </div>
      </footer>
    </div>
  );
}