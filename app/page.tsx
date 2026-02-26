"use client";

import { useMemo, useState } from "react";

type PlanItem = { if: string; then: string; risk: string };
type Plan = {
  bias: "bullish" | "bearish" | "neutral";
  thesis: string;
  playbook: PlanItem[];
  danger_zones: string[];
  confidence: number;
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

function formatXPost(input: any, plan: Plan) {
  const levels = input?.key_levels || {};
  const vwap = input?.vwap;

  return [
    `SPY 0-DTE Bias: ${String(plan.bias).toUpperCase()} (Confidence ${Number(plan.confidence).toFixed(2)})`,
    `Score: ${input?.momentum_score ?? "N/A"}`,
    ``,
    `${plan.thesis}`,
    ``,
    `Key levels: VWAP ${vwap} | PMH ${levels.premarket_high} | PML ${levels.premarket_low} | YH ${levels.yesterday_high} | YL ${levels.yesterday_low}`,
    ``,
    `Plan:`,
    ...plan.playbook.map((p) => `• IF ${p.if} THEN ${p.then} (Risk: ${p.risk})`),
    ``,
    `Avoid:`,
    ...plan.danger_zones.map((d) => `• ${d}`)
  ].join("\n");
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// Simple, explainable 0–10 scoring
function computeMomentumScore(input: any) {
  let score = 5; // start neutral

  // VWAP state
  if (input?.vwap_state === "above") score += 2.5;
  if (input?.vwap_state === "below") score -= 2.5;

  // EMA trends
  if (input?.ema_trend_5m === "bull") score += 1.5;
  if (input?.ema_trend_5m === "bear") score -= 1.5;

  if (input?.ema_trend_15m === "bull") score += 1.5;
  if (input?.ema_trend_15m === "bear") score -= 1.5;

  // RSI state (keep flexible)
  const rsiState = String(input?.rsi_state || "").toLowerCase();
  if (rsiState.includes("bull")) score += 1;
  if (rsiState.includes("bear")) score -= 1;

  // Volume state
  const volState = String(input?.volume_state || "").toLowerCase();
  if (volState.includes("above")) score += 0.75;
  if (volState.includes("below")) score -= 0.75;

  return Number(clamp(score, 0, 10).toFixed(1));
}
export default function Home() {
  const [inputJsonText, setInputJsonText] = useState(JSON.stringify(defaultInput, null, 2));
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState("");

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

  async function generatePlan() {
    setError("");
    setPlan(null);

    if (!inputObj) {
      setError("Your INPUT_JSON is not valid JSON.");
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

      setPlan(data as Plan);
    } catch (e: any) {
      setError(e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 20, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, marginBottom: 6 }}>SPY 0-DTE Bias Engine</h1>
      <p style={{ opacity: 0.8, marginTop: 0 }}>Paste/update your indicator snapshot → generate plan → copy X post.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14 }}>
          <h2 style={{ fontSize: 18, marginTop: 0 }}>INPUT_JSON</h2>
          <textarea
            value={inputJsonText}
            onChange={(e) => setInputJsonText(e.target.value)}
            rows={22}
            style={{
              width: "100%",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 12
            }}
          />

          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button onClick={generatePlan} disabled={loading} style={{ padding: "10px 12px", borderRadius: 10 }}>
              {loading ? "Generating..." : "Generate Plan"}
            </button>
            <button
  onClick={async () => {
    setError("");
    try {
      const res = await fetch("/api/snapshot");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Snapshot failed");
      setInputJsonText(JSON.stringify(data, null, 2));
    } catch (e: any) {
      setError(e?.message || "Snapshot error");
    }
  }}
  style={{ padding: "10px 12px", borderRadius: 10 }}
>
  Fetch Live Snapshot
</button>

            <button
              onClick={() => setInputJsonText(JSON.stringify(defaultInput, null, 2))}
              style={{ padding: "10px 12px", borderRadius: 10 }}
            >
              Reset Example
            </button>
          </div>
          {inputObj && (
  <p style={{ marginTop: 10, opacity: 0.85 }}>
    Auto Momentum Score: <b>{computeMomentumScore(inputObj)}</b> / 10
  </p>
)}
          {error && <p style={{ color: "crimson", marginTop: 10 }}>{error}</p>}
        </section>

        <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14 }}>
          <h2 style={{ fontSize: 18, marginTop: 0 }}>AI Plan Output</h2>

          {!plan && !loading && <p style={{ opacity: 0.7 }}>Click “Generate Plan” to populate.</p>}

          {plan && (
            <>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
                <span style={{ padding: "6px 10px", border: "1px solid #ccc", borderRadius: 999 }}>
                  Bias: <b>{plan.bias}</b>
                </span>
                <span style={{ padding: "6px 10px", border: "1px solid #ccc", borderRadius: 999 }}>
                  Confidence: <b>{Number(plan.confidence).toFixed(2)}</b>
                </span>
              </div>

              <p>
                <b>Thesis:</b> {plan.thesis}
              </p>

              <p style={{ marginBottom: 6 }}>
                <b>Playbook:</b>
              </p>
              <ul>
                {plan.playbook?.map((p, idx) => (
                  <li key={idx} style={{ marginBottom: 8 }}>
                    <div>
                      <b>IF</b> {p.if}
                    </div>
                    <div>
                      <b>THEN</b> {p.then}
                    </div>
                    <div style={{ opacity: 0.85 }}>
                      <b>Risk</b> {p.risk}
                    </div>
                  </li>
                ))}
              </ul>

              <p style={{ marginBottom: 6 }}>
                <b>Danger zones:</b>
              </p>
              <ul>
                {plan.danger_zones?.map((d, idx) => (
                  <li key={idx}>{d}</li>
                ))}
              </ul>

              <hr style={{ margin: "14px 0" }} />

              <h3 style={{ fontSize: 16, marginTop: 0 }}>Copy-to-X Post</h3>
              <textarea
                value={xPost}
                readOnly
                rows={10}
                style={{
                  width: "100%",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 12
                }}
              />

              <button
                onClick={() => copyToClipboard(xPost)}
                disabled={!xPost}
                style={{ padding: "10px 12px", borderRadius: 10, marginTop: 10 }}
              >
                Copy X Post
              </button>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
