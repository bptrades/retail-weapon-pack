// app/api/options-flow/route.js
// Fetches options chain data from Alpaca and derives flow signals.
// FIX: Fetches calls and puts separately then interleaves, so the
//      top-50 snapshot request always contains both sides equally.

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "SPY").toUpperCase();

    const apiKey    = process.env.ALPACA_API_KEY;
    const apiSecret = process.env.ALPACA_API_SECRET;

    if (!apiKey || !apiSecret) {
      return Response.json({ error: "Missing Alpaca credentials" }, { status: 500 });
    }

    const headers = {
      "APCA-API-KEY-ID":     apiKey,
      "APCA-API-SECRET-KEY": apiSecret,
      "Accept":              "application/json",
    };

    const today     = new Date();
    const dateStr   = today.toISOString().split("T")[0];
    const datePlus7 = getDatePlusDays(today, 7);

    // ── 1. Fetch calls AND puts separately ───────────────────────────────────
    // Root cause of "only calls" bug: Alpaca returns contracts alphabetically.
    // For SPY, all call symbols (SPY250321C...) sort before put symbols
    // (SPY250321P...), so a single fetch + slice(0,50) = 50 calls, 0 puts.
    // Fix: two parallel requests with explicit type= filter, then interleave.

    const baseParams =
      `underlying_symbols=${symbol}` +
      `&expiration_date_gte=${dateStr}` +
      `&expiration_date_lte=${datePlus7}` +
      `&limit=100` +
      `&status=active`;

    const [callsRes, putsRes] = await Promise.all([
      fetch(`https://paper-api.alpaca.markets/v2/options/contracts?${baseParams}&type=call`, { headers }),
      fetch(`https://paper-api.alpaca.markets/v2/options/contracts?${baseParams}&type=put`,  { headers }),
    ]);

    // Handle auth errors from either request
    for (const res of [callsRes, putsRes]) {
      if (!res.ok && (res.status === 403 || res.status === 401)) {
        return Response.json({
          error:   "options_access_denied",
          message: "Your Alpaca account does not have options data access. Enable options trading in your Alpaca dashboard or upgrade to a live account.",
          symbol,
        }, { status: 200 });
      }
    }

    const callsData = callsRes.ok ? await callsRes.json() : { option_contracts: [] };
    const putsData  = putsRes.ok  ? await putsRes.json()  : { option_contracts: [] };

    const calls = callsData?.option_contracts || [];
    const puts  = putsData?.option_contracts  || [];

    if (!calls.length && !puts.length) {
      return Response.json({
        symbol, flow: [], summary: null,
        message: "No contracts found for this symbol/date range.",
      }, { status: 200 });
    }

    // ── 2. Interleave calls + puts sorted by strike (ATM first) ──────────────
    // Sort each side by strike ascending so ATM contracts appear first.
    // Then interleave: call[0], put[0], call[1], put[1]...
    // This guarantees balanced call/put coverage in our 50-contract window.
    const sortedCalls = [...calls].sort((a, b) => a.strike_price - b.strike_price);
    const sortedPuts  = [...puts ].sort((a, b) => a.strike_price - b.strike_price);

    const interleaved = [];
    const maxLen = Math.max(sortedCalls.length, sortedPuts.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < sortedCalls.length) interleaved.push(sortedCalls[i]);
      if (i < sortedPuts.length)  interleaved.push(sortedPuts[i]);
    }

    const contracts50 = interleaved.slice(0, 50);

    // ── 3. Fetch snapshots ────────────────────────────────────────────────────
    const symbols50 = contracts50.map((c) => c.symbol).join(",");
    const snapUrl =
      `https://data.alpaca.markets/v1beta1/options/snapshots?` +
      `symbols=${encodeURIComponent(symbols50)}&feed=indicative`;

    const snapRes  = await fetch(snapUrl, { headers });
    const snapData = snapRes.ok ? await snapRes.json() : { snapshots: {} };
    const snaps    = snapData?.snapshots || {};

    // ── 4. Build flow rows ────────────────────────────────────────────────────
    let totalCallVolume = 0, totalPutVolume = 0;
    let totalCallOI = 0,    totalPutOI = 0;
    const flowRows = [];

    for (const contract of contracts50) {
      const snap   = snaps[contract.symbol];
      const volume = snap?.dailyBar?.v ?? snap?.latestTrade?.v ?? 0;
      const oi     = contract.open_interest ?? 0;
      const iv     = snap?.greeks?.iv    ?? snap?.impliedVolatility ?? null;
      const delta  = snap?.greeks?.delta ?? null;
      const bid    = snap?.latestQuote?.bp ?? null;
      const ask    = snap?.latestQuote?.ap ?? null;
      const mid    = bid != null && ask != null ? +((bid + ask) / 2).toFixed(2) : null;

      const isCall = contract.type === "call";
      const isPut  = contract.type === "put";

      if (isCall) { totalCallVolume += volume; totalCallOI += oi; }
      if (isPut)  { totalPutVolume  += volume; totalPutOI  += oi; }

      const unusual = oi > 0 ? volume / oi > 2 : volume > 500;

      flowRows.push({
        symbol:  contract.symbol,
        type:    contract.type,
        strike:  contract.strike_price,
        expiry:  contract.expiration_date,
        volume, oi,
        iv:    iv    != null ? +(iv * 100).toFixed(1) : null,
        delta: delta != null ? +delta.toFixed(2)      : null,
        mid,
        unusual,
      });
    }

    // Sort by volume desc
    flowRows.sort((a, b) => b.volume - a.volume);

    // ── 5. Summary ────────────────────────────────────────────────────────────
    const totalVolume   = totalCallVolume + totalPutVolume;
    const pcVolumeRatio = totalCallVolume > 0 ? +(totalPutVolume / totalCallVolume).toFixed(2) : null;
    const pcOIRatio     = totalCallOI     > 0 ? +(totalPutOI     / totalCallOI    ).toFixed(2) : null;

    let flowSentiment = "neutral";
    if (pcVolumeRatio != null) {
      if      (pcVolumeRatio < 0.7)  flowSentiment = "bullish";
      else if (pcVolumeRatio > 1.3)  flowSentiment = "bearish";
    }

    return Response.json({
      symbol,
      flow: flowRows.slice(0, 30),
      summary: {
        symbol, totalCallVolume, totalPutVolume, totalVolume,
        totalCallOI, totalPutOI, pcVolumeRatio, pcOIRatio,
        flowSentiment,
        unusualCount:      flowRows.filter(r => r.unusual).length,
        contractsScanned:  calls.length + puts.length,
      },
    }, { status: 200 });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

function getDatePlusDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}