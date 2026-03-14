"use client";

import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { Button }     from "@/components/ui/button";
import { Badge }      from "@/components/ui/badge";
import { Input }      from "@/components/ui/input";
import { Textarea }   from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator }  from "@/components/ui/separator";

// ─── Types ────────────────────────────────────────────────────────────────────

type TradeOutcome = "win" | "loss" | "breakeven";
type TradeBias    = "bullish" | "bearish" | "neutral";

interface TradeEntry {
  id:        string;
  ts:        string;        // ISO timestamp logged
  symbol:    string;
  bias:      TradeBias;
  direction: "long" | "short";
  entry:     number;
  exit:      number;
  stop:      number;
  size:      number;        // shares / contracts
  pnl:       number;        // dollar P&L
  rMultiple: number;        // R multiple
  outcome:   TradeOutcome;
  notes:     string;
  setup:     string;        // e.g. "VWAP reclaim", "breakout"
}

// ─── Storage key ─────────────────────────────────────────────────────────────
const JOURNAL_KEY = "rw_journal_v1";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcR(entry: number, exit: number, stop: number, dir: "long" | "short"): number {
  const risk   = Math.abs(entry - stop);
  if (!risk) return 0;
  const profit = dir === "long" ? exit - entry : entry - exit;
  return Number((profit / risk).toFixed(2));
}

function calcPnl(entry: number, exit: number, size: number, dir: "long" | "short"): number {
  const diff = dir === "long" ? exit - entry : entry - exit;
  return Number((diff * size).toFixed(2));
}

function outcomeFromR(r: number): TradeOutcome {
  if (r > 0.1)  return "win";
  if (r < -0.1) return "loss";
  return "breakeven";
}

