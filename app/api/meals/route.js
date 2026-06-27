import { NextResponse } from "next/server";
import { readMealMarks } from "../../../lib/mealMarks";

export const runtime = "nodejs";
export const maxDuration = 300; // page rasterization is slow on graphics-heavy PDFs

// Reads the ✓/✗ meal marks from a PDF DETERMINISTICALLY: rasterizes the day-program page
// and detects the colored marks by pixel color (green check / red cross), then binds each
// block to a day via the DAY-header positions. No AI — 100% reliable. Slow only because
// rendering the page is slow; returns { meals: { [dayNumber]: {breakfast,lunch,dinner} } }.
export async function POST(req) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const name = (file.name || "").toLowerCase();
    if (!name.endsWith(".pdf") && file.type !== "application/pdf") {
      return NextResponse.json({ error: "Meal re-read only supports PDF files." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const meals = await readMealMarks(buffer);
    if (!Object.keys(meals).length) {
      return NextResponse.json({ error: "No meal marks found in this PDF." }, { status: 422 });
    }
    return NextResponse.json({ meals });
  } catch (e) {
    console.error("meals extract failed:", e);
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
