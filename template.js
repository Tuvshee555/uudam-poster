// Clean & minimal Uudam poster. Brand navy #113e67 + real logo.
// One file = the whole design. buildHTML(trip) -> HTML with .page blocks (#p1, #p2...).
const fs = require("fs");
const path = require("path");

const NAVY = "#113e67";
const NAVY_SOFT = "#1c4f80";
const INK = "#16202c";
const MUTED = "#6b7785";
const LINE = "#e6eaf0";
const TINT = "#f4f7fb";
const GOOD = "#1f9d63";

// embed the real logo so the poster is self-contained
let LOGO = "";
try {
  const p = path.join(process.cwd(), "assets", "uudam-logo.jpg");
  LOGO = "data:image/jpeg;base64," + fs.readFileSync(p).toString("base64");
} catch (e) {}

function chip(text) {
  return `<span class="chip">${text}</span>`;
}

function mealPills(m) {
  const one = (on, label) =>
    `<span class="pill ${on ? "yes" : "no"}">${on ? "✓" : "✕"} ${label}</span>`;
  return `<div class="pills">${one(m.breakfast, "Өглөө")}${one(m.lunch, "Өдөр")}${one(m.dinner, "Орой")}</div>`;
}

function priceBlock(t) {
  if (t.price_table) {
    const pt = t.price_table;
    const head = `<th>Огноо</th>` + pt.columns.map((c) => `<th>${c}</th>`).join("");
    const rows = pt.rows
      .map(
        (r) =>
          `<tr><td class="pwhen">${r.dates}</td>` +
          r.cells.map((c) => `<td class="pamt">${c}</td>`).join("") +
          `</tr>`
      )
      .join("");
    return `<table class="ptable"><tr>${head}</tr>${rows}</table>` +
      (pt.note ? `<div class="pnote">${pt.note}</div>` : "");
  }
  return "";
}

function dayRow(d) {
  const km = d.distance_km ? `<span class="km">${d.distance_km} км</span>` : "";
  const flight = d.flight ? `<span class="flt">✈ ${d.flight}</span>` : "";
  const acts = d.activities.map((a) => `<li>${a}</li>`).join("");
  const bonus =
    d.bonus && d.bonus.length
      ? `<div class="bonus">+ ${d.bonus.join(" · ")}</div>`
      : "";
  const hotel = d.hotel ? `<div class="dhotel">🛏 ${d.hotel}</div>` : "";
  return `
  <div class="dayrow">
    <div class="dnum">${d.day}</div>
    <div class="dmain">
      <div class="droute">${d.route} ${km} ${flight}</div>
      <ul class="dacts">${acts}</ul>
      ${bonus}
      ${hotel}
    </div>
    <div class="dmeals">${mealPills(d.meals)}</div>
  </div>`;
}

