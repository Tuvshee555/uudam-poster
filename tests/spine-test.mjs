// Proves the two risky external pieces work: OpenAI extraction + Neon connection.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { extractTrip } from "../lib/openai.js";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

async function testOpenAI() {
  const doc = fs.readFileSync(path.join(process.cwd(), "tests", "datong-raw.txt"), "utf-8");
  const trip = await extractTrip(doc);

  console.log("OPENAI OK");
  console.log("   title:", trip.title);
  console.log("   duration:", trip.duration_days, "days /", trip.duration_nights, "nights");
  console.log("   departures:", (trip.departures || []).length);
  console.log("   price rows:", (trip.price_table?.rows || []).length);
  console.log("   days parsed:", (trip.days || []).length);
}

async function testNeon() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const result = await client.query("select version()");
  console.log("NEON OK:", result.rows[0].version.split(",")[0]);
  await client.end();
}

const started = Date.now();
await testOpenAI().catch((error) => console.log("OPENAI FAILED:", error.message));
await testNeon().catch((error) => console.log("NEON FAILED:", error.message));
console.log("(took " + ((Date.now() - started) / 1000).toFixed(1) + "s)");
