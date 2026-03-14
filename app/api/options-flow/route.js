// app/api/options-flow/route.js
// Fetches options chain data from Alpaca and derives flow signals
// Alpaca docs: https://docs.alpaca.markets/reference/optioncontracts-1

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

    // ── 1. Get nearest expiry options contracts ───────────────────────────────
    // We grab the front two expiries so we catch 0-DTE and next-day
    const today     = new Date();
    const yyyy      = today.getFullYear();
    const mm        = String(today.getMonth() + 1).padStart(2, "0");
    const dd        = String(today.getDate()).padStart(2, "0");
    const dateStr   = `${yyyy}-${mm}-${dd}`;

    // Fetch contracts expiring today or within 7 days
    const contractsUrl =
      `https://paper-api.alpaca.markets/v2/options/contracts?` +
      `underlying_symbols=${symbol}` +
      `&expiration_date_gte=${dateStr}` +
      `&expiration_date_lte=${getDatePlusDays(today, 7)}` +
      `&limit=200` +
      `&status=active`;

    const contractsRes = await fetch(contractsUrl, { headers });

    if (!contractsRes.ok) {
      const errText = await contractsRes.text();
      // Paper accounts may not have options — return a clear message
      if (contractsRes.status === 403 || contractsRes.status === 401) {
        return Response.json({
          error:   "options_access_denied",
          message: "Your Alpaca account does not have options data access. Upgrade to a live account or enable options trading in your Alpaca dashboard.",
          symbol,
        }, { status: 200 }); // 200 so UI can handle gracefully
      }
      return Response.json({ error: errText, symbol }, { status: 502 });
    }

    const contractsData = await contractsRes.json();
    const contracts      = contractsData?.option_contracts || [];

    if (!contracts.length) {
      return Response.json({ symbol, flow: [], summary: null, message: "No contracts found for this symbol/date range." }, { status: 200 });
    }

    // ── 2. Fetch latest snapshots for those contracts ─────────────────────────
    // Limit to 50 contracts closest to ATM to avoid blowing rate limits
    const symbols50 = contracts.slice(0, 50).map((c) => c.symbol).join(",");

    const snapUrl =
      `https://data.alpaca.markets/v1beta1/options/snapshots?` +
      `symbols=${encodeURIComponent(symbols50)}` +
      `&feed=indicative`;

    const snapRes  = await fetch(snapUrl, { headers });
    const snapData = snapRes.ok ? await snapRes.json() : { snapshots: {} };
    const snaps    = snapData?.snapshots || {};

    // ── 3. Derive flow metrics ────────────────────────────────────────────────
    let totalCallVolume = 0;
    let totalPutVolume  = 0;
    let totalCallOI     = 0;
    let totalPutOI      = 0;

    const flowRows = [];

    for (const contract of contracts.slice(0, 50)) {
      const snap    = snaps[contract.symbol];
      const volume  = snap?.dailyBar?.v  ?? snap?.latestTrade?.v ?? 0;
      const oi      = contract.open_interest ?? 0;
      const iv      = snap?.greeks?.iv   ?? snap?.impliedVolatility ?? null;
      const delta   = snap?.greeks?.delta ?? null;
      const bid     = snap?.latestQuote?.bp ?? null;
      const ask     = snap?.latestQuote?.ap ?? null;
      const mid     = bid != null && ask != null ? +((bid + ask) / 2).toFixed(2) : null;

      const isCall  = contract.type === "call";
      const isPut   = contract.type === "put";

      if (isCall) { totalCallVolume += volume; totalCallOI += oi; }
      if (isPut)  { totalPutVolume  += volume; totalPutOI  += oi; }

      // Flag unusual — volume > 2x OI or volume > 500 (simple heuristic)
      const unusual = oi > 0 ? volume / oi > 2 : volume > 500;

      flowRows.push({
        symbol:     contract.symbol,
        type:       contract.type,       // "call" | "put"
        strike:     contract.strike_price,
        expiry:     contract.expiration_date,
        volume,
        oi,
        iv:         iv   != null ? +(iv   * 100).toFixed(1) : null, // as %
        delta:      delta != null ? +delta.toFixed(2)        : null,
        mid,
        unusual,
      });
    }

    // Sort by volume desc — highest activity first
    flowRows.sort((a, b) => b.volume - a.volume);

    // ── 4. Summary signals ────────────────────────────────────────────────────
    const totalVolume  = totalCallVolume + totalPutVolume;
    const pcVolumeRatio = totalPutVolume > 0
      ? +(totalPutVolume / totalCallVolume).toFixed(2)
      : null;
    const pcOIRatio = totalCallOI > 0
      ? +(totalPutOI / totalCallOI).toFixed(2)
      : null;

    // Sentiment from P/C ratio
    let flowSentiment = "neutral";
    if (pcVolumeRatio != null) {
      if (pcVolumeRatio < 0.7)  flowSentiment = "bullish";
      else if (pcVolumeRatio > 1.3) flowSentiment = "bearish";
    }

    const unusualCount = flowRows.filter((r) => r.unusual).length;

    const summary = {
      symbol,
      totalCallVolume,
      totalPutVolume,
      totalVolume,
      totalCallOI,
      totalPutOI,
      pcVolumeRatio,
      pcOIRatio,
      flowSentiment,
      unusualCount,
      contractsScanned: contracts.length,
    };

    return Response.json({ symbol, flow: flowRows.slice(0, 20), summary }, { status: 200 });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

function getDatePlusDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}