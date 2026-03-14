"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType = "FOMC" | "CPI" | "JOBS" | "EARNINGS";
type Impact = "HIGH" | "MEDIUM" | "LOW";

interface CalendarEvent {
  id: number;
  type: EventType;
  title: string;
  ticker?: string; // only for EARNINGS
  date: string;   // YYYY-MM-DD
  time: string;
  impact: Impact;
  forecast?: string | null;
  previous?: string | null;
  actual?: string | null;
}

// ─── Static data ──────────────────────────────────────────────────────────────
// In production: replace with fetch() calls to:
//   Macro  → https://finnhub.io/api/v1/calendar/economic?token=YOUR_KEY
//   Earnings → Alpaca: GET /v1beta1/corporate_actions/announcements?ca_types=Earnings&symbols=AAPL,NVDA,...

const MACRO_EVENTS: CalendarEvent[] = [
  { id: 1,  type: "CPI",  title: "CPI (YoY)",             date: "2026-03-12", time: "08:30 ET", impact: "HIGH",   forecast: "3.1%",           previous: "3.0%"           },
  { id: 2,  type: "JOBS", title: "Initial Jobless Claims", date: "2026-03-13", time: "08:30 ET", impact: "MEDIUM", forecast: "225K",            previous: "221K"           },
  { id: 3,  type: "FOMC", title: "Fed Rate Decision",      date: "2026-03-19", time: "14:00 ET", impact: "HIGH",   forecast: "4.25–4.50%",      previous: "4.25–4.50%"    },
  { id: 4,  type: "FOMC", title: "FOMC Meeting Minutes",   date: "2026-03-19", time: "14:00 ET", impact: "HIGH",   forecast: null,              previous: null             },
  { id: 5,  type: "CPI",  title: "Core PCE Price Index",   date: "2026-03-28", time: "08:30 ET", impact: "HIGH",   forecast: "2.7%",            previous: "2.6%"           },
  { id: 6,  type: "JOBS", title: "Non-Farm Payrolls",      date: "2026-04-04", time: "08:30 ET", impact: "HIGH",   forecast: "185K",            previous: "175K"           },
];

const EARNINGS_EVENTS: CalendarEvent[] = [
  { id: 101, type: "EARNINGS", title: "AAPL Earnings", ticker: "AAPL", date: "2026-04-30", time: "After Close", impact: "HIGH", forecast: "EPS $1.62", previous: "EPS $1.53" },
  { id: 102, type: "EARNINGS", title: "NVDA Earnings", ticker: "NVDA", date: "2026-05-21", time: "After Close", impact: "HIGH", forecast: "EPS $0.97", previous: "EPS $0.89" },
  { id: 103, type: "EARNINGS", title: "TSLA Earnings", ticker: "TSLA", date: "2026-04-22", time: "After Close", impact: "HIGH", forecast: "EPS $0.51", previous: "EPS $0.71" },
  { id: 104, type: "EARNINGS", title: "META Earnings", ticker: "META", date: "2026-04-29", time: "After Close", impact: "HIGH", forecast: "EPS $5.24", previous: "EPS $4.71" },
  { id: 105, type: "EARNINGS", title: "QQQ (NASDAQ composite earnings cycle)", ticker: "QQQ", date: "2026-04-25", time: "Various", impact: "MEDIUM", forecast: null, previous: null },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

function daysFromNow(dateStr: string): number {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - TODAY.getTime()) / 86_400_000);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const TYPE_STYLES: Record<EventType, { color: string; bg: string }> = {
  FOMC:     { color: "text-amber-300",  bg: "bg-amber-500/15 border-amber-500/30"  },
  CPI:      { color: "text-violet-300", bg: "bg-violet-500/15 border-violet-500/30"},
  JOBS:     { color: "text-cyan-300",   bg: "bg-cyan-500/15 border-cyan-500/30"    },
  EARNINGS: { color: "text-emerald-300",bg: "bg-emerald-500/15 border-emerald-500/30"},
};

const IMPACT_COLOR: Record<Impact, string> = {
  HIGH:   "bg-rose-400",
  MEDIUM: "bg-amber-400",
  LOW:    "bg-slate-500",
};

// ─── EventCard ────────────────────────────────────────────────────────────────

