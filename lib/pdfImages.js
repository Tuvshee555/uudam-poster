// Extract embedded images from a PDF buffer.
// Returns array of data URLs in document order, one per day (skips tiny icons).

import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";

const MIN_BYTES = 15_000; // ignore images smaller than ~15KB (icons/decorations)

export async function extractPdfImages(buffer) {
  try {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const seen = new Set();
    const images = [];

    for (const page of pdfDoc.getPages()) {
      const resources = page.node.Resources();
      if (!resources) continue;

      const xObjects = resources.lookup(PDFName.of("XObject"));
      if (!xObjects || typeof xObjects.keys !== "function") continue;

      for (const key of xObjects.keys()) {
        const ref = xObjects.get(key);
        if (!ref) continue;

        // Dereference if it's an indirect ref
        const xobj = pdfDoc.context.lookup(ref) ?? ref;
        if (!(xobj instanceof PDFRawStream)) continue;

        // Skip duplicates (same image referenced from multiple pages)
        const refStr = ref.toString();
        if (seen.has(refStr)) continue;
        seen.add(refStr);

        const dict = xobj.dict;
        const subtype = dict.get(PDFName.of("Subtype"));
        if (!subtype || subtype.toString() !== "/Image") continue;

        const bytes = xobj.contents;
        if (!bytes || bytes.length < MIN_BYTES) continue;

        // Determine image type from Filter
        const filter = dict.get(PDFName.of("Filter"));
        const filterStr = filter ? filter.toString() : "";

        let mimeType;
        if (filterStr.includes("DCTDecode")) {
          mimeType = "image/jpeg";
        } else if (filterStr.includes("JPXDecode")) {
          mimeType = "image/jpeg";
        } else if (filterStr.includes("FlateDecode")) {
          // Raw pixel data or embedded PNG — try to serve as PNG
          mimeType = "image/png";
        } else {
          // Skip non-photo formats (CCITTFax, JBIG2, etc)
          continue;
        }

        const b64 = Buffer.from(bytes).toString("base64");
        images.push(`data:${mimeType};base64,${b64}`);
      }
    }

    return images;
  } catch (e) {
    console.warn("PDF image extraction failed:", e.message);
    return [];
  }
}
