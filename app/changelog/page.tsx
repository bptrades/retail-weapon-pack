"use client";
import React, { useState } from "react";

const versions = [
  {
    version: "0.5.1",
    date: "2026-03-18",
    tag: "bugfix",
    title: "Options Flow & Gamma Ladder Fixes",
    changes: [
      {
        type: "fix",
        text: "Options Flow was only returning calls. Root cause: Alpaca returns contracts alphabetically, so SPY250321C... (calls) all appear before SPY250321P... (puts). Slicing to 50 grabbed 50 calls, zero puts. Fix: fetch calls and puts as separate parallel requests with explicit type= filter, then interleave by strike before snapshotting.",
      },
      {
        type: "fix",
        text: "Gamma ladder showed all levels at the same price. Root cause: strike step for SPY is $5, but old multipliers (atr*0.75, atr*0.3) produced offsets smaller than one step — everything snapped to the same rounded number. Fix: use larger multipliers (1×ATR, 2×ATR) with a guaranteed minimum separation of 2 strike steps, plus deduplication pass.",
      },
    ],
  },
  {
    version: "0.5.0",
    date: "2026-03-18",
    tag: "feature",
    title: "Score Delta + Win Rate Heatmap",
    changes: [
      {
        type: "new",
        text: "ScoreDelta component — tracks momentum score across snapshots and fires a toast + alert banner the moment score moves ±2 points between fetches. Shows acceleration chart (SVG, zero dependencies), delta log, and a live velocity label ranging from 🚀 Surging to 💥 Collapsing.",
      },
      {
        type: "new",
        text: "WinRateHeatmap component — reads from your trade journal and breaks down win rate + average R across 6 dimensions: hour of day, day of week, setup type, ticker, bias direction, and cumulative R curve. Auto-generates plain-English edge insights once 5+ trades are logged.",
      },
      {
        type: "new",
        text: "Delta tab added to control panel. All 7 TabsTriggers correctly scoped inside TabsList.",
      },
      {
        type: "fix",
        text: "RovingFocusGroupItem crash on page load — caused by a stray TabsTrigger (value='edge') accidentally placed inside a TabsContent block instead of TabsList. Removed orphan trigger and reorganised all tab content into the correct structure.",
      },
    ],
  },
  {
    version: "0.4.2",
    date: "2026-03-17",
    tag: "bugfix",
    title: "Scanner Page & Watchlist Wiring",
    changes: [
      {
        type: "fix",
        text: "scanner/page.tsx was missing React and useState imports, causing immediate compile errors. Rewrote the page as a standalone file with ScannerPanel logic inlined — ScannerPanel only exists as an internal function inside page.tsx and cannot be imported separately.",
      },
      {
        type: "fix",
        text: "Watchlist Step 8 clarified — exact line range (1248–1278) and block to delete identified. WatchlistGroups replacement block documented with correct prop signature.",
      },
      {
        type: "fix",
        text: "Scanner page now reads watchlist from localStorage key rwp_watchlist_v2 (WatchlistGroups) instead of broken placeholder comment.",
      },
    ],
  },
  {
    version: "0.4.1",
    date: "2026-03-17",
    tag: "bugfix",
    title: "API rawPrompt Support",
    changes: [
      {
        type: "fix",
        text: "New components (NewsFeed, PreMarketBrief, CorrelationDashboard) were calling /api/plan with a rawPrompt field that the old route handler didn't support — returned 400, cascading into broken UI. Added rawPrompt passthrough at the top of the plan route before the existing inputJson logic.",
      },
    ],
  },
  {
    version: "0.4.0",
    date: "2026-03-16",
    tag: "feature",
    title: "Intelligence Layer — 9 New Components",
    changes: [
      {
        type: "new",
        text: "NewsFeed — fetches headlines via Alpaca News (Finnhub fallback, mock if no key). Makes two AI calls: regime classification (trending_bull / bear / choppy / news_driven / low_vol) and a 2-sentence catalyst summary.",
      },
      {
        type: "new",
        text: "CorrelationDashboard — Core tab shows SPY/QQQ/IWM/VIX scores with alignment signal. Sectors tab shows all 11 SPDR ETFs as a color-intensity heatmap. Sequential fetch with 200ms delays.",
      },
      {
        type: "new",
        text: "GammaLevels — call walls, put walls, gamma flip zone, and max pain derived from ATR + price structure. Click-to-expand explanations on each level. Visual price ladder.",
      },
      {
        type: "new",
        text: "PreMarketBrief + /brief page — full pre-market AI brief with gap analysis, key levels, risk events, watch-for list, and 30-minute opening game plan.",
      },
      {
        type: "new",
        text: "SetupCard — branded PNG export card with symbol, price, score, bias, thesis, primary play, and hashtags. Preview + Copy Text work without html2canvas.",
      },
      {
        type: "new",
        text: "WatchlistGroups — grouped watchlist with Core / Swing / 0DTE / Custom groups. Persists to localStorage key rwp_watchlist_v2 (non-conflicting with old key). Move tickers between groups via ⋯ menu.",
      },
      {
        type: "new",
        text: "NavBar — shared navigation bar with page links (Dashboard · Pre-Market · Scanner · Journal · Calendar) and injectable controls per page.",
      },
      {
        type: "new",
        text: "Multi-page routing: /brief, /scanner, /journal, /calendar.",
      },
    ],
  },
  {
    version: "0.3.0",
    date: "2026-03-14",
    tag: "feature",
    title: "Options Flow + Economic Calendar",
    changes: [
      {
        type: "new",
        text: "OptionsFlow component — fetches live options chain from Alpaca. Shows volume, OI, IV, mid price, and P/C ratio. Flags unusual sweeps (volume > 2× OI). Filter by CALLS / PUTS / UNUSUAL.",
      },
      {
        type: "new",
        text: "EconomicCalendar — slide-out drawer showing upcoming macro events relevant to the active watchlist. Fed decisions, CPI, NFP, earnings dates.",
      },
      {
        type: "new",
        text: "Trade Journal — localStorage-backed journal with trade logging, P&L tracking, R-multiple calculation, win rate ring, and P&L bar chart for last 10 trades.",
      },
      {
        type: "new",
        text: "Entry Signal Alerts — fires a toast + banner when momentum score crosses a configurable threshold. Adjustable from 6.0 (sensitive) to 9.5 (strict) via range slider.",
      },
    ],
  },
  {
    version: "0.2.0",
    date: "2026-03-12",
    tag: "feature",
    title: "Scoring Engine Overhaul + Scanner",
    changes: [
      {
        type: "improved",
        text: "Rebuilt momentum scoring engine from scratch. Old version used arbitrary string parsing and a single VWAP binary. New version: 6-factor weighted model — VWAP position normalized by ATR, EMA cross-timeframe alignment bonus, numeric RSI bands, volume ratio, ATR volatility context, and time-of-day weighting (opening drive +0.5, lunch chop −0.5).",
      },
      {
        type: "new",
        text: "Watchlist Scanner — scans all tickers sequentially, scores each with the upgraded engine, sorts by strength (bullish high score first, bearish low score, neutrals last), and flags in-play tickers (ATR >1.5% of price + above-avg volume).",
      },
      {
        type: "new",
        text: "Multi-ticker overlay bar — ambient SPY/QQQ/VIX monitor at the top of the dashboard. Configurable tickers, manual refresh.",
      },
      {
        type: "new",
        text: "Bias flip alerts — detects when bias_guess changes between consecutive snapshots and fires a beep + toast. Optional sound toggle in Settings.",
      },
      {
        type: "new",
        text: "Options strike picker — suggests ATM or 1-strike OTM call/put based on current bias and ATR, with rationale and stop level.",
      },
      {
        type: "new",
        text: "Template plan fallback — if AI errors or quota is hit, automatically generates a structured plan from snapshot data using one of three templates: Trend Continuation, VWAP Reclaim, or Mean Reversion.",
      },
    ],
  },
  {
    version: "0.1.0",
    date: "2026-03-11",
    tag: "release",
    title: "Initial Release",
    changes: [
      {
        type: "new",
        text: "Core dashboard — symbol input, snapshot fetch via Alpaca, AI plan generation via Gemini (gemini-2.5-flash-lite). Plan includes bias, thesis, 3-play playbook (IF/THEN/RISK), and danger zones.",
      },
      {
        type: "new",
        text: "Snapshot panel — price, VWAP state, EMA 5m/15m trend, RSI, volume, ATR, key session levels, market open/closed state.",
      },
      {
        type: "new",
        text: "Bias Checklist — 5-signal alignment check (VWAP, 5m EMA, 15m EMA, RSI, Volume) with a plain-English read.",
      },
      {
        type: "new",
        text: "TradingView chart embed — 5m default, dark theme, auto-maps SPY→AMEX:SPY, VIX→CBOE:VIX, etc.",
      },
      {
        type: "new",
        text: "Snapshot history — persists last 25 snapshots per symbol in localStorage. Click to reload any prior state.",
      },
      {
        type: "new",
        text: "Risk calculator — account size, risk %, entry, stop → shares, position size, 1R/2R/3R targets.",
      },
      {
        type: "new",
        text: "X post formatter — one-click copy of a structured bias post with levels, playbook, and danger zones.",
      },
      {
        type: "new",
        text: "Bloomberg Terminal aesthetic — obsidian palette, IBM Plex Mono data labels, DM Sans UI prose, full CSS design system.",
      },
    ],
  },
];

