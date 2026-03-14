"use client";
import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
export type WatchGroup = "core" | "swing" | "dte" | "custom";

export interface WatchlistItem {
  symbol: string;
  group: WatchGroup;
  note?: string;
  addedAt: string;
}

interface WatchlistGroupsProps {
  onSelect: (symbol: string) => void;
  activeSymbol: string;
}

const GROUP_META: Record<WatchGroup, { label: string; icon: string; desc: string; color: string; bg: string; border: string }> = {
  core:   { label: "Core",    icon: "◈", desc: "Index ETFs + macro",     color: "var(--cyan-text)",  bg: "var(--cyan-bg)",  border: "var(--cyan-border)"  },
  swing:  { label: "Swing",   icon: "◉", desc: "Multi-day setups",       color: "#a78bfa",            bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.22)" },
  dte:    { label: "0DTE",    icon: "⚡", desc: "Daily options plays",    color: "var(--amber-text)", bg: "var(--amber-bg)", border: "var(--amber-border)" },
  custom: { label: "Custom",  icon: "○", desc: "Everything else",         color: "var(--t-2)",        bg: "var(--bg-3)",     border: "var(--border-1)"    },
};

const DEFAULTS: WatchlistItem[] = [
  { symbol: "SPY",  group: "core",   addedAt: new Date().toISOString() },
  { symbol: "QQQ",  group: "core",   addedAt: new Date().toISOString() },
  { symbol: "IWM",  group: "core",   addedAt: new Date().toISOString() },
  { symbol: "VIX",  group: "core",   addedAt: new Date().toISOString() },
  { symbol: "TSLA", group: "dte",    addedAt: new Date().toISOString() },
  { symbol: "NVDA", group: "dte",    addedAt: new Date().toISOString() },
  { symbol: "AAPL", group: "swing",  addedAt: new Date().toISOString() },
];

const LS_KEY = "rwp_watchlist_v2";

function load(): WatchlistItem[] {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULTS;
    return JSON.parse(raw);
  } catch { return DEFAULTS; }
}

function save(items: WatchlistItem[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(items)); } catch {}
}

