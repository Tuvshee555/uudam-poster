import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Receives the raw file stream from the client and stores it in Vercel Blob.
// Returns { url } so the client can pass it to /api/extract.
export async function POST(req) {
  try {
    // Client URL-encodes the filename (Cyrillic/CJK aren't valid raw header values).
    const rawHeader = req.headers.get("x-filename") || "upload";
    let filename;
    try { filename = decodeURIComponent(rawHeader); } catch { filename = rawHeader; }
    // Blob storage keys must be ASCII — keep the extension, replace the rest with a safe stub.
    const ext = filename.slice(filename.lastIndexOf(".")) || "";
    const safeKey = /^[\x20-\x7e]*$/.test(filename) ? filename : `upload${ext}`;

    const contentType = req.headers.get("content-type") || "application/octet-stream";
    const blob = await put(safeKey, req.body, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });
    return NextResponse.json({ url: blob.url });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
