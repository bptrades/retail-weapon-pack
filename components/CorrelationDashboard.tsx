"use client";
import React, { useState, useEffect, useCallback } from "react";

interface CorrelationData {
  symbol: string;
  price: number | null;
  change_pct: number | null;
  score: number;
  bias: "bullish" | "bearish" | "neutral";
  vwap_state: string | null;
  ema5: string | null;
  ema15: string | null;
  atr: number | null;
}

interface CorrelationDashboardProps {
  activeSymbol: string;
  onSelectSymbol: (s: string) => void;
}

// Sector ETFs with labels
const SECTORS = [
  { sym: "XLK",  label: "Tech"       },
  { sym: "XLF",  label: "Finance"    },
  { sym: "XLE",  label: "Energy"     },
  { sym: "XLV",  label: "Health"     },
  { sym: "XLI",  label: "Industrial" },
  { sym: "XLY",  label: "Consumer"   },
  { sym: "XLP",  label: "Staples"    },
  { sym: "XLB",  label: "Materials"  },
  { sym: "XLRE", label: "Real Est."  },
  { sym: "XLU",  label: "Utilities"  },
  { sym: "XLC",  label: "Comms"      },
];

const CORE = ["SPY", "QQQ", "IWM", "VIX"];

function scoreColor(score: number) {
  if (score >= 6.5) return "var(--green-text)";
  if (score <= 3.5) return "var(--red-text)";
  return "var(--amber-text)";
}

function changePctColor(pct: number | null) {
  if (pct == null) return "var(--t-3)";
  if (pct > 0.5) return "var(--green-text)";
  if (pct < -0.5) return "var(--red-text)";
  return "var(--t-2)";
}

function heatBg(pct: number | null) {
  if (pct == null) return "var(--bg-3)";
  const intensity = Math.min(Math.abs(pct) / 3, 1); // max at 3% move
  if (pct > 0) return `rgba(16,185,129,${0.05 + intensity * 0.18})`;
  if (pct < 0) return `rgba(239,68,68,${0.05 + intensity * 0.18})`;
  return "var(--bg-3)";
}

function heatBorder(pct: number | null) {
  if (pct == null) return "var(--border-0)";
  const intensity = Math.min(Math.abs(pct) / 3, 1);
  if (pct > 0) return `rgba(16,185,129,${0.1 + intensity * 0.3})`;
  if (pct < 0) return `rgba(239,68,68,${0.1 + intensity * 0.3})`;
  return "var(--border-0)";
}

// Compute momentum score inline (mirrors page.tsx logic)
function computeScore(snap: any): number {
  let score = 5;
  const price = typeof snap?.price === "number" ? snap.price : null;
  const vwap  = typeof snap?.vwap  === "number" ? snap.vwap  : null;
  const atr   = typeof snap?.atr_14 === "number" ? snap.atr_14 : typeof snap?.expected_move_today === "number" ? snap.expected_move_today : null;

  if (price != null && vwap != null && atr && atr > 0) {
    const r = (price - vwap) / atr;
    if (r >= 0.5) score += 2.5; else if (r >= 0.1) score += 1.5;
    else if (r >= -0.1) score += 0; else if (r >= -0.5) score -= 1.5; else score -= 2.5;
  } else {
    if (snap?.vwap_state === "above") score += 2.0;
    if (snap?.vwap_state === "below") score -= 2.0;
  }

  const ema5 = snap?.ema_trend_5m, ema15 = snap?.ema_trend_15m;
  const bull = [ema5 === "bull", ema15 === "bull"].filter(Boolean).length;
  const bear = [ema5 === "bear", ema15 === "bear"].filter(Boolean).length;
  if (bull === 2) score += 2.5; else if (bull === 1) score += 1.0;
  else if (bear === 2) score -= 2.5; else if (bear === 1) score -= 1.0;

  const rsi = typeof snap?.rsi_1m === "number" ? snap.rsi_1m : null;
  if (rsi != null) {
    if (rsi >= 65) score += 1.5; else if (rsi >= 55) score += 0.75;
    else if (rsi >= 35) score -= 0.75; else score -= 1.5;
  }

  return Math.max(0, Math.min(10, +score.toFixed(1)));
}

function biasFrom(score: number): "bullish" | "bearish" | "neutral" {
  if (score >= 6.5) return "bullish";
  if (score <= 3.5) return "bearish";
  return "neutral";
}

