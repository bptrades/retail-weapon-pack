"use client";

import { useMemo, useState } from "react";

type PlanItem = { if: string; then: string; risk: string };
type Plan = {
  bias: "bullish" | "bearish" | "neutral";
  thesis: string;
  playbook: PlanItem[];
  danger_zones: string[];
  confidence: number; // not displayed directly
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
    `Plan:`,
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

/**
 * TradingView embedded chart (no extra API needed).
 * Note: Exchange prefixes vary across tickers. AMEX works for SPY and many ETFs.
 * If you want perfect routing later, we can add a small exchange map or let TradingView search.
 */
function tvSymbolForInput(raw: string) {
  const sym = raw.toUpperCase().trim();

  // Common index mappings on TradingView
  const indexMap: Record<string, string> = {
    SPX: "SP:SPX",
    NDX: "NASDAQ:NDX",
    VIX: "CBOE:VIX",
    DJI: "DJ:DJI",
    RUT: "RUSSELL:RUT"
  };

  if (indexMap[sym]) return indexMap[sym];

  // Most reliable ETF mappings
  const etfMap: Record<string, string> = {
    SPY: "AMEX:SPY",
    QQQ: "NASDAQ:QQQ",
    IWM: "AMEX:IWM",
    DIA: "AMEX:DIA"
  };

  if (etfMap[sym]) return etfMap[sym];

  // Default: no exchange prefix; TradingView will usually resolve (AAPL/TSLA/NVDA/etc.)
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
    typeof s === "string"
      ? s.replaceAll("SPY", sym).replaceAll("Spy", sym).replaceAll("spy", sym)
      : s;

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



export default function Home() {
  const [symbol, setSymbol] = useState("SPY");
  const [inputJsonText, setInputJsonText] = useState(JSON.stringify(defaultInput, null, 2));

  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState("");

  const [marketOpen, setMarketOpen] = useState(false);
  const [usingLastSession, setUsingLastSession] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

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

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  }

  async function fetchSnapshotIntoEditor() {
    setError("");
    try {
      const res = await fetch(`/api/snapshot?symbol=${encodeURIComponent(symbol)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Snapshot failed");

      const s = String(data?.symbol || symbol).toUpperCase();
      setSymbol(s);

      setUsingLastSession(!!data.using_last_session_data);
      setMarketOpen(!!data.market_open);
      setInputJsonText(JSON.stringify(data, null, 2));

      showToast("Snapshot loaded.");
    } catch (e: any) {
      setError(e?.message || "Snapshot error");
    }
  }

  async function runAll() {
    setError("");
    setPlan(null);
    setLoading(true);

    try {
      const snapRes = await fetch(`/api/snapshot?symbol=${encodeURIComponent(symbol)}`);
      const snap = await snapRes.json();
      if (!snapRes.ok) throw new Error(snap?.error || "Snapshot failed");

      const s = String(snap?.symbol || symbol).toUpperCase();
      setSymbol(s);

      setUsingLastSession(!!snap.using_last_session_data);
      setMarketOpen(!!snap.market_open);
      setInputJsonText(JSON.stringify(snap, null, 2));

      const planRes = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputJson: snap })
      });
      const planData = await planRes.json();
      if (!planRes.ok) throw new Error(planData?.error || "Plan failed");

      setPlan(applySymbolToPlan(planData, String(snap?.symbol || symbol)) as Plan);
      showToast("Plan generated.");
    } catch (e: any) {
      setError(e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function generatePlan() {
    setError("");
    setPlan(null);

    if (!inputObj) {
      setError("Your snapshot JSON is not valid.");
      return;
    }

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

      setPlan(applySymbolToPlan(data, String(inputObj?.symbol || symbol)) as Plan);
      showToast("Plan generated from edited JSON.");
    } catch (e: any) {
      setError(e?.message || "Unknown error");
    } finally {
      setLoading(false);
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

  const styles = {
    page: {
      minHeight: "100vh",
      background: "linear-gradient(180deg, #0b1220 0%, #0b1220 35%, #0f172a 100%)",
      color: "#e5e7eb"
    } as React.CSSProperties,
    shell: { maxWidth: 1150, margin: "0 auto", padding: "22px 16px 40px" } as React.CSSProperties,
    headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" } as React.CSSProperties,
    title: { fontSize: 28, margin: 0, letterSpacing: "-0.02em" } as React.CSSProperties,
    subtitle: { margin: "8px 0 0", opacity: 0.85, maxWidth: 780, lineHeight: 1.35 } as React.CSSProperties,
    cardGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16, alignItems: "start" } as React.CSSProperties,
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
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>Intraday Bias Engine</h1>
            <p style={styles.subtitle}>
              Pick a symbol → one click pulls a snapshot → generates a mechanical plan → gives you a copy-ready X post.
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
            </div>

            {usingLastSession && <div style={styles.banner}>Using last available session data (market likely closed).</div>}
          </div>

          <div style={{ opacity: 0.85, fontSize: 12, textAlign: "right" }}>
            <div style={{ fontWeight: 700 }}>Retail Weapon Pack</div>
            <div style={{ opacity: 0.75 }}>by @bptrades</div>
          </div>
        </div>

        <div style={styles.cardGrid}>
          {/* LEFT */}
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Dashboard</h2>

            {/* Symbol Picker */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
              <span style={styles.label}>Symbol</span>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase().trim())}
                placeholder="SPY"
                style={{ ...styles.input, width: 120 }}
              />
              <span style={{ ...styles.label, opacity: 0.65 }}>Examples: SPY, QQQ, AAPL, TSLA, NVDA</span>
            </div>

            {/* Chart */}
            <TradingViewChart symbol={symbol} />

            {/* Snapshot Stats */}
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

            {/* Buttons */}
            <div style={styles.btnRow}>
              <button onClick={runAll} disabled={loading} style={styles.btnPrimary}>
                {loading ? "Running..." : "Run Weapon Pack"}
              </button>

              <button onClick={fetchSnapshotIntoEditor} disabled={loading} style={styles.btn}>
                Fetch Snapshot
              </button>

              <button onClick={generatePlan} disabled={loading} style={styles.btn}>
                {loading ? "Generating..." : "Generate Plan"}
              </button>

              <button
                onClick={() => {
                  setUsingLastSession(false);
                  setMarketOpen(false);
                  setPlan(null);
                  setError("");
                  setInputJsonText(JSON.stringify({ ...defaultInput, symbol }, null, 2));
                  showToast("Reset.");
                }}
                disabled={loading}
                style={styles.btnDanger}
              >
                Reset Example
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

            {/* Advanced JSON */}
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

          {/* RIGHT */}
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>AI Plan Output</h2>

            {!plan && !loading && (
              <div style={{ opacity: 0.75, lineHeight: 1.4 }}>
                Click <b>Run Weapon Pack</b> to generate a full plan automatically.
              </div>
            )}

            {plan && (
              <>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                  <span
                    style={{
                      ...styles.pill,
                      background: biasTone.bg,
                      borderColor: biasTone.border,
                      color: biasTone.text
                    }}
                  >
                    Bias: <b>{plan.bias}</b>
                  </span>
                  <span style={styles.pill}>
                    Mode: <b>{String(inputObj?.symbol || symbol).toUpperCase() === "SPY" ? "0-DTE style" : "Intraday"}</b>
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
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap"
                    }}
                  >
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

        {/* Toast */}
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