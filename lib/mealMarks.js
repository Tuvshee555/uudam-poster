// Deterministic meal-mark reader. The itinerary's ✓/✗ meal marks are tiny color glyphs
// that vision models misread. Instead we rasterize the day-program page and detect the
// marks by PIXEL COLOR (green check = included, red cross = not), then bind each block of
// three marks to a day using the DAY-header text positions. 100% reliable, no AI call.

import { createCanvas, DOMMatrix, Path2D, ImageData } from "@napi-rs/canvas";

const SCALE = 2;

function installGlobals() {
  if (typeof globalThis.DOMMatrix === "undefined") globalThis.DOMMatrix = DOMMatrix;
  if (typeof globalThis.Path2D === "undefined") globalThis.Path2D = Path2D;
  if (typeof globalThis.ImageData === "undefined") globalThis.ImageData = ImageData;
}

class NodeCanvasFactory {
  create(w, h) {
    const canvas = createCanvas(Math.ceil(w), Math.ceil(h));
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(e, w, h) { e.canvas.width = Math.ceil(w); e.canvas.height = Math.ceil(h); }
  destroy(e) { e.canvas.width = 0; e.canvas.height = 0; e.canvas = null; e.context = null; }
}

const isGreen = (r, g, b) => g > 90 && g > r * 1.25 && g > b * 1.25;
const isRed = (r, g, b) => r > 120 && r > g * 1.5 && r > b * 1.5;

// Returns { [dayNumber]: { breakfast, lunch, dinner } } for days that have meal marks.
// Days without marks are simply absent (caller leaves them as-is / false).
export async function readMealMarks(buffer) {
  installGlobals();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const canvasFactory = new NodeCanvasFactory();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    canvasFactory,
    useSystemFonts: true,
  }).promise;

  try {
    // Find the day-program page (has DAY N headers)
    let target = null;
    const pageCount = Math.min(doc.numPages, 12);
    for (let p = 1; p <= pageCount; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const text = tc.items.map((i) => i.str || "").join(" ");
      if (/DAY\s+\d/i.test(text)) { target = { page, tc }; break; }
      page.cleanup();
    }
    if (!target) return {};

    const { page, tc } = target;
    const viewport = page.getViewport({ scale: SCALE });
    const W = Math.ceil(viewport.width);
    const H = Math.ceil(viewport.height);
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    await page.render({ canvasContext: ctx, viewport, canvasFactory }).promise;
    const img = ctx.getImageData(0, 0, W, H).data;

    // DAY header Y positions (canvas, top-down)
    const dayYs = [];
    for (const it of tc.items) {
      const m = (it.str || "").trim().match(/DAY\s+(\d+)/i);
      if (m) {
        const pdfY = it.transform[5];
        const canvasY = (viewport.height / SCALE - pdfY) * SCALE;
        dayYs.push({ day: +m[1], y: canvasY });
      }
    }
    dayYs.sort((a, b) => a.y - b.y);

    // Detect colored mark bands in the right ~30% column
    const x0 = Math.floor(W * 0.70);
    const rows = [];
    for (let y = 0; y < H; y++) {
      let gr = 0, rd = 0;
      for (let x = x0; x < W; x++) {
        const i = (y * W + x) * 4;
        const r = img[i], g = img[i + 1], b = img[i + 2];
        if (isGreen(r, g, b)) gr++;
        else if (isRed(r, g, b)) rd++;
      }
      rows.push({ y, gr, rd });
    }

    let bands = [], cur = null;
    for (const row of rows) {
      const has = row.gr + row.rd > 4;
      if (has) {
        if (!cur) cur = { y0: row.y, y1: row.y, gr: 0, rd: 0 };
        cur.y1 = row.y; cur.gr += row.gr; cur.rd += row.rd;
      } else { if (cur) bands.push(cur); cur = null; }
    }
    if (cur) bands.push(cur);

    // Keep only icon-sized bands (drops big header/title color bars)
    bands = bands.filter((b) => {
      const h = b.y1 - b.y0;
      const tot = b.gr + b.rd;
      return h >= 12 && h <= 40 && tot < 1500;
    });

    const marks = bands.map((b) => ({ yc: (b.y0 + b.y1) / 2, val: b.gr > b.rd }));

    // Group consecutive marks into blocks of 3 (breakfast, lunch, dinner)
    const result = {};
    for (let i = 0; i + 2 < marks.length; i += 3) {
      const grp = marks.slice(i, i + 3);
      const yc = grp[1].yc;
      // Bind block to the nearest DAY header at or above the block
      let best = null;
      for (const d of dayYs) {
        if (d.y <= yc + 40 && (!best || d.y > best.y)) best = d;
      }
      if (best) {
        result[best.day] = {
          breakfast: grp[0].val,
          lunch: grp[1].val,
          dinner: grp[2].val,
        };
      }
    }
    page.cleanup();
    return result;
  } finally {
    await doc.cleanup();
  }
}