function EventCard({ event }: { event: CalendarEvent }) {
  const days = daysFromNow(event.date);
  const isPast = days < 0;
  const isToday = days === 0;
  const isSoon = days > 0 && days <= 3;
  const style = TYPE_STYLES[event.type];

  return (
    <div
      className={`
        rounded-xl border px-3 py-2.5 mb-2 transition-colors
        ${isToday
          ? "border-white/20 bg-white/5"
          : "border-white/10 bg-black/20 hover:bg-black/30"}
        ${isPast ? "opacity-40" : ""}
      `}
    >
      <div className="flex items-start justify-between gap-2">
        {/* Left */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <Badge variant="outline" className={`text-[10px] font-bold px-1.5 py-0 border ${style.bg} ${style.color}`}>
              {event.type}
            </Badge>
            <span className={`h-2 w-2 rounded-full flex-shrink-0 ${IMPACT_COLOR[event.impact]}`} title={`${event.impact} impact`} />
            {isToday && (
              <Badge variant="outline" className="text-[10px] font-bold px-1.5 py-0 border bg-rose-500/15 border-rose-500/30 text-rose-300">
                TODAY
              </Badge>
            )}
          </div>
          <div className="text-sm font-semibold text-slate-100 truncate">{event.title}</div>
          <div className="text-xs text-slate-400 mt-0.5">{formatDate(event.date)} · {event.time}</div>
        </div>

        {/* Right — data + countdown */}
        <div className="text-right flex-shrink-0">
          {event.actual ? (
            <div className="text-sm font-bold text-emerald-300">{event.actual}</div>
          ) : event.forecast ? (
            <div className="space-y-0.5">
              <div className="text-xs text-slate-300">
                <span className="text-slate-500">Fcst </span>{event.forecast}
              </div>
              {event.previous && (
                <div className="text-xs text-slate-500">
                  <span>Prev </span>{event.previous}
                </div>
              )}
            </div>
          ) : null}
          <div className={`text-[10px] mt-1 font-semibold ${
            isPast ? "text-slate-600"
            : isToday ? "text-rose-400"
            : isSoon ? "text-amber-400"
            : "text-slate-500"
          }`}>
            {isPast ? `${Math.abs(days)}d ago` : isToday ? "Today" : `in ${days}d`}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type FilterType = "ALL" | EventType;

interface EconomicCalendarProps {
  watchlist?: string[];
}

export default function EconomicCalendar({ watchlist = ["SPY", "QQQ", "AAPL", "TSLA", "NVDA"] }: EconomicCalendarProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FilterType>("ALL");
  const [showPast, setShowPast] = useState(false);

  // Merge + sort all events
  const allEvents: CalendarEvent[] = [...MACRO_EVENTS, ...EARNINGS_EVENTS].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Badge: high-impact events in next 7 days
  const urgentCount = allEvents.filter((e) => {
    const d = daysFromNow(e.date);
    return d >= 0 && d <= 7 && e.impact === "HIGH";
  }).length;

  // Filtered list
  const filtered = allEvents.filter((e) => {
    if (!showPast && daysFromNow(e.date) < 0) return false;
    if (filter !== "ALL" && e.type !== filter) return false;
    if (e.type === "EARNINGS" && e.ticker && !watchlist.includes(e.ticker)) return false;
    return true;
  });

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const FILTERS: FilterType[] = ["ALL", "FOMC", "CPI", "JOBS", "EARNINGS"];

  return (
    <>
      {/* ── Trigger button (drop into TopBar) ── */}
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        className="relative bg-white/5 border border-white/10 hover:bg-white/10"
      >
        <span>📅 Calendar</span>
        {urgentCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
            {urgentCount}
          </span>
        )}
      </Button>

      {/* ── Backdrop ── */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        />
      )}

      {/* ── Drawer ── */}
      <div
        className={`
          fixed top-0 right-0 z-50 h-screen w-[360px] flex flex-col
          bg-slate-950 border-l border-white/10
          shadow-2xl transition-transform duration-300 ease-in-out
          ${open ? "translate-x-0" : "translate-x-full"}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
          <div>
            <div className="text-sm font-semibold tracking-wide text-slate-100">Economic Calendar</div>
            <div className="text-xs text-slate-400 mt-0.5">Macro events · Watchlist earnings</div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setOpen(false)}
            className="bg-white/5 border border-white/10 h-7 w-7 p-0"
          >
            ✕
          </Button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 px-4 py-2.5 border-b border-white/10 flex-shrink-0 flex-wrap">
          {FILTERS.map((f) => {
            const style = f !== "ALL" ? TYPE_STYLES[f as EventType] : null;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`
                  px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wider border transition-all
                  ${filter === f
                    ? style
                      ? `${style.bg} ${style.color}`
                      : "bg-violet-500/15 border-violet-500/30 text-violet-300"
                    : "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200"}
                `}
              >
                {f}
              </button>
            );
          })}
        </div>

        {/* Legend + show past */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5 flex-shrink-0">
          {(["HIGH", "MEDIUM", "LOW"] as Impact[]).map((lvl) => (
            <div key={lvl} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${IMPACT_COLOR[lvl]}`} />
              <span className="text-[10px] text-slate-500">{lvl}</span>
            </div>
          ))}
          <label className="ml-auto flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showPast}
              onChange={(e) => setShowPast(e.target.checked)}
              className="accent-violet-400 h-3 w-3"
            />
            <span className="text-[10px] text-slate-500">Show past</span>
          </label>
        </div>

        {/* Event list */}
        <ScrollArea className="flex-1 px-4 py-3">
          {filtered.length === 0 ? (
            <div className="text-sm text-slate-500 text-center mt-10">
              No events match this filter.
            </div>
          ) : (
            filtered.map((event) => <EventCard key={event.id} event={event} />)
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-white/10 flex-shrink-0 flex items-center justify-between">
          <span className="text-[10px] text-slate-600">All times ET · Earnings filtered to watchlist</span>
          <span className="text-[10px] text-slate-700">RWP</span>
        </div>
      </div>
    </>
  );
}