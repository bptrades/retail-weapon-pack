import { NextResponse } from "next/server";

function isoMinutesAgo(minutes: number) {
  const d = new Date(Date.now() - minutes * 60_000);
  return d.toISOString();
}

function ema(values: number[], period: number) {
  const k = 2 / (period + 1);
  let prev = values[0];
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
  }
  return prev;
}

function rsi(values: number[], period = 14) {
  if (values.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const rs = losses === 0 ? Infinity : gains / losses;
  return 100 - 100 / (1 + rs);
}

function atr(high: number[], low: number[], close: number[], period = 14) {
  if (close.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < close.length; i++) {
    const tr = Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1]),
      Math.abs(low[i] - close[i - 1])
    );
    trs.push(tr);
  }
  const recent = trs.slice(-period);
  const sum = recent.reduce((a, b) => a + b, 0);
  return sum / recent.length;
}

function computeScore(input: any) {
  let score = 5;
  if (input.vwap_state === "above") score += 2.5;
  if (input.vwap_state === "below") score -= 2.5;

  if (input.ema_trend_5m === "bull") score += 1.5;
  if (input.ema_trend_5m === "bear") score -= 1.5;

  if (input.ema_trend_15m === "bull") score += 1.5;
  if (input.ema_trend_15m === "bear") score -= 1.5;

  if (String(input.rsi_state).includes("bull")) score += 1;
  if (String(input.rsi_state).includes("bear")) score -= 1;

  if (String(input.volume_state).includes("above")) score += 0.75;
  if (String(input.volume_state).includes("below")) score -= 0.75;

  return Math.max(0, Math.min(10, Number(score.toFixed(1))));
}

export async function GET() {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  const feed = process.env.ALPACA_DATA_FEED || "sip";

  if (!key || !secret) {
    return NextResponse.json({ error: "Missing ALPACA_API_KEY/ALPACA_API_SECRET" }, { status: 500 });
  }

  // Pull last 240 minutes of 1-min bars (enough for RSI/ATR + trend)
  async function fetchBars(startISO: string) {
  const url =
    `https://data.alpaca.markets/v2/stocks/bars?symbols=SPY&timeframe=1Min&start=${encodeURIComponent(startISO)}` +
    `&limit=10000&feed=${encodeURIComponent(feed)}`;

  const res = await fetch(url, {
    headers: {
      "APCA-API-KEY-ID": key!,
      "APCA-API-SECRET-KEY": secret!
    }
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(`Alpaca error ${res.status}: ${raw}`);

  const json = JSON.parse(raw);
  return (json?.bars?.SPY as any[] | undefined) ?? [];
}

// Try recent window first (good during market hours)
let bars: any[] = [];
try {
  const startRecent = new Date(Date.now() - 240 * 60_000).toISOString();
  bars = await fetchBars(startRecent);
} catch {
  bars = [];
}

// Fallback: last 7 days (works outside market hours)
if (bars.length < 30) {
  const start7d = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  bars = await fetchBars(start7d);
}

// Still not enough? return helpful error
if (bars.length < 30) {
  return NextResponse.json(
    { error: "Not enough bars returned. Likely market closed or feed limited. Try during market hours or keep feed=iex.", barsCount: bars.length },
    { status: 502 }
  );
}

// Use only the most recent 240 bars for indicators
if (bars.length > 240) bars = bars.slice(-240);

  const close = bars.map(b => b.c);
  const high = bars.map(b => b.h);
  const low  = bars.map(b => b.l);
  const vol  = bars.map(b => b.v);

  const last = bars[bars.length - 1];
  const price = last.c;

  // Use bar VWAP if present; otherwise approximate session VWAP from typical price * volume (MVP)
  const vwap = (typeof last.vw === "number" && last.vw > 0) ? last.vw : null;

  // Approx “session vwap” fallback using last N bars:
  const tpv = bars.reduce((acc, b) => acc + ((b.h + b.l + b.c) / 3) * b.v, 0);
  const tv  = bars.reduce((acc, b) => acc + b.v, 0);
  const approxVWAP = tv > 0 ? tpv / tv : price;
  const vwapUse = vwap ?? approxVWAP;

  // Trend: use EMAs on 1-min as MVP proxy for 5m/15m (we’ll upgrade to true resample next)
  const ema9 = ema(close.slice(-200), 9);
  const ema21 = ema(close.slice(-200), 21);

  // Rough “5m/15m” states from faster/slower EMA relationship (MVP)
  const ema_trend_5m = ema9 > ema21 ? "bull" : "bear";
  const ema_trend_15m = ema(close.slice(-200), 18) > ema(close.slice(-200), 42) ? "bull" : "bear";

  const r = rsi(close, 14);
  const rsi_state =
    r === null ? "unknown" :
    r >= 60 ? "bullish" :
    r <= 40 ? "bearish" : "neutral";

  const a = atr(high, low, close, 14);

  // Volume state vs last 20-bar average
  const volAvg20 = vol.slice(-20).reduce((a,b)=>a+b,0) / 20;
  const volume_state = vol[vol.length - 1] > volAvg20 ? "above_avg" : "below_avg";

  const vwap_state = price >= vwapUse ? "above" : "below";

  const snapshot: any = {
    symbol: "SPY",
    timestamp: new Date().toISOString(),
    price,
    vwap: Number(vwapUse.toFixed(2)),
    vwap_state,
    ema_trend_5m,
    ema_trend_15m,
    rsi_1m: r === null ? null : Number(r.toFixed(1)),
    rsi_state,
    atr_14: a === null ? null : Number(a.toFixed(2)),
    expected_move_today: a === null ? null : Number(a.toFixed(2)),
    volume_state,
    key_levels: {
      high_lookback: Number(Math.max(...high.slice(-120)).toFixed(2)),
      low_lookback: Number(Math.min(...low.slice(-120)).toFixed(2))
    }
  };

  snapshot.momentum_score = computeScore(snapshot);

  return NextResponse.json(snapshot);
}