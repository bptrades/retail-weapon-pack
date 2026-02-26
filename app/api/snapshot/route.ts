import { NextResponse } from "next/server";

type AlpacaBar = {
  t: string; // timestamp ISO
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  vw?: number;
};

function ema(values: number[], period: number) {
  if (values.length === 0) return NaN;
  const k = 2 / (period + 1);
  let prev = values[0];
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
  }
  return prev;
}

function rsi(values: number[], period = 14) {
  if (values.length < period + 1) return null;
  let gains = 0,
    losses = 0;
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

  const rsiState = String(input.rsi_state || "").toLowerCase();
  if (rsiState.includes("bull")) score += 1;
  if (rsiState.includes("bear")) score -= 1;

  const volState = String(input.volume_state || "").toLowerCase();
  if (volState.includes("above")) score += 0.75;
  if (volState.includes("below")) score -= 0.75;

  return Math.max(0, Math.min(10, Number(score.toFixed(1))));
}

// Convert Date -> YYYY-MM-DD in America/New_York (no external libs)
function nyDateKey(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return fmt.format(d); // YYYY-MM-DD
}

function toBucketMs(iso: string, bucketMins: number) {
  const ms = new Date(iso).getTime();
  const bucketMs = bucketMins * 60_000;
  return Math.floor(ms / bucketMs) * bucketMs;
}

function resampleBars(bars: AlpacaBar[], bucketMins: number) {
  const map = new Map<number, { o: number; h: number; l: number; c: number; v: number; t: string }>();

  for (const b of bars) {
    const bucket = toBucketMs(b.t, bucketMins);
    const existing = map.get(bucket);
    if (!existing) {
      map.set(bucket, {
        o: b.o,
        h: b.h,
        l: b.l,
        c: b.c,
        v: b.v,
        t: new Date(bucket).toISOString()
      });
    } else {
      existing.h = Math.max(existing.h, b.h);
      existing.l = Math.min(existing.l, b.l);
      existing.c = b.c;
      existing.v += b.v;
    }
  }

  return Array.from(map.values()).sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());
}

