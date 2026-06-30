import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Receives the raw file stream from the client and stores it in Vercel Blob.
// Returns { url } so the client can pass it to /api/extract.
export async function POST(req) {
  try {
    const filename = req.headers.get("x-filename") || "upload";
    const contentType = req.headers.get("content-type") || "application/octet-stream";
    const blob = await put(filename, req.body, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });
    return NextResponse.json({ url: blob.url });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
