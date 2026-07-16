import { NextResponse } from "next/server";
import { del, get } from "@vercel/blob";
import { fileToImages, fileToText } from "../../../lib/parse";
import { extractTrip, extractTripFromImage, extractTripFromPdfPages } from "../../../lib/openai";
import { extractPdfImages } from "../../../lib/pdfImages";
import { applyDayText, applyMealMarks, extractPdfFacts } from "../../../lib/pdfMeals";

export const runtime = "nodejs";
export const maxDuration = 60;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"];
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

const MAX_EXTRACTED_IMAGES = 18;

async function bufferFromPrivateBlob(blobUrl) {
  const result = await get(blobUrl, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error("Uploaded file could not be read from storage.");
  }
  const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
  return {
    buffer,
    mime: result.blob.contentType || "",
    pathname: result.blob.pathname || "",
  };
}

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

async function extractFromBuffer(buffer, filename, mime, originalName) {
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "File too large. Max 100MB." }, { status: 413 });
  }

  const name = filename.toLowerCase();

  if (IMAGE_TYPES.includes(mime) || /\.(jpe?g|png|webp|gif|bmp)$/.test(name)) {
    const b64 = buffer.toString("base64");
    const trip = await extractImageTrip(b64, mime || "image/jpeg");
    return NextResponse.json({ trip, source_file: originalName });
  }

  if (name.endsWith(".pdf") || mime === "application/pdf") {
    const [trip, pdfImages, pdfFacts] = await Promise.all([
      extractTripFromPdfPages(buffer, filename),
      extractPdfImages(buffer),
      extractPdfFacts(buffer),
    ]);
    applyDayText(trip, pdfFacts.days);
    applyMealMarks(trip, pdfFacts.meals);
    assignPhotos(trip, pdfImages);
    return NextResponse.json({ trip, source_file: originalName });
  }

  // docx / txt
  const text = await fileToText(buffer, filename);
  if (!text || text.trim().length < 20) {
    return NextResponse.json({ error: "Could not read text from this file." }, { status: 422 });
  }
  const [trip, fileImages] = await Promise.all([
    extractTextTrip(text),
    fileToImages(buffer, filename),
  ]);
  assignPhotos(trip, fileImages);
  return NextResponse.json({ trip, source_file: originalName });
}

async function extractImageTrip(b64, mimeType) {
  return extractTripFromImage(b64, mimeType);
}

async function extractTextTrip(text) {
  return extractTrip(text);
}

export async function POST(req) {
  let blobUrlToDelete = "";
  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await req.json();
      const blobUrl = String(body.blob_url || body.blobUrl || "");
      if (!blobUrl) return NextResponse.json({ error: "No uploaded file URL" }, { status: 400 });

      blobUrlToDelete = blobUrl;
      const originalName = String(body.original_name || body.originalName || "upload");
      const stored = await bufferFromPrivateBlob(blobUrl);
      const filename = String(body.pathname || stored.pathname || originalName);
      const mime = String(body.file_type || body.fileType || stored.mime || "");

      return await extractFromBuffer(stored.buffer, filename, mime, originalName);
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "";
    // The client uploads under an ASCII-safe name ("upload.pdf") and passes the
    // real (often Cyrillic) filename separately — use that for history display.
    const originalName = String(form.get("original_name") || file.name);
    return await extractFromBuffer(buffer, file.name, mime, originalName);
  } catch (e) {
    console.error("extract failed:", e);
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  } finally {
    if (blobUrlToDelete) {
      try {
        await del(blobUrlToDelete);
      } catch (error) {
        console.warn("temporary upload cleanup failed:", error.message);
      }
    }
  }
}
