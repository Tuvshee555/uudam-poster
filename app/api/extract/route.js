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

async function resolveFileFromRequest(req) {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    // Large file path: client uploaded to Vercel Blob, sends us the URL
    const { blobUrl, fileName, mimeType } = await req.json();
    if (!blobUrl) throw new Error("No blobUrl");
    const res = await fetch(blobUrl);
    if (!res.ok) throw new Error(`Failed to fetch blob: ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const { del } = await import("@vercel/blob");
    del(blobUrl).catch(() => {}); // clean up async, don't block
    return { buffer: Buffer.from(arrayBuffer), name: (fileName || "file").toLowerCase(), mime: mimeType || "" };
  }
  // Small file path: direct multipart upload
  const form = await req.formData();
  const file = form.get("file");
  if (!file) throw new Error("No file");
  if (file.size > MAX_FILE_SIZE_BYTES) throw Object.assign(new Error("File too large. Max 100MB."), { status: 413 });
  return { buffer: Buffer.from(await file.arrayBuffer()), name: file.name.toLowerCase(), mime: file.type || "" };
}

export async function POST(req) {
  try {
    const { buffer, name, mime } = await resolveFileFromRequest(req);

    if (IMAGE_TYPES.includes(mime) || /\.(jpe?g|png|webp|gif|bmp)$/.test(name)) {
      const b64 = buffer.toString("base64");
      const trip = await extractTripFromImage(b64, mime || "image/jpeg");
      return NextResponse.json({ trip, source_file: name });
    }

    if (name.endsWith(".pdf") || mime === "application/pdf") {
      const b64 = buffer.toString("base64");
      const [trip, pdfImages, pdfFacts] = await Promise.all([
        extractPdfTrip(b64, name),
        extractPdfImages(buffer),
        extractPdfFacts(buffer),
      ]);
      applyDayText(trip, pdfFacts.days);
      applyMealMarks(trip, pdfFacts.meals);
      assignPhotos(trip, pdfImages);
      return NextResponse.json({ trip, source_file: name });
    }

    // docx / txt
    const text = await fileToText(buffer, name);
    if (!text || text.trim().length < 20) {
      return NextResponse.json({ error: "Could not read text from this file." }, { status: 422 });
    }
    const [trip, fileImages] = await Promise.all([
      extractTrip(text),
      fileToImages(buffer, name),
    ]);
    assignPhotos(trip, fileImages);
    return NextResponse.json({ trip, source_file: name });
  } catch (e) {
    console.error("extract failed:", e);
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
