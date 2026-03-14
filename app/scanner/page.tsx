"use client";
import React, { useState } from "react";
import WatchlistGroups from "@/components/WatchlistGroups";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScanResult {
  symbol: string;
  score: number;
  bias: "bullish" | "bearish" | "neutral";
  vwap_state: string | null;
  ema_trend_5m: string | null;
  ema_trend_15m: string | null;
  price: number | null;
  error?: string;
}

// ─── Helpers (mirrors page.tsx scoring engine) ────────────────────────────────

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function computeMomentumScore(input: any): number {
  let score = 5;
  const price = typeof input?.price === "number" ? input.price : null;
  const vwap  = typeof input?.vwap  === "number" ? input.vwap  : null;
  const atr   = typeof input?.atr_14 === "number" ? input.atr_14
              : typeof input?.expected_move_today === "number" ? input.expected_move_today
              : null;

  if (price != null && vwap != null && atr && atr > 0) {
    const r = (price - vwap) / atr;
    if      (r >= 0.5)  score += 2.5;
    else if (r >= 0.1)  score += 1.5;
    else if (r >= -0.1) score += 0;
    else if (r >= -0.5) score -= 1.5;
    else                score -= 2.5;
  } else {
    if (input?.vwap_state === "above") score += 2.0;
    if (input?.vwap_state === "below") score -= 2.0;
  }

  const ema5  = input?.ema_trend_5m;
  const ema15 = input?.ema_trend_15m;
  const bull  = [ema5 === "bull", ema15 === "bull"].filter(Boolean).length;
  const bear  = [ema5 === "bear", ema15 === "bear"].filter(Boolean).length;
  if (bull === 2) score += 2.5; else if (bull === 1) score += 1.0;
  else if (bear === 2) score -= 2.5; else if (bear === 1) score -= 1.0;

  const rsi = typeof input?.rsi_1m === "number" ? input.rsi_1m : null;
  if (rsi != null) {
    if      (rsi >= 65) score += 1.5;
    else if (rsi >= 55) score += 0.75;
    else if (rsi >= 35) score -= 0.75;
    else                score -= 1.5;
  }

  const volRatio = typeof input?.volume_ratio === "number" ? input.volume_ratio : null;
  if (volRatio != null) {
    if      (volRatio >= 2.0) score += 1.0;
    else if (volRatio >= 1.2) score += 0.5;
    else if (volRatio < 0.8)  score -= 0.5;
  } else {
    const v = String(input?.volume_state || "").toLowerCase();
    if (v.includes("above") || v.includes("surge")) score += 0.75;
    if (v.includes("below") || v.includes("thin"))  score -= 0.75;
  }

  return Number(clamp(score, 0, 10).toFixed(1));
}

function biasFrom(score: number): "bullish" | "bearish" | "neutral" {
  if (score >= 6.5) return "bullish";
  if (score <= 3.5) return "bearish";
  return "neutral";
}

function scoreColor(score: number) {
  if (score >= 6.5) return "var(--green-text)";
  if (score <= 3.5) return "var(--red-text)";
  return "var(--amber-text)";
}

