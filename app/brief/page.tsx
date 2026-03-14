"use client";

import React, { useState, useEffect } from "react";
import PreMarketBrief from "@/components/PreMarketBrief";
import CorrelationDashboard from "@/components/CorrelationDashboard";
import NewsFeed from "@/components/NewsFeed";
import { toast } from "sonner";

const LS_SNAP  = "rwp_last_snapshot";
const LS_WATCH = "rwp_watchlist_v2";

export default function BriefPage(): React.JSX.Element {
  const [symbol,     setSymbol]     = useState<string>("SPY");
  const [inputObj,   setInputObj]   = useState<any>(null);
  const [watchlist,  setWatchlist]  = useState<string[]>(["SPY", "QQQ", "IWM"]);
  const [loading,    setLoading]    = useState<boolean>(false);
  const [marketOpen, setMarketOpen] = useState<boolean>(false);
  const [regime,     setRegime]     = useState<any>(null);

  useEffect(() => {
    const check = () => {
      const now = new Date();
      const et  = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
      const h   = et.getHours();
      const m   = et.getMinutes();
      const d   = et.getDay();
      setMarketOpen(d >= 1 && d <= 5 && (h > 9 || (h === 9 && m >= 30)) && h < 16);
    };
    check();
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    try {
      const snap = localStorage.getItem(LS_SNAP);
      if (snap) setInputObj(JSON.parse(snap));
      const wl = localStorage.getItem(LS_WATCH);
      if (wl) {
        const parsed = JSON.parse(wl);
        if (Array.isArray(parsed)) {
          setWatchlist(parsed.map((i: any) => (typeof i === "string" ? i : i.symbol)).filter(Boolean));
        }
      }
    } catch {}
  }, []);

  async function fetchSnapshot(): Promise<void> {
    setLoading(true);
    try {
      const res  = await fetch(`/api/snapshot?symbol=${encodeURIComponent(symbol)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Fetch failed");
      setInputObj(data);
      localStorage.setItem(LS_SNAP, JSON.stringify(data));
      toast.success(`${symbol} snapshot updated`);
    } catch (e: any) {
      toast.error(e?.message || "Fetch failed");
    } finally {
      setLoading(false);
    }
  }

  const now           = new Date();
  const etHour        = now.getUTCHours() - 4;
  const isPreMarket   = etHour >= 4 && etHour < 9;
  const isMarketHours = etHour >= 9 && etHour < 16;

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
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--cyan-text)", letterSpacing: "0.08em" }}>PRE-MARKET BRIEF</span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span className={`pill ${marketOpen ? "open" : "closed"}`}>
              <span className={`pill-dot ${marketOpen ? "green pulse-dot" : "muted"}`} />
              {marketOpen ? "OPEN" : "CLOSED"}
            </span>
            <a href="/"        className="btn btn-ghost" style={{ textDecoration: "none", fontSize: 10 }}>← Dashboard</a>
            <a href="/scanner" className="btn btn-ghost" style={{ textDecoration: "none", fontSize: 10 }}>Scanner</a>
            <button className="btn btn-primary" style={{ fontSize: 10 }} onClick={fetchSnapshot} disabled={loading}>
              {loading ? "⟳" : "Fetch"}
            </button>
          </div>
        </div>
      </nav>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 20px 0" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 22 }}>🌅</span>
              <h1 style={{ fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 700, color: "var(--t-1)", letterSpacing: "-0.02em", margin: 0 }}>
                Pre-Market Brief
              </h1>
              {isPreMarket   && <span className="badge cyan" style={{ fontSize: 9 }}>PRE-MARKET</span>}
              {isMarketHours && <span className="badge bull" style={{ fontSize: 9 }}>MARKET OPEN</span>}
            </div>
            <div style={{ fontSize: 11, color: "var(--t-3)", fontFamily: "var(--font-mono)" }}>
              Morning intelligence briefing · {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input className="inp" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase().trim())} placeholder="Symbol" style={{ width: 70, textAlign: "center", fontWeight: 700, fontSize: 13 }} />
            <button className="btn btn-primary" onClick={fetchSnapshot} disabled={loading}>{loading ? "⟳" : "Fetch"}</button>
          </div>
        </div>

        {regime && (
          <div style={{
            marginBottom: 16, padding: "10px 16px", borderRadius: 8,
            background: regime.regime === "trending_bull" ? "var(--green-bg)" : regime.regime === "trending_bear" ? "var(--red-bg)" : "var(--amber-bg)",
            border: `1px solid ${regime.regime === "trending_bull" ? "var(--green-border)" : regime.regime === "trending_bear" ? "var(--red-border)" : "var(--amber-border)"}`,
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: regime.regime === "trending_bull" ? "var(--green-text)" : regime.regime === "trending_bear" ? "var(--red-text)" : "var(--amber-text)" }}>
              {String(regime.regime).replace(/_/g, " ").toUpperCase()}
            </span>
            <span style={{ fontSize: 11, color: "var(--t-2)" }}>{regime.reasoning}</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--t-3)" }}>{regime.confidence}% confidence</span>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 20px 32px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="panel">
            <div className="panel-header">
              <span className="panel-label">AI Morning Brief</span>
              <span style={{ fontSize: 9, color: "var(--t-4)", fontFamily: "var(--font-mono)" }}>{symbol}</span>
            </div>
            <div className="panel-body">
              <PreMarketBrief symbol={symbol} inputObj={inputObj} watchlist={watchlist} />
            </div>
          </div>
          <div className="panel">
            <div className="panel-header"><span className="panel-label">Market Correlation</span></div>
            <div className="panel-body">
              <CorrelationDashboard activeSymbol={symbol} onSelectSymbol={setSymbol} />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="panel">
            <div className="panel-header"><span className="panel-label">News & Market Regime</span></div>
            <div className="panel-body">
              <NewsFeed symbol={symbol} inputObj={inputObj} onRegimeChange={setRegime} />
            </div>
          </div>
          <div className="panel">
            <div className="panel-header"><span className="panel-label">Watchlist Quick-Load</span></div>
            <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {watchlist.slice(0, 8).map(sym => (
                <button key={sym} onClick={() => setSymbol(sym)} style={{
                  width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: 7,
                  border: `1px solid ${symbol === sym ? "var(--cyan-border)" : "var(--border-0)"}`,
                  background: symbol === sym ? "var(--cyan-bg)" : "var(--bg-3)",
                  cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700,
                  color: symbol === sym ? "var(--cyan-text)" : "var(--t-1)", transition: "all 70ms",
                }}>{sym}</button>
              ))}
              {watchlist.length === 0 && (
                <div style={{ fontSize: 10, color: "var(--t-4)", textAlign: "center", padding: "12px 0" }}>
                  Add tickers to your watchlist on the dashboard.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}