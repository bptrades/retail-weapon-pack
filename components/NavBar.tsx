"use client";
// components/NavBar.tsx
// Persistent top nav shared across all pages.
// Import this at the top of each page's return, or use it in layout.tsx

import React, { useState } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: string;
}

const NAV: NavItem[] = [
  { href: "/",         label: "Dashboard",  icon: "◈" },
  { href: "/brief",    label: "Pre-Market", icon: "🌅", badge: "NEW" },
  { href: "/scanner",  label: "Scanner",    icon: "⊕" },
  { href: "/journal",  label: "Journal",    icon: "📒" },
  { href: "/calendar", label: "Calendar",   icon: "📅" },
];

interface NavBarProps {
  symbol?: string;
  marketOpen?: boolean;
  usingLastSession?: boolean;
  onFetch?: () => void;
  onRunAI?: () => void;
  children?: React.ReactNode; // for extra controls injected by page
}

export default function NavBar({
  symbol, marketOpen, usingLastSession, onFetch, onRunAI, children
}: NavBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Detect current path client-side
  const currentPath = typeof window !== "undefined" ? window.location.pathname : "/";

  return (
    <nav className="topbar">
      <div className="topbar-inner">

        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <div style={{ position: "relative" }}>
              <div style={{
                width: 30, height: 30, borderRadius: 7,
                background: "var(--cyan-bg)", border: "1px solid var(--cyan-border)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 800, color: "var(--cyan-text)", letterSpacing: "0.1em" }}>RWP</span>
              </div>
              <span className="pulse-dot" style={{
                position: "absolute", top: -2, right: -2,
                width: 6, height: 6, borderRadius: "50%", background: "var(--cyan)",
              }} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t-1)", lineHeight: 1.1 }}>Retail Weapon Pack</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--t-4)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                0-DTE Intelligence Platform
              </div>
            </div>
          </a>

          {/* Page nav — desktop */}
          <div style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: 12, borderLeft: "1px solid var(--border-0)", paddingLeft: 12 }}>
            {NAV.map(item => {
              const active = currentPath === item.href;
              return (
                <a key={item.href} href={item.href}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                    letterSpacing: "0.06em", textTransform: "uppercase",
                    padding: "5px 9px", borderRadius: 6, textDecoration: "none",
                    border: "1px solid",
                    background: active ? "var(--bg-4)" : "transparent",
                    borderColor: active ? "var(--border-2)" : "transparent",
                    color: active ? "var(--t-1)" : "var(--t-3)",
                    transition: "background 70ms, color 70ms, border-color 70ms",
                    position: "relative",
                  }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.color = "var(--t-2)"; e.currentTarget.style.borderColor = "var(--border-1)"; }}}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.color = "var(--t-3)"; e.currentTarget.style.borderColor = "transparent"; }}}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                  {item.badge && (
                    <span style={{
                      fontSize: 7, fontWeight: 800, letterSpacing: "0.08em",
                      padding: "1px 4px", borderRadius: 3,
                      background: "var(--cyan-bg)", border: "1px solid var(--cyan-border)", color: "var(--cyan-text)",
                    }}>{item.badge}</span>
                  )}
                </a>
              );
            })}
          </div>
        </div>

        {/* Right controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Status pills */}
          {symbol && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span className={`pill ${marketOpen ? "open" : "closed"}`}>
                <span className={`pill-dot ${marketOpen ? "green pulse-dot" : "muted"}`} />
                {marketOpen ? "OPEN" : "CLOSED"}
              </span>
              <span className={`pill ${usingLastSession ? "stale" : "live"}`}>
                {usingLastSession ? "STALE" : "LIVE"}
              </span>
              <span className="pill sym" style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{symbol}</span>
            </div>
          )}

          {/* Injected page controls */}
          {children}

          {/* Quick actions */}
          {onFetch  && <button className="btn btn-ghost"   style={{ fontSize: 10 }} onClick={onFetch}>Fetch</button>}
          {onRunAI  && <button className="btn btn-primary" style={{ fontSize: 10 }} onClick={onRunAI}>Run AI</button>}
        </div>
      </div>
    </nav>
  );
}