function getWatchlistSymbols(): string[] {
  try {
    const raw = localStorage.getItem("rwp_watchlist_v2");
    if (!raw) return ["SPY", "QQQ", "AAPL", "TSLA", "NVDA"];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((i: any) => i.symbol || i).filter(Boolean)
      : ["SPY", "QQQ", "AAPL", "TSLA", "NVDA"];
  } catch {
    return ["SPY", "QQQ", "AAPL", "TSLA", "NVDA"];
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ScannerPage() {
  const [symbol,   setSymbol]   = useState("SPY");
  const [results,  setResults]  = useState<ScanResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [progress, setProgress] = useState<string[]>([]);

  async function runScan() {
    if (scanning) return;
    const tickers = getWatchlistSymbols();
    if (!tickers.length) return;
    setScanning(true);
    setResults([]);
    setProgress([]);

    const settled: ScanResult[] = [];

    for (const sym of tickers) {
      try {
        const res  = await fetch(`/api/snapshot?symbol=${encodeURIComponent(sym)}`);
        const snap = await res.json();
        if (!res.ok) throw new Error(snap?.error || "failed");

        const score = computeMomentumScore(snap);
        settled.push({
          symbol,
          score,
          bias:          biasFrom(score),
          vwap_state:    snap?.vwap_state    ?? null,
          ema_trend_5m:  snap?.ema_trend_5m  ?? null,
          ema_trend_15m: snap?.ema_trend_15m ?? null,
          price:         typeof snap?.price === "number" ? snap.price : null,
        });
        // Fix: push the correct sym not the state variable
        settled[settled.length - 1].symbol = sym;
      } catch (e: any) {
        settled.push({
          symbol: sym, score: 5, bias: "neutral",
          vwap_state: null, ema_trend_5m: null, ema_trend_15m: null,
          price: null, error: e?.message,
        });
      }
      setProgress(prev => [...prev, sym]);
      await new Promise(r => setTimeout(r, 300));
    }

    settled.sort((a, b) => {
      const aStr = a.bias === "bullish" ? a.score : a.bias === "bearish" ? 10 - a.score : 5;
      const bStr = b.bias === "bullish" ? b.score : b.bias === "bearish" ? 10 - b.score : 5;
      return bStr - aStr;
    });

    setResults(settled);
    setLastScan(new Date().toLocaleTimeString());
    setScanning(false);
    setProgress([]);
  }

  function handleSelect(sym: string) {
    setSymbol(sym);
  }

  const allTickers = getWatchlistSymbols();

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-1)", color: "var(--t-1)" }}>

      {/* ── Nav ── */}
      <nav className="topbar">
        <div className="topbar-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <a href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: "var(--cyan-bg)", border: "1px solid var(--cyan-border)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--cyan-text)" }}>RWP</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--t-1)" }}>Retail Weapon Pack</span>
            </a>
            <span style={{ color: "var(--border-1)" }}>·</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--cyan-text)", letterSpacing: "0.08em" }}>
              SCANNER
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <a href="/"        className="btn btn-ghost" style={{ textDecoration: "none", fontSize: 10 }}>← Dashboard</a>
            <a href="/brief"   className="btn btn-ghost" style={{ textDecoration: "none", fontSize: 10 }}>Pre-Market</a>
            <a href="/journal" className="btn btn-ghost" style={{ textDecoration: "none", fontSize: 10 }}>Journal</a>
            <button
              className="btn btn-primary"
              style={{ fontSize: 10 }}
              onClick={runScan}
              disabled={scanning}
            >
              {scanning ? "⟳ Scanning…" : "⚡ Scan All"}
            </button>
          </div>
        </div>
      </nav>

      {/* ── Body ── */}
      <div style={{
        maxWidth: 1280, margin: "0 auto", padding: "20px",
        display: "grid", gridTemplateColumns: "260px 1fr", gap: 14, alignItems: "start",
      }}>

        {/* Left: WatchlistGroups */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-label">Watchlist</span>
            {lastScan && (
              <span style={{ fontSize: 9, color: "var(--t-4)", fontFamily: "var(--font-mono)" }}>
                {results.length} scanned
              </span>
            )}
          </div>
          <div className="panel-body">
            <WatchlistGroups onSelect={handleSelect} activeSymbol={symbol} />
          </div>
        </div>

        {/* Right: Results */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-label">Scan Results</span>
            {lastScan && (
              <span style={{ fontSize: 9, color: "var(--t-4)", fontFamily: "var(--font-mono)" }}>
                Last scan {lastScan}
              </span>
            )}
          </div>
          <div className="panel-body">

            {/* Scanning progress */}
            {scanning && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 10, color: "var(--cyan-text)", fontFamily: "var(--font-mono)", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--cyan)", display: "inline-block" }} />
                  Scanning {allTickers.length} tickers…
                </div>
                {allTickers.map(sym => {
                  const done = progress.includes(sym);
                  return (
                    <div key={sym} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "6px 10px", borderRadius: 6,
                      border: `1px solid ${done ? "var(--green-border)" : "var(--border-0)"}`,
                      background: done ? "var(--green-bg)" : "var(--bg-3)",
                      transition: "all 200ms",
                    }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                        background: done ? "var(--green)" : "var(--t-4)",
                      }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--t-1)" }}>{sym}</span>
                      {done && (() => {
                        const r = results.find(x => x.symbol === sym);
                        return r ? (
                          <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: scoreColor(r.score) }}>
                            {r.score.toFixed(1)}
                          </span>
                        ) : null;
                      })()}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Results */}
            {!scanning && results.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {/* Legend */}
                <div style={{ display: "flex", gap: 10, paddingBottom: 6, borderBottom: "1px solid var(--border-0)", marginBottom: 2 }}>
                  {[
                    { color: "var(--green)", label: "Bullish" },
                    { color: "var(--red)",   label: "Bearish" },
                    { color: "var(--amber)", label: "Neutral" },
                  ].map(l => (
                    <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: l.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 9, color: "var(--t-4)", fontFamily: "var(--font-mono)" }}>{l.label}</span>
                    </div>
                  ))}
                  <span style={{ marginLeft: "auto", fontSize: 9, color: "var(--t-4)", fontFamily: "var(--font-mono)" }}>
                    Sorted by strength
                  </span>
                </div>

                {results.map(r => (
                  <button key={r.symbol}
                    onClick={() => { if (!r.error) handleSelect(r.symbol); }}
                    disabled={!!r.error}
                    style={{
                      width: "100%", textAlign: "left", padding: "11px 14px", borderRadius: 9,
                      border: `1px solid ${
                        r.bias === "bullish" ? "var(--green-border)"
                        : r.bias === "bearish" ? "var(--red-border)"
                        : "var(--border-0)"
                      }`,
                      background: r.bias === "bullish" ? "var(--green-bg)"
                        : r.bias === "bearish" ? "var(--red-bg)"
                        : "var(--bg-3)",
                      cursor: r.error ? "not-allowed" : "pointer",
                      opacity: r.error ? 0.4 : 1,
                      outline: symbol === r.symbol ? "1px solid var(--cyan)" : "none",
                      transition: "border-color 70ms",
                    }}
                    onMouseEnter={e => { if (!r.error) e.currentTarget.style.opacity = "0.85"; }}
                    onMouseLeave={e => { if (!r.error) e.currentTarget.style.opacity = "1"; }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 800, color: "var(--t-1)", letterSpacing: "0.04em" }}>
                          {r.symbol}
                        </span>
                        {r.error && <span style={{ fontSize: 9, color: "var(--t-4)" }}>error</span>}
                      </div>
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 800,
                        color: scoreColor(r.score), fontVariantNumeric: "tabular-nums",
                      }}>
                        {r.score.toFixed(1)}
                      </span>
                    </div>

                    {!r.error && (
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
                        {r.price != null && (
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t-2)", fontVariantNumeric: "tabular-nums" }}>
                            ${r.price.toFixed(2)}
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: "var(--t-3)" }}>
                          VWAP{" "}
                          <span style={{ fontWeight: 700, color: r.vwap_state === "above" ? "var(--green-text)" : "var(--red-text)" }}>
                            {r.vwap_state ?? "—"}
                          </span>
                        </span>
                        <span style={{ fontSize: 10, color: "var(--t-3)" }}>
                          5m{" "}
                          <span style={{ fontWeight: 700, color: r.ema_trend_5m === "bull" ? "var(--green-text)" : r.ema_trend_5m === "bear" ? "var(--red-text)" : "var(--t-4)" }}>
                            {r.ema_trend_5m === "bull" ? "▲" : r.ema_trend_5m === "bear" ? "▼" : "—"}
                          </span>
                        </span>
                        <span style={{ fontSize: 10, color: "var(--t-3)" }}>
                          15m{" "}
                          <span style={{ fontWeight: 700, color: r.ema_trend_15m === "bull" ? "var(--green-text)" : r.ema_trend_15m === "bear" ? "var(--red-text)" : "var(--t-4)" }}>
                            {r.ema_trend_15m === "bull" ? "▲" : r.ema_trend_15m === "bear" ? "▼" : "—"}
                          </span>
                        </span>
                        <span style={{
                          marginLeft: "auto",
                          fontSize: 9, fontFamily: "var(--font-mono)", fontWeight: 700,
                          letterSpacing: "0.07em", textTransform: "uppercase",
                          color: r.bias === "bullish" ? "var(--green-text)" : r.bias === "bearish" ? "var(--red-text)" : "var(--amber-text)",
                        }}>
                          {r.bias}
                        </span>
                      </div>
                    )}
                  </button>
                ))}

                <div style={{ textAlign: "center", fontSize: 9, color: "var(--t-4)", fontFamily: "var(--font-mono)", marginTop: 6 }}>
                  Click a ticker to select it in the watchlist · Navigate to dashboard to trade it
                </div>
              </div>
            )}

            {/* Empty state */}
            {!scanning && results.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>⚡</div>
                <div style={{ fontSize: 13, color: "var(--t-3)", marginBottom: 4 }}>Click Scan All to rank your watchlist.</div>
                <div style={{ fontSize: 10, color: "var(--t-4)" }}>
                  Reads your saved watchlist groups and scores each ticker.
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}