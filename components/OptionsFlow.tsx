"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Button }      from "@/components/ui/button";
import { Badge }       from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea }  from "@/components/ui/scroll-area";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlowRow {
  symbol:  string;
  type:    "call" | "put";
  strike:  number;
  expiry:  string;
  volume:  number;
  oi:      number;
  iv:      number | null;
  delta:   number | null;
  mid:     number | null;
  unusual: boolean;
}

interface FlowSummary {
  symbol:            string;
  totalCallVolume:   number;
  totalPutVolume:    number;
  totalVolume:       number;
  totalCallOI:       number;
  totalPutOI:        number;
  pcVolumeRatio:     number | null;
  pcOIRatio:         number | null;
  flowSentiment:     "bullish" | "bearish" | "neutral";
  unusualCount:      number;
  contractsScanned:  number;
}

interface OptionsFlowData {
  symbol:   string;
  flow:     FlowRow[];
  summary:  FlowSummary | null;
  message?: string;
  error?:   string;
}

type FlowFilter = "ALL" | "CALLS" | "PUTS" | "UNUSUAL";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, digits = 0): string {
  if (n == null || !isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function fmtDate(dateStr: string): string {
  // "2026-03-21" → "Mar 21"
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function sentimentStyle(s: string) {
  if (s === "bullish") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  if (s === "bearish") return "bg-rose-500/15 text-rose-300 border-rose-500/30";
  return "bg-slate-500/15 text-slate-200 border-slate-500/30";
}

// ─── PC Ratio Bar ─────────────────────────────────────────────────────────────

function PCBar({ calls, puts }: { calls: number; puts: number }) {
  const total = calls + puts;
  if (!total) return null;
  const callPct = Math.round((calls / total) * 100);
  const putPct  = 100 - callPct;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-slate-400">
        <span className="text-emerald-400 font-semibold">CALLS {callPct}%</span>
        <span className="text-rose-400 font-semibold">PUTS {putPct}%</span>
      </div>
      <div className="flex h-2 w-full rounded-full overflow-hidden">
        <div className="bg-emerald-500/60 transition-all duration-500" style={{ width: `${callPct}%` }} />
        <div className="bg-rose-500/60 transition-all duration-500"    style={{ width: `${putPct}%`  }} />
      </div>
    </div>
  );
}

// ─── Flow Row ─────────────────────────────────────────────────────────────────

function FlowRowItem({ row }: { row: FlowRow }) {
  const isCall = row.type === "call";

  return (
    <div className={`
      flex items-center justify-between rounded-xl border px-3 py-2 mb-1.5 text-xs
      ${row.unusual
        ? isCall
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-rose-500/30 bg-rose-500/5"
        : "border-white/10 bg-black/20"}
    `}>
      {/* Type + strike + expiry */}
      <div className="flex items-center gap-2 min-w-0">
        {row.unusual && (
          <span className="text-amber-400 text-[10px] font-bold flex-shrink-0">⚡</span>
        )}
        <Badge
          variant="outline"
          className={`text-[10px] font-bold px-1.5 py-0 border flex-shrink-0 ${
            isCall
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/15 border-rose-500/30 text-rose-300"
          }`}
        >
          {isCall ? "CALL" : "PUT"}
        </Badge>
        <span className="text-slate-200 font-semibold">${fmt(row.strike, 0)}</span>
        <span className="text-slate-500">{fmtDate(row.expiry)}</span>
      </div>

      {/* Metrics */}
      <div className="flex items-center gap-3 text-right flex-shrink-0">
        <div>
          <div className="text-[9px] text-slate-500">VOL</div>
          <div className={`font-semibold ${row.unusual ? "text-amber-300" : "text-slate-200"}`}>
            {fmt(row.volume)}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-slate-500">OI</div>
          <div className="text-slate-400">{fmt(row.oi)}</div>
        </div>
        {row.iv != null && (
          <div>
            <div className="text-[9px] text-slate-500">IV</div>
            <div className="text-slate-300">{row.iv}%</div>
          </div>
        )}
        {row.mid != null && (
          <div>
            <div className="text-[9px] text-slate-500">MID</div>
            <div className="text-slate-300">${fmt(row.mid, 2)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface OptionsFlowProps {
  symbol: string;
}

export default function OptionsFlow({ symbol }: OptionsFlowProps) {
  const [data,    setData]    = useState<OptionsFlowData | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter,  setFilter]  = useState<FlowFilter>("ALL");

  const fetchFlow = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/options-flow?symbol=${encodeURIComponent(symbol)}`);
      const json = await res.json();

      if (json.error === "options_access_denied") {
        toast.error("Options data not available on this Alpaca account.");
      } else if (json.error) {
        toast.error(`Flow error: ${json.error}`);
      } else {
        toast.success(`${symbol} options flow loaded`);
      }
      setData(json);
    } catch (e: any) {
      toast.error(e?.message || "Failed to fetch options flow");
    } finally {
      setLoading(false);
    }
  }, [symbol, loading]);

  // Apply filter
  const filtered = (data?.flow ?? []).filter((r) => {
    if (filter === "CALLS")   return r.type === "call";
    if (filter === "PUTS")    return r.type === "put";
    if (filter === "UNUSUAL") return r.unusual;
    return true;
  });

  const summary = data?.summary;
  const FILTERS: FlowFilter[] = ["ALL", "CALLS", "PUTS", "UNUSUAL"];

  return (
    <Card className="border-white/10 bg-white/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">Options Flow</CardTitle>
            <CardDescription>
              {summary
                ? `${summary.contractsScanned} contracts scanned · ${summary.unusualCount} unusual`
                : "Live options activity via Alpaca"}
            </CardDescription>
          </div>
          <Button
            onClick={fetchFlow}
            disabled={loading}
            className="bg-cyan-500/20 border border-cyan-400/30 text-cyan-100 hover:bg-cyan-500/25"
          >
            {loading ? "Loading…" : "Fetch Flow"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">

        {/* ── Access denied / no data message ── */}
        {data?.error === "options_access_denied" && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200 space-y-1">
            <div className="font-semibold">Options data not available</div>
            <div className="text-xs text-amber-300/70">
              Paper trading accounts have limited options access. To unlock flow data, enable options trading in your{" "}
              <a href="https://app.alpaca.markets" target="_blank" rel="noopener noreferrer" className="underline">
                Alpaca dashboard
              </a>{" "}
              or upgrade to a live account.
            </div>
          </div>
        )}

        {/* ── Summary bar ── */}
        {summary && !data?.error && (
          <div className="space-y-3">
            {/* Sentiment + P/C */}
            <div className="flex items-center justify-between gap-3">
              <Badge variant="outline" className={`border ${sentimentStyle(summary.flowSentiment)}`}>
                {summary.flowSentiment.toUpperCase()}
              </Badge>
              <div className="text-xs text-slate-400">
                P/C Vol: <span className="text-slate-200 font-semibold">
                  {summary.pcVolumeRatio ?? "—"}
                </span>
                <span className="mx-2 text-slate-600">·</span>
                P/C OI: <span className="text-slate-200 font-semibold">
                  {summary.pcOIRatio ?? "—"}
                </span>
              </div>
            </div>

            {/* Call/Put volume bar */}
            <PCBar calls={summary.totalCallVolume} puts={summary.totalPutVolume} />

            {/* Volume tiles */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Call Vol", value: fmt(summary.totalCallVolume), color: "text-emerald-300" },
                { label: "Put Vol",  value: fmt(summary.totalPutVolume),  color: "text-rose-300"    },
                { label: "Total",    value: fmt(summary.totalVolume),     color: "text-slate-200"   },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-xl border border-white/10 bg-black/20 p-3 text-center">
                  <div className="text-[10px] text-slate-500">{label}</div>
                  <div className={`text-sm font-semibold mt-0.5 ${color}`}>{value}</div>
                </div>
              ))}
            </div>

            {/* Unusual sweep callout */}
            {summary.unusualCount > 0 && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 flex items-center gap-2">
                <span className="text-amber-400">⚡</span>
                <span className="text-xs text-amber-200 font-medium">
                  {summary.unusualCount} unusual sweep{summary.unusualCount > 1 ? "s" : ""} detected
                </span>
                <button
                  onClick={() => setFilter("UNUSUAL")}
                  className="ml-auto text-[10px] text-amber-400 underline hover:opacity-80"
                >
                  View
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Empty state ── */}
        {!data && !loading && (
          <div className="rounded-xl border border-white/10 bg-black/20 p-6 text-center">
            <div className="text-sm text-slate-400">Click <b>Fetch Flow</b> to load options activity for {symbol}.</div>
            <div className="text-xs text-slate-600 mt-1">Shows volume, OI, IV and unusual sweeps from Alpaca.</div>
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {loading && (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 rounded-xl border border-white/10 bg-black/20 animate-pulse" />
            ))}
          </div>
        )}

        {/* ── Flow table ── */}
        {!loading && data && !data.error && filtered.length > 0 && (
          <div className="space-y-2">
            {/* Filter tabs */}
            <div className="flex gap-1.5 flex-wrap">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`
                    px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wider border transition-all
                    ${filter === f
                      ? f === "CALLS"   ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                      : f === "PUTS"    ? "bg-rose-500/15 border-rose-500/30 text-rose-300"
                      : f === "UNUSUAL" ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                      :                   "bg-violet-500/15 border-violet-500/30 text-violet-300"
                      : "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200"}
                  `}
                >
                  {f}
                </button>
              ))}
              <span className="ml-auto text-[10px] text-slate-600 self-center">
                Top {filtered.length} by volume
              </span>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[1fr_auto] px-3 text-[9px] text-slate-600 uppercase tracking-wider">
              <span>Contract</span>
              <span className="text-right">Vol · OI · IV · Mid</span>
            </div>

            <ScrollArea className="h-[340px] pr-1">
              {filtered.map((row) => (
                <FlowRowItem key={row.symbol} row={row} />
              ))}
            </ScrollArea>
          </div>
        )}

        {/* ── No results after filter ── */}
        {!loading && data && !data.error && filtered.length === 0 && data.flow.length > 0 && (
          <div className="text-sm text-slate-500 text-center py-4">
            No {filter.toLowerCase()} contracts found.
          </div>
        )}

        {/* ── Soft message (e.g. no contracts found) ── */}
        {data?.message && !data.error && (
          <div className="text-xs text-slate-500 text-center">{data.message}</div>
        )}

        <div className="text-[10px] text-slate-700">
          Unusual = volume &gt; 2× open interest. Not financial advice.
        </div>
      </CardContent>
    </Card>
  );
}