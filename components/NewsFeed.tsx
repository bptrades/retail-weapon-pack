"use client";
import React, { useState, useCallback } from "react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
interface NewsItem {
  headline: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment: "bullish" | "bearish" | "neutral";
  relevance: "high" | "medium" | "low";
  tickers: string[];
}

interface RegimeResult {
  regime: "trending_bull" | "trending_bear" | "choppy" | "news_driven" | "low_vol";
  confidence: number;
  reasoning: string;
  playbook_adjustment: string;
}

interface NewsFeedProps {
  symbol: string;
  inputObj: any;
  onRegimeChange?: (regime: RegimeResult) => void;
}

// ─── Regime colours ───────────────────────────────────────────────────────────
function regimeStyle(r: RegimeResult["regime"]) {
  switch (r) {
    case "trending_bull": return { color: "var(--green-text)",  bg: "var(--green-bg)",  border: "var(--green-border)"  };
    case "trending_bear": return { color: "var(--red-text)",    bg: "var(--red-bg)",    border: "var(--red-border)"    };
    case "news_driven":   return { color: "var(--amber-text)",  bg: "var(--amber-bg)",  border: "var(--amber-border)"  };
    case "choppy":        return { color: "#c084fc",            bg: "rgba(192,132,252,0.08)", border: "rgba(192,132,252,0.22)" };
    case "low_vol":       return { color: "var(--t-3)",         bg: "var(--bg-3)",      border: "var(--border-1)"      };
  }
}

function regimeLabel(r: RegimeResult["regime"]) {
  switch (r) {
    case "trending_bull": return "▲ TRENDING BULL";
    case "trending_bear": return "▼ TRENDING BEAR";
    case "news_driven":   return "⚡ NEWS DRIVEN";
    case "choppy":        return "⇌ CHOPPY";
    case "low_vol":       return "○ LOW VOL";
  }
}

function sentimentColor(s: NewsItem["sentiment"]) {
  if (s === "bullish") return "var(--green-text)";
  if (s === "bearish") return "var(--red-text)";
  return "var(--t-3)";
}

function sentimentDot(s: NewsItem["sentiment"]) {
  if (s === "bullish") return { background: "var(--green)", boxShadow: "0 0 5px var(--green)" };
  if (s === "bearish") return { background: "var(--red)",   boxShadow: "0 0 5px var(--red)"   };
  return { background: "var(--t-3)" };
}