function buildHTML(t) {
  const deps = t.departures.map((d) => chip(d.date)).join("");
  const inc = t.includes.map((i) => `<li>${i}</li>`).join("");
  const exc = t.excludes.map((i) => `<li>${i}</li>`).join("");
  const days = t.days.map(dayRow).join("");
  const logo = LOGO ? `<img class="logo" src="${LOGO}" alt="UUDAM">` : "";
  const flights = t.flights
    ? chip(`✈ ${t.flights.outbound}`) + chip(`✈ ${t.flights.return}`)
    : "";

  return `<!doctype html><html lang="mn"><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:"Segoe UI","Noto Sans",Arial,sans-serif;color:${INK};-webkit-font-smoothing:antialiased}
  .page{width:1080px;background:#fff;padding:64px 64px 0}
  /* header */
  .head{display:flex;align-items:center;gap:18px;padding-bottom:26px;border-bottom:2px solid ${NAVY}}
  .logo{width:74px;height:74px;border-radius:16px;object-fit:cover}
  .head .name{font-size:20px;font-weight:800;letter-spacing:3px;color:${NAVY}}
  .head .name small{display:block;font-size:11px;letter-spacing:4px;color:${MUTED};font-weight:600;margin-top:2px}
  .head .spacer{flex:1}
  .head .dur{text-align:right;color:${NAVY};font-weight:800;font-size:18px}
  .head .dur small{display:block;color:${MUTED};font-weight:600;font-size:13px}
  /* title */
  .title{margin:34px 0 8px;font-size:46px;line-height:1.05;font-weight:900;color:${NAVY};letter-spacing:-.5px}
  .subtitle{font-size:20px;color:${MUTED};font-weight:600;margin-bottom:24px}
  /* chips */
  .chips{display:flex;flex-wrap:wrap;gap:8px;margin:30px 0}
  .hero{margin:26px -64px 0;padding:50px 64px;color:#fff;position:relative;overflow:hidden;
    background:linear-gradient(135deg,#0f3a61 0%,#1d5d95 100%)}
  .hero:after{content:"✈";position:absolute;right:34px;top:48%;transform:translateY(-50%) rotate(-20deg);font-size:170px;opacity:.07;line-height:1}
  .hero .kicker{font-size:14px;letter-spacing:3px;text-transform:uppercase;color:#e7b23f;font-weight:800;margin-bottom:12px}
  .hero .htitle{font-size:54px;line-height:1.02;font-weight:900;letter-spacing:-.6px;position:relative}
  .hero .htag{margin-top:16px;font-size:17px;color:#cfe0f1;font-style:italic;position:relative}
  .hero .htag b{color:#e7b23f;font-style:normal;margin-right:6px}
  .days{position:relative}
  .days:before{content:"";position:absolute;left:20px;top:18px;bottom:70px;width:2px;background:linear-gradient(#113e67,#cdd8e6)}
  .chip{border:1.5px solid ${LINE};background:${TINT};color:${NAVY};font-weight:600;
    font-size:15px;padding:8px 15px;border-radius:30px}
  /* section */
  .sec{margin-top:34px}
  .sec h3{font-size:14px;letter-spacing:2px;text-transform:uppercase;color:${NAVY};
    font-weight:800;margin-bottom:14px;display:flex;align-items:center;gap:10px}
  .sec h3:before{content:"";width:22px;height:3px;background:${NAVY};border-radius:2px}
  /* price */
  .ptable{width:100%;border-collapse:collapse;margin-top:4px}
  .ptable th{text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.5px;
    color:${MUTED};font-weight:700;padding:10px 10px;border-bottom:2px solid ${LINE}}
  .ptable td{padding:14px 10px;border-bottom:1px solid ${LINE};font-size:16px}
  .pwhen{font-weight:700;color:${NAVY}}
  .pamt{font-weight:800;color:${INK}}
  .pnote{margin-top:12px;color:${MUTED};font-size:14px;font-style:italic}
  /* two-col includes */
  .two{display:grid;grid-template-columns:1fr 1fr;gap:30px}
  .two ul{list-style:none}
  .two li{padding:8px 0 8px 26px;position:relative;font-size:16px;color:${INK}}
  .inc li:before{content:"✓";position:absolute;left:0;color:${GOOD};font-weight:800}
  .exc li:before{content:"✕";position:absolute;left:0;color:#c2c9d4;font-weight:800}
  /* contacts footer */
  .foot{margin:40px -64px 0;padding:22px 64px;background:${NAVY};color:#fff;
    display:flex;gap:26px;flex-wrap:wrap;font-size:15px}
  .foot b{color:#cfe0f1;font-weight:600}
  /* itinerary */
  .ititle{margin:30px 0 8px;font-size:30px;font-weight:900;color:${NAVY}}
  .dayrow{display:flex;gap:18px;padding:22px 0;border-bottom:1px solid ${LINE}}
  .dnum{flex:none;width:42px;height:42px;border-radius:50%;background:${NAVY};color:#fff;
    font-weight:800;font-size:18px;display:flex;align-items:center;justify-content:center;
    box-shadow:0 0 0 4px #fff,0 0 0 6px #dfeaf4;position:relative;z-index:1}
  .dmain{flex:1}
  .droute{font-size:19px;font-weight:800;color:${NAVY};margin-bottom:8px}
  .droute .km{color:${MUTED};font-weight:600;font-size:14px;margin-left:4px}
  .droute .flt{color:${NAVY_SOFT};font-weight:600;font-size:14px;margin-left:6px}
  .dacts{list-style:none}
  .dacts li{position:relative;padding:3px 0 3px 16px;color:${INK};font-size:16px}
  .dacts li:before{content:"•";position:absolute;left:0;color:${NAVY_SOFT}}
  .bonus{margin-top:6px;color:#9a6b00;background:#fff7e6;display:inline-block;
    padding:5px 11px;border-radius:7px;font-size:14px}
  .dhotel{margin-top:8px;color:${MUTED};font-size:14px}
  .dmeals{flex:none;width:128px;display:flex;align-items:flex-start;justify-content:flex-end}
  .pills{display:flex;flex-direction:column;gap:6px;align-items:flex-end}
  .pill{font-size:13px;font-weight:700;padding:5px 11px;border-radius:20px;white-space:nowrap}
  .pill.yes{background:#e7f6ee;color:#1f9d63;border:1px solid #bfe6d0}
  .pill.no{background:#fdecec;color:#d64545;border:1px solid #f3c9c9}
  .endpad{height:56px}
  </style></head><body>

  <!-- PAGE 1 -->
  <div class="page" id="p1">
    <div class="head">
      ${logo}
      <div class="name">UUDAM<small>TRAVEL AGENCY</small></div>
      <div class="spacer"></div>
      <div class="dur">${t.duration_days} ӨДӨР<small>${t.duration_nights} шөнө</small></div>
    </div>

    <div class="hero">
      <div class="kicker">${t.subtitle || t.agency}</div>
      <div class="htitle">${t.title}</div>
      <div class="htag"><b>✦</b> Аялал бүхэн давтагдашгүй</div>
    </div>

    <div class="chips">${flights}${deps}</div>

    <div class="sec">
      <h3>Үнэ</h3>
      ${priceBlock(t)}
      ${t.price_note ? `<div class="pnote">⚠ ${t.price_note}</div>` : ""}
    </div>

    <div class="sec">
      <h3>Багтсан / Багтаагүй</h3>
      <div class="two">
        <ul class="inc">${inc}</ul>
        <ul class="exc">${exc}</ul>
      </div>
    </div>

    <div class="foot">
      <span>📞 <b>${t.contacts.phones.join(", ")}</b></span>
      <span>✉ <b>${t.contacts.email}</b></span>
    </div>
  </div>

  <!-- PAGE 2 -->
  <div class="page" id="p2">
    <div class="head">
      ${logo}
      <div class="name">UUDAM<small>TRAVEL AGENCY</small></div>
      <div class="spacer"></div>
      <div class="dur">ХӨТӨЛБӨР<small>${t.duration_days} өдөр</small></div>
    </div>
    <div class="ititle">${t.title}</div>
    <div class="days">${days}</div>
    <div class="endpad"></div>
  </div>

  </body></html>`;
}

module.exports = { buildHTML };
