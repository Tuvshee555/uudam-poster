"use client";

import { useRef, useState } from "react";

function Ed({ value = "", onChange, as = "span", className, placeholder }) {
  const Tag = as;
  return (
    <Tag
      className={className}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder || ""}
      onBlur={(e) => {
        const txt = e.currentTarget.innerText.trim();
        if (txt !== value) onChange(txt);
      }}
    >
      {value}
    </Tag>
  );
}

function RemoveBtn({ onClick, title = "Устгах" }) {
  return (
    <button type="button" className="editor-only removebtn" onClick={onClick} title={title}>
      ×
    </button>
  );
}

const MEAL_LABELS = [
  ["breakfast", "Өглөөний цай"],
  ["lunch", "Өдрийн хоол"],
  ["dinner", "Оройн хоол"],
];

function cleanText(value) {
  const text = String(value ?? "").trim();
  if (!text || /^null$/i.test(text) || /^undefined$/i.test(text)) return "";
  return text;
}

function buildNarrative(day) {
  return String(day.summary || "").trim();
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

export default function Poster({
  trip: t,
  upd,
  addItem,
  removeItem,
  insertDay,
  reorderDay,
  addPriceRow,
  addPriceCol,
  removePriceCol,
  logoSrc,
  page1Ref,
  onDayPhotoFile,
  dayPhotoInputRefs,
}) {
  const priceTable = getPriceTable(t);
  const dragIdx = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  const Logo = () => (
    <>
      <img className="logo" src={logoSrc} alt="UUDAM" />
      <div className="name">
        UUDAM<small>TRAVEL AGENCY</small>
      </div>
    </>
  );

  return (
    <>
      <div className="page" id="p1" ref={page1Ref}>
        <div className="head">
          <Logo />
          <div className="spacer" />
          <div className="dur">
            <div className="dur-item"><span className="dur-emoji">☀️</span>{t.duration_days} өдөр</div>
            <div className="dur-item"><span className="dur-emoji">🌙</span>{t.duration_nights} шөнө</div>
          </div>
        </div>

        <div
          className="hero"
          style={
            t.hero_image
              ? {
                  backgroundImage: `linear-gradient(135deg, rgba(15,58,97,.84), rgba(29,93,149,.66)), url(${t.hero_image})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        >
          <Ed as="div" className="kicker" value={t.subtitle || t.agency} onChange={(v) => upd(["subtitle"], v)} />
          <Ed as="div" className="htitle" value={t.title} onChange={(v) => upd(["title"], v)} />
        </div>

        {priceTable || t.price_note ? (
          <div className="sec compact-sec">
            <h3>Үнэ</h3>
            {priceTable ? (
            <>
            <table className="ptable">
              <tbody>
                <tr>
                  <th>Огноо</th>
                  {priceTable.columns.map((c, ci) => (
                    <th key={ci} className="ptable-col-head">
                      {t.price_table ? <Ed value={c} placeholder="Багана нэр" onChange={(v) => upd(["price_table", "columns", ci], v)} /> : c}
                      {t.price_table && priceTable.columns.length > 1 ? (
                        <button type="button" className="editor-only col-remove-btn" onClick={() => removePriceCol(ci)} title="Багана устгах">×</button>
                      ) : null}
                    </th>
                  ))}
                  {t.price_table ? (
                    <th className="editor-only ptable-add-col-th ptable-add-col-header">
                      <button type="button" className="ptable-add-btn" onClick={addPriceCol} title="Багана нэмэх">+</button>
                    </th>
                  ) : null}
                </tr>
                {priceTable.rows.map((r, ri) => {
                  const colCount = priceTable.columns.length;
                  const cells = Array.from({ length: colCount }, (_, ci) => r.cells[ci] ?? "");
                  return (
                  <tr key={ri}>
                    <td className="pwhen">
                      {t.price_table ? (
                        <>
                          <textarea
                            className="pwhen-input"
                            key={r.dates}
                            defaultValue={r.dates}
                            placeholder="Огноо"
                            rows={1}
                            ref={(el) => {
                              if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
                            }}
                            onInput={(e) => {
                              e.target.style.height = "auto";
                              e.target.style.height = e.target.scrollHeight + "px";
                            }}
                            onBlur={(e) => upd(["price_table", "rows", ri, "dates"], e.target.value.trim())}
                          />
                          <RemoveBtn onClick={() => removeItem(["price_table", "rows"], ri)} />
                        </>
                      ) : r.dates}
                    </td>
                    {cells.map((c, ci) => (
                      <td className="pamt" key={ci}>
                        {t.price_table ? <Ed value={c} placeholder="Үнэ" onChange={(v) => upd(["price_table", "rows", ri, "cells", ci], v)} /> : c}
                      </td>
                    ))}
                    {t.price_table ? <td className="editor-only ptable-add-col-th" /> : null}
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {t.price_table ? (
              <button type="button" className="editor-only ptable-add-row-btn" onClick={addPriceRow}>+ Мөр нэмэх</button>
            ) : null}
            </>
            ) : null}
            {priceTable?.note && !t.price_table ? <div className="pnote">{priceTable.note}</div> : null}
            {t.price_note ? (
            <Ed
              as="div"
              className="pnote"
              value={"⚠ " + t.price_note}
              onChange={(v) => upd(["price_note"], v.replace(/^⚠\s*/, ""))}
            />
            ) : null}
            {/* Description box — always in editor, hidden on export if empty via CSS */}
            <Ed
              as="div"
              className="price-desc-input"
              value={t.price_desc || ""}
              placeholder="Тайлбар нэмэх..."
              onChange={(v) => upd(["price_desc"], v)}
            />
          </div>
        ) : null}

        <div className="program-head">
          <div>
            <div className="section-kicker">ХӨТӨЛБӨР</div>
            <div className="ititle">{t.title}</div>
          </div>
        </div>

        <div className="days">
          {(t.days || []).map((d, i) => {
            const narrative = buildNarrative(d);

            return (
              <div
                className={"dayrow" + (d.photo ? " has-photo" : "") + (dragOver === i ? " drag-over" : "")}
                key={i}
                draggable
                onDragStart={() => { dragIdx.current = i; }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => {
                  setDragOver(null);
                  if (dragIdx.current !== null && dragIdx.current !== i) reorderDay(dragIdx.current, i);
                  dragIdx.current = null;
                }}
                onDragEnd={() => { setDragOver(null); dragIdx.current = null; }}
              >
                <div className="dnum" title="Чирж байрлал солих">
                  <span className="dnum-num">{d.day}</span>
                  <span className="dnum-handle editor-only">⠿</span>
                </div>

                <div className="daycard">
                  {/* Left col: title + text + meals | Right col: photo full height */}
                  <div className="dmain">
                    <div className="droute">
                      <Ed value={d.route} onChange={(v) => upd(["days", i, "route"], v)} />
                      <RemoveBtn onClick={() => removeItem(["days"], i)} title="Өдөр устгах" />
                      {d.distance_km ? <span className="km">{d.distance_km} км</span> : null}
                      {cleanText(d.flight) ? <span className="flt">✈ {cleanText(d.flight)}</span> : null}
                    </div>

                    <Ed
                      as="div"
                      className="dsummary prose"
                      value={narrative}
                      placeholder="Энэ өдрийн аяллын тайлбар энд харагдана."
                      onChange={(v) => upd(["days", i, "summary"], v)}
                    />

                    {cleanText(d.hotel) ? (
                      <div className="dhotel">
                        🛏 <Ed value={cleanText(d.hotel)} onChange={(v) => upd(["days", i, "hotel"], v)} />
                      </div>
                    ) : null}

                    <div className="mealgrid">
                      {MEAL_LABELS.map(([k, label]) => {
                        const on = d.meals?.[k];
                        return (
                          <button
                            key={k}
                            type="button"
                            className={"mealcard " + (on ? "yes" : "no")}
                            onClick={() => upd(["days", i, "meals", k], !on)}
                          >
                            <span className="mealname">{label}</span>
                            <span className="mealstate">{on ? "Багтсан" : "Багтаагүй"}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="dside">
                      {d.photo ? (
                        <button
                          type="button"
                          className="dphoto clickable filled"
                          style={{
                            backgroundImage: `linear-gradient(180deg, rgba(12, 27, 43, 0.08), rgba(12, 27, 43, 0.38)), url(${d.photo})`,
                          }}
                          onClick={() => dayPhotoInputRefs.current?.[i]?.click()}
                        >
                          <span className="editor-only photohint">Дарж зураг солино</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="dphoto editor-only dphoto-empty"
                          onClick={() => dayPhotoInputRefs.current?.[i]?.click()}
                        >
                          <span className="dphoto-add-label">+ Зураг нэмэх</span>
                        </button>
                      )}

                      <input
                        ref={(node) => {
                          if (!dayPhotoInputRefs.current) return;
                          if (node) dayPhotoInputRefs.current[i] = node;
                          else delete dayPhotoInputRefs.current[i];
                        }}
                        type="file"
                        accept="image/*"
                        className="hidden-input"
                        onChange={(e) => onDayPhotoFile(i, e.target.files?.[0])}
                      />

                      <div className="editor-only daytools">
                        {d.photo && (
                          <button type="button" className="addbtn danger" onClick={() => upd(["days", i, "photo"], null)}>
                            Фото авах
                          </button>
                        )}
                        <button type="button" className="addbtn" onClick={() => insertDay(i)}>
                          + Дараа өдөр
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="endpad" />

        <div className="foot">
          <span>📞 <b>{(t.contacts?.phones || []).join(", ")}</b></span>
          <span>✉ <b>{t.contacts?.email}</b></span>
        </div>
      </div>
    </>
  );
}
