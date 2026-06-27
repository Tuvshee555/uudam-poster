"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Poster from "../components/Poster";
import { createDefaultTrip } from "../lib/defaultTrip";

const POSTER_WIDTH = 1080;

function setPath(obj, path, value) {
  const clone = structuredClone(obj);
  let o = clone;
  for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
  o[path[path.length - 1]] = value;
  return clone;
}

function resizeImage(file, maxW = 1500) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function normalizeTripData(trip) {
  if (!trip) return trip;
  const clone = structuredClone(trip);
  clone.departures = (clone.departures || []).filter((d) => d?.date?.trim());
  clone.includes = (clone.includes || []).filter((x) => String(x || "").trim());
  clone.excludes = (clone.excludes || []).filter((x) => String(x || "").trim());
  clone.days = (clone.days || []).map((day, index) => ({
    ...day,
    day: index + 1,
    summary: day.summary || "",
    activities: (day.activities || []).filter((x) => String(x || "").trim()),
    meals: day.meals || { breakfast: true, lunch: false, dinner: true },
    bonus: day.bonus || [],
    photo: day.photo || null,
    photo_caption: day.photo_caption || "",
  }));
  if (clone.price_table) {
    clone.price_table.columns = (clone.price_table.columns || []).filter((x) => String(x || "").trim());
    clone.price_table.rows = (clone.price_table.rows || []).filter((r) => {
      const hasDate = String(r?.dates || "").trim();
      const hasCells = (r?.cells || []).some((x) => String(x || "").trim());
      return hasDate || hasCells;
    });
  }
  return clone;
}