function timeSince(isoStr: string) {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function NewsFeed({ symbol, inputObj, onRegimeChange }: NewsFeedProps) {
  const [news,         setNews]         = useState<NewsItem[]>([]);
  const [regime,       setRegime]       = useState<RegimeResult | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [aiSummary,    setAiSummary]    = useState<string | null>(null);
  const [expanded,     setExpanded]     = useState<string | null>(null);
  const [filter,       setFilter]       = useState<"all" | "bullish" | "bearish">("all");

  const fetch = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setAiSummary(null);
    try {
      const res  = await window.fetch(`/api/news?symbol=${encodeURIComponent(symbol)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "News fetch failed");
      setNews(data.news || []);

      // ── Regime detection via AI ──────────────────────────────────────────
      const prompt = `You are a market regime classifier for active 0-DTE options traders.

Given this snapshot data and recent headlines, classify the current market regime.

SNAPSHOT:
${JSON.stringify(inputObj, null, 2)}

RECENT HEADLINES:
${(data.news || []).slice(0, 6).map((n: NewsItem, i: number) => `${i + 1}. [${n.sentiment.toUpperCase()}] ${n.headline} (${n.source})`).join("\n")}

Respond ONLY with valid JSON, no markdown, no explanation:
{
  "regime": "trending_bull" | "trending_bear" | "choppy" | "news_driven" | "low_vol",
  "confidence": 0-100,
  "reasoning": "one sentence",
  "playbook_adjustment": "one concrete tactical suggestion for a 0-DTE trader given this regime"
}`;

      const aiRes = await window.fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawPrompt: prompt }),
      });
      const aiData = await aiRes.json();
      const text = (aiData?.regime_raw || aiData?.text || "")
        .replace(/```json|```/g, "").trim();
      try {
        const parsed = JSON.parse(text);
        setRegime(parsed);
        onRegimeChange?.(parsed);
      } catch { /* regime parse failed silently */ }

      // ── AI news summary ──────────────────────────────────────────────────
      const summaryPrompt = `Summarize in 2 sentences how today's top news headlines affect ${symbol} for a 0-DTE options trader. Be direct and specific. Headlines: ${(data.news || []).slice(0, 4).map((n: NewsItem) => n.headline).join(" | ")}`;
      const sumRes = await window.fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawPrompt: summaryPrompt }),
      });
      const sumData = await sumRes.json();
      setAiSummary(sumData?.text || sumData?.summary || null);

    } catch (e: any) {
      toast.error(e?.message || "News error");
    } finally {
      setLoading(false);
    }
  }, [symbol, inputObj, loading, onRegimeChange]);

  const filtered = filter === "all" ? news : news.filter(n => n.sentiment === filter);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="panel-label">News & Regime</div>
          {news.length > 0 && (
            <div style={{ fontSize: 9, color: "var(--t-4)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
              {news.length} headlines · {symbol}
            </div>
          )}
        </div>
        <button
          className="btn btn-primary"
          style={{ fontSize: 10 }}
          onClick={fetch}
          disabled={loading}
        >
          {loading ? "⟳ Fetching…" : "⟳ Fetch News"}
        </button>
      </div>

      {/* Regime badge */}
      {regime && (() => {
        const s = regimeStyle(regime.regime);
        return (
          <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8, padding: "10px 13px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: s.color, letterSpacing: "0.08em" }}>
                {regimeLabel(regime.regime)}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: s.color, opacity: 0.7 }}>
                {regime.confidence}% confidence
              </span>
            </div>
            <div style={{ fontSize: 10, color: "var(--t-2)", lineHeight: 1.5, marginBottom: 5 }}>{regime.reasoning}</div>
            <div style={{ display: "flex", gap: 5, alignItems: "flex-start" }}>
              <span style={{ fontSize: 9, color: s.color, opacity: 0.6, flexShrink: 0, fontFamily: "var(--font-mono)", fontWeight: 700 }}>PLAY:</span>
              <span style={{ fontSize: 10, color: "var(--t-1)", lineHeight: 1.45 }}>{regime.playbook_adjustment}</span>
            </div>
          </div>
        );
      })()}

      {/* AI news summary */}
      {aiSummary && (
        <div style={{ background: "var(--bg-3)", border: "1px solid var(--border-0)", borderRadius: 8, padding: "10px 13px" }}>
          <div className="label-xs" style={{ marginBottom: 5 }}>AI Catalyst Summary</div>
          <div style={{ fontSize: 11, color: "var(--t-2)", lineHeight: 1.55 }}>{aiSummary}</div>
        </div>
      )}

      {/* Filter tabs */}
      {news.length > 0 && (
        <div style={{ display: "flex", gap: 4 }}>
          {(["all", "bullish", "bearish"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                letterSpacing: "0.07em", textTransform: "uppercase",
                padding: "4px 9px", borderRadius: 5, border: "1px solid", cursor: "pointer",
                background: filter === f
                  ? (f === "bullish" ? "var(--green-bg)" : f === "bearish" ? "var(--red-bg)" : "var(--bg-4)")
                  : "var(--bg-3)",
                borderColor: filter === f
                  ? (f === "bullish" ? "var(--green-border)" : f === "bearish" ? "var(--red-border)" : "var(--border-2)")
                  : "var(--border-0)",
                color: filter === f
                  ? (f === "bullish" ? "var(--green-text)" : f === "bearish" ? "var(--red-text)" : "var(--t-1)")
                  : "var(--t-3)",
              }}
            >{f === "all" ? `All (${news.length})` : f === "bullish" ? `▲ Bull (${news.filter(n => n.sentiment === "bullish").length})` : `▼ Bear (${news.filter(n => n.sentiment === "bearish").length})`}
            </button>
          ))}
        </div>
      )}

      {/* News list */}
      {filtered.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {filtered.map((item, idx) => (
            <div key={idx}
              onClick={() => setExpanded(expanded === `${idx}` ? null : `${idx}`)}
              style={{
                background: "var(--bg-3)", border: "1px solid var(--border-0)", borderRadius: 7,
                padding: "9px 12px", cursor: "pointer",
                transition: "border-color 70ms, background 70ms",
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--border-2)")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border-0)")}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span className="sig-dot" style={{ ...sentimentDot(item.sentiment), marginTop: 4, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 600, color: "var(--t-1)", lineHeight: 1.4,
                    overflow: "hidden", textOverflow: "ellipsis",
                    display: expanded === `${idx}` ? "block" : "-webkit-box",
                    WebkitLineClamp: expanded === `${idx}` ? undefined : 2,
                    WebkitBoxOrient: "vertical" as any,
                  }}>{item.headline}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 9, color: "var(--t-3)", fontFamily: "var(--font-mono)" }}>{item.source}</span>
                    <span style={{ fontSize: 9, color: "var(--t-4)", fontFamily: "var(--font-mono)" }}>{timeSince(item.publishedAt)}</span>
                    {item.relevance === "high" && (
                      <span style={{ fontSize: 8, fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--amber-text)", letterSpacing: "0.07em" }}>HIGH IMPACT</span>
                    )}
                    <span style={{ fontSize: 9, color: sentimentColor(item.sentiment), fontFamily: "var(--font-mono)", fontWeight: 700, marginLeft: "auto" }}>
                      {item.sentiment.toUpperCase()}
                    </span>
                  </div>
                  {expanded === `${idx}` && item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 9, color: "var(--cyan-text)", display: "block", marginTop: 5 }}
                      onClick={e => e.stopPropagation()}>
                      Read full article →
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : news.length === 0 && !loading ? (
        <div className="empty-state">
          <div style={{ fontSize: 20, marginBottom: 6 }}>📰</div>
          <div style={{ fontSize: 11, color: "var(--t-3)" }}>Click Fetch News to load headlines.</div>
          <div style={{ fontSize: 9, color: "var(--t-4)", marginTop: 3 }}>AI will classify market regime and summarize catalyst impact.</div>
        </div>
      ) : null}
    </div>
  );
}