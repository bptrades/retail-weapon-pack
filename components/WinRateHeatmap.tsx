"use client";
// components/WinRateHeatmap.tsx
// Reads from localStorage key "rw_journal_v1" (same as TradeJournal).
// No props needed — fully self-contained.
//
// Shows:
//   1. By time of day   — which hours you win / lose
//   2. By day of week   — Monday edge vs Friday edge
//   3. By setup type    — which setups are actually profitable
//   4. By ticker        — which symbols you trade best
//   5. By bias          — bullish vs bearish trades
//   6. Session R curve  — cumulative R over all trades
//
// Add to journal page or as a drawer/modal from the Journal button:
//   import WinRateHeatmap from "@/components/WinRateHeatmap";
//   <WinRateHeatmap />

import React, { useEffect, useState, useMemo } from "react";

// ─── Types (mirrors TradeJournal) ────────────────────────────────────────────

type TradeOutcome = "win" | "loss" | "breakeven";
type TradeBias    = "bullish" | "bearish" | "neutral";

interface TradeEntry {
  id:        string;
  ts:        string;
  symbol:    string;
  bias:      TradeBias;
  direction: "long" | "short";
  entry:     number;
  exit:      number;
  stop:      number;
  size:      number;
  pnl:       number;
  rMultiple: number;
  outcome:   TradeOutcome;
  notes:     string;
  setup:     string;
}

const JOURNAL_KEY = "rw_journal_v1";

// ─── Stat helpers ────────────────────────────────────────────────────────────

interface GroupStat {
  label: string;
  wins: number;
  losses: number;
  breakevens: number;
  totalR: number;
  totalPnl: number;
  trades: number;
  winRate: number;
  avgR: number;
}

function buildStat(label: string, trades: TradeEntry[]): GroupStat {
  const wins   = trades.filter(t => t.outcome === "win").length;
  const losses = trades.filter(t => t.outcome === "loss").length;
  const bes    = trades.filter(t => t.outcome === "breakeven").length;
  const totalR = trades.reduce((s, t) => s + t.rMultiple, 0);
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  return {
    label,
    wins, losses, breakevens: bes,
    totalR: Number(totalR.toFixed(2)),
    totalPnl: Number(totalPnl.toFixed(2)),
    trades: trades.length,
    winRate: trades.length > 0 ? Number(((wins / trades.length) * 100).toFixed(1)) : 0,
    avgR:   trades.length > 0 ? Number((totalR / trades.length).toFixed(2)) : 0,
  };
}

// ─── Color scales ────────────────────────────────────────────────────────────

function winRateColor(wr: number, trades: number): string {
  if (trades === 0) return "var(--bg-3)";
  if (wr >= 65) return "rgba(16,185,129,0.35)";
  if (wr >= 55) return "rgba(16,185,129,0.18)";
  if (wr >= 45) return "rgba(245,158,11,0.18)";
  if (wr >= 35) return "rgba(239,68,68,0.18)";
  return "rgba(239,68,68,0.32)";
}

function winRateBorder(wr: number, trades: number): string {
  if (trades === 0) return "var(--border-0)";
  if (wr >= 65) return "rgba(16,185,129,0.45)";
  if (wr >= 55) return "rgba(16,185,129,0.25)";
  if (wr >= 45) return "rgba(245,158,11,0.25)";
  if (wr >= 35) return "rgba(239,68,68,0.25)";
  return "rgba(239,68,68,0.45)";
}

function winRateTextColor(wr: number, trades: number): string {
  if (trades === 0) return "var(--t-4)";
  if (wr >= 55) return "var(--green-text)";
  if (wr >= 45) return "var(--amber-text)";
  return "var(--red-text)";
}

function pnlColor(pnl: number): string {
  if (pnl > 0) return "var(--green-text)";
  if (pnl < 0) return "var(--red-text)";
  return "var(--t-3)";
}

function fmtMoney(n: number): string {
  const abs = Math.abs(n).toLocaleString(undefined, {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  });
  return n < 0 ? `-${abs}` : `+${abs}`;
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function StatBar({ wr, trades }: { wr: number; trades: number }) {
  const pct = trades > 0 ? wr : 0;
  return (
    <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginTop: 4 }}>
      <div style={{
        height: "100%", width: `${pct}%`, borderRadius: 2,
        background: pct >= 55 ? "var(--green)" : pct >= 45 ? "var(--amber)" : "var(--red)",
        transition: "width 0.5s ease",
      }} />
    </div>
  );
}

