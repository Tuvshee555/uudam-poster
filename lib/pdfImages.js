// Extract embedded JPEG images from a PDF buffer.
// Returns array of data URLs in document order (one per page max), skips tiny icons.

import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";

const MIN_BYTES = 15_000; // ignore images smaller than ~15KB

export async function extractPdfImages(buffer) {
  try {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const seenRefs = new Set();
    const images = [];

    for (const page of pdfDoc.getPages()) {
      const resources = page.node.Resources();
      if (!resources) continue;

      const xObjects = resources.lookup(PDFName.of("XObject"));
      if (!xObjects || typeof xObjects.keys !== "function") continue;

      // Pick the largest JPEG image on this page (one per page)
      let bestBytes = null;
      let bestSize = 0;

      for (const key of xObjects.keys()) {
        const ref = xObjects.get(key);
        if (!ref) continue;

        const refStr = String(ref);
        if (seenRefs.has(refStr)) continue;

        const xobj = pdfDoc.context.lookup(ref) ?? ref;
        if (!(xobj instanceof PDFRawStream)) continue;

        seenRefs.add(refStr);

        const dict = xobj.dict;
        const subtype = dict.get(PDFName.of("Subtype"));
        if (!subtype || subtype.toString() !== "/Image") continue;

        const bytes = xobj.contents;
        if (!bytes || bytes.length < MIN_BYTES) continue;

        // Only handle JPEG/JPEG2000 — FlateDecode is raw pixels, not a valid image file
        const filter = dict.get(PDFName.of("Filter"));
        const filterStr = filter ? filter.toString() : "";
        if (!filterStr.includes("DCTDecode") && !filterStr.includes("JPXDecode")) continue;

        if (bytes.length > bestSize) {
          bestSize = bytes.length;
          bestBytes = bytes;
        }
      }

      if (bestBytes) {
        const b64 = Buffer.from(bestBytes).toString("base64");
        images.push(`data:image/jpeg;base64,${b64}`);
      }
    }

    return images;
  } catch (e) {
    console.warn("PDF image extraction failed:", e.message);
    return [];
  }
}