export default function WatchlistGroups({ onSelect, activeSymbol }: WatchlistGroupsProps) {
  const [items,      setItems]      = useState<WatchlistItem[]>(DEFAULTS);
  const [activeTab,  setActiveTab]  = useState<WatchGroup | "all">("all");
  const [newSym,     setNewSym]     = useState("");
  const [newGroup,   setNewGroup]   = useState<WatchGroup>("dte");
  const [newNote,    setNewNote]    = useState("");
  const [editSym,    setEditSym]    = useState<string | null>(null);
  const [dragging,   setDragging]   = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => { setItems(load()); }, []);

  const persist = useCallback((next: WatchlistItem[]) => {
    setItems(next);
    save(next);
  }, []);

  function addItem() {
    const sym = newSym.toUpperCase().trim().replace(/\s+/g, "");
    if (!sym || !/^[A-Z.\-]{1,10}$/.test(sym)) { toast.error("Invalid ticker"); return; }
    if (items.find(i => i.symbol === sym)) { toast.error(`${sym} already in watchlist`); return; }
    persist([...items, { symbol: sym, group: newGroup, note: newNote.trim() || undefined, addedAt: new Date().toISOString() }]);
    setNewSym(""); setNewNote("");
    toast.success(`${sym} added to ${GROUP_META[newGroup].label}`);
  }

  function removeItem(sym: string) {
    persist(items.filter(i => i.symbol !== sym));
  }

  function moveToGroup(sym: string, group: WatchGroup) {
    persist(items.map(i => i.symbol === sym ? { ...i, group } : i));
    setEditSym(null);
  }

  const displayed = activeTab === "all" ? items : items.filter(i => i.group === activeTab);

  const counts = Object.keys(GROUP_META).reduce((acc, g) => {
    acc[g as WatchGroup] = items.filter(i => i.group === g).length;
    return acc;
  }, {} as Record<WatchGroup, number>);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

      {/* Group tabs */}
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        <button
          onClick={() => setActiveTab("all")}
          style={{
            fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
            letterSpacing: "0.07em", textTransform: "uppercase",
            padding: "4px 9px", borderRadius: 5, border: "1px solid", cursor: "pointer",
            background: activeTab === "all" ? "var(--bg-4)" : "var(--bg-3)",
            borderColor: activeTab === "all" ? "var(--border-2)" : "var(--border-0)",
            color: activeTab === "all" ? "var(--t-1)" : "var(--t-3)",
          }}
        >All ({items.length})</button>

        {(Object.entries(GROUP_META) as [WatchGroup, typeof GROUP_META[WatchGroup]][]).map(([key, meta]) => (
          <button key={key}
            onClick={() => setActiveTab(key)}
            style={{
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.07em", textTransform: "uppercase",
              padding: "4px 9px", borderRadius: 5, border: "1px solid", cursor: "pointer",
              background: activeTab === key ? meta.bg : "var(--bg-3)",
              borderColor: activeTab === key ? meta.border : "var(--border-0)",
              color: activeTab === key ? meta.color : "var(--t-3)",
            }}
          >
            {meta.icon} {meta.label} ({counts[key]})
          </button>
        ))}
      </div>

      {/* Ticker list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {displayed.length === 0 && (
          <div style={{ textAlign: "center", padding: "14px 0", color: "var(--t-4)", fontSize: 10 }}>
            No tickers in this group. Add one below.
          </div>
        )}

        {displayed.map(item => {
          const meta = GROUP_META[item.group];
          const isActive = item.symbol === activeSymbol;
          const isEditing = editSym === item.symbol;

          return (
            <div key={item.symbol}>
              <div
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "7px 10px", borderRadius: 7,
                  border: `1px solid ${isActive ? "var(--cyan-border)" : "var(--border-0)"}`,
                  background: isActive ? "var(--cyan-bg)" : "var(--bg-3)",
                  transition: "border-color 70ms, background 70ms",
                  cursor: "pointer",
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = "var(--border-2)"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = "var(--border-0)"; }}
              >
                {/* Left: symbol + group dot */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 9, color: meta.color, flexShrink: 0 }}>{meta.icon}</span>
                  <button
                    onClick={() => onSelect(item.symbol)}
                    style={{
                      fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700,
                      color: isActive ? "var(--cyan-text)" : "var(--t-1)",
                      background: "none", border: "none", cursor: "pointer",
                      letterSpacing: "0.04em",
                    }}
                  >{item.symbol}</button>
                  {item.note && (
                    <span style={{ fontSize: 9, color: "var(--t-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.note}
                    </span>
                  )}
                </div>

                {/* Right: group badge + actions */}
                <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                    letterSpacing: "0.07em", textTransform: "uppercase",
                    padding: "2px 6px", borderRadius: 3,
                    background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color,
                  }}>{meta.label}</span>

                  <button
                    onClick={() => setEditSym(isEditing ? null : item.symbol)}
                    style={{ fontSize: 10, color: "var(--t-3)", background: "none", border: "none", cursor: "pointer", padding: "0 2px" }}
                  >⋯</button>
                  <button
                    onClick={() => removeItem(item.symbol)}
                    style={{ fontSize: 10, color: "var(--t-4)", background: "none", border: "none", cursor: "pointer", padding: "0 2px", transition: "color 70ms" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "var(--red-text)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "var(--t-4)")}
                  >✕</button>
                </div>
              </div>

              {/* Edit popover: move to group */}
              {isEditing && (
                <div style={{
                  background: "var(--bg-4)", border: "1px solid var(--border-1)",
                  borderRadius: 7, padding: "8px 10px", marginTop: 2,
                  display: "flex", flexDirection: "column", gap: 5,
                }}>
                  <div style={{ fontSize: 9, color: "var(--t-3)", marginBottom: 2, fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Move {item.symbol} to group
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {(Object.entries(GROUP_META) as [WatchGroup, typeof GROUP_META[WatchGroup]][]).map(([key, meta]) => (
                      <button key={key}
                        onClick={() => moveToGroup(item.symbol, key)}
                        style={{
                          fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                          padding: "3px 8px", borderRadius: 4, border: "1px solid",
                          cursor: "pointer",
                          background: item.group === key ? meta.bg : "var(--bg-3)",
                          borderColor: item.group === key ? meta.border : "var(--border-1)",
                          color: item.group === key ? meta.color : "var(--t-3)",
                        }}
                      >{meta.icon} {meta.label}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add ticker */}
      <div style={{
        background: "var(--bg-3)", border: "1px solid var(--border-0)", borderRadius: 8, padding: "10px 12px",
        display: "flex", flexDirection: "column", gap: 7,
      }}>
        <div className="label-xs">Add Ticker</div>
        <div style={{ display: "flex", gap: 5 }}>
          <input
            className="inp"
            value={newSym}
            onChange={e => setNewSym(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addItem(); }}
            placeholder="TICKER"
            maxLength={10}
            style={{ flex: 1, textTransform: "uppercase", fontWeight: 700, fontSize: 12 }}
          />
          <select
            value={newGroup}
            onChange={e => setNewGroup(e.target.value as WatchGroup)}
            style={{
              background: "var(--bg-4)", border: "1px solid var(--border-1)", color: "var(--t-2)",
              fontFamily: "var(--font-mono)", fontSize: 10, borderRadius: 6, padding: "0 6px",
            }}
          >
            {(Object.entries(GROUP_META) as [WatchGroup, typeof GROUP_META[WatchGroup]][]).map(([key, meta]) => (
              <option key={key} value={key}>{meta.icon} {meta.label}</option>
            ))}
          </select>
        </div>
        <input
          className="inp"
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          placeholder="Note (optional)"
          style={{ fontSize: 11 }}
        />
        <button className="btn btn-primary btn-full" onClick={addItem} style={{ fontSize: 10 }}>
          + Add to {GROUP_META[newGroup].label}
        </button>
      </div>

      {/* Group legend */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {(Object.entries(GROUP_META) as [WatchGroup, typeof GROUP_META[WatchGroup]][]).map(([key, meta]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 10, color: meta.color, flexShrink: 0 }}>{meta.icon}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: meta.color, minWidth: 36 }}>{meta.label}</span>
            <span style={{ fontSize: 9, color: "var(--t-4)" }}>{meta.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}