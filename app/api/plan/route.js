import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req) {
  try {
    const body = await req.json();
    const inputJson = body?.inputJson;

    if (!inputJson) {
      return new Response(JSON.stringify({ error: "Missing inputJson" }), { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing GEMINI_API_KEY" }), { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const prompt = `
You are a mechanical trading plan generator for SPY 0-DTE traders.

Return ONLY valid JSON in this format:
{
  "bias": "bullish|bearish|neutral",
  "thesis": "string",
  "playbook": [{"if":"string","then":"string","risk":"string"}],
  "danger_zones": ["string"],
  "confidence": number
}

Rules:
- playbook must have 3–5 items
- danger_zones must have 2–4 items
- confidence must be between 0 and 1

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
