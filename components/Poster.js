"use client";

// Inline-editable element: click the text on the poster and type.
function Ed({ value = "", onChange, as = "span", className }) {
  const Tag = as;
  return (
    <Tag
      className={className}
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => {
        const txt = e.currentTarget.innerText;
        if (txt !== value) onChange(txt);
      }}
    >
      {value}
    </Tag>
  );
}

export default function Poster({ trip: t, upd, addItem, removeItem, logoSrc, page1Ref, page2Ref }) {
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
      {/* ===== PAGE 1 ===== */}
      <div className="page" id="p1" ref={page1Ref}>
        <div className="head">
          <Logo />
          <div className="spacer" />
          <div className="dur">
            {t.duration_days} ӨДӨР<small>{t.duration_nights} шөнө</small>
          </div>
        </div>

        <div className="hero">
          <Ed as="div" className="kicker" value={t.subtitle || t.agency} onChange={(v) => upd(["subtitle"], v)} />
          <Ed as="div" className="htitle" value={t.title} onChange={(v) => upd(["title"], v)} />
          <div className="htag"><b>✦</b> Аялал бүхэн давтагдашгүй</div>
        </div>

        <div className="chips">
          {t.flights && (
            <>
              <span className="chip">✈ <Ed value={t.flights.outbound} onChange={(v) => upd(["flights", "outbound"], v)} /></span>
              <span className="chip">✈ <Ed value={t.flights.return} onChange={(v) => upd(["flights", "return"], v)} /></span>
            </>
          )}
          {(t.departures || []).map((d, i) => (
            <span className="chip" key={i}>
              <Ed value={d.date} onChange={(v) => upd(["departures", i, "date"], v)} />
            </span>
          ))}
        </div>

        <div className="sec">
          <h3>Үнэ</h3>
          {t.price_table && (
            <table className="ptable">
              <tbody>
                <tr>
                  <th>Огноо</th>
                  {t.price_table.columns.map((c, ci) => (
                    <th key={ci}>
                      <Ed value={c} onChange={(v) => upd(["price_table", "columns", ci], v)} />
                    </th>
                  ))}
                </tr>
                {t.price_table.rows.map((r, ri) => (
                  <tr key={ri}>
                    <td className="pwhen">
                      <Ed value={r.dates} onChange={(v) => upd(["price_table", "rows", ri, "dates"], v)} />
                    </td>
                    {r.cells.map((c, ci) => (
                      <td className="pamt" key={ci}>
                        <Ed value={c} onChange={(v) => upd(["price_table", "rows", ri, "cells", ci], v)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {t.price_note ? (
            <Ed as="div" className="pnote" value={"⚠ " + t.price_note} onChange={(v) => upd(["price_note"], v.replace(/^⚠\s*/, ""))} />
          ) : null}
        </div>

        <div className="sec">
          <h3>Багтсан / Багтаагүй</h3>
          <div className="two">
            <ul className="inc">
              {(t.includes || []).map((x, i) => (
                <li key={i}>
                  <Ed value={x} onChange={(v) => (v.trim() ? upd(["includes", i], v) : removeItem(["includes"], i))} />
                </li>
              ))}
              <li style={{ listStyle: "none", paddingLeft: 0 }}>
                <span className="addbtn" onClick={() => addItem(["includes"], "Шинэ зүйл")}>+ нэмэх</span>
              </li>
            </ul>
            <ul className="exc">
              {(t.excludes || []).map((x, i) => (
                <li key={i}>
                  <Ed value={x} onChange={(v) => (v.trim() ? upd(["excludes", i], v) : removeItem(["excludes"], i))} />
                </li>
              ))}
              <li style={{ listStyle: "none", paddingLeft: 0 }}>
                <span className="addbtn" onClick={() => addItem(["excludes"], "Шинэ зүйл")}>+ нэмэх</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="foot">
          <span>📞 <b>{(t.contacts?.phones || []).join(", ")}</b></span>
          <span>✉ <b>{t.contacts?.email}</b></span>
        </div>
      </div>

      {/* ===== PAGE 2 ===== */}
      <div className="page" id="p2" ref={page2Ref}>
        <div className="head">
          <Logo />
          <div className="spacer" />
          <div className="dur">ХӨТӨЛБӨР<small>{t.duration_days} өдөр</small></div>
        </div>
        <div className="ititle">{t.title}</div>
        <div className="days">
        {(t.days || []).map((d, i) => (
          <div className="dayrow" key={i}>
            <div className="dnum">{d.day}</div>
            <div className="dmain">
              <div className="droute">
                <Ed value={d.route} onChange={(v) => upd(["days", i, "route"], v)} />
                {d.distance_km ? <span className="km"> {d.distance_km} км</span> : null}
                {d.flight ? <span className="flt"> ✈ {d.flight}</span> : null}
              </div>
              <ul className="dacts">
                {(d.activities || []).map((a, ai) => (
                  <li key={ai}>
                    <Ed value={a} onChange={(v) => (v.trim() ? upd(["days", i, "activities", ai], v) : removeItem(["days", i, "activities"], ai))} />
                  </li>
                ))}
                <li style={{ listStyle: "none", paddingLeft: 0 }}>
                  <span className="addbtn" onClick={() => addItem(["days", i, "activities"], "Шинэ үйл явдал")}>+ мөр нэмэх</span>
                </li>
              </ul>
              {d.bonus && d.bonus.length ? <div className="bonus">+ {d.bonus.join(" · ")}</div> : null}
              {d.hotel ? (
                <div className="dhotel">🛏 <Ed value={d.hotel} onChange={(v) => upd(["days", i, "hotel"], v)} /></div>
              ) : null}
            </div>
            <div className="dmeals">
              <div className="pills">
                {[["breakfast", "Өглөө"], ["lunch", "Өдөр"], ["dinner", "Орой"]].map(([k, label]) => {
                  const on = d.meals?.[k];
                  return (
                    <span key={k} className={"pill " + (on ? "yes" : "no")} onClick={() => upd(["days", i, "meals", k], !on)}>
                      {on ? "✓" : "✕"} {label}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
        </div>
        <div className="endpad" />
      </div>
    </>
  );
}
