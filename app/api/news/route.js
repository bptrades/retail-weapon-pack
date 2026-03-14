// app/api/news/route.js
// Fetches market news for a ticker from multiple sources.
// Uses Alpaca News API (included in free tier) + fallback RSS parsing.

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") || "SPY").toUpperCase().trim();

  const ALPACA_KEY    = process.env.ALPACA_API_KEY;
  const ALPACA_SECRET = process.env.ALPACA_API_SECRET;

  // ── Try Alpaca News API first (best for ticker-specific news) ─────────────
  if (ALPACA_KEY && ALPACA_SECRET) {
    try {
      const url = `https://data.alpaca.markets/v1beta1/news?symbols=${symbol}&limit=20&sort=desc`;
      const res = await fetch(url, {
        headers: {
          "APCA-API-KEY-ID":     ALPACA_KEY,
          "APCA-API-SECRET-KEY": ALPACA_SECRET,
        },
      });

      if (res.ok) {
        const data = await res.json();
        const articles = data.news || [];

        const news = articles.map(a => ({
          headline:    a.headline,
          source:      a.source || "Alpaca News",
          url:         a.url || "",
          publishedAt: a.created_at || new Date().toISOString(),
          sentiment:   classifySentiment(a.headline + " " + (a.summary || "")),
          relevance:   classifyRelevance(a.headline, symbol),
          tickers:     a.symbols || [symbol],
        }));

        return Response.json({ news, source: "alpaca" });
      }
    } catch (e) {
      console.error("Alpaca news error:", e);
    }
  }

  // ── Fallback: Finnhub free news API ──────────────────────────────────────
  const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
  if (FINNHUB_KEY) {
    try {
      const today = new Date().toISOString().split("T")[0];
      const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split("T")[0];
      const url = `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${weekAgo}&to=${today}&token=${FINNHUB_KEY}`;
      const res = await fetch(url);

      if (res.ok) {
        const articles = await res.json();
        const news = (articles || []).slice(0, 20).map(a => ({
          headline:    a.headline,
          source:      a.source || "Finnhub",
          url:         a.url || "",
          publishedAt: new Date(a.datetime * 1000).toISOString(),
          sentiment:   classifySentiment(a.headline + " " + (a.summary || "")),
          relevance:   classifyRelevance(a.headline, symbol),
          tickers:     [symbol],
        }));
        return Response.json({ news, source: "finnhub" });
      }
    } catch (e) {
      console.error("Finnhub news error:", e);
    }
  }

  // ── Final fallback: mock data so UI always renders ────────────────────────
  const mockNews = generateMockNews(symbol);
  return Response.json({ news: mockNews, source: "mock", note: "Add ALPACA_API_KEY or FINNHUB_API_KEY to .env.local for live news" });
}

// ─── Sentiment classifier ─────────────────────────────────────────────────────
function classifySentiment(text) {
  const t = text.toLowerCase();
  const bullWords = ["beat", "surge", "rally", "gain", "rise", "record", "upgrade", "bullish", "strong", "positive", "growth", "profit", "exceed", "outperform", "buy", "target raised", "higher", "recovery", "expansion", "boost"];
  const bearWords = ["miss", "fall", "drop", "decline", "loss", "downgrade", "bearish", "weak", "cut", "layoff", "recall", "lawsuit", "concern", "warning", "risk", "lower", "sell", "crash", "crisis", "volatile", "fear", "uncertainty"];

  let bull = 0, bear = 0;
  bullWords.forEach(w => { if (t.includes(w)) bull++; });
  bearWords.forEach(w => { if (t.includes(w)) bear++; });

  if (bull > bear + 1) return "bullish";
  if (bear > bull + 1) return "bearish";
  return "neutral";
}

// ─── Relevance classifier ─────────────────────────────────────────────────────
function classifyRelevance(headline, symbol) {
  const t = headline.toLowerCase();
  const sym = symbol.toLowerCase();

  // Direct mention of ticker or related terms
  if (t.includes(sym)) return "high";

  // High impact macro events
  const highImpact = ["fed", "fomc", "cpi", "inflation", "rate", "earnings", "gdp", "jobs report", "nonfarm", "powell", "yellen", "sec", "options expiry", "vix"];
  if (highImpact.some(w => t.includes(w))) return "high";

  // Medium impact sector/market events
  const medImpact = ["market", "stocks", "equity", "sector", "rally", "selloff", "recession", "tariff", "geopolitical"];
  if (medImpact.some(w => t.includes(w))) return "medium";

  return "low";
}

// ─── Mock news for demo/no-key fallback ──────────────────────────────────────
function generateMockNews(symbol) {
  const now = new Date();
  const offset = (mins) => new Date(now - mins * 60000).toISOString();

  return [
    { headline: `${symbol} options volume surges ahead of key resistance level`, source: "Market Wire", url: "", publishedAt: offset(12), sentiment: "bullish",  relevance: "high",   tickers: [symbol] },
    { headline: "Fed minutes signal potential rate pause in upcoming meeting",       source: "Reuters",      url: "", publishedAt: offset(28), sentiment: "bullish",  relevance: "high",   tickers: ["SPY", "QQQ"] },
    { headline: "VIX spikes to 3-week high as traders hedge into month end",         source: "Bloomberg",    url: "", publishedAt: offset(45), sentiment: "bearish",  relevance: "high",   tickers: ["VIX", "SPY"] },
    { headline: "Tech sector leads morning rally on AI infrastructure spending",     source: "CNBC",         url: "", publishedAt: offset(67), sentiment: "bullish",  relevance: "medium", tickers: ["QQQ", "NVDA"] },
    { headline: "Treasury yields rise on stronger-than-expected economic data",       source: "WSJ",          url: "", publishedAt: offset(95), sentiment: "bearish",  relevance: "medium", tickers: ["SPY", "TLT"] },
    { headline: "Options market pricing in elevated volatility through expiry",       source: "Options Desk", url: "", publishedAt: offset(130), sentiment: "neutral", relevance: "high",  tickers: [symbol] },
  ].filter(n => n.relevance !== "low").slice(0, 8);
}