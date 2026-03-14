import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req) {
  try {
    const body = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing GEMINI_API_KEY" }), { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    // ── NEW: rawPrompt passthrough (used by NewsFeed, PreMarketBrief, regime detection) ──
    if (body?.rawPrompt) {
      const result = await model.generateContent(body.rawPrompt);
      const text = result.response.text();
      return new Response(JSON.stringify({ text }), { status: 200 });
    }

    // ── Original: inputJson plan generation ──────────────────────────────────
    const inputJson = body?.inputJson;
    if (!inputJson) {
      return new Response(JSON.stringify({ error: "Missing inputJson or rawPrompt" }), { status: 400 });
    }

    const sym    = String(inputJson?.symbol || "SPY").toUpperCase();
    const price  = inputJson?.price;
    const vwap   = inputJson?.vwap;
    const atr    = inputJson?.atr_14 ?? inputJson?.expected_move_today;
    const levels = inputJson?.key_levels || {};

    const sessionHigh = levels.session_high ?? levels.premarket_high ?? levels.yesterday_high ?? null;
    const sessionLow  = levels.session_low  ?? levels.premarket_low  ?? levels.yesterday_low  ?? null;
    const high60      = levels.high_60m ?? sessionHigh;
    const low60       = levels.low_60m  ?? sessionLow;

    const t = (base, mult, dir) =>
      base && atr ? Number((dir === "up" ? base + atr * mult : base - atr * mult).toFixed(2)) : null;

    const bullT1 = sessionHigh ?? t(price, 0.5, "up");
    const bullT2 = t(sessionHigh ?? price, 0.25, "up") ?? t(price, 1, "up");
    const bearT1 = sessionLow  ?? t(price, 0.5, "dn");
    const bearT2 = t(sessionLow  ?? price, 0.25, "dn") ?? t(price, 1, "dn");

    const prompt = `
You are an elite intraday trading plan generator specializing in momentum, VWAP, and 0-DTE options setups.
Your output is used directly by retail traders. Every number you reference MUST come from INPUT_JSON.
Never invent price levels. Use exact values from the data.

════════════════════════════════════════
FIELD GLOSSARY (reference when writing):
════════════════════════════════════════
- price          → current last trade price (${price ?? "see input"})
- vwap           → session volume-weighted average price (${vwap ?? "see input"})
- vwap_state     → "above" = price > VWAP (bullish), "below" = price < VWAP (bearish)
- ema_trend_5m   → "bull" = EMA9 > EMA21 on 5m chart; "bear" = opposite
- ema_trend_15m  → same on 15m chart; stronger signal than 5m alone
- rsi_1m         → 1-min RSI; >60 = momentum, <40 = weak/oversold; 40–60 = neutral
- rsi_state      → narrative label (e.g. "neutral_to_bull", "overbought")
- volume_state   → "above_avg" = institutional participation, "below_avg" = low conviction
- momentum_score → 0–10 composite score (0–3 bear, 4–6 neutral, 7–10 bull)
- atr_14         → average true range (${atr ?? "see input"}); use for stop/target sizing
- session_high   → ${sessionHigh ?? "see input"} — key resistance
- session_low    → ${sessionLow  ?? "see input"} — key support
- high_60m       → ${high60 ?? "see input"} — 60-min high
- low_60m        → ${low60  ?? "see input"} — 60-min low
- market_open    → true = live session, false = pre/post market or closed

════════════════════════════════════════
YOUR TASK:
════════════════════════════════════════
Generate a precise, actionable trading plan for ${sym}.

BIAS RULES (follow strictly):
- momentum_score ≥ 7 AND vwap_state = "above" AND at least one EMA trend = "bull" → bias = "bullish"
- momentum_score ≤ 3 AND vwap_state = "below" AND at least one EMA trend = "bear" → bias = "bearish"
- Otherwise → bias = "neutral"

THESIS (2–3 sentences):
- Sentence 1: State price vs VWAP, EMA trend alignment, and RSI condition using exact numbers.
- Sentence 2: Explain the dominant momentum narrative.
- Sentence 3: Name the single most important price level to watch.

PLAYBOOK — generate EXACTLY 3 scenarios:
  Scenario 1 (PRIMARY): IF trigger → THEN entry/targets → RISK stop
  Scenario 2 (SECONDARY): alternate setup
  Scenario 3 (COUNTER-TREND): fade at extreme

DANGER ZONES — list EXACTLY 3.

confidence: float 0.0–1.0 based on signal alignment.

════════════════════════════════════════
OUTPUT FORMAT — return ONLY this JSON:
════════════════════════════════════════
{
  "bias": "bullish|bearish|neutral",
  "thesis": "string",
  "playbook": [
    {"if":"string","then":"string","risk":"string"},
    {"if":"string","then":"string","risk":"string"},
    {"if":"string","then":"string","risk":"string"}
  ],
  "danger_zones": ["string","string","string"],
  "confidence": number
}

INPUT_JSON:
${JSON.stringify(inputJson, null, 2)}
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");

    if (jsonStart === -1 || jsonEnd === -1) {
      return new Response(JSON.stringify({ error: "Model did not return JSON", raw: text }), { status: 502 });
    }

    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    return new Response(JSON.stringify(parsed), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}