export default function Home() {
  const [trip, setTrip] = useState(null);
  const [tripId, setTripId] = useState(null);
  const [source, setSource] = useState("");
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [scale, setScale] = useState(0.6);
  const [totalH, setTotalH] = useState(0);

  const page1Ref = useRef(null);
  const previewRef = useRef(null);
  const mainRef = useRef(null);
  const heroInputRef = useRef(null);
  const dayPhotoInputRefs = useRef({});

  const upd = (path, value) => setTrip((t) => setPath(t, path, value));

  const startTemplate = () => {
    setError("");
    setBusy("");
    setTrip(normalizeTripData(createDefaultTrip()));
    setTripId(null);
    setSource("Default template");
  };

  const addItem = (path, value) =>
    setTrip((t) => {
      const clone = structuredClone(t);
      let o = clone;
      for (const p of path) o = o[p];
      o.push(value);
      return normalizeTripData(clone);
    });

  const removeItem = (path, idx) =>
    setTrip((t) => {
      const clone = structuredClone(t);
      let o = clone;
      for (const p of path) o = o[p];
      o.splice(idx, 1);
      return normalizeTripData(clone);
    });

  const addDeparture = () => addItem(["departures"], { date: "Шинэ огноо" });

  const newDayObj = () => ({
    route: "Шинэ өдөр",
    distance_km: 0,
    summary:
      "Энэ хэсэгт тухайн өдрийн аяллын уур амьсгал, үзэх газар, амрах цаг болон аялагчид юуг мэдрэхийг ойлгомжтой тайлбарлан бичнэ.",
    activities: ["Шинэ үйл ажиллагаа"],
    meals: { breakfast: true, lunch: false, dinner: true },
    hotel: null,
    flight: null,
    bonus: [],
    photo: null,
    photo_caption: "",
  });

  const addDay = () =>
    setTrip((t) => {
      const clone = structuredClone(t);
      clone.days ||= [];
      clone.days.push(newDayObj());
      return normalizeTripData(clone);
    });

  const insertDay = (afterIndex) =>
    setTrip((t) => {
      const clone = structuredClone(t);
      clone.days ||= [];
      clone.days.splice(afterIndex + 1, 0, newDayObj());
      return normalizeTripData(clone);
    });

  const reorderDay = (fromIdx, toIdx) =>
    setTrip((t) => {
      const clone = structuredClone(t);
      const days = clone.days || [];
      const [moved] = days.splice(fromIdx, 1);
      days.splice(toIdx, 0, moved);
      clone.days = days;
      return normalizeTripData(clone);
    });

  const removeLastDay = () =>
    setTrip((t) => {
      const clone = structuredClone(t);
      clone.days = (clone.days || []).slice(0, -1);
      return normalizeTripData(clone);
    });

  const ensurePriceTable = () =>
    setTrip((t) => {
      const clone = structuredClone(t);
      clone.price_table ||= { columns: ["Том хүн", "Хүүхэд"], rows: [], note: "" };
      if (!clone.price_table.columns?.length) clone.price_table.columns = ["Том хүн", "Хүүхэд"];
      clone.price_table.rows ||= [];
      if (clone.price_table.rows.length === 0) {
        clone.price_table.rows.push({ dates: "Шинэ огноо", cells: clone.price_table.columns.map(() => "") });
      }
      return normalizeTripData(clone);
    });

  const addPriceRow = () =>
    setTrip((t) => {
      const clone = structuredClone(t);
      clone.price_table ||= { columns: ["Том хүн", "Хүүхэд"], rows: [], note: "" };
      const cols = clone.price_table.columns?.length || 2;
      clone.price_table.rows ||= [];
      clone.price_table.rows.push({ dates: "Шинэ огноо", cells: Array.from({ length: cols }, () => "") });
      return clone;
    });

  const addPriceCol = () =>
    setTrip((t) => {
      const clone = structuredClone(t);
      if (!clone.price_table) return clone;
      clone.price_table.columns.push("Шинэ багана");
      clone.price_table.rows = clone.price_table.rows.map((r) => ({
        ...r,
        cells: [...r.cells, ""],
      }));
      return clone;
    });

  const removePriceCol = (ci) =>
    setTrip((t) => {
      const clone = structuredClone(t);
      if (!clone.price_table) return clone;
      clone.price_table.columns.splice(ci, 1);
      clone.price_table.rows = clone.price_table.rows.map((r) => ({
        ...r,
        cells: r.cells.filter((_, i) => i !== ci),
      }));
      return clone;
    });

  const toggleFlights = () =>
    setTrip((t) => {
      const clone = structuredClone(t);
      clone.flights = clone.flights ? null : { outbound: "MR855 УБ → Датун 16:30-18:10", return: "MR856 Датун → УБ 19:10-21:00" };
      return clone;
    });

  useLayoutEffect(() => {
    const fit = () => {
      const w = mainRef.current ? mainRef.current.clientWidth : POSTER_WIDTH;
      setScale(Math.min(1, (w - 4) / POSTER_WIDTH));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [trip]);

  useLayoutEffect(() => {
    if (previewRef.current) setTotalH(previewRef.current.scrollHeight);
  }, [trip, scale]);

  const loadHistory = async () => {
    const r = await fetch("/api/trips").then((x) => x.json());
    if (r.trips) setHistory(r.trips);
  };

  useEffect(() => {
    loadHistory();
  }, []);

  async function handleFile(file) {
    if (!file) return;
    setError("");
    setBusy("AI бичиг баримтыг уншиж байна…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/extract", { method: "POST", body: fd }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      setTrip(normalizeTripData(r.trip));
      setTripId(null);
      setSource(r.source_file || file.name);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy("");
    }
  }

  async function capture(node) {
    const imgs = Array.from(node.querySelectorAll("img"));
    await Promise.all(
      imgs.map(async (img) => {
        if (!img.complete || !img.naturalWidth) {
          await new Promise((resolve) => {
            const done = () => resolve();
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
          });
        }
        if (img.decode) {
          try {
            await img.decode();
          } catch {}
        }
      })
    );

    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const htmlToImage = await import("html-to-image");
    return htmlToImage.toPng(node, {
      pixelRatio: 2,
      width: node.offsetWidth,
      height: node.offsetHeight,
      backgroundColor: "#ffffff",
      style: { transform: "none", margin: "0", boxShadow: "none" },
      filter: (domNode) => !domNode.classList?.contains("editor-only") && !domNode.classList?.contains("hidden-input"),
    });
  }

  async function withExportMode(work) {
    document.body.classList.add("exporting");
    try {
      return await work();
    } finally {
      document.body.classList.remove("exporting");
    }
  }

  async function downloadPng() {
    setBusy("Зураг бэлдэж байна…");
    try {
      await withExportMode(async () => {
        const nodes = [page1Ref.current].filter(Boolean);
        for (let i = 0; i < nodes.length; i++) {
          const url = await capture(nodes[i]);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${(trip.title || "poster").slice(0, 30)}-${i + 1}.png`;
          a.click();
        }
      });
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy("");
    }
  }

  async function downloadPdf() {
    setBusy("PDF бэлдэж байна…");
    try {
      await withExportMode(async () => {
        const { jsPDF } = await import("jspdf");
        const nodes = [page1Ref.current].filter(Boolean);
        let pdf;
        for (let i = 0; i < nodes.length; i++) {
          const url = await capture(nodes[i]);
          const w = nodes[i].offsetWidth;
          const h = nodes[i].offsetHeight;
          if (i === 0) pdf = new jsPDF({ orientation: "p", unit: "px", format: [w, h] });
          else pdf.addPage([w, h], "p");
          pdf.addImage(url, "PNG", 0, 0, w, h);
        }
        pdf.save(`${(trip.title || "poster").slice(0, 30)}.pdf`);
      });
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy("");
    }
  }

  async function downloadOneImage() {
    setBusy("Нэг зураг бэлдэж байна…");
    try {
      await withExportMode(async () => {
        const nodes = [page1Ref.current].filter(Boolean);
        const urls = [];
        for (const n of nodes) urls.push(await capture(n));

        const imgs = await Promise.all(
          urls.map(
            (u) =>
              new Promise((res, rej) => {
                const i = new Image();
                i.onload = () => res(i);
                i.onerror = rej;
                i.src = u;
              })
          )
        );

        const W = Math.max(...imgs.map((i) => i.width));
        const H = imgs.reduce((s, i) => s + i.height, 0);
        const c = document.createElement("canvas");
        c.width = W;
        c.height = H;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, W, H);
        let y = 0;
        for (const i of imgs) {
          ctx.drawImage(i, 0, y);
          y += i.height;
        }

        const a = document.createElement("a");
        a.href = c.toDataURL("image/png");
        a.download = `${(trip.title || "poster").slice(0, 30)}-full.png`;
        a.click();
      });
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy("");
    }
  }

  async function onHeroFile(file) {
    if (!file) return;
    setBusy("Зураг нэмж байна…");
    try {
      const dataUrl = await resizeImage(file);
      upd(["hero_image"], dataUrl);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy("");
      if (heroInputRef.current) heroInputRef.current.value = "";
    }
  }

  async function onDayPhotoFile(index, file) {
    if (!file) return;
    setBusy("Өдрийн зураг нэмж байна…");
    try {
      const dataUrl = await resizeImage(file, 1400);
      setTrip((t) => {
        const clone = structuredClone(t);
        const day = clone.days?.[index];
        if (!day) return t;
        day.photo = dataUrl;
        if (!day.photo_caption) day.photo_caption = day.summary || day.route || "";
        return normalizeTripData(clone);
      });
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy("");
      if (dayPhotoInputRefs.current[index]) dayPhotoInputRefs.current[index].value = "";
    }
  }

  async function save() {
    setBusy("Хадгалж байна…");
    try {
      const cleanTrip = normalizeTripData(trip);
      const r = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tripId, title: cleanTrip.title, data: cleanTrip, source_file: source }),
      }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      setTrip(cleanTrip);
      setTripId(r.id);
      await loadHistory();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy("");
    }
  }

  async function openTrip(id) {
    setBusy("Ачааллаж байна…");
    try {
      const r = await fetch(`/api/trips/${id}`).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      setTrip(normalizeTripData(r.trip.data));
      setTripId(r.trip.id);
      setSource(r.trip.source_file || "");
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      {busy && (
        <div className="loading-bar-wrap">
          <div className="loading-bar" />
          <div className="loading-label">{busy}</div>
        </div>
      )}
      <div className="appbar">
        <img src="/uudam-logo.jpg" alt="" />
        <h1>UUDAM — Постер үүсгэгч</h1>
        <span className="sub">China doc → AI → брэнд постер</span>
      </div>

      <div className="layout">
        <div className="main" ref={mainRef}>
          <div className="uploader">
            <div className="lead">
              Хятадаас ирсэн файлаa оруулаад, брэнд постер бэлэн.
              <small>AI уншиж, аяллын постерийг ~10 секундэд үүсгэнэ.</small>
            </div>
            <label
              className="drop"
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add("over");
              }}
              onDragLeave={(e) => e.currentTarget.classList.remove("over")}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("over");
                handleFile(e.dataTransfer.files[0]);
              }}
            >
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                style={{ display: "none" }}
                onChange={(e) => handleFile(e.target.files[0])}
              />
              <div className="ic">⬆</div>
              <div className="dt">Файлаа энд чирж тавь</div>
              <div className="ds">эсвэл дарж сонгоно уу · Word (.docx), PDF, .txt</div>
            </label>
            {busy && <div className="note" style={{ marginTop: 14, textAlign: "center" }}>⏳ {busy}</div>}
            {error && <div className="err" style={{ textAlign: "center" }}>⚠ {error}</div>}
            <div className="template-start">
              <button type="button" className="btn" onClick={startTemplate}>
                Default template-ээр эхлэх
              </button>
              <span>Файлгүйгээр шууд poster нээгээд бүх текст, үнэ, өдөр, хоол, зураг засна.</span>
            </div>
          </div>

          {trip && (
            <>
              <div className="studio-panel">
                <div className="studio-head">
                  <div>
                    <div className="eyebrow">Workspace</div>
                    <h2>{trip.title || "Untitled poster"}</h2>
                    <p>{source || "Live editable travel poster"} · {trip.days?.length || 0} өдөр · 1 export page</p>
                  </div>
                  <button className="btn ghost" type="button" onClick={startTemplate} disabled={!!busy}>
                    Шинэ default template
                  </button>
                </div>

                <div className="studio-actions">
                  <button type="button" onClick={addDeparture}>+ Огноо</button>
                  <button type="button" onClick={addDay}>+ Өдөр</button>
                  <button type="button" onClick={removeLastDay} disabled={(trip.days || []).length <= 1}>Сүүлийн өдөр устгах</button>
                  <button type="button" onClick={ensurePriceTable}>Үнийн хүснэгт асаах</button>
                  <button type="button" onClick={addPriceRow} disabled={!trip.price_table}>+ Үнэ мөр</button>
                  <button type="button" onClick={addPriceCol} disabled={!trip.price_table}>+ Үнэ багана</button>
                  <button type="button" onClick={toggleFlights}>{trip.flights ? "Нислэг нуух" : "Нислэг нэмэх"}</button>
                </div>

                <div className="edit-hints">
                  <span>Canvas маягаар: постер дээрх бичвэр дээр шууд дарж засна.</span>
                  <span>Зураг: нүүр зураг toolbar-аас, өдрийн зураг тухайн зурагны box дээр дарж орно.</span>
                  <span>Download/print үед editor товч, хоосон зурагны box автоматаар алга болно.</span>
                </div>
              </div>

              <div className="toolbar">
                <button className="btn" onClick={save} disabled={!!busy}>💾 Хадгалах</button>
                <button className="btn ghost" onClick={() => heroInputRef.current?.click()} disabled={!!busy}>
                  📷 {trip.hero_image ? "Зураг солих" : "Нүүр зураг нэмэх"}
                </button>
                {trip.hero_image && (
                  <button className="btn ghost" onClick={() => upd(["hero_image"], null)} disabled={!!busy}>✕ Зураг авах</button>
                )}
                <button className="btn ghost" onClick={downloadPng} disabled={!!busy}>🖼 PNG (нэг poster)</button>
                <button className="btn ghost" onClick={downloadOneImage} disabled={!!busy}>🧩 Нэг зураг (бүгд)</button>
                <button className="btn ghost" onClick={downloadPdf} disabled={!!busy}>📑 PDF</button>
                <input
                  ref={heroInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => onHeroFile(e.target.files[0])}
                />
                <span className="note" style={{ alignSelf: "center" }}>
                  Бичвэр дээр дарж засаарай · хоолны таглыг дарж асаах/унтраах
                </span>
              </div>

              <div className="preview-shell" style={{ width: POSTER_WIDTH * scale, height: totalH * scale }}>
                <div
                  className="preview-stage"
                  ref={previewRef}
                  style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: POSTER_WIDTH }}
                >
                  <Poster
                    trip={trip}
                    upd={upd}
                    addItem={addItem}
                    removeItem={removeItem}
                    insertDay={insertDay}
                    reorderDay={reorderDay}
                    removePriceCol={removePriceCol}
                    logoSrc="/uudam-logo.jpg"
                    page1Ref={page1Ref}
                    onDayPhotoFile={onDayPhotoFile}
                    dayPhotoInputRefs={dayPhotoInputRefs}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="sidebar">
          <div className="card">
            <h3>Түүх</h3>
            <div className="hist">
              {history.length === 0 && <div className="note">Хадгалсан постер алга</div>}
              {history.map((h) => (
                <button key={h.id} onClick={() => openTrip(h.id)}>
                  <div className="t">{h.title}</div>
                  <div className="d">{new Date(h.updated_at).toLocaleString()}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