const tagStyles: Record<string, { bg: string; color: string; border: string; label: string }> = {
  release:  { bg: "var(--cyan-bg)",  color: "var(--cyan-text)",  border: "var(--cyan-border)",  label: "RELEASE"  },
  feature:  { bg: "var(--green-bg)", color: "var(--green-text)", border: "var(--green-border)", label: "FEATURE"  },
  improved: { bg: "var(--amber-bg)", color: "var(--amber-text)", border: "var(--amber-border)", label: "IMPROVED" },
  bugfix:   { bg: "var(--red-bg)",   color: "var(--red-text)",   border: "var(--red-border)",   label: "BUGFIX"   },
};

const changeTypeIcon: Record<string, string> = {
  new:      "◆",
  fix:      "✕",
  improved: "↑",
};
const changeTypeColor: Record<string, string> = {
  new:      "var(--cyan-text)",
  fix:      "var(--red-text)",
  improved: "var(--amber-text)",
};

export default function ChangelogPage() {
  const [expanded, setExpanded] = useState<string | null>(versions[0].version);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-1)", color: "var(--t-1)" }}>

      {/* Nav */}
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
              CHANGELOG
            </span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <a href="/"        className="btn btn-ghost" style={{ textDecoration: "none", fontSize: 10 }}>← Dashboard</a>
            <a href="/brief"   className="btn btn-ghost" style={{ textDecoration: "none", fontSize: 10 }}>Pre-Market</a>
            <a href="/scanner" className="btn btn-ghost" style={{ textDecoration: "none", fontSize: 10 }}>Scanner</a>
          </div>
        </div>
      </nav>

      {/* Body */}
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "32px 20px 60px" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--cyan-text)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
            Retail Weapon Pack
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--t-1)", margin: 0, marginBottom: 6 }}>
            Changelog
          </h1>
          <p style={{ fontSize: 12, color: "var(--t-3)", margin: 0, lineHeight: 1.6 }}>
            Full history of every version — what changed, what was fixed, and why.
          </p>
        </div>

        {/* Version list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {versions.map((v) => {
            const isOpen = expanded === v.version;
            const tag = tagStyles[v.tag] ?? tagStyles.feature;

            return (
              <div key={v.version}
                style={{
                  background: "var(--bg-2)",
                  border: `1px solid ${isOpen ? "var(--border-2)" : "var(--border-0)"}`,
                  borderRadius: 10,
                  overflow: "hidden",
                  transition: "border-color 100ms",
                }}
              >
                {/* Header row */}
                <button
                  onClick={() => setExpanded(isOpen ? null : v.version)}
                  style={{
                    width: "100%", textAlign: "left", padding: "14px 18px",
                    background: "none", border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 12,
                  }}
                >
                  {/* Version number */}
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800,
                    color: "var(--t-1)", letterSpacing: "0.04em", minWidth: 44,
                  }}>
                    v{v.version}
                  </span>

                  {/* Tag badge */}
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                    letterSpacing: "0.1em", padding: "2px 7px", borderRadius: 4,
                    background: tag.bg, color: tag.color, border: `1px solid ${tag.border}`,
                    flexShrink: 0,
                  }}>
                    {tag.label}
                  </span>

                  {/* Title */}
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--t-1)", flex: 1 }}>
                    {v.title}
                  </span>

                  {/* Date + change count */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--t-4)" }}>
                      {v.changes.length} change{v.changes.length !== 1 ? "s" : ""}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--t-4)" }}>
                      {v.date}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--t-4)", transition: "transform 150ms", display: "inline-block", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                      ▾
                    </span>
                  </div>
                </button>

                {/* Expanded content */}
                {isOpen && (
                  <div style={{ borderTop: "1px solid var(--border-0)", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {v.changes.map((c, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                          color: changeTypeColor[c.type] ?? "var(--t-3)",
                          marginTop: 3, flexShrink: 0, minWidth: 10,
                        }}>
                          {changeTypeIcon[c.type] ?? "·"}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--t-2)", lineHeight: 1.65 }}>
                          {c.text}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid var(--border-0)", display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--t-4)", letterSpacing: "0.06em" }}>
            RETAIL WEAPON PACK · v{versions[0].version}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--t-4)" }}>
            Built by @bptrades
          </span>
        </div>
      </div>
    </div>
  );
}