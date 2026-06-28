"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Poster from "../components/Poster";
import { createDefaultTrip } from "../lib/defaultTrip";

const POSTER_WIDTH = 1080;
const MESSENGER_SINGLE_IMAGE_MAX_HEIGHT = 1900;

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
    const colCount = clone.price_table.columns.length;

    // Normalize rows: filter empty, pad/clamp cells
    const cleaned = (clone.price_table.rows || [])
      .filter((r) => {
        const hasDate = String(r?.dates || "").trim();
        const hasCells = (r?.cells || []).some((x) => String(x || "").trim());
        return hasDate || hasCells;
      })
      .map((r) => ({
        ...r,
        cells: Array.from({ length: colCount }, (_, i) => r.cells?.[i] ?? ""),
      }));

    // Merge rows with identical prices — combine their dates into one row
    const merged = [];
    for (const row of cleaned) {
      const sig = row.cells.join("||");
      const existing = merged.find((m) => m.cells.join("||") === sig);
      if (existing) {
        // Add this date to the existing row's dates
        const existingDates = existing.dates.split(/[,،、]\s*/);
        const newDate = String(row.dates || "").trim();
        if (newDate && !existingDates.includes(newDate)) {
          existing.dates = [...existingDates, newDate].join(", ");
        }
      } else {
        merged.push({ ...row, dates: String(row.dates || "").trim() });
      }
    }

    clone.price_table.rows = merged;
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
    const isImage = file.type.startsWith("image/");
    setBusy(isImage ? "AI зургийг уншиж байна…" : "AI бичиг баримтыг уншиж байна…");
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

  function buildExportBaseName() {
    return (trip?.title || "poster")
      .slice(0, 40)
      .replace(/[\\/:*?"<>|]/g, "")
      .trim() || "poster";
  }

  function getRelativeTop(node, container) {
    return node.getBoundingClientRect().top - container.getBoundingClientRect().top;
  }

  function chooseMessengerSplitPoint(node) {
    const totalHeight = node.offsetHeight;
    const target = totalHeight / 2;
    const minY = totalHeight * 0.38;
    const maxY = totalHeight * 0.72;
    const candidates = [];

    node.querySelectorAll(".dayrow,.program-head,.sec.compact-sec,.foot").forEach((el) => {
      const top = getRelativeTop(el, node);
      if (top > minY && top < maxY) candidates.push(top);
    });

    if (!candidates.length) return Math.round(target);

    return Math.round(
      candidates.reduce((best, current) =>
        Math.abs(current - target) < Math.abs(best - target) ? current : best
      )
    );
  }

  function drawMessengerBadge(ctx, width, height, index, total) {
    const label = `${index + 1}/${total}`;
    const badgeWidth = 120;
    const badgeHeight = 56;
    const x = width - badgeWidth - 28;
    const y = height - badgeHeight - 28;

    ctx.fillStyle = "rgba(17, 62, 103, 0.88)";
    ctx.beginPath();
    ctx.roundRect(x, y, badgeWidth, badgeHeight, 18);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 30px Segoe UI";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + badgeWidth / 2, y + badgeHeight / 2 + 1);
  }

  async function captureMessengerSlices() {
    const node = page1Ref.current;
    if (!node) return [];

    const fullUrl = await capture(node);
    const fullImage = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = fullUrl;
    });

    const totalHeight = node.offsetHeight;
    const shouldSplit = totalHeight > MESSENGER_SINGLE_IMAGE_MAX_HEIGHT;
    const splitY = shouldSplit ? chooseMessengerSplitPoint(node) : totalHeight;
    const ranges = shouldSplit
      ? [
          [0, splitY],
          [splitY, totalHeight],
        ]
      : [[0, totalHeight]];
    const scaleY = fullImage.height / totalHeight;

    return ranges.map(([startY, endY], index) => {
      const sourceY = Math.round(startY * scaleY);
      const sourceHeight = Math.round((endY - startY) * scaleY);
      const canvas = document.createElement("canvas");
      canvas.width = fullImage.width;
      canvas.height = sourceHeight;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(fullImage, 0, sourceY, fullImage.width, sourceHeight, 0, 0, canvas.width, canvas.height);
      drawMessengerBadge(ctx, canvas.width, canvas.height, index, ranges.length);

      return {
        index,
        url: canvas.toDataURL("image/png"),
      };
    });
  }

  async function downloadSplitImages() {
    setBusy("Messenger зурагнуудыг бэлдэж байна…");
    try {
      await withExportMode(async () => {
        const captures = await captureMessengerSlices();
        const baseName = buildExportBaseName();

        for (const item of captures) {
          const a = document.createElement("a");
          a.href = item.url;
          a.download = `${baseName}-messenger-${item.index + 1}.png`;
          a.click();
        }
      });
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy("");
    }
  }

  async function downloadSplitZip() {
    setBusy("ZIP файл бэлдэж байна…");
    try {
      await withExportMode(async () => {
        const captures = await captureMessengerSlices();
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        const baseName = buildExportBaseName();

        await Promise.all(
          captures.map(async (item) => {
            const blob = await fetch(item.url).then((response) => response.blob());
            zip.file(`${baseName}-messenger-${item.index + 1}.png`, blob);
          })
        );

        const blob = await zip.generateAsync({ type: "blob" });
        const zipUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = zipUrl;
        a.download = `${baseName}-messenger-split.zip`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(zipUrl), 1000);
      });
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy("");
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
                accept=".pdf,.docx,.txt,image/*"
                style={{ display: "none" }}
                onChange={(e) => handleFile(e.target.files[0])}
              />
              <div className="ic">⬆</div>
              <div className="dt">Файл эсвэл зураг энд чирж тавь</div>
              <div className="ds">Word (.docx), PDF, .txt · JPG, PNG, WEBP зураг</div>
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
                <button className="btn ghost" onClick={downloadPng} disabled={!!busy}>🖼 PNG (нэг poster)</button>
                <button className="btn ghost" onClick={downloadPdf} disabled={!!busy}>📑 PDF</button>
                <button className="btn ghost" onClick={downloadSplitImages} disabled={!!busy}>💬 Messenger Split</button>
                <button className="btn ghost" onClick={downloadSplitZip} disabled={!!busy}>🗜 Messenger ZIP</button>
                <span className="note" style={{ alignSelf: "center" }}>
                  Бичвэр дээр дарж засаарай · хоолны таглыг дарж асаах/унтраах · Messenger split: main poster-оос 1-2 зураг
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
                    addPriceRow={addPriceRow}
                    addPriceCol={addPriceCol}
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