function GroupCard({ stat, highlight }: { stat: GroupStat; highlight?: boolean }) {
  return (
    <div style={{
      padding: "9px 11px", borderRadius: 8,
      background: winRateColor(stat.winRate, stat.trades),
      border: `1px solid ${winRateBorder(stat.winRate, stat.trades)}`,
      outline: highlight ? "1px solid var(--cyan)" : "none",
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--t-1)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {stat.label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 800,
          color: winRateTextColor(stat.winRate, stat.trades),
          fontVariantNumeric: "tabular-nums",
        }}>
          {stat.trades > 0 ? `${stat.winRate}%` : "—"}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--t-4)", fontVariantNumeric: "tabular-nums" }}>
          {stat.trades}T
        </span>
      </div>
      <StatBar wr={stat.winRate} trades={stat.trades} />
      {stat.trades > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: pnlColor(stat.totalPnl) }}>
            {fmtMoney(stat.totalPnl)}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: stat.avgR > 0 ? "var(--green-text)" : stat.avgR < 0 ? "var(--red-text)" : "var(--t-4)" }}>
            {stat.avgR > 0 ? "+" : ""}{stat.avgR}R avg
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Cumulative R curve ───────────────────────────────────────────────────────

function CumulativeRChart({ trades }: { trades: TradeEntry[] }) {
  if (trades.length < 2) return (
    <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontSize: 10, color: "var(--t-4)", fontFamily: "var(--font-mono)" }}>
        Log 2+ trades to see equity curve
      </span>
    </div>
  );

  // Build cumulative R array oldest → newest
  const sorted = [...trades].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  let cumR = 0;
  const points = [{ i: 0, r: 0 }];
  sorted.forEach((t, i) => {
    cumR += t.rMultiple;
    points.push({ i: i + 1, r: Number(cumR.toFixed(2)) });
  });

  const W = 100; const H = 50; const PAD = 4;
  const minR = Math.min(...points.map(p => p.r), 0);
  const maxR = Math.max(...points.map(p => p.r), 1);
  const range = maxR - minR || 1;

  function px(i: number) { return PAD + (i / (points.length - 1)) * (W - PAD * 2); }
  function py(r: number) { return PAD + (1 - (r - minR) / range) * (H - PAD * 2); }

  const polyline = points.map(p => `${px(p.i)},${py(p.r)}`).join(" ");
  const finalR   = points[points.length - 1].r;
  const isPos    = finalR >= 0;
  const lineColor = isPos ? "var(--green)" : "var(--red)";
  const zeroY    = py(0);

  // Find drawdown — deepest point below previous high
  let peak = 0, maxDd = 0;
  points.forEach(p => {
    if (p.r > peak) peak = p.r;
    const dd = peak - p.r;
    if (dd > maxDd) maxDd = dd;
  });

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 90, display: "block" }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="r-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Zero line */}
        <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="rgba(255,255,255,0.1)" strokeWidth={0.5} strokeDasharray="2,2" />

        {/* Fill */}
        <polygon
          points={`${px(0)},${zeroY} ${polyline} ${px(points.length - 1)},${zeroY}`}
          fill="url(#r-fill)"
        />

        {/* Line */}
        <polyline points={polyline} fill="none" stroke={lineColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />

        {/* Final point */}
        <circle cx={px(points.length - 1)} cy={py(finalR)} r={2.5} fill={lineColor} stroke="var(--bg-1)" strokeWidth={0.8} />

        {/* R axis labels */}
        {[0, maxR, minR < 0 ? minR : null].filter(v => v !== null).map(v => (
          <text key={v} x={1} y={py(v as number) + 1.5} fontSize={3.5} fill="rgba(255,255,255,0.25)" fontFamily="monospace">
            {(v as number).toFixed(1)}R
          </text>
        ))}
      </svg>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: isPos ? "var(--green-text)" : "var(--red-text)", fontWeight: 700 }}>
            Total: {finalR > 0 ? "+" : ""}{finalR.toFixed(2)}R
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--red-text)" }}>
            Max DD: -{maxDd.toFixed(2)}R
          </span>
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--t-4)" }}>
          {trades.length} trades
        </span>
      </div>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="label-xs">{title}</div>
      {subtitle && <div style={{ fontSize: 9, color: "var(--t-4)", marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WinRateHeatmap() {
  const [trades, setTrades] = useState<TradeEntry[]>([]);
  const [tab,    setTab]    = useState<"time" | "day" | "setup" | "ticker" | "bias" | "curve">("time");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(JOURNAL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setTrades(parsed);
      }
    } catch {}
  }, []);

  // ── By hour of day (ET) ──────────────────────────────────────────────────────
  const byHour = useMemo(() => {
    const hours: Record<number, TradeEntry[]> = {};
    trades.forEach(t => {
      const et = new Date(new Date(t.ts).toLocaleString("en-US", { timeZone: "America/New_York" }));
      const h  = et.getHours();
      if (!hours[h]) hours[h] = [];
      hours[h].push(t);
    });
    return Array.from({ length: 8 }, (_, i) => {
      const h = i + 9; // 9am through 4pm ET
      const label = `${h <= 12 ? h : h - 12}${h < 12 ? "am" : "pm"}`;
      return buildStat(label, hours[h] || []);
    });
  }, [trades]);

  // ── By day of week ────────────────────────────────────────────────────────────
  const byDay = useMemo(() => {
    const days: Record<number, TradeEntry[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    trades.forEach(t => {
      const d = new Date(t.ts).getDay();
      if (days[d]) days[d].push(t);
    });
    const labels = ["", "Mon", "Tue", "Wed", "Thu", "Fri"];
    return [1, 2, 3, 4, 5].map(d => buildStat(labels[d], days[d]));
  }, [trades]);

  // ── By setup ─────────────────────────────────────────────────────────────────
  const bySetup = useMemo(() => {
    const setups: Record<string, TradeEntry[]> = {};
    trades.forEach(t => {
      const s = t.setup?.trim() || "Untagged";
      if (!setups[s]) setups[s] = [];
      setups[s].push(t);
    });
    return Object.entries(setups)
      .map(([label, ts]) => buildStat(label, ts))
      .sort((a, b) => b.totalR - a.totalR);
  }, [trades]);

  // ── By ticker ─────────────────────────────────────────────────────────────────
  const byTicker = useMemo(() => {
    const tickers: Record<string, TradeEntry[]> = {};
    trades.forEach(t => {
      if (!tickers[t.symbol]) tickers[t.symbol] = [];
      tickers[t.symbol].push(t);
    });
    return Object.entries(tickers)
      .map(([label, ts]) => buildStat(label, ts))
      .sort((a, b) => b.totalR - a.totalR);
  }, [trades]);

  // ── By bias ───────────────────────────────────────────────────────────────────
  const byBias = useMemo(() => {
    return (["bullish", "bearish", "neutral"] as TradeBias[]).map(b =>
      buildStat(b.charAt(0).toUpperCase() + b.slice(1), trades.filter(t => t.bias === b))
    );
  }, [trades]);

  // ── Insight generator ─────────────────────────────────────────────────────────
  const insights = useMemo(() => {
    if (trades.length < 5) return [];
    const out: string[] = [];

    const bestHour = byHour.filter(h => h.trades >= 2).sort((a, b) => b.winRate - a.winRate)[0];
    const worstHour = byHour.filter(h => h.trades >= 2).sort((a, b) => a.winRate - b.winRate)[0];
    if (bestHour && bestHour.winRate >= 55) out.push(`⚡ Your best hour is ${bestHour.label} — ${bestHour.winRate}% win rate. Focus there.`);
    if (worstHour && worstHour.winRate <= 40 && worstHour.trades >= 3) out.push(`⚠ Avoid trading at ${worstHour.label} — ${worstHour.winRate}% win rate on ${worstHour.trades} trades. Your worst hour.`);

    const bestDay = byDay.filter(d => d.trades >= 2).sort((a, b) => b.winRate - a.winRate)[0];
    const worstDay = byDay.filter(d => d.trades >= 2).sort((a, b) => a.winRate - b.winRate)[0];
    if (bestDay && bestDay.winRate >= 60) out.push(`📅 ${bestDay.label} is your best day — ${bestDay.winRate}% win rate.`);
    if (worstDay && worstDay.winRate <= 35 && worstDay.trades >= 3) out.push(`📅 ${worstDay.label} is your worst day — consider sitting out.`);

    const bestSetup = bySetup.filter(s => s.trades >= 2 && s.label !== "Untagged").sort((a, b) => b.avgR - a.avgR)[0];
    if (bestSetup) out.push(`🎯 Your highest avg-R setup is "${bestSetup.label}" at +${bestSetup.avgR}R per trade.`);

    const bullStat = byBias.find(b => b.label === "Bullish");
    const bearStat = byBias.find(b => b.label === "Bearish");
    if (bullStat && bearStat && bullStat.trades >= 2 && bearStat.trades >= 2) {
      if (bullStat.winRate > bearStat.winRate + 15) out.push(`📊 You trade bullish setups significantly better (${bullStat.winRate}% vs ${bearStat.winRate}%). Lean long.`);
      if (bearStat.winRate > bullStat.winRate + 15) out.push(`📊 You trade bearish setups significantly better (${bearStat.winRate}% vs ${bullStat.winRate}%). Lean short.`);
    }

    const losingTickers = byTicker.filter(t => t.trades >= 3 && t.winRate < 40);
    if (losingTickers.length > 0) out.push(`🚫 Stop trading ${losingTickers.map(t => t.label).join(", ")} — win rate below 40% with 3+ trades.`);

    return out;
  }, [trades, byHour, byDay, bySetup, byBias, byTicker]);

  // ── Overall stats ─────────────────────────────────────────────────────────────
  const overall = useMemo(() => buildStat("All Trades", trades), [trades]);

  const tabs: { key: typeof tab; label: string }[] = [
    { key: "time",   label: "By Hour"  },
    { key: "day",    label: "By Day"   },
    { key: "setup",  label: "By Setup" },
    { key: "ticker", label: "By Ticker"},
    { key: "bias",   label: "By Bias"  },
    { key: "curve",  label: "R Curve"  },
  ];

  if (trades.length === 0) {
    return (
      <div className="empty-state" style={{ padding: "32px 0" }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>📊</div>
        <div style={{ fontSize: 12, color: "var(--t-3)", marginBottom: 4 }}>No trades logged yet.</div>
        <div style={{ fontSize: 10, color: "var(--t-4)", lineHeight: 1.5 }}>
          Log trades in your Journal and the heatmap will show you exactly where your edge lives.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Header stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        {[
          { label: "Win Rate",   value: `${overall.winRate}%`,                        color: winRateTextColor(overall.winRate, overall.trades) },
          { label: "Total R",    value: `${overall.totalR > 0 ? "+" : ""}${overall.totalR}R`, color: pnlColor(overall.totalR) },
          { label: "Total P&L",  value: fmtMoney(overall.totalPnl),                   color: pnlColor(overall.totalPnl) },
          { label: "Trades",     value: String(overall.trades),                        color: "var(--t-1)" },
        ].map(s => (
          <div key={s.label} className="metric-tile">
            <div className="label-xs" style={{ marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 800, color: s.color, fontVariantNumeric: "tabular-nums" }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* AI-style insights */}
      {insights.length > 0 && (
        <div style={{ background: "var(--cyan-bg)", border: "1px solid var(--cyan-border)", borderRadius: 8, padding: "11px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="label-xs" style={{ color: "var(--cyan-text)", marginBottom: 2 }}>Edge Insights</div>
          {insights.map((ins, i) => (
            <div key={i} style={{ fontSize: 11, color: "var(--t-2)", lineHeight: 1.5 }}>{ins}</div>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.07em", textTransform: "uppercase",
              padding: "4px 9px", borderRadius: 5, border: "1px solid", cursor: "pointer",
              background: tab === t.key ? "var(--bg-4)" : "var(--bg-3)",
              borderColor: tab === t.key ? "var(--border-2)" : "var(--border-0)",
              color: tab === t.key ? "var(--t-1)" : "var(--t-3)",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* By Hour heatmap */}
      {tab === "time" && (
        <div>
          <SectionHeader title="Win Rate by Hour (ET)" subtitle="Focus on your power hours. Skip your dead zones." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {byHour.map(s => <GroupCard key={s.label} stat={s} />)}
          </div>
        </div>
      )}

      {/* By Day */}
      {tab === "day" && (
        <div>
          <SectionHeader title="Win Rate by Day of Week" subtitle="Some days just don't work. The data shows you which." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
            {byDay.map(s => <GroupCard key={s.label} stat={s} />)}
          </div>
        </div>
      )}

      {/* By Setup */}
      {tab === "setup" && (
        <div>
          <SectionHeader title="Win Rate by Setup" subtitle="Sorted by total R. Only take your proven setups." />
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {bySetup.length === 0
              ? <div style={{ fontSize: 10, color: "var(--t-4)", padding: 12 }}>Tag your trades with setup names to see this breakdown.</div>
              : bySetup.map((s, i) => (
                <div key={s.label} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 13px", borderRadius: 8,
                  background: winRateColor(s.winRate, s.trades),
                  border: `1px solid ${winRateBorder(s.winRate, s.trades)}`,
                }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--t-4)", minWidth: 14 }}>#{i + 1}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--t-1)" }}>{s.label}</span>
                      <span style={{ fontSize: 9, color: "var(--t-4)", fontFamily: "var(--font-mono)" }}>{s.trades} trades</span>
                    </div>
                    <div style={{ display: "flex", gap: 14, marginTop: 4, paddingLeft: 22 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: pnlColor(s.totalPnl) }}>{fmtMoney(s.totalPnl)}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: s.avgR > 0 ? "var(--green-text)" : "var(--red-text)" }}>
                        {s.avgR > 0 ? "+" : ""}{s.avgR}R avg
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 800, color: winRateTextColor(s.winRate, s.trades), fontVariantNumeric: "tabular-nums" }}>
                      {s.trades > 0 ? `${s.winRate}%` : "—"}
                    </div>
                    <StatBar wr={s.winRate} trades={s.trades} />
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* By Ticker */}
      {tab === "ticker" && (
        <div>
          <SectionHeader title="Win Rate by Ticker" subtitle="Sorted by total R. Trade your best symbols more." />
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {byTicker.map((s, i) => (
              <div key={s.label} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 13px", borderRadius: 8,
                background: winRateColor(s.winRate, s.trades),
                border: `1px solid ${winRateBorder(s.winRate, s.trades)}`,
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--t-4)", minWidth: 14 }}>#{i + 1}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800, color: "var(--t-1)", letterSpacing: "0.04em" }}>{s.label}</span>
                    <span style={{ fontSize: 9, color: "var(--t-4)", fontFamily: "var(--font-mono)" }}>{s.trades} trades</span>
                  </div>
                  <div style={{ display: "flex", gap: 14, marginTop: 4, paddingLeft: 22 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: pnlColor(s.totalPnl) }}>{fmtMoney(s.totalPnl)}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: s.avgR > 0 ? "var(--green-text)" : "var(--red-text)" }}>
                      {s.avgR > 0 ? "+" : ""}{s.avgR}R avg
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 800, color: winRateTextColor(s.winRate, s.trades) }}>
                    {s.winRate}%
                  </div>
                  <StatBar wr={s.winRate} trades={s.trades} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By Bias */}
      {tab === "bias" && (
        <div>
          <SectionHeader title="Win Rate by Bias Direction" subtitle="Are you better long or short? The data knows." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {byBias.map(s => <GroupCard key={s.label} stat={s} highlight={s.trades === Math.max(...byBias.map(b => b.trades))} />)}
          </div>
          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {byBias.map(s => (
              <div key={s.label} style={{ background: "var(--bg-3)", border: "1px solid var(--border-0)", borderRadius: 7, padding: "7px 10px" }}>
                <div className="label-xs" style={{ marginBottom: 4 }}>{s.label} · W/L/BE</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t-2)" }}>
                  <span style={{ color: "var(--green-text)" }}>{s.wins}W</span>
                  {" / "}
                  <span style={{ color: "var(--red-text)" }}>{s.losses}L</span>
                  {" / "}
                  <span style={{ color: "var(--amber-text)" }}>{s.breakevens}BE</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cumulative R curve */}
      {tab === "curve" && (
        <div>
          <SectionHeader title="Cumulative R Curve" subtitle="Your equity curve in R units. Should trend up-right." />
          <div style={{ background: "var(--bg-3)", border: "1px solid var(--border-0)", borderRadius: 8, padding: "12px 14px" }}>
            <CumulativeRChart trades={trades} />
          </div>

          {/* Profit factor */}
          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {[
              {
                label: "Profit Factor",
                value: (() => {
                  const grossWin  = trades.filter(t => t.outcome === "win").reduce((s, t) => s + t.pnl, 0);
                  const grossLoss = trades.filter(t => t.outcome === "loss").reduce((s, t) => s + Math.abs(t.pnl), 0);
                  return grossLoss ? (grossWin / grossLoss).toFixed(2) : grossWin > 0 ? "∞" : "—";
                })(),
                color: "var(--cyan-text)",
              },
              {
                label: "Avg Win",
                value: (() => {
                  const wins = trades.filter(t => t.outcome === "win");
                  if (!wins.length) return "—";
                  return fmtMoney(wins.reduce((s, t) => s + t.pnl, 0) / wins.length);
                })(),
                color: "var(--green-text)",
              },
              {
                label: "Avg Loss",
                value: (() => {
                  const losses = trades.filter(t => t.outcome === "loss");
                  if (!losses.length) return "—";
                  return fmtMoney(losses.reduce((s, t) => s + t.pnl, 0) / losses.length);
                })(),
                color: "var(--red-text)",
              },
            ].map(s => (
              <div key={s.label} className="metric-tile">
                <div className="label-xs" style={{ marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800, color: s.color, fontVariantNumeric: "tabular-nums" }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}