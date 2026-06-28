import { NextResponse } from "next/server";
import { fileToText } from "../../../lib/parse";
import { extractTrip, extractTripFromImage, extractTripFromPdf } from "../../../lib/openai";
import { extractTripFromPdfGemini } from "../../../lib/gemini";
import { extractPdfImages } from "../../../lib/pdfImages";

export const runtime = "nodejs";
export const maxDuration = 60;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"];
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

// Cap images per day to avoid cycling 20 photos for 9 days
const MAX_PDF_IMAGES = 9;

function assignPhotos(trip, pdfImages) {
  if (!pdfImages?.length) return;
  const capped = pdfImages.slice(0, MAX_PDF_IMAGES);
  for (let i = 0; i < trip.days.length; i++) {
    trip.days[i].photo = capped[i % capped.length];
  }
}

// Extract trip from PDF: Gemini first (faster, smarter on layout), OpenAI as fallback
async function extractPdfTrip(b64, filename) {
  if (process.env.GEMINI_API_KEY) {
    try {
      return await extractTripFromPdfGemini(b64, filename);
    } catch (err) {
      console.warn("Gemini PDF extract failed, trying OpenAI:", err.message);
    }
  }
  return extractTripFromPdf(b64, filename).catch(async (visionErr) => {
    console.warn("OpenAI PDF vision failed, falling back to text:", visionErr.message);
    // This fallback path only runs if both vision models fail
    throw visionErr;
  });
}

export async function POST(req) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "File too large. Max 100MB." }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const name = file.name.toLowerCase();
    const mime = file.type || "";

    if (IMAGE_TYPES.includes(mime) || /\.(jpe?g|png|webp|gif|bmp)$/.test(name)) {
      const b64 = buffer.toString("base64");
      const trip = await extractTripFromImage(b64, mime || "image/jpeg");
      return NextResponse.json({ trip, source_file: file.name });
    }

    if (name.endsWith(".pdf") || mime === "application/pdf") {
      const b64 = buffer.toString("base64");
      const [trip, pdfImages] = await Promise.all([
        extractPdfTrip(b64, file.name),
        extractPdfImages(buffer),
      ]);
      assignPhotos(trip, pdfImages);
      return NextResponse.json({ trip, source_file: file.name });
    }

    // docx / txt
    const text = await fileToText(buffer, file.name);
    if (!text || text.trim().length < 20) {
      return NextResponse.json({ error: "Could not read text from this file." }, { status: 422 });
    }
    const trip = await extractTrip(text);
    return NextResponse.json({ trip, source_file: file.name });
  } catch (e) {
    console.error("extract failed:", e);
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
