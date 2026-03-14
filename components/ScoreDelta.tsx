"use client";
// components/ScoreDelta.tsx
// Score delta / momentum acceleration tracker.
//
// What it does:
//   - Tracks the last N momentum scores from snapshot history
//   - Detects when score moves ≥ deltaThreshold points between consecutive snaps
//   - Fires a toast + sets an "acceleration alert" with direction
//   - Renders a mini sparkline chart of score over time with delta annotations
//   - Shows a "velocity" reading (rate of change per snapshot)
//
// Add to page.tsx:
//   import ScoreDelta from "@/components/ScoreDelta";
//   <ScoreDelta history={symbolHistory} symbol={symbol} />
// Put it inside the Alerts tab or directly below the score track in Snapshot panel.

import React, { useEffect, useRef, useState, useMemo } from "react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HistoryItem {
  id: string;
  ts: string;
  symbol: string;
  momentum_score: number | null;
  price: number | null;
  bias_guess: "bullish" | "bearish" | "neutral";
}

interface ScoreDeltaProps {
  history: HistoryItem[];           // symbolHistory from page.tsx (already filtered to current symbol)
  symbol: string;
  deltaThreshold?: number;          // default 2.0 — fire alert when score moves this much
  lookback?: number;                // how many snapshots to show in chart (default 12)
}

interface AccelAlert {
  from: number;
  to: number;
  delta: number;
  direction: "surge" | "collapse";
  ts: string;
  price: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  if (s >= 6.5) return "var(--green)";
  if (s <= 3.5) return "var(--red)";
  return "var(--amber)";
}

function scoreTextColor(s: number) {
  if (s >= 6.5) return "var(--green-text)";
  if (s <= 3.5) return "var(--red-text)";
  return "var(--amber-text)";
}

function deltaColor(d: number) {
  if (d >= 1.5)  return "var(--green-text)";
  if (d <= -1.5) return "var(--red-text)";
  return "var(--t-3)";
}

function velocityLabel(v: number): { label: string; color: string } {
  if (v >= 2.0)  return { label: "🚀 Surging",    color: "var(--green-text)"  };
  if (v >= 1.0)  return { label: "↑ Climbing",    color: "var(--green-text)"  };
  if (v >= 0.25) return { label: "→ Drifting Up", color: "var(--amber-text)"  };
  if (v >= -0.25)return { label: "⇌ Flat",        color: "var(--t-3)"         };
  if (v >= -1.0) return { label: "↓ Slipping",    color: "var(--amber-text)"  };
  if (v >= -2.0) return { label: "↓ Fading",      color: "var(--red-text)"    };
  return               { label: "💥 Collapsing",  color: "var(--red-text)"    };
}

// ─── Sparkline with delta markers ────────────────────────────────────────────

