import { NextResponse } from "next/server";
import { fileToImages, fileToText } from "../../../lib/parse";
import { extractTrip, extractTripFromImage, extractTripFromPdf } from "../../../lib/openai";
import {
  extractTripFromImageGemini,
  extractTripFromPdfGemini,
  extractTripFromTextGemini,
} from "../../../lib/gemini";
import { extractPdfImages } from "../../../lib/pdfImages";
import { applyDayText, applyMealMarks, extractPdfFacts } from "../../../lib/pdfMeals";

export const runtime = "nodejs";
export const maxDuration = 60;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"];
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

const MAX_EXTRACTED_IMAGES = 18;

function assignPhotos(trip, extractedImages) {
  if (!trip?.days?.length || !extractedImages?.length) return;
  const images = extractedImages.slice(0, MAX_EXTRACTED_IMAGES);
  const dayCount = trip.days.length;
  const imageCount = images.length;

  for (let dayIndex = 0; dayIndex < dayCount; dayIndex++) {
    const imageIndex =
      imageCount <= dayCount
        ? dayIndex
        : Math.round((dayIndex * (imageCount - 1)) / (dayCount - 1 || 1));
    if (images[imageIndex]) {
      trip.days[dayIndex].photo = images[imageIndex];
    }
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
  return extractTripFromPdf(b64, filename);
}

// Same pattern for photos of documents: Gemini first, OpenAI as fallback.
async function extractImageTrip(b64, mimeType) {
  if (process.env.GEMINI_API_KEY) {
    try {
      return await extractTripFromImageGemini(b64, mimeType);
    } catch (err) {
      console.warn("Gemini image extract failed, trying OpenAI:", err.message);
    }
  }
  return extractTripFromImage(b64, mimeType);
}

// Plain text (docx/txt): OpenAI first (existing behavior), Gemini as fallback
// so extraction keeps working when the OpenAI account is over quota.
async function extractTextTrip(text) {
  try {
    return await extractTrip(text);
  } catch (err) {
    if (!process.env.GEMINI_API_KEY) throw err;
    console.warn("OpenAI text extract failed, trying Gemini:", err.message);
    return extractTripFromTextGemini(text);
  }
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
    // The client uploads under an ASCII-safe name ("upload.pdf") and passes the
    // real (often Cyrillic) filename separately — use that for history display.
    const originalName = String(form.get("original_name") || file.name);

    if (IMAGE_TYPES.includes(mime) || /\.(jpe?g|png|webp|gif|bmp)$/.test(name)) {
      const b64 = buffer.toString("base64");
      const trip = await extractImageTrip(b64, mime || "image/jpeg");
      return NextResponse.json({ trip, source_file: originalName });
    }

    if (name.endsWith(".pdf") || mime === "application/pdf") {
      const b64 = buffer.toString("base64");
      const [trip, pdfImages, pdfFacts] = await Promise.all([
        extractPdfTrip(b64, file.name),
        extractPdfImages(buffer),
        extractPdfFacts(buffer),
      ]);
      applyDayText(trip, pdfFacts.days);
      applyMealMarks(trip, pdfFacts.meals);
      assignPhotos(trip, pdfImages);
      return NextResponse.json({ trip, source_file: originalName });
    }

    // docx / txt
    const text = await fileToText(buffer, file.name);
    if (!text || text.trim().length < 20) {
      return NextResponse.json({ error: "Could not read text from this file." }, { status: 422 });
    }
    const [trip, fileImages] = await Promise.all([
      extractTextTrip(text),
      fileToImages(buffer, file.name),
    ]);
    assignPhotos(trip, fileImages);
    return NextResponse.json({ trip, source_file: originalName });
  } catch (e) {
    console.error("extract failed:", e);
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
