"use client";

import React from "react";
import TradeJournal from "@/components/TradeJournal";
import WinRateHeatmap from "@/components/WinRateHeatmap";

export default function JournalPage(): React.JSX.Element {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-1)", color: "var(--t-1)" }}>

      <nav className="topbar">
        <div className="topbar-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <a href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--cyan-bg)", border: "1px solid var(--cyan-border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--cyan-text)" }}>RWP</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--t-1)" }}>Retail Weapon Pack</span>
            </a>
            <span style={{ color: "var(--border-1)" }}>·</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--cyan-text)", letterSpacing: "0.08em" }}>JOURNAL</span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <a href="/"        className="btn btn-ghost" style={{ textDecoration: "none", fontSize: 10 }}>← Dashboard</a>
            <a href="/brief"   className="btn btn-ghost" style={{ textDecoration: "none", fontSize: 10 }}>Pre-Market</a>
            <a href="/scanner" className="btn btn-ghost" style={{ textDecoration: "none", fontSize: 10 }}>Scanner</a>
          </div>
        </div>
      </nav>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 20px 48px" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 22 }}>📒</span>
            <h1 style={{ fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 700, color: "var(--t-1)", letterSpacing: "-0.02em", margin: 0 }}>
              Trade Journal
            </h1>
          </div>
          <div style={{ fontSize: 11, color: "var(--t-3)", fontFamily: "var(--font-mono)" }}>
            Log trades · Track performance · Find your edge
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 16, alignItems: "start" }}>
          <div className="panel">
            <div className="panel-header">
              <span className="panel-label">Trade Log</span>
            </div>
            <div className="panel-body">
              <TradeJournal currentSymbol="SPY" currentPrice={null} />
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <span className="panel-label">Edge Analysis</span>
              <span style={{ fontSize: 9, color: "var(--t-4)" }}>From your trade history</span>
            </div>
            <div className="panel-body">
              <WinRateHeatmap />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}