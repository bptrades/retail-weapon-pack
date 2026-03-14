"use client";
import React, { useState, useCallback } from "react";
import { toast } from "sonner";

interface PreMarketBrief {
  date: string;
  generated_at: string;
  market_outlook: "bullish" | "bearish" | "neutral";
  headline_summary: string;
  gap_analysis: string;
  key_levels: { label: string; price: string; significance: string }[];
  watch_for: string[];
  risk_events: string[];
  opening_game_plan: string;
  confidence: number;
}

interface PreMarketBriefProps {
  symbol: string;
  inputObj: any;
  watchlist: string[];
}

function outlookColor(o: PreMarketBrief["market_outlook"]) {
  if (o === "bullish") return "var(--green-text)";
  if (o === "bearish") return "var(--red-text)";
  return "var(--amber-text)";
}

function outlookBg(o: PreMarketBrief["market_outlook"]) {
  if (o === "bullish") return { bg: "var(--green-bg)", border: "var(--green-border)" };
  if (o === "bearish") return { bg: "var(--red-bg)",   border: "var(--red-border)"   };
  return { bg: "var(--amber-bg)", border: "var(--amber-border)" };
}

export default function PreMarketBrief({ symbol, inputObj, watchlist }: PreMarketBriefProps) {
  const [brief,   setBrief]   = useState<PreMarketBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [section, setSection] = useState<"brief" | "gameplan">("brief");

  const generate = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const now = new Date();
      const etHour = now.getUTCHours() - 4;
      const timeContext = etHour < 9 ? "PRE-MARKET" : etHour < 16 ? "MARKET HOURS" : "AFTER HOURS";

      const prompt = `You are an elite institutional 0-DTE options trader generating a morning prep brief.

TIME: ${timeContext} — ${now.toLocaleString('en-US', { timeZone: 'America/New_York' })}
PRIMARY SYMBOL: ${symbol}
WATCHLIST: ${watchlist.slice(0, 8).join(", ")}
CURRENT SNAPSHOT: ${JSON.stringify(inputObj, null, 2)}

Generate a comprehensive pre-market brief for a 0-DTE options trader. Respond ONLY with valid JSON, no markdown, no explanation:
{
  "date": "${now.toISOString().split('T')[0]}",
  "generated_at": "${now.toISOString()}",
  "market_outlook": "bullish" | "bearish" | "neutral",
  "headline_summary": "2-sentence macro summary of what's driving the market today",
  "gap_analysis": "Brief analysis of overnight gap and what it means for the session",
  "key_levels": [
    { "label": "name of level", "price": "exact price as string", "significance": "why this level matters today" }
  ],
  "watch_for": [
    "specific thing to watch in first 30 minutes",
    "specific catalyst or level to monitor mid-day",
    "key setup or risk event for afternoon"
  ],
  "risk_events": [
    "any scheduled data releases, Fed speakers, or macro events today"
  ],
  "opening_game_plan": "Concrete 2-3 sentence plan for the first 30 minutes of trading. Include specific levels, what confirms or invalidates the thesis.",
  "confidence": 1-100
}`;

      const res  = await window.fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawPrompt: prompt }),
      });
      const data = await res.json();
      const text = (data?.brief_raw || data?.text || "").replace(/```json|```/g, "").trim();

      try {
        const parsed: PreMarketBrief = JSON.parse(text);
        setBrief(parsed);
        toast.success("Pre-market brief generated");
      } catch {
        toast.error("Failed to parse brief — try again");
      }
    } catch (e: any) {
      toast.error(e?.message || "Brief generation failed");
    } finally {
      setLoading(false);
    }
  }, [loading, symbol, inputObj, watchlist]);

  function confidenceBar(n: number) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, height: 2, borderRadius: 1, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${n}%`, background: n >= 70 ? "var(--green)" : n >= 50 ? "var(--amber)" : "var(--red)", transition: "width 0.5s ease" }} />
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--t-3)", fontVariantNumeric: "tabular-nums", minWidth: 30 }}>{n}%</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="panel-label">Pre-Market Brief</div>
          {brief && (
            <div style={{ fontSize: 9, color: "var(--t-4)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
              Generated {new Date(brief.generated_at).toLocaleTimeString()}
            </div>
          )}
        </div>
        <button className="btn btn-primary" style={{ fontSize: 10 }} onClick={generate} disabled={loading}>
          {loading ? "⟳ Generating…" : brief ? "⟳ Regenerate" : "Generate Brief"}
        </button>
      </div>

      {brief ? (
        <>
          {/* Outlook badge + confidence */}
          {(() => {
            const { bg, border } = outlookBg(brief.market_outlook);
            return (
              <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 13px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: outlookColor(brief.market_outlook), letterSpacing: "0.08em", marginBottom: 2 }}>
                    {brief.market_outlook.toUpperCase()} OUTLOOK · {brief.date}
                  </div>
                  {confidenceBar(brief.confidence)}
                </div>
              </div>
            );
          })()}

          {/* Section tabs */}
          <div style={{ display: "flex", gap: 4 }}>
            {(["brief", "gameplan"] as const).map(s => (
              <button key={s} onClick={() => setSection(s)}
                style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.07em",
                  textTransform: "uppercase", padding: "4px 10px", borderRadius: 5, border: "1px solid",
                  cursor: "pointer",
                  background: section === s ? "var(--bg-4)" : "var(--bg-3)",
                  borderColor: section === s ? "var(--border-2)" : "var(--border-0)",
                  color: section === s ? "var(--t-1)" : "var(--t-3)",
                }}>
                {s === "brief" ? "Morning Brief" : "Game Plan"}
              </button>
            ))}
          </div>

          {section === "brief" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

              {/* Headline summary */}
              <div style={{ background: "var(--bg-3)", border: "1px solid var(--border-0)", borderRadius: 8, padding: "10px 13px" }}>
                <div className="label-xs" style={{ marginBottom: 5 }}>Market Outlook</div>
                <div style={{ fontSize: 11, color: "var(--t-1)", lineHeight: 1.6 }}>{brief.headline_summary}</div>
              </div>

              {/* Gap analysis */}
              <div style={{ background: "var(--bg-3)", border: "1px solid var(--border-0)", borderRadius: 8, padding: "10px 13px" }}>
                <div className="label-xs" style={{ marginBottom: 5 }}>Gap Analysis</div>
                <div style={{ fontSize: 11, color: "var(--t-2)", lineHeight: 1.55 }}>{brief.gap_analysis}</div>
              </div>

              {/* Key levels */}
              {brief.key_levels?.length > 0 && (
                <div style={{ background: "var(--bg-3)", border: "1px solid var(--border-0)", borderRadius: 8, padding: "10px 13px" }}>
                  <div className="label-xs" style={{ marginBottom: 8 }}>Key Levels Today</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {brief.key_levels.map((lvl, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 0", borderBottom: i < brief.key_levels.length - 1 ? "1px solid var(--border-0)" : "none" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--cyan-text)", minWidth: 55, fontVariantNumeric: "tabular-nums" }}>
                          ${lvl.price}
                        </span>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--t-1)", marginBottom: 1 }}>{lvl.label}</div>
                          <div style={{ fontSize: 9, color: "var(--t-3)" }}>{lvl.significance}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Risk events */}
              {brief.risk_events?.length > 0 && (
                <div style={{ background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: 8, padding: "10px 13px" }}>
                  <div className="label-xs" style={{ color: "var(--red-text)", marginBottom: 6, opacity: 0.8 }}>⚠ Risk Events Today</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {brief.risk_events.map((e, i) => (
                      <div key={i} style={{ display: "flex", gap: 7, fontSize: 10, color: "var(--t-2)" }}>
                        <span style={{ color: "var(--red-text)", opacity: 0.5, flexShrink: 0 }}>•</span>{e}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Watch for */}
              {brief.watch_for?.length > 0 && (
                <div style={{ background: "var(--bg-3)", border: "1px solid var(--border-0)", borderRadius: 8, padding: "10px 13px" }}>
                  <div className="label-xs" style={{ marginBottom: 6 }}>Watch For</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {brief.watch_for.map((item, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, fontSize: 10, color: "var(--t-2)", lineHeight: 1.45 }}>
                        <span style={{ color: "var(--cyan-text)", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 9, flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {section === "gameplan" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Opening game plan */}
              <div style={{
                background: "var(--cyan-bg)", border: "1px solid var(--cyan-border)",
                borderRadius: 8, padding: "14px 16px",
              }}>
                <div className="label-xs" style={{ color: "var(--cyan-text)", marginBottom: 8 }}>⚡ Opening 30-Minute Plan</div>
                <div style={{ fontSize: 12, color: "var(--t-1)", lineHeight: 1.7, fontWeight: 500 }}>
                  {brief.opening_game_plan}
                </div>
              </div>

              {/* Recap of key levels for quick reference */}
              {brief.key_levels?.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 5 }}>
                  {brief.key_levels.slice(0, 4).map((lvl, i) => (
                    <div key={i} className="metric-tile">
                      <div className="label-xs" style={{ marginBottom: 4 }}>{lvl.label}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--cyan-text)", fontVariantNumeric: "tabular-nums" }}>${lvl.price}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="empty-state">
          <div style={{ fontSize: 22, marginBottom: 6 }}>🌅</div>
          <div style={{ fontSize: 12, color: "var(--t-3)" }}>Generate your pre-market brief.</div>
          <div style={{ fontSize: 9, color: "var(--t-4)", marginTop: 4, lineHeight: 1.5, maxWidth: 240, margin: "4px auto 0" }}>
            AI analyzes your snapshot, watchlist, and macro context to build a morning game plan.
          </div>
        </div>
      )}
    </div>
  );
}