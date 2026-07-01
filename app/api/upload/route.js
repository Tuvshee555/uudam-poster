import { handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Issues a client-upload token so the browser sends file bytes straight to
// Vercel Blob, bypassing this function entirely. Vercel serverless functions
// cap request bodies at 4.5MB regardless of maxDuration/plan — routing the
// file body through this route (the old approach) hit that cap on anything
// bigger. Client-direct upload has no such limit.
export async function POST(req) {
  const body = await req.json();
  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        // Blob storage keys must be ASCII — the real filename still travels
        // separately (JSON body) to /api/extract, so this key is just storage.
        const ext = pathname.slice(pathname.lastIndexOf(".")) || "";
        const safeKey = /^[\x20-\x7e]*$/.test(pathname) ? pathname : `upload${ext}`;
        return {
          pathname: safeKey,
          addRandomSuffix: true,
          allowedContentTypes: [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "text/plain",
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "image/bmp",
          ],
          maximumSizeInBytes: 100 * 1024 * 1024,
        };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(jsonResponse);
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 400 });
  }
}
