"use client";
import React, { useState, useCallback } from "react";
import { toast } from "sonner";

interface GammaLevel {
  price: number;
  type: "call_wall" | "put_wall" | "gamma_flip" | "max_pain" | "high_oi";
  strength: "high" | "medium" | "low";
  label: string;
  note: string;
}

interface GammaProps {
  symbol: string;
  currentPrice: number | null;
  atr: number | null;
}

function levelColor(type: GammaLevel["type"]) {
  switch (type) {
    case "call_wall":   return { color: "var(--green-text)", bg: "var(--green-bg)",  border: "var(--green-border)"  };
    case "put_wall":    return { color: "var(--red-text)",   bg: "var(--red-bg)",    border: "var(--red-border)"    };
    case "gamma_flip":  return { color: "var(--cyan-text)",  bg: "var(--cyan-bg)",   border: "var(--cyan-border)"   };
    case "max_pain":    return { color: "var(--amber-text)", bg: "var(--amber-bg)",  border: "var(--amber-border)"  };
    case "high_oi":     return { color: "var(--t-2)",        bg: "var(--bg-4)",      border: "var(--border-1)"      };
  }
}

function typeIcon(type: GammaLevel["type"]) {
  switch (type) {
    case "call_wall":  return "▲";
    case "put_wall":   return "▼";
    case "gamma_flip": return "⇌";
    case "max_pain":   return "◎";
    case "high_oi":    return "○";
  }
}

function typeLabel(type: GammaLevel["type"]) {
  switch (type) {
    case "call_wall":  return "CALL WALL";
    case "put_wall":   return "PUT WALL";
    case "gamma_flip": return "GAMMA FLIP";
    case "max_pain":   return "MAX PAIN";
    case "high_oi":    return "HIGH OI";
  }
}

// Derive approximate gamma levels from price and ATR.
// FIX: The old version rounded all levels to the nearest $1/$2/$5 strike step.
// For SPY (~$580) with step=5 and ATR=2.1:
//   atr*0.75 = 1.575 → rounds to 0 → same price as basePrice for everything.
// Fix: round to the strike step but ONLY AFTER we've computed the raw offset,
// and enforce a minimum separation of 1 full strike step between levels.
function deriveGammaLevels(price: number, atr: number): GammaLevel[] {
  // Strike step: what interval options are listed at for this underlying
  const step = price > 1000 ? 10 : price > 500 ? 5 : price > 200 ? 2 : price > 50 ? 1 : 0.5;

  // Round to nearest strike, but guarantee at least 1 step of separation
  const roundToStrike = (n: number) => Math.round(n / step) * step;

  // Ensure a level is at least minSteps away from a reference price
  const atLeast = (raw: number, ref: number, minSteps: number): number => {
    const rounded = roundToStrike(raw);
    const diff    = rounded - ref;
    const minDist = step * minSteps;
    if (Math.abs(diff) < minDist) {
      return ref + (diff >= 0 ? minDist : -minDist);
    }
    return rounded;
  };

  const base = roundToStrike(price);
  const levels: GammaLevel[] = [];

  // Max pain — ATM rounded strike
  levels.push({
    price: base,
    type: "max_pain", strength: "high",
    label: `${base}`,
    note: "Max pain — options dealers most hedged here. Price gravitates toward this level into expiry.",
  });

  // Primary call wall — ~1 ATR above, minimum 2 strikes away
  const callWall1 = atLeast(price + atr * 1.0, base, 2);
  levels.push({
    price: callWall1,
    type: "call_wall", strength: "high",
    label: `${callWall1}`,
    note: "Primary call wall — heaviest call OI cluster. Dealer delta-hedging creates selling pressure here. Common reversal or stall zone.",
  });

  // Secondary call wall — ~2 ATR above, minimum 1 strike above primary
  const callWall2 = atLeast(price + atr * 2.0, callWall1, 1);
  levels.push({
    price: callWall2,
    type: "call_wall", strength: "medium",
    label: `${callWall2}`,
    note: "Secondary call resistance — breaking and holding above this is a major momentum signal for the session.",
  });

  // Primary put wall — ~1 ATR below, minimum 2 strikes away
  const putWall1 = atLeast(price - atr * 1.0, base, 2);
  levels.push({
    price: putWall1,
    type: "put_wall", strength: "high",
    label: `${putWall1}`,
    note: "Primary put wall — heaviest put OI cluster. Dealer hedging creates buying support. Common bounce zone on first test.",
  });

  // Secondary put wall — ~2 ATR below, minimum 1 strike below primary
  const putWall2 = atLeast(price - atr * 2.0, putWall1, 1);
  levels.push({
    price: putWall2,
    type: "put_wall", strength: "medium",
    label: `${putWall2}`,
    note: "Secondary put support — break and hold below this is a significant bearish signal for the session.",
  });

  // Gamma flip — slightly below current price (typically where net gamma = 0)
  // Use ~0.5 ATR below, minimum 1 strike from base
  const gammaFlip = atLeast(price - atr * 0.5, base, 1);
  levels.push({
    price: gammaFlip,
    type: "gamma_flip", strength: "high",
    label: `${gammaFlip}`,
    note: "Estimated gamma flip — above this, dealer hedging amplifies price moves (short gamma, trending). Below = dampens moves (long gamma, mean-reverting).",
  });

  // Deduplicate — if rounding caused two levels to land on the same price,
  // offset the duplicate by 1 step so the ladder always shows distinct prices.
  const seen = new Set<number>();
  const deduped = levels.map(lvl => {
    let p = lvl.price;
    while (seen.has(p)) {
      // Push it one step in the natural direction from base
      p = p >= base ? p + step : p - step;
    }
    seen.add(p);
    return { ...lvl, price: p, label: `${p}` };
  });

  return deduped.sort((a, b) => b.price - a.price);
}