export default function CorrelationDashboard({ activeSymbol, onSelectSymbol }: CorrelationDashboardProps) {
  const [coreData,    setCoreData]    = useState<Record<string, CorrelationData>>({});
  const [sectorData,  setSectorData]  = useState<Record<string, CorrelationData>>({});
  const [loading,     setLoading]     = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [tab,         setTab]         = useState<"core" | "sectors">("core");

  const fetchAll = useCallback(async () => {
    if (loading) return;
    setLoading(true);

    async function fetchOne(sym: string): Promise<CorrelationData> {
      try {
        const res  = await window.fetch(`/api/snapshot?symbol=${encodeURIComponent(sym)}`);
        const snap = await res.json();
        const score = computeScore(snap);
        return {
          symbol:     sym,
          price:      typeof snap?.price === "number" ? snap.price : null,
          change_pct: typeof snap?.change_pct === "number" ? snap.change_pct : null,
          score,
          bias:       biasFrom(score),
          vwap_state: snap?.vwap_state ?? null,
          ema5:       snap?.ema_trend_5m ?? null,
          ema15:      snap?.ema_trend_15m ?? null,
          atr:        typeof snap?.atr_14 === "number" ? snap.atr_14 : null,
        };
      } catch {
        return { symbol: sym, price: null, change_pct: null, score: 5, bias: "neutral", vwap_state: null, ema5: null, ema15: null, atr: null };
      }
    }

    // Fetch core first
    const coreResults: Record<string, CorrelationData> = {};
    for (const sym of CORE) {
      coreResults[sym] = await fetchOne(sym);
      await new Promise(r => setTimeout(r, 200));
    }
    setCoreData(coreResults);

    // Then sectors
    const sectorResults: Record<string, CorrelationData> = {};
    for (const { sym } of SECTORS) {
      sectorResults[sym] = await fetchOne(sym);
      await new Promise(r => setTimeout(r, 200));
    }
    setSectorData(sectorResults);

    setLastRefresh(new Date().toLocaleTimeString());
    setLoading(false);
  }, [loading]);

  // Alignment signal: how many of SPY/QQQ/IWM agree on bias
  const coreArr = CORE.filter(s => s !== "VIX").map(s => coreData[s]).filter(Boolean);
  const bullCount = coreArr.filter(d => d?.bias === "bullish").length;
  const bearCount = coreArr.filter(d => d?.bias === "bearish").length;
  const alignLabel = bullCount >= 2 ? "BULL ALIGNED" : bearCount >= 2 ? "BEAR ALIGNED" : "MIXED";
  const alignColor = bullCount >= 2 ? "var(--green-text)" : bearCount >= 2 ? "var(--red-text)" : "var(--amber-text)";
  const alignBg    = bullCount >= 2 ? "var(--green-bg)"   : bearCount >= 2 ? "var(--red-bg)"   : "var(--amber-bg)";
  const alignBorder= bullCount >= 2 ? "var(--green-border)": bearCount >= 2 ? "var(--red-border)": "var(--amber-border)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="panel-label">Correlation & Sectors</div>
          {lastRefresh && <div style={{ fontSize: 9, color: "var(--t-4)", marginTop: 2, fontFamily: "var(--font-mono)" }}>Updated {lastRefresh}</div>}
        </div>
        <button className="btn btn-primary" style={{ fontSize: 10 }} onClick={fetchAll} disabled={loading}>
          {loading ? "⟳ Scanning…" : "⟳ Refresh All"}
        </button>
      </div>

      {/* Market alignment badge */}
      {coreArr.length > 0 && (
        <div style={{ background: alignBg, border: `1px solid ${alignBorder}`, borderRadius: 7, padding: "7px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: alignColor, letterSpacing: "0.08em" }}>
            {alignLabel}
          </span>
          <span style={{ fontSize: 9, color: "var(--t-3)", fontFamily: "var(--font-mono)" }}>
            {bullCount}/3 bull · {bearCount}/3 bear
          </span>
        </div>
      )}

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 4 }}>
        {(["core", "sectors"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.07em",
              textTransform: "uppercase", padding: "4px 10px", borderRadius: 5,
              border: "1px solid", cursor: "pointer",
              background: tab === t ? "var(--bg-4)" : "var(--bg-3)",
              borderColor: tab === t ? "var(--border-2)" : "var(--border-0)",
              color: tab === t ? "var(--t-1)" : "var(--t-3)",
            }}>
            {t === "core" ? "Core (SPY/QQQ/IWM/VIX)" : "Sectors (11 ETFs)"}
          </button>
        ))}
      </div>

      {/* Core view */}
      {tab === "core" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {CORE.map(sym => {
            const d = coreData[sym];
            const isVix = sym === "VIX";
            return (
              <button key={sym} onClick={() => { if (!isVix) onSelectSymbol(sym); }}
                style={{
                  width: "100%", textAlign: "left", padding: "9px 12px", borderRadius: 8,
                  border: `1px solid ${d ? heatBorder(d.change_pct) : "var(--border-0)"}`,
                  background: d ? heatBg(d.change_pct) : "var(--bg-3)",
                  cursor: isVix ? "default" : "pointer",
                  transition: "border-color 70ms",
                  outline: activeSymbol === sym ? `1px solid var(--cyan)` : "none",
                }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--t-1)", letterSpacing: "0.04em", minWidth: 40 }}>{sym}</span>
                    {d ? (
                      <>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t-2)", fontVariantNumeric: "tabular-nums" }}>
                          {d.price != null ? `$${d.price.toFixed(2)}` : "—"}
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: changePctColor(d.change_pct) }}>
                          {d.change_pct != null ? `${d.change_pct > 0 ? "+" : ""}${d.change_pct.toFixed(2)}%` : "—"}
                        </span>
                      </>
                    ) : loading ? (
                      <span className="shimmer" style={{ width: 80, height: 12, borderRadius: 4 }} />
                    ) : <span style={{ fontSize: 10, color: "var(--t-4)" }}>—</span>}
                  </div>

                  {d && !isVix && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t-3)" }}>
                        {d.ema5 === "bull" ? "▲" : d.ema5 === "bear" ? "▼" : "—"}
                        {d.ema15 === "bull" ? "▲" : d.ema15 === "bear" ? "▼" : "—"}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: scoreColor(d.score) }}>{d.score.toFixed(1)}</span>
                    </div>
                  )}
                  {d && isVix && (
                    <span style={{ fontSize: 9, color: d.price && d.price > 20 ? "var(--red-text)" : d.price && d.price > 15 ? "var(--amber-text)" : "var(--green-text)", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                      {d.price && d.price > 20 ? "FEAR" : d.price && d.price > 15 ? "CAUTION" : "CALM"}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Sector heatmap */}
      {tab === "sectors" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5 }}>
            {SECTORS.map(({ sym, label }) => {
              const d = sectorData[sym];
              return (
                <button key={sym} onClick={() => onSelectSymbol(sym)}
                  style={{
                    padding: "9px 10px", borderRadius: 7, border: `1px solid ${d ? heatBorder(d.change_pct) : "var(--border-0)"}`,
                    background: d ? heatBg(d.change_pct) : "var(--bg-3)", cursor: "pointer",
                    transition: "border-color 70ms", textAlign: "center",
                    outline: activeSymbol === sym ? `1px solid var(--cyan)` : "none",
                  }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--t-1)" }}>{sym}</div>
                  <div style={{ fontSize: 9, color: "var(--t-3)", marginTop: 1 }}>{label}</div>
                  {d ? (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, marginTop: 4, color: changePctColor(d.change_pct) }}>
                      {d.change_pct != null ? `${d.change_pct > 0 ? "+" : ""}${d.change_pct.toFixed(2)}%` : "—"}
                    </div>
                  ) : loading ? (
                    <div className="shimmer" style={{ height: 10, marginTop: 5, borderRadius: 3 }} />
                  ) : <div style={{ fontSize: 10, color: "var(--t-4)", marginTop: 4 }}>—</div>}
                </button>
              );
            })}
          </div>
          {Object.keys(sectorData).length > 0 && (
            <div style={{ marginTop: 8, padding: "8px 10px", background: "var(--bg-3)", border: "1px solid var(--border-0)", borderRadius: 7 }}>
              <div className="label-xs" style={{ marginBottom: 5 }}>Sector Rotation Signal</div>
              {(() => {
                const sorted = SECTORS.map(({ sym, label }) => ({ sym, label, pct: sectorData[sym]?.change_pct ?? 0 }))
                  .sort((a, b) => b.pct - a.pct);
                const top = sorted[0], bot = sorted[sorted.length - 1];
                return (
                  <div style={{ fontSize: 10, color: "var(--t-2)", lineHeight: 1.5 }}>
                    <span style={{ color: "var(--green-text)", fontWeight: 700 }}>↑ {top.label} ({top.sym})</span>
                    {" "}leading · {" "}
                    <span style={{ color: "var(--red-text)", fontWeight: 700 }}>↓ {bot.label} ({bot.sym})</span>
                    {" "}lagging
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && Object.keys(tab === "core" ? coreData : sectorData).length === 0 && (
        <div className="empty-state">
          <div style={{ fontSize: 11, color: "var(--t-3)" }}>Click Refresh All to load correlation data.</div>
        </div>
      )}
    </div>
  );
}