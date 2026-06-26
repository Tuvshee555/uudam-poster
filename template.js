const fs = require("fs");
const path = require("path");

const NAVY = "#113e67";
const NAVY_SOFT = "#1c4f80";
const NAVY_DEEP = "#082f52";
const GOLD = "#f2bd4a";
const INK = "#16202c";
const MUTED = "#6b7785";
const LINE = "#e6eaf0";
const TINT = "#f4f7fb";
const PAPER = "#fbfcff";

let LOGO = "";
try {
  const p = path.join(process.cwd(), "assets", "uudam-logo.jpg");
  LOGO = "data:image/jpeg;base64," + fs.readFileSync(p).toString("base64");
} catch (e) {}

function wordCount(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function stripFinalPunctuation(text) {
  return String(text || "").trim().replace(/[.!?。]+$/u, "");
}

function cleanText(value) {
  const text = String(value ?? "").trim();
  if (!text || /^null$/i.test(text) || /^undefined$/i.test(text)) return "";
  return text;
}

function buildNarrative(day) {
  const summary = String(day.summary || "").trim();
  if (wordCount(summary) >= 20) return summary;

  const activities = (day.activities || []).map((x) => String(x || "").trim()).filter(Boolean);
  const route = stripFinalPunctuation(day.route || "");
  const lead = summary ? stripFinalPunctuation(summary) : route;
  const first = activities.slice(0, 2).join(", ");
  const rest = activities.slice(2).join(", ");
  const sentences = [];

  if (lead && first) sentences.push(`${lead} чиглэлд аялж, ${first.toLowerCase()}.`);
  else if (lead) sentences.push(`${lead} чиглэлд аялан тухайн өдрийн онцлох хөтөлбөрөө өнгөрөөнө.`);
  else if (first) sentences.push(`${first}.`);
  if (rest) sentences.push(`${rest[0].toUpperCase()}${rest.slice(1)}.`);
  if (day.hotel) sentences.push(`Орой ${stripFinalPunctuation(day.hotel)} байрлаж амарна.`);

  const narrative = sentences.join(" ").replace(/\s+/g, " ").trim();
  if (wordCount(narrative) >= 20) return narrative;
  return `${narrative} Аяллын хэмнэл тайван үргэлжилж, аялагчид тухайн газрын уур амьсгал, үзэмж, амралтын мэдрэмжийг илүү ойроос мэдрэх боломжтой.`.trim();
}

function getPriceTable(trip) {
  if (trip.price_table) return trip.price_table;
  if (!Array.isArray(trip.prices) || trip.prices.length === 0) return null;

  return {
    columns: ["Том хүн", "Хүүхэд"],
    rows: trip.prices.map((p) => ({
      dates: p.applies_to || "",
      cells: [
        p.adult ? `${p.adult}${p.currency || ""}` : "",
        p.child ? `${p.child}${p.currency || ""}${p.child_years ? ` (${p.child_years})` : ""}` : "",
      ],
    })),
    note: trip.child_free_note || "",
  };
}

function priceBlock(t) {
  const pt = getPriceTable(t);
  if (!pt) return "";
  const head = `<th>Огноо</th>` + pt.columns.map((c) => `<th>${c}</th>`).join("");
  const rows = pt.rows
    .map(
      (r) =>
        `<tr><td class="pwhen">${r.dates}</td>` +
        r.cells.map((c) => `<td class="pamt">${c}</td>`).join("") +
        `</tr>`
    )
    .join("");
  return `<table class="ptable"><tr>${head}</tr>${rows}</table>` + (pt.note ? `<div class="pnote">${pt.note}</div>` : "");
}

function dayRow(d) {
  const km = d.distance_km ? `<span class="km">${d.distance_km} км</span>` : "";
  const flight = cleanText(d.flight) ? `<span class="flt">✈ ${cleanText(d.flight)}</span>` : "";
  const summary = buildNarrative(d);
  const hotel = cleanText(d.hotel) ? `<div class="dhotel">🛏 ${cleanText(d.hotel)}</div>` : "";
  const photo = d.photo
    ? `<div class="dphoto" style="background-image:linear-gradient(180deg,rgba(12,27,43,.08),rgba(12,27,43,.38)),url(${d.photo})"></div>`
    : "";

  return `
    <div class="dayrow">
      <div class="dnum">${d.day}</div>
      <div class="daycard">
        <div class="droute">${d.route}${km}${flight}</div>
        <div class="daycontent">
          <div class="dmain">
            <div class="dsummary prose">${summary}</div>
            ${hotel}
          </div>
          <div class="dside">
            <div class="mealgrid">
              <div class="mealcard ${d.meals?.breakfast ? "yes" : "no"}"><span>Өглөө</span><span>${d.meals?.breakfast ? "Багтсан" : "Ороогүй"}</span></div>
              <div class="mealcard ${d.meals?.lunch ? "yes" : "no"}"><span>Өдөр</span><span>${d.meals?.lunch ? "Багтсан" : "Ороогүй"}</span></div>
              <div class="mealcard ${d.meals?.dinner ? "yes" : "no"}"><span>Орой</span><span>${d.meals?.dinner ? "Багтсан" : "Ороогүй"}</span></div>
            </div>
            ${photo}
          </div>
        </div>
      </div>
    </div>
  `;
}

function chip(text) {
  return `<div class="datepill">${text}</div>`;
}

function buildHTML(t) {
  const days = (t.days || []).map(dayRow).join("");
  const logo = LOGO ? `<img class="logo" src="${LOGO}" alt="UUDAM">` : "";
  const prices = priceBlock(t);

  return `<!doctype html><html lang="mn"><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:"Segoe UI","Noto Sans",Arial,sans-serif;color:${INK};-webkit-font-smoothing:antialiased}
    .page{width:1080px;background:#fff;padding:52px 56px 0}
    .head{display:flex;align-items:center;gap:16px;padding-bottom:20px;border-bottom:2px solid ${NAVY}}
    .logo{width:64px;height:64px;border-radius:12px;object-fit:cover}
    .head .name{font-size:18px;font-weight:900;letter-spacing:2px;color:${NAVY}}
    .head .name small{display:block;font-size:10px;letter-spacing:3px;color:${MUTED};font-weight:600;margin-top:3px}
    .head .spacer{flex:1}
    .head .dur{text-align:right;display:flex;flex-direction:column;gap:4px}
    .dur-item{color:${NAVY};font-weight:900;font-size:20px;display:flex;align-items:center;gap:6px;justify-content:flex-end}
    .hero{margin:28px 0 0;padding:40px 48px;color:#fff;border-radius:16px;background:${NAVY}}
    .hero .kicker{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${GOLD};font-weight:800;margin-bottom:10px}
    .hero .htitle{font-size:50px;line-height:1.06;font-weight:900;letter-spacing:-1px;max-width:760px}
    .sec{margin-top:28px}
    .sec h3{font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:${MUTED};font-weight:800;margin-bottom:10px}
    .ptable{width:100%;border-collapse:collapse;margin-top:4px}
    .ptable th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#fff;font-weight:700;padding:10px 14px;background:${NAVY}}
    .ptable td{padding:12px 14px;border-bottom:1px solid ${LINE};font-size:15px;vertical-align:top}
    .ptable tr:last-child td{border-bottom:none}
    .pwhen{font-weight:700;color:${NAVY}}
    .pamt{font-weight:800;color:${INK}}
    .pnote{margin-top:8px;color:${MUTED};font-size:13px;font-style:italic}
    .foot{margin:36px -56px 0;padding:16px 56px;background:${NAVY};color:#fff;display:flex;gap:24px;flex-wrap:wrap;font-size:14px}
    .foot b{color:#bcd2e8;font-weight:600}
    .program-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin:36px 0 12px;padding-top:24px;border-top:1px solid ${LINE}}
    .section-kicker{font-size:10px;text-transform:uppercase;letter-spacing:2.5px;color:${GOLD};font-weight:900;margin-bottom:4px}
    .program-count{font-size:13px;font-weight:800;color:${NAVY};border:1px solid ${LINE};border-radius:999px;padding:6px 14px;white-space:nowrap}
    .ititle{font-size:28px;font-weight:900;color:${NAVY};letter-spacing:-.3px}
    .days{position:relative;padding-left:2px}
    .days:before{content:"";position:absolute;left:22px;top:24px;bottom:60px;width:1px;background:${LINE}}
    .dayrow{display:grid;grid-template-columns:46px 1fr;gap:18px;padding:10px 0}
    .dnum{width:44px;height:44px;border-radius:50%;background:${NAVY};color:#fff;font-weight:800;font-size:18px;display:flex;align-items:center;justify-content:center;position:relative;z-index:1}
    .daycard{border:1px solid ${LINE};border-radius:12px;padding:20px 24px;background:#fff;border-left:3px solid ${GOLD}}
    .droute{font-size:19px;font-weight:900;color:${NAVY};display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .droute .km,.droute .flt{font-size:11px;padding:3px 8px;border-radius:999px;background:#f4f7fb;font-weight:700;color:${MUTED}}
    .droute .flt{color:${NAVY_SOFT}}
    .daycontent{display:grid;grid-template-columns:minmax(0,1.7fr) 210px;gap:24px;align-items:start;margin-top:14px}
    .dsummary.prose{font-size:16px;line-height:1.8;color:#2c3e50}
    .dhotel{margin-top:12px;color:${MUTED};font-size:13px;line-height:1.4}
    .dside{display:flex;flex-direction:column;gap:10px}
    .mealgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}
    .mealcard{display:flex;flex-direction:column;gap:3px;align-items:center;padding:8px 4px;border-radius:8px;border:1px solid ${LINE};font-size:10px;font-weight:700}
    .mealcard.yes{background:#f0faf4;color:#1a7a4a;border-color:#b8e2c8}
    .mealcard.no{background:#fdf4f4;color:#a04040;border-color:#e8c8c8}
    .dphoto{min-height:160px;border-radius:10px;border:1px solid ${LINE};background-size:cover;background-position:center}
    .endpad{height:32px}
  </style></head><body>
    <div class="page" id="p1">
      <div class="head">
        ${logo}
        <div class="name">UUDAM<small>TRAVEL AGENCY</small></div>
        <div class="spacer"></div>
        <div class="dur">
          <div class="dur-item"><span>☀️</span>${t.duration_days} өдөр</div>
          <div class="dur-item"><span>🌙</span>${t.duration_nights} шөнө</div>
        </div>
      </div>

      <div class="hero"${t.hero_image ? ` style="background-image:linear-gradient(135deg,rgba(15,58,97,.84),rgba(29,93,149,.66)),url(${t.hero_image});background-size:cover;background-position:center"` : ""}>
        <div class="kicker">${t.subtitle || t.agency}</div>
        <div class="htitle">${t.title}</div>
      </div>

      ${prices || t.price_note ? `<div class="sec">
        <h3>Үнэ</h3>
        ${prices}
        ${t.price_note ? `<div class="pnote">⚠ ${t.price_note}</div>` : ""}
      </div>` : ""}

      <div class="program-head">
        <div>
          <div class="section-kicker">ХӨТӨЛБӨР</div>
          <div class="ititle">${t.title}</div>
        </div>
        <div class="program-count">${t.duration_days} өдөр</div>
      </div>

      <div class="days">${days}</div>
      <div class="endpad"></div>

      <div class="foot">
        <span>📞 <b>${t.contacts.phones.join(", ")}</b></span>
        <span>✉ <b>${t.contacts.email}</b></span>
      </div>
    </div>
  </body></html>`;
}

module.exports = { buildHTML };
