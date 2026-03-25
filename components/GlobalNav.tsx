"use client";
// components/GlobalNav.tsx
// Persistent fixed nav bar that renders on EVERY page via layout.tsx.
// Shows active page by comparing window.location.pathname.
// No props needed — fully self-contained.

import { usePathname } from "next/navigation";

const NAV = [
  { href: "/",          label: "Dashboard",  icon: "◈" },
  { href: "/brief",     label: "Pre-Market", icon: "🌅" },
  { href: "/scanner",   label: "Scanner",    icon: "⚡" },
  { href: "/journal",   label: "Journal",    icon: "📒" },
  { href: "/changelog", label: "Changelog",  icon: "◎" },
];

export default function GlobalNav() {
  const pathname = usePathname();

  return (
    <nav style={{
      position: "fixed",
      top: 0, left: 0, right: 0,
      zIndex: 100,
      height: 48,
      background: "var(--bg-0)",
      borderBottom: "1px solid var(--border-1)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 16px",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
    }}>

      {/* Brand */}
      <a href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: "var(--cyan-bg)", border: "1px solid var(--cyan-border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative",
          flexShrink: 0,
        }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 800,
            color: "var(--cyan-text)", letterSpacing: "0.1em",
          }}>
            RWP
          </span>
          {/* Pulse dot */}
          <span style={{
            position: "absolute", top: -2, right: -2,
            width: 6, height: 6, borderRadius: "50%",
            background: "var(--cyan)",
            boxShadow: "0 0 5px var(--cyan)",
            animation: "pulse 2s infinite",
          }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
            color: "var(--t-1)", letterSpacing: "0.05em",
            lineHeight: 1,
          }}>
            RETAIL WEAPON PACK
          </span>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--t-4)",
            letterSpacing: "0.1em", textTransform: "uppercase", lineHeight: 1,
          }}>
            0-DTE Intelligence Platform
          </span>
        </div>
      </a>

      {/* Page links */}
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        {NAV.map(item => {
          // Exact match for "/" so it doesn't highlight on every page
          const active = item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);

          return (
            <a key={item.href} href={item.href}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                letterSpacing: "0.06em", textTransform: "uppercase",
                padding: "5px 10px", borderRadius: 6, textDecoration: "none",
                transition: "color 70ms, background 70ms, border-color 70ms",
                // Active = highlighted, inactive = subtle
                background:   active ? "var(--bg-4)"    : "transparent",
                borderWidth:  1,
                borderStyle:  "solid",
                borderColor:  active ? "var(--border-2)" : "transparent",
                color:        active ? "var(--t-1)"      : "var(--t-3)",
                // Active page gets a cyan bottom accent line
                boxShadow:    active ? "inset 0 -2px 0 var(--cyan)" : "none",
              }}
            >
              <span style={{ fontSize: 11, lineHeight: 1 }}>{item.icon}</span>
              <span>{item.label}</span>
            </a>
          );
        })}
      </div>

      {/* Right side */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 8,
          color: "var(--t-4)", letterSpacing: "0.08em",
        }}>
          v0.5.1
        </span>
        {/* Live indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{
            width: 5, height: 5, borderRadius: "50%",
            background: "var(--green)",
            boxShadow: "0 0 4px var(--green)",
            display: "inline-block",
          }} />
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 8,
            color: "var(--green-text)", fontWeight: 700, letterSpacing: "0.08em",
          }}>
            LIVE
          </span>
        </div>
      </div>
    </nav>
  );
}