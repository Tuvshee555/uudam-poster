import { NextResponse } from "next/server";
import { fileToText } from "../../../lib/parse";
import { extractTrip, extractTripFromImage } from "../../../lib/openai";
import { extractPdfImages } from "../../../lib/pdfImages";

export const runtime = "nodejs";
export const maxDuration = 60;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"];

// Extract day summaries directly from source text — more reliable than asking the AI
// Matches "DAY N :", "Өдөр N", "第N天" patterns then collects body text until next day header
function parseDaySummaries(text) {
  const result = {};
  // Match DAY N / Өдөр N / 第N天 headers
  const dayPattern = /(?:DAY\s+(\d+)\s*[:：]|(?:Өдөр|өдөр)\s*\n?\s*(\d+)|第\s*(\d+)\s*天)/gi;
  const MEAL_WORDS = /^(өглөөний\s+цай|өдрийн\s+хоол|оройн\s+хоол|breakfast|lunch|dinner|早餐|午餐|晚餐)/i;
  const SKIP_LINES = /^(шар тэнгис|бэйдайхэ|бээжин|аяллын зургуудаас|ШАР ТЭНГИС|uudam|travel agency)/i;
  // Lines that signal we've left the day's body text (price info, addresses, phone numbers, itinerary summary header)
  const STOP_LINE = /(?:₮|юань|том хүн|хүүхэд|настай|доош|\d{4,}\s*₮|todtower|офис|тоот|\d{2,}\s*сар(?:ын)?\s*\d|\+976|7713|8913|9117|9924|хөтөлбөрийн\s+тойм)/i;

  const matches = [...text.matchAll(dayPattern)];
  for (let mi = 0; mi < matches.length; mi++) {
    const m = matches[mi];
    const dayNum = parseInt(m[1] || m[2] || m[3]);
    if (!dayNum) continue;

    const start = m.index + m[0].length;
    const end = mi + 1 < matches.length ? matches[mi + 1].index : text.length;
    const chunk = text.slice(start, end);

    // Collect lines until we hit price/address/phone content
    const rawLines = chunk.split("\n").map(l => l.trim()).filter(Boolean);
    const lines = [];
    for (const l of rawLines) {
      if (STOP_LINE.test(l)) break;
      if (!MEAL_WORDS.test(l) && !SKIP_LINES.test(l)) lines.push(l);
    }

    if (lines.length > 0) {
      const joined = lines.join(" ").replace(/\s+/g, " ").trim();
      // Skip if the only content is the route header itself (no real body text)
      const isJustHeader = /^[А-ЯӨҮЁ\s\-–:+&A-Z0-9]+$/u.test(joined) && joined.length < 80;
      if (!isJustHeader) result[dayNum] = joined;
    }
  }
  return result;
}

export async function POST(req) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const name = file.name.toLowerCase();
    const mime = file.type || "";

    // Image file → use vision API to read the poster/document photo
    if (IMAGE_TYPES.includes(mime) || /\.(jpe?g|png|webp|gif|bmp)$/.test(name)) {
      const b64 = buffer.toString("base64");
      const imgMime = mime || "image/jpeg";
      const trip = await extractTripFromImage(b64, imgMime);
      return NextResponse.json({ trip, source_file: file.name });
    }

    // Text-based file → extract text then run AI
    const text = await fileToText(buffer, file.name);
    if (!text || text.trim().length < 20) {
      return NextResponse.json(
        { error: "Could not read text from this file." },
        { status: 422 }
      );
    }

    const [trip, pdfImages] = await Promise.all([
      extractTrip(text),
      name.endsWith(".pdf") ? extractPdfImages(buffer) : Promise.resolve([]),
    ]);

    // Override AI summaries with text parsed directly from source (AI often skips/garbles these)
    const daySummaries = parseDaySummaries(text);
    for (const day of trip.days) {
      const found = daySummaries[day.day];
      if (found && found.trim()) day.summary = found.trim();
    }

    // Assign images to days — cycle through if more days than images
    if (pdfImages.length > 0) {
      for (let i = 0; i < trip.days.length; i++) {
        trip.days[i].photo = pdfImages[i % pdfImages.length];
      }
    }

    return NextResponse.json({ trip, source_file: file.name });
  } catch (e) {
    console.error("extract failed:", e);
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