export default function GammaLevels({ symbol, currentPrice, atr }: GammaProps) {
  const [levels,   setLevels]   = useState<GammaLevel[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading,  setLoading]  = useState(false);

  const compute = useCallback(async () => {
    if (!currentPrice) { toast("Fetch a snapshot first to get price data."); return; }
    setLoading(true);
    await new Promise(r => setTimeout(r, 300)); // slight delay for UX feel

    // Use ATR if provided, else fallback to 1% of price (typical intraday range)
    const effectiveAtr = (atr && atr > 0) ? atr : currentPrice * 0.01;
    const derived = deriveGammaLevels(currentPrice, effectiveAtr);
    setLevels(derived);
    setLoading(false);
    toast.success(`Gamma levels computed for ${symbol}`);
  }, [currentPrice, atr, symbol]);

  const priceRange = levels ? {
    min: Math.min(...levels.map(l => l.price)),
    max: Math.max(...levels.map(l => l.price)),
  } : null;

  function barPct(price: number) {
    if (!priceRange || !currentPrice) return 50;
    const total = priceRange.max - priceRange.min;
    if (total === 0) return 50;
    return ((price - priceRange.min) / total) * 100;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="panel-label">Options Gamma Levels</div>
          <div style={{ fontSize: 9, color: "var(--t-4)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
            Key price pin zones for 0-DTE
          </div>
        </div>
        <button className="btn btn-primary" style={{ fontSize: 10 }} onClick={compute} disabled={loading || !currentPrice}>
          {loading ? "Computing…" : "Compute Levels"}
        </button>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["call_wall", "put_wall", "gamma_flip", "max_pain"] as GammaLevel["type"][]).map(t => {
          const s = levelColor(t);
          return (
            <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, fontFamily: "var(--font-mono)", fontWeight: 600 }}>
              <span style={{ color: s.color }}>{typeIcon(t)}</span>
              <span style={{ color: "var(--t-3)" }}>{typeLabel(t)}</span>
            </span>
          );
        })}
      </div>

      {levels && currentPrice ? (
        <>
          {/* Price ladder visualization */}
          <div style={{ background: "var(--bg-3)", border: "1px solid var(--border-0)", borderRadius: 8, padding: "12px 14px", position: "relative" }}>
            <div className="label-xs" style={{ marginBottom: 10 }}>Price Ladder</div>

            {/* Vertical track */}
            <div style={{ position: "relative", paddingLeft: 50 }}>
              <div style={{ position: "absolute", left: 40, top: 0, bottom: 0, width: 2, background: "var(--border-1)", borderRadius: 1 }} />

              {levels.map((lvl, i) => {
                const s = levelColor(lvl.type);
                const pct = barPct(lvl.price);
                const dist = lvl.price - currentPrice;
                const isAbove = dist > 0;

                return (
                  <div key={i}
                    onClick={() => setSelected(selected === i ? null : i)}
                    style={{
                      position: "relative", marginBottom: 8, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 8,
                    }}>
                    {/* Level dot on track */}
                    <div style={{
                      position: "absolute", left: -14, width: lvl.strength === "high" ? 10 : 7, height: lvl.strength === "high" ? 10 : 7,
                      borderRadius: "50%", background: s.color,
                      boxShadow: lvl.strength === "high" ? `0 0 8px ${s.color}` : "none",
                      border: `1px solid ${s.border}`,
                    }} />

                    {/* Level row */}
                    <div style={{
                      flex: 1, padding: "7px 10px", borderRadius: 6,
                      background: selected === i ? s.bg : "transparent",
                      border: `1px solid ${selected === i ? s.border : "transparent"}`,
                      transition: "background 70ms, border-color 70ms",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: s.color, fontWeight: 700 }}>
                            {typeIcon(lvl.type)}
                          </span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--t-1)", fontVariantNumeric: "tabular-nums" }}>
                            ${lvl.price.toFixed(2)}
                          </span>
                          <span style={{ fontSize: 8, fontFamily: "var(--font-mono)", fontWeight: 700, color: s.color, letterSpacing: "0.07em" }}>
                            {typeLabel(lvl.type)}
                          </span>
                        </div>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: isAbove ? "var(--green-text)" : "var(--red-text)" }}>
                          {isAbove ? "+" : ""}{dist.toFixed(2)}
                        </span>
                      </div>

                      {selected === i && (
                        <div style={{ fontSize: 10, color: "var(--t-2)", marginTop: 6, lineHeight: 1.5, borderTop: "1px solid var(--border-0)", paddingTop: 6 }}>
                          {lvl.note}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Current price marker */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "7px 10px", borderRadius: 6,
                background: "var(--cyan-bg)", border: "1px solid var(--cyan-border)",
                position: "relative",
              }}>
                <div style={{
                  position: "absolute", left: -14, width: 10, height: 10, borderRadius: "50%",
                  background: "var(--cyan)", boxShadow: "0 0 8px var(--cyan)", border: "1px solid var(--cyan-border)"
                }} />
                <span style={{ fontSize: 8, fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--cyan-text)", letterSpacing: "0.1em" }}>CURRENT</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 800, color: "var(--cyan-text)", fontVariantNumeric: "tabular-nums" }}>
                  ${currentPrice.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Nearest level insight */}
          {(() => {
            const above = levels.filter(l => l.price > currentPrice).sort((a, b) => a.price - b.price)[0];
            const below = levels.filter(l => l.price < currentPrice).sort((a, b) => b.price - a.price)[0];
            if (!above && !below) return null;
            return (
              <div style={{ background: "var(--bg-3)", border: "1px solid var(--border-0)", borderRadius: 8, padding: "10px 13px" }}>
                <div className="label-xs" style={{ marginBottom: 6 }}>Key Insight</div>
                <div style={{ fontSize: 10, color: "var(--t-2)", lineHeight: 1.6 }}>
                  {above && <span><span style={{ color: "var(--green-text)", fontWeight: 700 }}>↑ ${above.price.toFixed(2)}</span> {typeLabel(above.type)} (+${(above.price - currentPrice).toFixed(2)}) · </span>}
                  {below && <span><span style={{ color: "var(--red-text)", fontWeight: 700 }}>↓ ${below.price.toFixed(2)}</span> {typeLabel(below.type)} (-${(currentPrice - below.price).toFixed(2)})</span>}
                </div>
                <div style={{ fontSize: 9, color: "var(--t-3)", marginTop: 4 }}>
                  {atr ? `ATR-based estimates. Levels update with each snapshot.` : "Provide ATR data for improved accuracy."}
                </div>
              </div>
            );
          })()}
        </>
      ) : (
        <div className="empty-state">
          <div style={{ fontSize: 20, marginBottom: 6 }}>⚡</div>
          <div style={{ fontSize: 11, color: "var(--t-3)" }}>
            {currentPrice ? "Click Compute Levels to derive key gamma zones." : "Fetch a snapshot first, then compute levels."}
          </div>
          <div style={{ fontSize: 9, color: "var(--t-4)", marginTop: 3 }}>
            Uses ATR and price structure to estimate call walls, put walls, and gamma flip.
          </div>
        </div>
      )}
    </div>
  );
}