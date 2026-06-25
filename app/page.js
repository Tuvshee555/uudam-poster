"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Poster from "../components/Poster";

function setPath(obj, path, value) {
  const clone = structuredClone(obj);
  let o = clone;
  for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
  o[path[path.length - 1]] = value;
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
  const page2Ref = useRef(null);
  const previewRef = useRef(null);
  const mainRef = useRef(null);

  // edit helpers
  const upd = (path, value) => setTrip((t) => setPath(t, path, value));
  const addItem = (path, value) =>
    setTrip((t) => {
      const clone = structuredClone(t);
      let o = clone;
      for (const p of path) o = o[p];
      o.push(value);
      return clone;
    });
  const removeItem = (path, idx) =>
    setTrip((t) => {
      const clone = structuredClone(t);
      let o = clone;
      for (const p of path) o = o[p];
      o.splice(idx, 1);
      return clone;
    });

  // responsive scale to fit the main column
  useLayoutEffect(() => {
    const fit = () => {
      const w = mainRef.current ? mainRef.current.clientWidth : 1080;
      setScale(Math.min(1, (w - 4) / 1080));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [trip]);

  useLayoutEffect(() => {
    if (previewRef.current) setTotalH(previewRef.current.scrollHeight);
  }, [trip, scale]);

  const loadHistory = async () => {
    const r = await fetch("/api/trips").then((r) => r.json());
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
      setTrip(r.trip);
      setTripId(null);
      setSource(r.source_file || file.name);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy("");
    }
  }

  async function capture(node) {
    const htmlToImage = await import("html-to-image");
    return htmlToImage.toPng(node, {
      pixelRatio: 2,
      width: 1080,
      height: node.offsetHeight,
      backgroundColor: "#ffffff",
      style: { transform: "none", margin: "0", boxShadow: "none" },
    });
  }

  async function downloadPng() {
    setBusy("Зураг бэлдэж байна…");
    try {
      const nodes = [page1Ref.current, page2Ref.current].filter(Boolean);
      for (let i = 0; i < nodes.length; i++) {
        const url = await capture(nodes[i]);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${(trip.title || "poster").slice(0, 30)}-${i + 1}.png`;
        a.click();
      }
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy("");
    }
  }

  async function downloadPdf() {
    setBusy("PDF бэлдэж байна…");
    try {
      const { jsPDF } = await import("jspdf");
      const nodes = [page1Ref.current, page2Ref.current].filter(Boolean);
      let pdf;
      for (let i = 0; i < nodes.length; i++) {
        const url = await capture(nodes[i]);
        const w = 1080,
          h = nodes[i].offsetHeight;
        if (i === 0) pdf = new jsPDF({ orientation: "p", unit: "px", format: [w, h] });
        else pdf.addPage([w, h], "p");
        pdf.addImage(url, "PNG", 0, 0, w, h);
      }
      pdf.save(`${(trip.title || "poster").slice(0, 30)}.pdf`);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy("");
    }
  }

  async function save() {
    setBusy("Хадгалж байна…");
    try {
      const r = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tripId, title: trip.title, data: trip, source_file: source }),
      }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
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
      setTrip(r.trip.data);
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
      <div className="appbar">
        <img src="/uudam-logo.jpg" alt="" />
        <h1>UUDAM — Постер үүсгэгч</h1>
        <span className="sub">China doc → AI → брэнд постер</span>
      </div>

      <div className="layout">
        <div className="main" ref={mainRef}>
          <div className="card">
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
              📄 <b>Хятадаас ирсэн файлыг энд чирж тавь</b> эсвэл дарж сонго
              <div className="note" style={{ marginTop: 6 }}>Word (.docx), PDF, эсвэл .txt</div>
            </label>
            {busy && <div className="note" style={{ marginTop: 10 }}>⏳ {busy}</div>}
            {error && <div className="err">⚠ {error}</div>}
          </div>

          {trip && (
            <>
              <div className="toolbar">
                <button className="btn" onClick={save} disabled={!!busy}>💾 Хадгалах</button>
                <button className="btn ghost" onClick={downloadPng} disabled={!!busy}>🖼 PNG татах</button>
                <button className="btn ghost" onClick={downloadPdf} disabled={!!busy}>📑 PDF татах</button>
                <span className="note" style={{ alignSelf: "center" }}>
                  Постер дээрх бичвэр дээр дарж засаарай. Хоолны таглыг дарж асаах/унтраах.
                </span>
              </div>

              <div style={{ width: 1080 * scale, height: totalH * scale, overflow: "hidden" }}>
                <div
                  ref={previewRef}
                  style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: 1080 }}
                >
                  <Poster
                    trip={trip}
                    upd={upd}
                    addItem={addItem}
                    removeItem={removeItem}
                    logoSrc="/uudam-logo.jpg"
                    page1Ref={page1Ref}
                    page2Ref={page2Ref}
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
