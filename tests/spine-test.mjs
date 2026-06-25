// Proves the two risky external pieces work: Gemini extraction + Neon connection.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

// --- tiny .env.local parser ---
const env = {};
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8").split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
  if (m) env[m[1]] = m[2];
}

const doc = fs.readFileSync(path.join(process.cwd(), "tests", "datong-raw.txt"), "utf-8");

const schema = `{
  "title": string, "subtitle": string,
  "duration_days": number, "duration_nights": number,
  "departures": [{ "date": string }],
  "price_rows": [{ "dates": string, "adult": string, "child": string }],
  "days": [{ "day": number, "route": string, "activities": [string],
            "meals": { "breakfast": boolean, "lunch": boolean, "dinner": boolean },
            "hotel": string }]
}`;

const prompt = `You extract structured data from a Mongolian/Chinese travel itinerary for a poster.
Return ONLY JSON matching this shape (prices in Mongolian tugrik with the ₮ sign if present):
${schema}

DOCUMENT:
${doc}`;

async function testGemini() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
    }),
  });
  if (!res.ok) throw new Error("Gemini HTTP " + res.status + ": " + (await res.text()).slice(0, 300));
  const data = await res.json();
  const txt = data.candidates[0].content.parts[0].text;
  const j = JSON.parse(txt);
  console.log("✅ GEMINI OK");
  console.log("   title:", j.title);
  console.log("   duration:", j.duration_days, "days /", j.duration_nights, "nights");
  console.log("   departures:", (j.departures || []).length);
  console.log("   price rows:", (j.price_rows || []).length, "| first:", JSON.stringify(j.price_rows?.[0]));
  console.log("   days parsed:", (j.days || []).length);
  console.log("   day1:", j.days?.[0]?.route, "| meals:", JSON.stringify(j.days?.[0]?.meals));
  console.log("   day5:", j.days?.[4]?.route, "| hotel:", j.days?.[4]?.hotel);
}

async function testNeon() {
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  const r = await client.query("select version()");
  console.log("✅ NEON OK:", r.rows[0].version.split(",")[0]);
  await client.end();
}

const t0 = Date.now();
await testGemini().catch((e) => console.log("❌ GEMINI FAILED:", e.message));
await testNeon().catch((e) => console.log("❌ NEON FAILED:", e.message));
console.log("(took " + ((Date.now() - t0) / 1000).toFixed(1) + "s)");