function ScoreChart({
  scores, timestamps, deltaThreshold
}: {
  scores: number[];
  timestamps: string[];
  deltaThreshold: number;
}) {
  if (scores.length < 2) return (
    <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontSize: 10, color: "var(--t-4)", fontFamily: "var(--font-mono)" }}>
        Need 2+ snapshots to render chart
      </span>
    </div>
  );

  const W = 100; // viewBox units (percentage-like)
  const H = 50;
  const PAD = 4;

  const min = Math.min(...scores, 0);
  const max = Math.max(...scores, 10);
  const range = max - min || 1;

  function x(i: number) {
    return PAD + (i / (scores.length - 1)) * (W - PAD * 2);
  }
  function y(v: number) {
    return PAD + (1 - (v - min) / range) * (H - PAD * 2);
  }

  const polyline = scores.map((s, i) => `${x(i)},${y(s)}`).join(" ");

  // Reference lines at score 3.5 and 6.5
  const y35 = y(3.5);
  const y65 = y(6.5);

  // Delta markers — show dot + line where delta exceeded threshold
  const deltaMarkers: { i: number; positive: boolean }[] = [];
  for (let i = 1; i < scores.length; i++) {
    const d = scores[i] - scores[i - 1];
    if (Math.abs(d) >= deltaThreshold) {
      deltaMarkers.push({ i, positive: d > 0 });
    }
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: 90, display: "block" }}
      preserveAspectRatio="none"
    >
      {/* Reference zone background */}
      <rect x={0} y={y65} width={W} height={y35 - y65}
        fill="rgba(255,255,255,0.02)" />

      {/* Reference lines */}
      <line x1={0} y1={y65} x2={W} y2={y65}
        stroke="rgba(16,185,129,0.2)" strokeWidth={0.5} strokeDasharray="2,2" />
      <line x1={0} y1={y35} x2={W} y2={y35}
        stroke="rgba(239,68,68,0.2)" strokeWidth={0.5} strokeDasharray="2,2" />

      {/* Midline at 5.0 */}
      <line x1={0} y1={y(5)} x2={W} y2={y(5)}
        stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />

      {/* Area fill under line */}
      <defs>
        <linearGradient id="score-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={scoreColor(scores[scores.length - 1])} stopOpacity="0.25" />
          <stop offset="100%" stopColor={scoreColor(scores[scores.length - 1])} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon
        points={`${x(0)},${H} ${polyline} ${x(scores.length - 1)},${H}`}
        fill="url(#score-fill)"
      />

      {/* Score line */}
      <polyline
        points={polyline}
        fill="none"
        stroke={scoreColor(scores[scores.length - 1])}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Delta markers */}
      {deltaMarkers.map(({ i, positive }) => (
        <g key={i}>
          <line
            x1={x(i)} y1={0} x2={x(i)} y2={H}
            stroke={positive ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}
            strokeWidth={0.75}
            strokeDasharray="1.5,1.5"
          />
          <circle
            cx={x(i)} cy={y(scores[i])}
            r={2.5}
            fill={positive ? "var(--green)" : "var(--red)"}
            stroke="var(--bg-1)" strokeWidth={0.8}
          />
        </g>
      ))}

      {/* Latest point */}
      <circle
        cx={x(scores.length - 1)}
        cy={y(scores[scores.length - 1])}
        r={3}
        fill={scoreColor(scores[scores.length - 1])}
        stroke="var(--bg-1)" strokeWidth={1}
      />

      {/* Score labels on left axis */}
      {[0, 3.5, 5, 6.5, 10].map(v => (
        <text key={v} x={1} y={y(v) + 1.5}
          fontSize={3.5} fill="rgba(255,255,255,0.2)" fontFamily="monospace">
          {v}
        </text>
      ))}
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ScoreDelta({
  history,
  symbol,
  deltaThreshold = 2.0,
  lookback = 12,
}: ScoreDeltaProps) {
  const [accelAlert, setAccelAlert] = useState<AccelAlert | null>(null);
  const [dismissed,  setDismissed]  = useState(false);
  const lastAlertKeyRef = useRef<string>("");

  // Filtered, chronological scores (oldest first for chart)
  const scores = useMemo(() => {
    return history
      .filter(h => typeof h.momentum_score === "number")
      .slice(0, lookback)
      .reverse()
      .map(h => h.momentum_score as number);
  }, [history, lookback]);

  const timestamps = useMemo(() => {
    return history
      .filter(h => typeof h.momentum_score === "number")
      .slice(0, lookback)
      .reverse()
      .map(h => h.ts);
  }, [history, lookback]);

  // Deltas between consecutive scores
  const deltas = useMemo(() => {
    const result: number[] = [];
    for (let i = 1; i < scores.length; i++) {
      result.push(Number((scores[i] - scores[i - 1]).toFixed(1)));
    }
    return result;
  }, [scores]);

  // Velocity = weighted average of last 3 deltas (more recent = more weight)
  const velocity = useMemo(() => {
    if (deltas.length === 0) return 0;
    const recent = deltas.slice(-3);
    const weights = recent.map((_, i) => i + 1);
    const wSum = weights.reduce((a, b) => a + b, 0);
    const weighted = recent.reduce((sum, d, i) => sum + d * weights[i], 0);
    return Number((weighted / wSum).toFixed(2));
  }, [deltas]);

  const latestScore  = scores[scores.length - 1] ?? null;
  const prevScore    = scores[scores.length - 2] ?? null;
  const latestDelta  = deltas[deltas.length - 1] ?? null;

  // Acceleration alert detection
  useEffect(() => {
    if (scores.length < 2) return;
    const last = scores[scores.length - 1];
    const prev = scores[scores.length - 2];
    const delta = last - prev;

    if (Math.abs(delta) < deltaThreshold) return;

    const alertKey = `${symbol}_${prev.toFixed(1)}_${last.toFixed(1)}`;
    if (lastAlertKeyRef.current === alertKey) return;
    lastAlertKeyRef.current = alertKey;

    const latest = history.find(h => typeof h.momentum_score === "number");
    const alert: AccelAlert = {
      from:      prev,
      to:        last,
      delta,
      direction: delta > 0 ? "surge" : "collapse",
      ts:        latest?.ts ?? new Date().toISOString(),
      price:     latest?.price ?? null,
    };

    setAccelAlert(alert);
    setDismissed(false);

    if (delta > 0) {
      toast.success(
        `⚡ Score Surge: ${symbol} +${delta.toFixed(1)} pts (${prev.toFixed(1)} → ${last.toFixed(1)})`,
        { duration: 7000 }
      );
    } else {
      toast.error(
        `⚠ Score Collapse: ${symbol} ${delta.toFixed(1)} pts (${prev.toFixed(1)} → ${last.toFixed(1)})`,
        { duration: 7000 }
      );
    }
  }, [scores, symbol, deltaThreshold, history]);

  const vel = velocityLabel(velocity);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Acceleration alert banner */}
      {accelAlert && !dismissed && (
        <div style={{
          background: accelAlert.direction === "surge" ? "var(--green-bg)" : "var(--red-bg)",
          border: `1px solid ${accelAlert.direction === "surge" ? "var(--green-border)" : "var(--red-border)"}`,
          borderRadius: 8, padding: "10px 13px",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10,
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, letterSpacing: "0.06em",
              color: accelAlert.direction === "surge" ? "var(--green-text)" : "var(--red-text)",
            }}>
              {accelAlert.direction === "surge" ? "⚡ SCORE SURGE" : "⚠ SCORE COLLAPSE"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--t-1)" }}>
                {accelAlert.from.toFixed(1)}
              </span>
              <span style={{ fontSize: 11, color: "var(--t-3)" }}>→</span>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 800,
                color: accelAlert.direction === "surge" ? "var(--green-text)" : "var(--red-text)",
              }}>
                {accelAlert.to.toFixed(1)}
              </span>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
                color: accelAlert.direction === "surge" ? "var(--green-text)" : "var(--red-text)",
              }}>
                ({accelAlert.delta > 0 ? "+" : ""}{accelAlert.delta.toFixed(1)} pts)
              </span>
            </div>
            {accelAlert.price != null && (
              <div style={{ fontSize: 9, color: "var(--t-3)", fontFamily: "var(--font-mono)" }}>
                @ ${accelAlert.price.toFixed(2)} · {new Date(accelAlert.ts).toLocaleTimeString()}
              </div>
            )}
            <div style={{ fontSize: 10, color: "var(--t-2)", marginTop: 2 }}>
              {accelAlert.direction === "surge"
                ? "Momentum accelerating. Favor continuation entries. High-conviction signal."
                : "Momentum fading. Reduce exposure. Wait for stabilization before new entries."}
            </div>
          </div>
          <button
            onClick={() => setDismissed(true)}
            style={{ fontSize: 10, color: "var(--t-4)", background: "none", border: "none", cursor: "pointer", flexShrink: 0, marginTop: 2 }}
          >✕</button>
        </div>
      )}

      {/* Current score + velocity row */}
      {latestScore != null && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {/* Current score */}
          <div className="metric-tile">
            <div className="label-xs" style={{ marginBottom: 4 }}>Score Now</div>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 800,
              color: scoreTextColor(latestScore), fontVariantNumeric: "tabular-nums", lineHeight: 1,
            }}>
              {latestScore.toFixed(1)}
            </div>
          </div>

          {/* Last delta */}
          <div className="metric-tile">
            <div className="label-xs" style={{ marginBottom: 4 }}>Δ Last</div>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 800,
              color: latestDelta != null ? deltaColor(latestDelta) : "var(--t-3)",
              fontVariantNumeric: "tabular-nums", lineHeight: 1,
            }}>
              {latestDelta != null
                ? `${latestDelta > 0 ? "+" : ""}${latestDelta.toFixed(1)}`
                : "—"}
            </div>
          </div>

          {/* Velocity */}
          <div className="metric-tile">
            <div className="label-xs" style={{ marginBottom: 4 }}>Velocity</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: vel.color, lineHeight: 1.3, marginTop: 4 }}>
              {vel.label}
            </div>
          </div>
        </div>
      )}

      {/* Score history chart */}
      <div style={{ background: "var(--bg-3)", border: "1px solid var(--border-0)", borderRadius: 8, padding: "10px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div className="label-xs">Score Acceleration Chart</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 8, color: "var(--t-4)", fontFamily: "var(--font-mono)" }}>
              Last {scores.length} snaps
            </span>
            {/* Legend */}
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { color: "var(--green)", label: "Surge" },
                { color: "var(--red)",   label: "Collapse" },
              ].map(l => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: l.color, display: "inline-block" }} />
                  <span style={{ fontSize: 8, color: "var(--t-4)", fontFamily: "var(--font-mono)" }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <ScoreChart scores={scores} timestamps={timestamps} deltaThreshold={deltaThreshold} />

        {/* X axis time labels */}
        {timestamps.length >= 2 && (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
            <span style={{ fontSize: 8, color: "var(--t-4)", fontFamily: "var(--font-mono)" }}>
              {new Date(timestamps[0]).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span style={{ fontSize: 8, color: "var(--t-4)", fontFamily: "var(--font-mono)" }}>
              {new Date(timestamps[timestamps.length - 1]).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        )}
      </div>

      {/* Delta history table */}
      {deltas.length > 0 && (
        <div style={{ background: "var(--bg-3)", border: "1px solid var(--border-0)", borderRadius: 8, padding: "10px 12px" }}>
          <div className="label-xs" style={{ marginBottom: 7 }}>Delta Log (newest first)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {deltas.slice().reverse().slice(0, 8).map((d, i) => {
              const scoreIdx = scores.length - 1 - i;
              const s = scores[scoreIdx];
              const ts = timestamps[scoreIdx];
              const isBig = Math.abs(d) >= deltaThreshold;
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "5px 8px", borderRadius: 5,
                  background: isBig
                    ? d > 0 ? "var(--green-bg)" : "var(--red-bg)"
                    : "transparent",
                  border: `1px solid ${isBig
                    ? d > 0 ? "var(--green-border)" : "var(--red-border)"
                    : "transparent"}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
                      color: d > 0 ? "var(--green-text)" : d < 0 ? "var(--red-text)" : "var(--t-3)",
                      minWidth: 36,
                    }}>
                      {d > 0 ? "+" : ""}{d.toFixed(1)}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t-2)", fontVariantNumeric: "tabular-nums" }}>
                      → {typeof s === "number" ? s.toFixed(1) : "—"}
                    </span>
                    {isBig && (
                      <span style={{
                        fontSize: 8, fontFamily: "var(--font-mono)", fontWeight: 700,
                        color: d > 0 ? "var(--green-text)" : "var(--red-text)",
                        letterSpacing: "0.07em",
                      }}>
                        {d > 0 ? "SURGE" : "DROP"}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 8, color: "var(--t-4)", fontFamily: "var(--font-mono)" }}>
                    {ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {scores.length < 2 && (
        <div className="empty-state">
          <div style={{ fontSize: 20, marginBottom: 6 }}>📈</div>
          <div style={{ fontSize: 11, color: "var(--t-3)" }}>Fetch 2+ snapshots to activate.</div>
          <div style={{ fontSize: 9, color: "var(--t-4)", marginTop: 3, lineHeight: 1.5 }}>
            Alerts when score moves ≥{deltaThreshold} pts between snapshots.
          </div>
        </div>
      )}

      {/* Settings row */}
      <div style={{ fontSize: 9, color: "var(--t-4)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", gap: 6 }}>
        <span>Alert threshold: ±{deltaThreshold} pts</span>
        <span>·</span>
        <span>Lookback: {lookback} snaps</span>
        <span>·</span>
        <span style={{ color: vel.color }}>{vel.label}</span>
      </div>
    </div>
  );
}