export async function GET(req: Request) {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  const feed = process.env.ALPACA_DATA_FEED || "iex";

  if (!key || !secret) {
    return NextResponse.json({ error: "Missing ALPACA_API_KEY/ALPACA_API_SECRET" }, { status: 500 });
  }

  const API_KEY: string = key;
  const API_SECRET: string = secret;

  const alpacaHeaders: HeadersInit = {
    "APCA-API-KEY-ID": API_KEY,
    "APCA-API-SECRET-KEY": API_SECRET
  };

  const urlObj = new URL(req.url);
  const symbol = (urlObj.searchParams.get("symbol") || "SPY").toUpperCase().trim();

  // Basic guardrail (allows BRK.B, RDS-A, etc.)
  if (!/^[A-Z.\-]{1,10}$/.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol format" }, { status: 400 });
  }

  async function fetchMarketClock() {
    const url = "https://api.alpaca.markets/v2/clock";
    const res = await fetch(url, { headers: alpacaHeaders });
    const raw = await res.text();
    if (!res.ok) throw new Error(`Alpaca clock error ${res.status}: ${raw}`);
    return JSON.parse(raw);
  }

  async function fetchBars(startISO: string): Promise<AlpacaBar[]> {
    const url =
      `https://data.alpaca.markets/v2/stocks/bars?symbols=${encodeURIComponent(symbol)}&timeframe=1Min&start=${encodeURIComponent(
        startISO
      )}` + `&limit=10000&feed=${encodeURIComponent(feed)}`;

    const res = await fetch(url, { headers: alpacaHeaders });
    const raw = await res.text();
    if (!res.ok) throw new Error(`Alpaca bars error ${res.status}: ${raw}`);

    const json = JSON.parse(raw);
    const arr = (json?.bars?.[symbol] as any[] | undefined) ?? [];
    return arr.map((b: any) => ({ ...b, t: String(b.t) })) as AlpacaBar[];
  }

  // Market status (best-effort)
  let market_open = false;
  try {
    const clock = await fetchMarketClock();
    market_open = !!clock?.is_open;
  } catch {
    market_open = false;
  }

  // Fetch bars: recent first, fallback to last 7 days
  let using_last_session_data = false;

  let bars: AlpacaBar[] = [];
  try {
    const startRecent = new Date(Date.now() - 240 * 60_000).toISOString();
    bars = await fetchBars(startRecent);
  } catch {
    bars = [];
  }

  if (bars.length < 30) {
    using_last_session_data = true;
    const start7d = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
    bars = await fetchBars(start7d);
  }

  if (bars.length < 30) {
    return NextResponse.json(
      {
        error:
          "Not enough bars returned. Symbol may be invalid/illiquid, market may be closed, or your feed may be limited. Try again during market hours or keep ALPACA_DATA_FEED=iex.",
        symbol,
        barsCount: bars.length,
        market_open,
        using_last_session_data
      },
      { status: 502 }
    );
  }

  // Use last 240 1m bars for indicators
  if (bars.length > 240) bars = bars.slice(-240);

  const last = bars[bars.length - 1];
  const price = last.c;

  // Session day (NY date of most recent bar)
  const lastDayNY = nyDateKey(new Date(last.t));
  const sessionBars = bars.filter((b) => nyDateKey(new Date(b.t)) === lastDayNY);

  // Session VWAP
  const tpvSession = sessionBars.reduce((acc, b) => acc + ((b.h + b.l + b.c) / 3) * b.v, 0);
  const tvSession = sessionBars.reduce((acc, b) => acc + b.v, 0);
  const sessionVWAP = tvSession > 0 ? tpvSession / tvSession : price;

  const vwap_state = price >= sessionVWAP ? "above" : "below";

  // True 5m/15m resampling
  const bars5m = resampleBars(sessionBars, 5);
  const bars15m = resampleBars(sessionBars, 15);

  const close1m = bars.map((b) => b.c);
  const high1m = bars.map((b) => b.h);
  const low1m = bars.map((b) => b.l);
  const vol1m = bars.map((b) => b.v);

  const close5m = bars5m.map((b) => b.c);
  const close15m = bars15m.map((b) => b.c);

  const ema9_5m = ema(close5m.slice(-200), 9);
  const ema21_5m = ema(close5m.slice(-200), 21);
  const ema9_15m = ema(close15m.slice(-200), 9);
  const ema21_15m = ema(close15m.slice(-200), 21);

  const ema_trend_5m = ema9_5m > ema21_5m ? "bull" : "bear";
  const ema_trend_15m = ema9_15m > ema21_15m ? "bull" : "bear";

  const r = rsi(close1m, 14);
  const rsi_state = r === null ? "unknown" : r >= 60 ? "bullish" : r <= 40 ? "bearish" : "neutral";

  const a = atr(high1m, low1m, close1m, 14);

  const volAvg20 = vol1m.slice(-20).reduce((sum, x) => sum + x, 0) / 20;
  const volume_state = vol1m[vol1m.length - 1] > volAvg20 ? "above_avg" : "below_avg";

  // Key levels
  const sessionHigh = Math.max(...sessionBars.map((b) => b.h));
  const sessionLow = Math.min(...sessionBars.map((b) => b.l));

  const last60 = bars.slice(-60);
  const high60 = Math.max(...last60.map((b) => b.h));
  const low60 = Math.min(...last60.map((b) => b.l));

  const snapshot: any = {
    symbol,
    timestamp: new Date().toISOString(),
    market_open,
    using_last_session_data,

    price: Number(price.toFixed(2)),
    vwap: Number(sessionVWAP.toFixed(2)),
    vwap_state,

    ema_trend_5m,
    ema_trend_15m,

    rsi_1m: r === null ? null : Number(r.toFixed(1)),
    rsi_state,

    atr_14: a === null ? null : Number(a.toFixed(2)),
    expected_move_today: a === null ? null : Number(a.toFixed(2)),

    volume_state,

    key_levels: {
      session_day_ny: lastDayNY,
      session_high: Number(sessionHigh.toFixed(2)),
      session_low: Number(sessionLow.toFixed(2)),
      high_60m: Number(high60.toFixed(2)),
      low_60m: Number(low60.toFixed(2))
    }
  };

  snapshot.momentum_score = computeScore(snapshot);

  return NextResponse.json(snapshot);
}