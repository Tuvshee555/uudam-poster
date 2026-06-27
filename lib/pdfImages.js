// Extract embedded images from a PDF buffer by walking all indirect objects.
// Returns array of data URLs, largest images first (skips tiny icons < 5KB).

import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import zlib from "zlib";
import { promisify } from "util";

const inflate = promisify(zlib.inflate);
const MIN_BYTES = 5_000;
const MIN_DIM = 100; // ignore images smaller than 100px in either dimension

// Build a minimal valid PNG from raw RGB pixel data
function rawRGBtoPNG(pixels, width, height) {
  const rows = [];
  const rowBytes = width * 3;
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(rowBytes + 1);
    row[0] = 0; // filter type: None
    pixels.copy(row, 1, y * rowBytes, (y + 1) * rowBytes);
    rows.push(row);
  }
  const rawData = Buffer.concat(rows);
  const compressed = zlib.deflateSync(rawData);

  function crc32(buf) {
    let c = 0xffffffff;
    for (const b of buf) {
      c ^= b;
      for (let i = 0; i < 8; i++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const typeBytes = Buffer.from(type, "ascii");
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crcBuf = Buffer.concat([typeBytes, data]);
    const crcVal = Buffer.alloc(4); crcVal.writeUInt32BE(crc32(crcBuf));
    return Buffer.concat([len, typeBytes, data, crcVal]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export async function extractPdfImages(buffer) {
  try {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const ctx = pdfDoc.context;
    const images = [];

    for (const [, obj] of ctx.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream)) continue;

      const dict = obj.dict;
      const subtype = dict.get(PDFName.of("Subtype"));
      if (!subtype || subtype.toString() !== "/Image") continue;

      const bytes = obj.contents;
      if (!bytes || bytes.length < MIN_BYTES) continue;

      const w = Number(dict.get(PDFName.of("Width"))?.toString() || 0);
      const h = Number(dict.get(PDFName.of("Height"))?.toString() || 0);
      if (w < MIN_DIM || h < MIN_DIM) continue;

      const filter = dict.get(PDFName.of("Filter"));
      const filterStr = filter ? filter.toString() : "";

      try {
        if (filterStr.includes("DCTDecode") || filterStr.includes("JPXDecode")) {
          // Real JPEG — use as-is
          const b64 = Buffer.from(bytes).toString("base64");
          images.push({ data: `data:image/jpeg;base64,${b64}`, size: bytes.length, w, h });
        } else if (filterStr.includes("FlateDecode")) {
          // Compressed raw RGB pixels — decompress and encode as PNG
          const cs = dict.get(PDFName.of("ColorSpace"));
          const csStr = cs ? cs.toString() : "";
          // Only handle RGB (DeviceRGB) — skip CMYK, indexed, grayscale
          if (!csStr.includes("RGB") && csStr !== "") continue;
          const decompressed = await inflate(Buffer.from(bytes));
          const expected = w * h * 3;
          if (decompressed.length < expected) continue;
          const png = rawRGBtoPNG(decompressed.slice(0, expected), w, h);
          const b64 = png.toString("base64");
          images.push({ data: `data:image/png;base64,${b64}`, size: bytes.length, w, h });
        }
      } catch {
        // Skip images that fail to decode
      }
    }

    // Sort by size descending (largest/highest quality first), skip obvious logos
    images.sort((a, b) => b.size - a.size);

    console.log(`[pdfImages] found ${images.length} images`);
    return images.map((i) => i.data);
  } catch (e) {
    console.warn("[pdfImages] extraction failed:", e.message);
    return [];
  }
}
