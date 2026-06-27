import { NextResponse } from "next/server";
import { fileToText } from "../../../lib/parse";
import { extractTrip, extractTripFromImage } from "../../../lib/openai";
import { extractPdfImages } from "../../../lib/pdfImages";

export const runtime = "nodejs";
export const maxDuration = 60;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"];

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

    // Auto-assign extracted images to days (by order, skippable by user)
    if (pdfImages.length > 0) {
      for (let i = 0; i < trip.days.length; i++) {
        if (pdfImages[i]) trip.days[i].photo = pdfImages[i];
      }
    }

    return NextResponse.json({ trip, source_file: file.name });
  } catch (e) {
    console.error("extract failed:", e);
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