function fmtMoney(n: number): string {
  const abs = Math.abs(n).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  return n < 0 ? `-${abs}` : abs;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function profitFactor(trades: TradeEntry[]): string {
  const grossWin  = trades.filter(t => t.outcome === "win") .reduce((s, t) => s + t.pnl, 0);
  const grossLoss = trades.filter(t => t.outcome === "loss").reduce((s, t) => s + Math.abs(t.pnl), 0);
  if (!grossLoss) return grossWin > 0 ? "∞" : "—";
  return (grossWin / grossLoss).toFixed(2);
}

// ─── Stat tile ────────────────────────────────────────────────────────────────

function StatTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-xl font-black tabular-nums ${color ?? "text-slate-100"}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-600 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Win rate ring ────────────────────────────────────────────────────────────

function WinRateRing({ rate }: { rate: number }) {
  const r   = 28;
  const circ = 2 * Math.PI * r;
  const fill = (rate / 100) * circ;
  const color = rate >= 60 ? "#34d399" : rate >= 45 ? "#fbbf24" : "#f87171";

  return (
    <div className="flex flex-col items-center justify-center">
      <svg width={72} height={72} className="-rotate-90">
        <circle cx={36} cy={36} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={6} />
        <circle cx={36} cy={36} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div className="text-center -mt-[52px] mb-[14px]">
        <div className={`text-lg font-black tabular-nums`} style={{ color }}>{rate.toFixed(0)}%</div>
      </div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Win Rate</div>
    </div>
  );
}

// ─── P&L bar chart (last 10 trades) ──────────────────────────────────────────

function PnlBars({ trades }: { trades: TradeEntry[] }) {
  const last10  = trades.slice(0, 10).reverse();
  if (!last10.length) return null;
  const maxAbs  = Math.max(...last10.map(t => Math.abs(t.pnl)), 1);

  return (
    <div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Last {last10.length} Trades</div>
      <div className="flex items-end gap-1 h-14">
        {last10.map((t) => {
          const pct    = (Math.abs(t.pnl) / maxAbs) * 100;
          const isWin  = t.outcome === "win";
          const isBe   = t.outcome === "breakeven";
          return (
            <div key={t.id} className="flex-1 flex flex-col items-center gap-0.5" title={`${t.symbol} ${fmtMoney(t.pnl)}`}>
              <div
                className={`w-full rounded-sm transition-all duration-300 ${isWin ? "bg-emerald-500/70" : isBe ? "bg-amber-500/50" : "bg-rose-500/70"}`}
                style={{ height: `${Math.max(pct, 8)}%` }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Trade row ────────────────────────────────────────────────────────────────

function TradeRow({ trade, onDelete }: { trade: TradeEntry; onDelete: (id: string) => void }) {
  const isWin  = trade.outcome === "win";
  const isLoss = trade.outcome === "loss";

  return (
    <div className={`rounded-xl border px-3 py-2.5 mb-2 ${
      isWin  ? "border-emerald-500/20 bg-emerald-500/5"
      : isLoss ? "border-rose-500/20 bg-rose-500/5"
      : "border-white/10 bg-black/20"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className="text-sm font-black font-mono text-slate-100">{trade.symbol}</span>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border font-bold ${
              trade.direction === "long"
                ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-300"
                : "bg-violet-500/15 border-violet-500/30 text-violet-300"
            }`}>{trade.direction.toUpperCase()}</Badge>
            {trade.setup && (
              <span className="text-[10px] text-slate-500 border border-white/10 rounded px-1.5 py-0.5 bg-white/5">{trade.setup}</span>
            )}
          </div>

          <div className="flex gap-3 text-[10px] text-slate-500 flex-wrap">
            <span>In <b className="text-slate-300">{trade.entry.toFixed(2)}</b></span>
            <span>Out <b className="text-slate-300">{trade.exit.toFixed(2)}</b></span>
            <span>Stop <b className="text-slate-300">{trade.stop.toFixed(2)}</b></span>
            <span>Size <b className="text-slate-300">{trade.size}</b></span>
          </div>

          {trade.notes && (
            <div className="text-[10px] text-slate-600 mt-1 truncate">{trade.notes}</div>
          )}

          <div className="text-[10px] text-slate-600 mt-1">{fmtDate(trade.ts)}</div>
        </div>

        <div className="text-right flex-shrink-0 space-y-1">
          <div className={`text-sm font-black tabular-nums ${isWin ? "text-emerald-300" : isLoss ? "text-rose-300" : "text-amber-300"}`}>
            {fmtMoney(trade.pnl)}
          </div>
          <div className={`text-xs font-bold tabular-nums ${isWin ? "text-emerald-400/70" : isLoss ? "text-rose-400/70" : "text-amber-400/70"}`}>
            {trade.rMultiple > 0 ? "+" : ""}{trade.rMultiple}R
          </div>
          <button onClick={() => onDelete(trade.id)} className="text-[10px] text-slate-700 hover:text-rose-400 transition-colors">delete</button>
        </div>
      </div>
    </div>
  );
}

// ─── Add trade form ───────────────────────────────────────────────────────────

interface AddTradeFormProps {
  currentSymbol: string;
  currentPrice:  number | null;
  onAdd:         (t: TradeEntry) => void;
}

function AddTradeForm({ currentSymbol, currentPrice, onAdd }: AddTradeFormProps) {
  const [symbol,    setSymbol]    = useState(currentSymbol);
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [bias,      setBias]      = useState<TradeBias>("bullish");
  const [entry,     setEntry]     = useState<string>(currentPrice ? String(currentPrice) : "");
  const [exit,      setExit]      = useState<string>("");
  const [stop,      setStop]      = useState<string>("");
  const [size,      setSize]      = useState<string>("1");
  const [setup,     setSetup]     = useState<string>("");
  const [notes,     setNotes]     = useState<string>("");

  const entryN = parseFloat(entry);
  const exitN  = parseFloat(exit);
  const stopN  = parseFloat(stop);
  const sizeN  = parseFloat(size);

  const preview = useMemo(() => {
    if (!entryN || !exitN || !stopN || !sizeN) return null;
    const r   = calcR(entryN, exitN, stopN, direction);
    const pnl = calcPnl(entryN, exitN, sizeN, direction);
    return { r, pnl, outcome: outcomeFromR(r) };
  }, [entryN, exitN, stopN, sizeN, direction]);

  function handleSubmit() {
    if (!entryN || !exitN || !stopN || !sizeN || !symbol.trim()) {
      toast.error("Fill in symbol, entry, exit, stop and size.");
      return;
    }
    const r   = calcR(entryN, exitN, stopN, direction);
    const pnl = calcPnl(entryN, exitN, sizeN, direction);
    const trade: TradeEntry = {
      id:        `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      ts:        new Date().toISOString(),
      symbol:    symbol.toUpperCase().trim(),
      bias, direction,
      entry: entryN, exit: exitN, stop: stopN, size: sizeN,
      pnl, rMultiple: r, outcome: outcomeFromR(r),
      setup: setup.trim(), notes: notes.trim(),
    };
    onAdd(trade);
    setExit(""); setNotes(""); setSetup("");
    toast.success(`Trade logged: ${trade.symbol} ${fmtMoney(pnl)}`);
  }

  const SETUPS = ["VWAP Reclaim", "Breakout", "Trend Pull", "Fade", "Opening Drive", "Mean Rev"];

  return (
    <div className="space-y-3">
      <div className="text-[10px] text-slate-500 uppercase tracking-widest">Log a Trade</div>

      {/* Symbol + direction + bias */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <div className="text-[10px] text-slate-600 mb-1">Symbol</div>
          <Input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} className="bg-white/5 border-white/10 font-mono font-bold text-sm h-8" />
        </div>
        <div>
          <div className="text-[10px] text-slate-600 mb-1">Direction</div>
          <div className="flex gap-1">
            {(["long","short"] as const).map(d => (
              <button key={d} onClick={() => setDirection(d)}
                className={`flex-1 rounded-lg border text-[10px] font-bold h-8 transition-all ${
                  direction === d
                    ? d === "long" ? "bg-cyan-500/20 border-cyan-500/30 text-cyan-300" : "bg-violet-500/20 border-violet-500/30 text-violet-300"
                    : "bg-white/5 border-white/10 text-slate-500"
                }`}
              >{d === "long" ? "▲ L" : "▼ S"}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-600 mb-1">Bias</div>
          <select value={bias} onChange={e => setBias(e.target.value as TradeBias)}
            className="w-full h-8 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-xs px-2 focus:outline-none">
            <option value="bullish">Bullish</option>
            <option value="bearish">Bearish</option>
            <option value="neutral">Neutral</option>
          </select>
        </div>
      </div>

      {/* Entry / exit / stop / size */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Entry",  val: entry,  set: setEntry },
          { label: "Exit",   val: exit,   set: setExit  },
          { label: "Stop",   val: stop,   set: setStop  },
          { label: "Size",   val: size,   set: setSize  },
        ].map(({ label, val, set }) => (
          <div key={label}>
            <div className="text-[10px] text-slate-600 mb-1">{label}</div>
            <Input type="number" value={val} onChange={e => set(e.target.value)}
              className="bg-white/5 border-white/10 font-mono text-xs h-8" />
          </div>
        ))}
      </div>

      {/* Setup chips */}
      <div>
        <div className="text-[10px] text-slate-600 mb-1.5">Setup</div>
        <div className="flex gap-1.5 flex-wrap">
          {SETUPS.map(s => (
            <button key={s} onClick={() => setSetup(setup === s ? "" : s)}
              className={`px-2 py-1 rounded-lg border text-[10px] font-medium transition-all ${
                setup === s ? "bg-cyan-500/20 border-cyan-500/30 text-cyan-300" : "bg-white/5 border-white/10 text-slate-500 hover:text-slate-300"
              }`}
            >{s}</button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <Textarea value={notes} onChange={e => setNotes(e.target.value)}
        placeholder="Notes (optional)…"
        className="bg-white/5 border-white/10 text-xs min-h-[60px] resize-none" />

      {/* Live preview */}
      {preview && (
        <div className={`rounded-xl border px-3 py-2 flex items-center justify-between ${
          preview.outcome === "win"  ? "border-emerald-500/30 bg-emerald-500/5"
          : preview.outcome === "loss" ? "border-rose-500/30 bg-rose-500/5"
          : "border-amber-500/30 bg-amber-500/5"
        }`}>
          <span className="text-xs text-slate-400">Preview</span>
          <div className="flex items-center gap-3">
            <span className={`text-sm font-black tabular-nums ${
              preview.outcome === "win" ? "text-emerald-300" : preview.outcome === "loss" ? "text-rose-300" : "text-amber-300"
            }`}>{fmtMoney(preview.pnl)}</span>
            <span className={`text-xs font-bold ${preview.r > 0 ? "text-emerald-400/70" : "text-rose-400/70"}`}>
              {preview.r > 0 ? "+" : ""}{preview.r}R
            </span>
          </div>
        </div>
      )}

      <Button onClick={handleSubmit}
        className="w-full bg-cyan-500/20 border border-cyan-400/30 text-cyan-100 hover:bg-cyan-500/30 font-bold">
        Log Trade
      </Button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface TradeJournalProps {
  currentSymbol: string;
  currentPrice:  number | null;
}

type JournalView = "stats" | "log" | "add";

export default function TradeJournal({ currentSymbol, currentPrice }: TradeJournalProps) {
  const [open,   setOpen]   = useState(false);
  const [view,   setView]   = useState<JournalView>("stats");
  const [trades, setTrades] = useState<TradeEntry[]>([]);
  const [filter, setFilter] = useState<string>("ALL");

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(JOURNAL_KEY);
      if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) setTrades(p); }
    } catch {}
  }, []);

  // Persist
  useEffect(() => {
    try { localStorage.setItem(JOURNAL_KEY, JSON.stringify(trades)); } catch {}
  }, [trades]);

  // Escape to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  function addTrade(t: TradeEntry) { setTrades(prev => [t, ...prev]); setView("stats"); }
  function deleteTrade(id: string) { setTrades(prev => prev.filter(t => t.id !== id)); toast("Trade deleted"); }

  // Filter symbols
  const symbols    = ["ALL", ...Array.from(new Set(trades.map(t => t.symbol)))];
  const filtered   = filter === "ALL" ? trades : trades.filter(t => t.symbol === filter);

  // Stats
  const stats = useMemo(() => {
    if (!filtered.length) return null;
    const wins      = filtered.filter(t => t.outcome === "win");
    const losses    = filtered.filter(t => t.outcome === "loss");
    const winRate   = (wins.length / filtered.length) * 100;
    const totalPnl  = filtered.reduce((s, t) => s + t.pnl, 0);
    const bestTrade = filtered.reduce((a, b) => a.pnl > b.pnl ? a : b);
    const worstTrade= filtered.reduce((a, b) => a.pnl < b.pnl ? a : b);
    const pf        = profitFactor(filtered);
    return { winRate, totalPnl, bestTrade, worstTrade, pf, wins: wins.length, losses: losses.length, total: filtered.length };
  }, [filtered]);

  const totalPnlColor = stats
    ? stats.totalPnl > 0 ? "text-emerald-300" : stats.totalPnl < 0 ? "text-rose-300" : "text-amber-300"
    : "text-slate-300";

  return (
    <>
      {/* ── Trigger button ── */}
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        className="relative bg-white/5 border border-white/10 hover:bg-white/10 text-xs h-8"
      >
        📒 Journal
        {trades.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500 text-[9px] font-bold text-white">
            {trades.length > 99 ? "99+" : trades.length}
          </span>
        )}
      </Button>

      {/* ── Backdrop ── */}
      {open && (
        <div onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
      )}

      {/* ── Drawer ── */}
      <div className={`
        fixed top-0 right-0 z-50 h-screen w-[400px] flex flex-col
        bg-slate-950 border-l border-white/10 shadow-2xl
        transition-transform duration-300 ease-in-out
        ${open ? "translate-x-0" : "translate-x-full"}
      `}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
          <div>
            <div className="text-sm font-semibold tracking-wide text-slate-100">Trade Journal</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {trades.length} trade{trades.length !== 1 ? "s" : ""} logged
              {stats && <span className={`ml-2 font-semibold ${totalPnlColor}`}>{fmtMoney(stats.totalPnl)}</span>}
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}
            className="bg-white/5 border border-white/10 h-7 w-7 p-0 text-xs">✕</Button>
        </div>

        {/* Nav tabs */}
        <div className="flex border-b border-white/10 flex-shrink-0">
          {(["stats", "log", "add"] as JournalView[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
                view === v
                  ? "border-cyan-400 text-cyan-300"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              {v === "stats" ? "📊 Stats" : v === "log" ? "📋 Log" : "➕ Add"}
            </button>
          ))}
        </div>

        {/* Symbol filter (shown on log view) */}
        {view === "log" && symbols.length > 1 && (
          <div className="flex gap-1.5 px-4 py-2.5 border-b border-white/5 flex-shrink-0 flex-wrap">
            {symbols.map(s => (
              <button key={s} onClick={() => setFilter(s)}
                className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold tracking-wider transition-all ${
                  filter === s
                    ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-300"
                    : "bg-white/5 border-white/10 text-slate-500 hover:text-slate-300"
                }`}>{s}</button>
            ))}
          </div>
        )}

        {/* ── Content ── */}
        <ScrollArea className="flex-1 px-4 py-4">

          {/* STATS VIEW */}
          {view === "stats" && (
            <div className="space-y-4">
              {!stats ? (
                <div className="text-center py-12 space-y-2">
                  <div className="text-3xl">📒</div>
                  <div className="text-sm text-slate-400">No trades logged yet.</div>
                  <div className="text-xs text-slate-600">Click ➕ Add to log your first trade.</div>
                  <Button onClick={() => setView("add")} size="sm"
                    className="mt-2 bg-cyan-500/20 border border-cyan-400/30 text-cyan-100 hover:bg-cyan-500/30">
                    Log First Trade
                  </Button>
                </div>
              ) : (
                <>
                  {/* Win rate ring + quick stats */}
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center gap-4">
                      <WinRateRing rate={stats.winRate} />
                      <div className="flex-1 space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">Wins</span>
                          <span className="text-emerald-300 font-bold">{stats.wins}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">Losses</span>
                          <span className="text-rose-300 font-bold">{stats.losses}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">Total</span>
                          <span className="text-slate-200 font-bold">{stats.total}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* P&L bar chart */}
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <PnlBars trades={filtered} />
                  </div>

                  {/* Stat tiles */}
                  <div className="grid grid-cols-2 gap-2">
                    <StatTile
                      label="Total P&L"
                      value={fmtMoney(stats.totalPnl)}
                      color={stats.totalPnl >= 0 ? "text-emerald-300" : "text-rose-300"}
                    />
                    <StatTile
                      label="Profit Factor"
                      value={String(stats.pf)}
                      sub="Gross win ÷ gross loss"
                      color={parseFloat(String(stats.pf)) >= 1.5 ? "text-emerald-300" : parseFloat(String(stats.pf)) >= 1 ? "text-amber-300" : "text-rose-300"}
                    />
                    <StatTile
                      label="Best Trade"
                      value={fmtMoney(stats.bestTrade.pnl)}
                      sub={`${stats.bestTrade.symbol} ${stats.bestTrade.rMultiple}R`}
                      color="text-emerald-300"
                    />
                    <StatTile
                      label="Worst Trade"
                      value={fmtMoney(stats.worstTrade.pnl)}
                      sub={`${stats.worstTrade.symbol} ${stats.worstTrade.rMultiple}R`}
                      color="text-rose-300"
                    />
                  </div>

                  {/* CSV export */}
                  <button
                    onClick={() => {
                      const headers = "Date,Symbol,Direction,Bias,Setup,Entry,Exit,Stop,Size,PnL,R,Outcome,Notes";
                      const rows = trades.map(t =>
                        [fmtDate(t.ts), t.symbol, t.direction, t.bias, t.setup, t.entry, t.exit, t.stop, t.size, t.pnl, t.rMultiple, t.outcome, `"${t.notes}"`].join(",")
                      );
                      const csv  = [headers, ...rows].join("\n");
                      const blob = new Blob([csv], { type: "text/csv" });
                      const url  = URL.createObjectURL(blob);
                      const a    = document.createElement("a"); a.href = url; a.download = "rwp_journal.csv"; a.click();
                      URL.revokeObjectURL(url);
                      toast.success("CSV exported");
                    }}
                    className="w-full rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors py-2 text-xs text-slate-400 font-medium"
                  >
                    ↓ Export CSV
                  </button>
                </>
              )}
            </div>
          )}

          {/* LOG VIEW */}
          {view === "log" && (
            <div>
              {filtered.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-sm">No trades {filter !== "ALL" ? `for ${filter}` : "yet"}.</div>
              ) : (
                filtered.map(t => <TradeRow key={t.id} trade={t} onDelete={deleteTrade} />)
              )}
            </div>
          )}

          {/* ADD VIEW */}
          {view === "add" && (
            <AddTradeForm
              currentSymbol={currentSymbol}
              currentPrice={currentPrice}
              onAdd={addTrade}
            />
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-white/10 flex-shrink-0 flex items-center justify-between flex-shrink-0">
          <span className="text-[10px] text-slate-700">Stored locally · not financial advice</span>
          <span className="text-[10px] text-slate-700">RWP</span>
        </div>
      </div>
    </>
  );
}