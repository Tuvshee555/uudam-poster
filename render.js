// render.js  —  trip JSON -> poster PNG(s) + combined PDF
// Usage: node render.js datong-trip.json
const fs = require("fs");
const puppeteer = require("puppeteer-core");
const { PDFDocument } = require("pdf-lib");
const { buildHTML } = require("./template");

const CHROME =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function main() {
  const input = process.argv[2] || "sample-trip.json";
  const data = JSON.parse(fs.readFileSync(input, "utf-8"));
  const html = buildHTML(data);
  fs.writeFileSync("preview.html", html);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--force-device-scale-factor=2"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1400, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: "networkidle0" });

  const ids = await page.$$eval(".page", (els) => els.map((e) => e.id));
  const pngs = [];
  for (const id of ids) {
    const el = await page.$("#" + id);
    const out = `poster-${id}.png`;
    const buf = await el.screenshot({ path: out });
    pngs.push(buf);
    console.log("wrote", out);
  }
  await browser.close();

  // combine the PNGs into one PDF (each poster page = one PDF page)
  const pdf = await PDFDocument.create();
  for (const buf of pngs) {
    const img = await pdf.embedPng(buf);
    const pg = pdf.addPage([img.width, img.height]);
    pg.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }
  fs.writeFileSync("poster.pdf", await pdf.save());
  console.log("wrote poster.pdf");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
