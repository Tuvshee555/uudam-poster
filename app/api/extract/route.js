import { NextResponse } from "next/server";
import { fileToImages, fileToText } from "../../../lib/parse";
import { extractTrip, extractTripFromImage, extractTripFromPdf } from "../../../lib/openai";
import { extractTripFromPdfGemini } from "../../../lib/gemini";
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
      const [trip, pdfImages, pdfFacts] = await Promise.all([
        extractPdfTrip(b64, file.name),
        extractPdfImages(buffer),
        extractPdfFacts(buffer),
      ]);
      applyDayText(trip, pdfFacts.days);
      applyMealMarks(trip, pdfFacts.meals);
      assignPhotos(trip, pdfImages);
      return NextResponse.json({ trip, source_file: file.name });
    }

    // docx / txt
    const text = await fileToText(buffer, file.name);
    if (!text || text.trim().length < 20) {
      return NextResponse.json({ error: "Could not read text from this file." }, { status: 422 });
    }
    const [trip, fileImages] = await Promise.all([
      extractTrip(text),
      fileToImages(buffer, file.name),
    ]);
    assignPhotos(trip, fileImages);
    return NextResponse.json({ trip, source_file: file.name });
  } catch (e) {
    console.error("extract failed:", e);
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
