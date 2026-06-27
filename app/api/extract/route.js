import { NextResponse } from "next/server";
import { fileToText } from "../../../lib/parse";
import { extractTrip, extractTripFromImage, extractTripFromPdf } from "../../../lib/openai";
import { extractPdfImages } from "../../../lib/pdfImages";

export const runtime = "nodejs";
// Vercel free tier caps function duration at 10s. The PDF-direct vision extract returns
// well within that. (Hi-res page rendering for reading ✓/✗ meal marks takes ~45s on
// graphics-heavy PDFs and can't run here — meals are best-effort + manually toggleable.)
export const maxDuration = 60;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"];

// Spread the extracted photos across the days (cycle if fewer photos than days)
function assignPhotos(trip, pdfImages) {
  if (!pdfImages?.length) return;
  for (let i = 0; i < trip.days.length; i++) {
    trip.days[i].photo = pdfImages[i % pdfImages.length];
  }
}

export async function POST(req) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const name = file.name.toLowerCase();
    const mime = file.type || "";

    // Image file → vision API reads it as a picture
    if (IMAGE_TYPES.includes(mime) || /\.(jpe?g|png|webp|gif|bmp)$/.test(name)) {
      const b64 = buffer.toString("base64");
      const trip = await extractTripFromImage(b64, mime || "image/jpeg");
      return NextResponse.json({ trip, source_file: file.name });
    }

    // PDF → send the file straight to vision. The model renders the PDF and reads it
    // VISUALLY, so multi-column / scrambled-text layouts map day text to the right day.
    // We still pull embedded images out of the PDF bytes for the day photos.
    if (name.endsWith(".pdf") || mime === "application/pdf") {
      const b64 = buffer.toString("base64");
      const [trip, pdfImages] = await Promise.all([
        extractTripFromPdf(b64, file.name).catch(async (visionErr) => {
          // Vision failed (model/size limit) → fall back to plain-text extraction
          console.warn("PDF vision extract failed, falling back to text:", visionErr.message);
          const text = await fileToText(buffer, file.name);
          if (!text || text.trim().length < 20) throw visionErr;
          return extractTrip(text);
        }),
        extractPdfImages(buffer),
      ]);
      assignPhotos(trip, pdfImages);
      return NextResponse.json({ trip, source_file: file.name });
    }

    // Other text-based files (docx, txt) → extract text then run AI
    const text = await fileToText(buffer, file.name);
    if (!text || text.trim().length < 20) {
      return NextResponse.json(
        { error: "Could not read text from this file." },
        { status: 422 }
      );
    }
    const trip = await extractTrip(text);
    return NextResponse.json({ trip, source_file: file.name });
  } catch (e) {
    console.error("extract failed:", e);
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
