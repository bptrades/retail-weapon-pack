"use client";
import React, { useRef, useState, useCallback } from "react";
import { toast } from "sonner";

interface SetupCardProps {
  symbol: string;
  price: number | null;
  score: number | null;
  bias: "bullish" | "bearish" | "neutral";
  vwap: number | null;
  plan: {
    thesis?: string;
    playbook?: { if: string; then: string; risk: string }[];
    confidence?: number;
    danger_zones?: string[];
  } | null;
  inputObj: any;
}

export default function SetupCard({ symbol, price, score, bias, vwap, plan, inputObj }: SetupCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [preview, setPreview] = useState(false);

  const primaryPlay = plan?.playbook?.[0];
  const atr = typeof inputObj?.atr_14 === "number" ? inputObj.atr_14 : null;
  const ema5 = inputObj?.ema_trend_5m;
  const ema15 = inputObj?.ema_trend_15m;
  const rsi = typeof inputObj?.rsi_1m === "number" ? inputObj.rsi_1m : null;

  const biasColor   = bias === "bullish" ? "#34d399" : bias === "bearish" ? "#f87171" : "#fbbf24";
  const biasGlow    = bias === "bullish" ? "rgba(16,185,129,0.4)" : bias === "bearish" ? "rgba(239,68,68,0.4)" : "rgba(245,158,11,0.3)";
  const scoreColor  = score && score >= 6.5 ? "#34d399" : score && score <= 3.5 ? "#f87171" : "#fbbf24";

  const now = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  async function exportPNG() {
    if (!cardRef.current) return;
    setIsExporting(true);
    try {
      // Dynamically import html2canvas
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: "#090d17",
        scale: 2,
        useCORS: true,
        logging: false,
      });

      canvas.toBlob((blob) => {
        if (!blob) { toast.error("Export failed"); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${symbol}-setup-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Setup card saved!");
      }, "image/png", 0.95);
    } catch (e: any) {
      toast.error("Export failed: " + e?.message);
    } finally {
      setIsExporting(false);
    }
  }

  function copySetupText() {
    const lines = [
      `📊 ${symbol} SETUP — ${bias.toUpperCase()}`,
      `Price: $${price?.toFixed(2) ?? "—"} | Score: ${score?.toFixed(1) ?? "—"}/10`,
      ``,
      plan?.thesis ? `Thesis: ${plan.thesis}` : "",
      primaryPlay ? `\nIF ${primaryPlay.if}\nTHEN ${primaryPlay.then}\nRISK ${primaryPlay.risk}` : "",
      `\n#0DTE #${symbol} #OptionsFlow`,
    ].filter(Boolean).join("\n");

    navigator.clipboard.writeText(lines).then(() => toast.success("Copied to clipboard!"));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="panel-label">Setup Card Export</div>
          <div style={{ fontSize: 9, color: "var(--t-4)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
            Share to Twitter · Discord · Telegram
          </div>
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          <button className="btn btn-ghost" style={{ fontSize: 10 }} onClick={() => setPreview(!preview)}>
            {preview ? "Hide" : "Preview"}
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 10 }} onClick={copySetupText}>
            Copy Text
          </button>
          <button className="btn btn-primary" style={{ fontSize: 10 }} onClick={exportPNG} disabled={isExporting || !price}>
            {isExporting ? "Exporting…" : "Save PNG"}
          </button>
        </div>
      </div>

      {/* Note about html2canvas */}
      <div style={{ fontSize: 9, color: "var(--t-4)", fontFamily: "var(--font-mono)", background: "var(--bg-3)", border: "1px solid var(--border-0)", borderRadius: 6, padding: "6px 10px" }}>
        Requires: <code style={{ color: "var(--cyan-text)" }}>npm install html2canvas</code>
      </div>

      {!price && (
        <div className="empty-state">
          <div style={{ fontSize: 11, color: "var(--t-3)" }}>Fetch a snapshot and run AI first.</div>
        </div>
      )}

      {/* Card preview — this is what gets exported */}
      {(preview || isExporting) && price && (
        <div style={{ overflow: "hidden", borderRadius: 10 }}>
          <div
            ref={cardRef}
            style={{
              width: 480,
              background: "linear-gradient(145deg, #0c1322 0%, #08101e 60%, #060c18 100%)",
              border: `1px solid rgba(255,255,255,0.1)`,
              borderRadius: 12,
              padding: 20,
              fontFamily: "'IBM Plex Mono', monospace",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Ambient glow */}
            <div style={{
              position: "absolute", top: -60, right: -60, width: 200, height: 200, borderRadius: "50%",
              background: biasGlow, opacity: 0.3, filter: "blur(60px)", pointerEvents: "none",
            }} />

            {/* Top cyan line */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${biasColor}, transparent)` }} />

            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#eef2f7", letterSpacing: "-0.02em", lineHeight: 1 }}>{symbol}</div>
                <div style={{ fontSize: 10, color: "#445566", marginTop: 4, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  RETAIL WEAPON PACK · {now} ET
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: biasColor, lineHeight: 1, textShadow: `0 0 20px ${biasGlow}` }}>
                  ${price.toFixed(2)}
                </div>
                <div style={{ fontSize: 9, color: biasColor, opacity: 0.7, marginTop: 3, letterSpacing: "0.1em" }}>
                  {bias.toUpperCase()}
                </div>
              </div>
            </div>

            {/* Score + key signals row */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {/* Score */}
              <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "10px 14px", flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "#445566", marginBottom: 4, letterSpacing: "0.1em", textTransform: "uppercase" }}>Score</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: scoreColor, fontVariantNumeric: "tabular-nums" }}>{score?.toFixed(1) ?? "—"}</div>
                <div style={{ fontSize: 8, color: "#445566", marginTop: 2 }}>/ 10</div>
              </div>

              {/* Signals */}
              <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "10px 14px", flex: 2 }}>
                <div style={{ fontSize: 9, color: "#445566", marginBottom: 6, letterSpacing: "0.1em", textTransform: "uppercase" }}>Signals</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
                  {[
                    { label: "VWAP", val: vwap ? `$${vwap.toFixed(2)}` : "—", state: inputObj?.vwap_state },
                    { label: "EMA 5m", val: ema5 ?? "—", state: ema5 },
                    { label: "EMA 15m", val: ema15 ?? "—", state: ema15 },
                    { label: "RSI", val: rsi != null ? rsi.toFixed(0) : "—", state: rsi && rsi > 55 ? "bull" : rsi && rsi < 45 ? "bear" : "neut" },
                    { label: "ATR", val: atr != null ? atr.toFixed(2) : "—", state: "neut" },
                  ].map(sig => (
                    <div key={sig.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 8, color: "#445566" }}>{sig.label}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: sig.state === "bull" || sig.state === "above" ? "#34d399" : sig.state === "bear" || sig.state === "below" ? "#f87171" : "#8899aa" }}>
                        {String(sig.val).toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Thesis */}
            {plan?.thesis && (
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 7, padding: "10px 12px", marginBottom: 10 }}>
                <div style={{ fontSize: 8, color: "#445566", marginBottom: 5, letterSpacing: "0.1em", textTransform: "uppercase" }}>Thesis</div>
                <div style={{ fontSize: 10, color: "#8899aa", lineHeight: 1.55 }}>{plan.thesis}</div>
              </div>
            )}

            {/* Primary play */}
            {primaryPlay && (
              <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid rgba(255,255,255,0.05)`, borderLeft: `2px solid ${biasColor}`, borderRadius: 7, padding: "10px 12px", marginBottom: 14 }}>
                <div style={{ fontSize: 8, color: "#445566", marginBottom: 6, letterSpacing: "0.1em", textTransform: "uppercase" }}>Primary Play</div>
                <div style={{ fontSize: 10, marginBottom: 3 }}><span style={{ color: "#67e8f9", fontWeight: 700 }}>IF </span><span style={{ color: "#8899aa" }}>{primaryPlay.if}</span></div>
                <div style={{ fontSize: 10, marginBottom: 3 }}><span style={{ color: "#34d399", fontWeight: 700 }}>THEN </span><span style={{ color: "#8899aa" }}>{primaryPlay.then}</span></div>
                <div style={{ fontSize: 10 }}><span style={{ color: "#f87171", fontWeight: 700 }}>RISK </span><span style={{ color: "#8899aa" }}>{primaryPlay.risk}</span></div>
              </div>
            )}

            {/* Footer */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 10 }}>
              <div style={{ fontSize: 8, color: "#1e2d3d", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Not financial advice · retailweaponpack.com
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {["#0DTE", `#${symbol}`, "#OptionsFlow"].map(tag => (
                  <span key={tag} style={{ fontSize: 8, color: "#445566", letterSpacing: "0.04em" }}>{tag}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}