import { NextResponse } from "next/server";
import { fileToText } from "../../../lib/parse";
import { extractTrip } from "../../../lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
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
