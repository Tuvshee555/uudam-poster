import { NextResponse } from "next/server";
import { fileToText } from "../../../lib/parse";
import { extractTrip } from "../../../lib/openai";
import { extractPdfImages } from "../../../lib/pdfImages";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const name = file.name.toLowerCase();

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

    // Debug: log what the AI returned for the price table
    console.log("[extract] price_table from AI:", JSON.stringify(trip.price_table, null, 2));

    // Auto-assign extracted images to days (by order, skippable by user)
    if (pdfImages.length > 0) {
      for (let i = 0; i < trip.days.length; i++) {
        if (pdfImages[i]) {
          trip.days[i].photo = pdfImages[i];
        }
      }
    }

    return NextResponse.json({ trip, source_file: file.name });
  } catch (e) {
    console.error("extract failed:", e);
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
