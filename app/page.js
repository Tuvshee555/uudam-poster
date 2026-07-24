"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as htmlToImage from "html-to-image";
import { upload } from "@vercel/blob/client";
import Poster from "../components/Poster";
import { createDefaultTrip } from "../lib/defaultTrip";
import SyncModal from "../components/SyncModal";
import {
  isChatbotSyncConfigured,
  matchTripOnChatbot,
  commitPosterToChatbot,
} from "../lib/syncToChatbot";

const POSTER_WIDTH = 1080;
const MESSENGER_SINGLE_IMAGE_MAX_HEIGHT = 1900;
const MESSENGER_MAX_IMAGE_SLICES = 3;
const MAX_UPLOAD_FILES = 10;
const MAX_UPLOAD_SIZE_MB = 100;
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;
const DIRECT_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;
const TRANSPARENT_IMAGE_PLACEHOLDER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

// Poster text size. One multiplier scales every text on the poster; photos are
// not touched — a day photo fills its column's full height, so bigger text makes
// the photo taller by itself.
const TEXT_SCALE_KEY = "uudam.poster.textScale";
const TEXT_SCALE_MIN = 0.8;
const TEXT_SCALE_MAX = 1.5;
const TEXT_SCALE_STEP = 0.05;
const TEXT_SCALE_PRESETS = [
  { label: "Жижиг", value: 0.9 },
  { label: "Хэвийн", value: 1 },
  { label: "Том", value: 1.2 },
  { label: "Маш том", value: 1.4 },
];

function clampTextScale(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, Math.round(n * 100) / 100));
}

const EXTRACT_TIMEOUT_MS = 90_000; // server maxDuration is 60s; give network slack then give up

// If the Vercel function times out mid-request, the connection can hang instead of
// cleanly erroring — without this, the "уншиж байна" spinner can get stuck forever.
async function fetchJsonWithTimeout(url, options, timeoutMs = EXTRACT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      throw new Error(data?.error || text || `HTTP ${res.status}`);
    }
    return data || {};
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`Хүсэлт хэт удаж, зогслоо (${timeoutMs / 1000}s). Дахин оролдоно уу.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function errorMessage(error, fallback = "Алдаа гарлаа. Дахин оролдоно уу.") {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message) return error.message;
  if (error instanceof Event) {
    const target = error.target;
    const src = target?.currentSrc || target?.src;
    return src ? `Зураг ачаалж чадсангүй: ${src}` : fallback;
  }
  if (typeof error.message === "string") return error.message;
  if (String(error) === "[object Event]") return fallback;
  try {
    const json = JSON.stringify(error);
    return json && json !== "{}" ? json : fallback;
  } catch {
    return String(error);
  }
}

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
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(objectUrl);
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Зураг уншиж чадсангүй. Өөр JPG/PNG зураг ашиглаад дахин оролдоно уу."));
    };
    img.src = objectUrl;
  });
}

function tableFromPriceNote(note) {
  const text = String(note || "").replace(/^⚠\s*/, "").trim();
  if (!text) return null;

  const matches = [...text.matchAll(/(\d[\d\s,'’]*\d)\s*₮/g)];
  if (matches.length < 2) return null;

  let cursor = 0;
  const columns = [];
  const cells = [];
  let consumedEnd = 0;

  for (const match of matches) {
    const rawLabel = text
      .slice(cursor, match.index)
      .replace(/[—–:;,]+$/g, "")
      .trim();
    const isExplanation = /өрөөнд|ганцаараа|тусгай|нэмж|орох бол/i.test(rawLabel);
    if (isExplanation && columns.length === 0) return null;
    if (isExplanation && columns.length >= 2) break;

    const label = rawLabel || `Үнэ ${columns.length + 1}`;
    const amount = `${match[1].replace(/[’']/g, ",").replace(/\s+/g, "")}₮`;
    const paren = text.slice(match.index + match[0].length).match(/^\s*(\([^)]*\))/);
    const end = match.index + match[0].length + (paren ? paren[0].length : 0);

    columns.push(paren ? `${label} ${paren[1]}` : label);
    cells.push(amount);
    cursor = end;
    consumedEnd = end;
  }

  if (columns.length < 2) return null;

  return {
    priceTable: {
      columns,
      rows: [{ dates: "Үнэ", cells }],
      note: "",
    },
    remainingNote: text.slice(consumedEnd).replace(/^[\s—–:;,]+/, "").trim(),
  };
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
    show_meals: day.show_meals !== false,
    bonus: day.bonus || [],
    photo: day.photo || null,
    photo_caption: day.photo_caption || "",
  }));

  if (!clone.price_table && clone.price_note) {
    const parsedPriceNote = tableFromPriceNote(clone.price_note);
    if (parsedPriceNote) {
      clone.price_table = parsedPriceNote.priceTable;
      clone.price_note = parsedPriceNote.remainingNote;
    }
  }

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

function normalizeHistoryTitle(title) {
  return String(title || "Untitled")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function historyDateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Огноогүй";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, today)) return "Өнөөдөр";
  if (sameDay(date, yesterday)) return "Өчигдөр";
  return date.toLocaleDateString();
}

export default function Home() {
  const [trip, setTrip] = useState(null);
  const [tripId, setTripId] = useState(null);
  const [source, setSource] = useState("");
  const [history, setHistory] = useState([]);
  const [historySearch, setHistorySearch] = useState("");
  const [historySort, setHistorySort] = useState("newest");
  const [historyGroup, setHistoryGroup] = useState("date");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [scale, setScale] = useState(0.6);
  const [totalH, setTotalH] = useState(0);
  const [activeDayPhotoIndex, setActiveDayPhotoIndex] = useState(null);
  // Last text size the user picked — remembered in this browser so a new poster
  // opens at their size instead of resetting to 100% every time.
  const [defaultTextScale, setDefaultTextScale] = useState(1);

  // Chatbot sync modal state
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMatch, setSyncMatch] = useState(null); // { candidates, allTrips }
  const [syncImages, setSyncImages] = useState([]); // captured poster slice data URLs
  const [syncError, setSyncError] = useState("");
  const [syncResult, setSyncResult] = useState(null);

  const page1Ref = useRef(null);
  const previewRef = useRef(null);
  const mainRef = useRef(null);
  const dayPhotoInputRefs = useRef({});

  const upd = (path, value) => setTrip((t) => setPath(t, path, value));

  // A poster keeps the size it was saved with; anything without one uses the
  // remembered browser default.
  const textScale = clampTextScale(trip?.text_scale ?? defaultTextScale);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(TEXT_SCALE_KEY);
      if (stored !== null) setDefaultTextScale(clampTextScale(stored));
    } catch {}
  }, []);

  const changeTextScale = (value) => {
    const next = clampTextScale(value);
    setDefaultTextScale(next);
    try {
      window.localStorage.setItem(TEXT_SCALE_KEY, String(next));
    } catch {}
    if (trip) upd(["text_scale"], next);
  };

  const historyTitleCounts = useMemo(() => {
    const counts = new Map();
    for (const item of history) {
      const key = normalizeHistoryTitle(item.title);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [history]);

  const visibleHistoryGroups = useMemo(() => {
    const query = historySearch.trim().toLocaleLowerCase();
    const filtered = history.filter((item) => {
      const haystack = `${item.title || ""} ${item.source_file || ""}`.toLocaleLowerCase();
      return !query || haystack.includes(query);
    });

    filtered.sort((a, b) => {
      if (historySort === "oldest") return new Date(a.updated_at) - new Date(b.updated_at);
      if (historySort === "title") return String(a.title || "").localeCompare(String(b.title || ""));
      return new Date(b.updated_at) - new Date(a.updated_at);
    });

    if (historyGroup === "none") return [{ label: "", items: filtered }];

    const groups = new Map();
    for (const item of filtered) {
      const duplicateCount = historyTitleCounts.get(normalizeHistoryTitle(item.title)) || 0;
      let label = historyDateLabel(item.updated_at);
      if (historyGroup === "duplicate") label = duplicateCount > 1 ? "Давхардсан нэртэй" : "Давхардаагүй";
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(item);
    }

    return Array.from(groups, ([label, items]) => ({ label, items }));
  }, [history, historyGroup, historySearch, historySort, historyTitleCounts]);

  const currentDuplicateCount = trip
    ? [...historyTitleCounts.entries()].find(([key]) => key === normalizeHistoryTitle(trip.title))?.[1] || 0
    : 0;

  const startTemplate = () => {
    setError("");
    setBusy("");
    setTrip(normalizeTripData(createDefaultTrip()));
    setTripId(null);
    setSource("Default template");
    setActiveDayPhotoIndex(null);
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

  const newDayObj = () => ({
    route: "Шинэ өдөр",
    distance_km: 0,
    summary:
      "Энэ хэсэгт тухайн өдрийн аяллын уур амьсгал, үзэх газар, амрах цаг болон аялагчид юуг мэдрэхийг ойлгомжтой тайлбарлан бичнэ.",
    activities: ["Шинэ үйл ажиллагаа"],
    meals: { breakfast: true, lunch: false, dinner: true },
    show_meals: true,
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
  }, [trip, scale, textScale]);

  const loadHistory = async () => {
    // Never throw — a failed history refresh must not break the upload flow
    // (handleFiles awaits this after processing; an error here would leave the
    // busy spinner stuck forever).
    try {
      const r = await fetch("/api/trips").then((x) => x.json());
      if (r.trips) setHistory(r.trips);
    } catch (e) {
      console.warn("loadHistory failed:", e);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  async function sha256File(file) {
    const buf = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buf);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function extractOne(file) {
    const ext = file.name.slice(file.name.lastIndexOf(".")) || "";
    const safeName = "upload" + ext;

    if (file.size > DIRECT_UPLOAD_LIMIT_BYTES) {
      const pathname = `trip-uploads/${Date.now()}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}${ext || ".bin"}`;
      const blob = await upload(pathname, file, {
        access: "private",
        handleUploadUrl: "/api/upload",
        contentType: file.type || "application/octet-stream",
        multipart: file.size > 8 * 1024 * 1024,
      });

      const r = await fetchJsonWithTimeout("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blob_url: blob.url,
          pathname: blob.pathname || safeName,
          original_name: file.name,
          file_type: file.type || "application/octet-stream",
        }),
      });
      if (r.error) throw new Error(r.error);
      return { ...r, source_file: r.source_file || file.name };
    }

    const fd = new FormData();
    fd.append("file", new Blob([await file.arrayBuffer()], { type: file.type || "application/octet-stream" }), safeName);
    fd.append("original_name", file.name);
    const r = await fetchJsonWithTimeout("/api/extract", { method: "POST", body: fd });
    if (r.error) throw new Error(r.error);
    return { ...r, source_file: r.source_file || file.name };
  }

  async function saveTripData(data, sourceFile) {
    const cleanTrip = normalizeTripData(data);
    const r = await fetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: cleanTrip.title, data: cleanTrip, source_file: sourceFile }),
    }).then((x) => x.json());
    if (r.error) throw new Error(r.error);
    return { id: r.id, trip: cleanTrip };
  }

  async function handleFiles(files) {
    if (!files || files.length === 0) return;
    setError("");
    let fileList = Array.from(files).filter((f) => f instanceof File);
    const droppedCount = fileList.length;
    const warnings = [];

    if (droppedCount > MAX_UPLOAD_FILES) {
      warnings.push(`Зөвхөн эхний ${MAX_UPLOAD_FILES} файлыг боловсруулна (${droppedCount} файлаас).`);
      fileList = fileList.slice(0, MAX_UPLOAD_FILES);
    }

    const tooBig = fileList.filter((f) => f.size > MAX_UPLOAD_SIZE_BYTES);
    if (tooBig.length > 0) {
      warnings.push(`${tooBig.map((f) => f.name).join(", ")} файл ${MAX_UPLOAD_SIZE_MB}MB-с том тул алгаслаа.`);
      fileList = fileList.filter((f) => f.size <= MAX_UPLOAD_SIZE_BYTES);
    }

    if (fileList.length === 0) {
      setError(warnings.join(" "));
      return;
    }

    const seen = new Set();
    const uniqueFiles = [];
    for (const file of fileList) {
      // crypto.subtle is unavailable on insecure (http) origins — skip dedupe then
      let hash = null;
      try {
        hash = await sha256File(file);
      } catch {}
      if (hash && seen.has(hash)) {
        warnings.push(`${file.name} нөгөө файлтай ижиг агуулгатай байсан тул алгаслаа.`);
      } else {
        if (hash) seen.add(hash);
        uniqueFiles.push(file);
      }
    }

    const saved = [];
    const failed = [];

    for (let i = 0; i < uniqueFiles.length; i++) {
      const file = uniqueFiles[i];
      setBusy(`${uniqueFiles.length} файлаас ${i + 1}-г уншиж байна: ${file.name}…`);
      try {
        const { trip, source_file } = await extractOne(file);
        setBusy(`${uniqueFiles.length} файлаас ${i + 1}-г хадгалж байна: ${file.name}…`);
        const { id } = await saveTripData(trip, source_file || file.name);
        saved.push({ file: file.name, trip, id });
      } catch (e) {
        console.error("file failed:", file.name, e);
        failed.push({ file: file.name, error: errorMessage(e) });
      }
    }

    if (saved.length > 0) {
      const first = saved[0];
      setTrip(normalizeTripData(first.trip));
      setTripId(first.id);
      setSource(first.file);
    }

    await loadHistory();
    setBusy("");

    const messages = [...warnings];
    if (failed.length > 0) {
      messages.push(`${failed.length} файл уншихад алдаа гарлаа: ${failed.map((f) => `${f.file}: ${f.error}`).join("; ")}`);
    }
    if (messages.length > 0) setError(messages.join(" "));
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

    return htmlToImage.toPng(node, {
      pixelRatio: 2,
      width: node.offsetWidth,
      height: node.offsetHeight,
      backgroundColor: "#ffffff",
      cacheBust: true,
      imagePlaceholder: TRANSPARENT_IMAGE_PLACEHOLDER,
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

  async function downloadDataUrl(dataUrl, filename) {
    const blob = await fetch(dataUrl).then((response) => response.blob());
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
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

  function chooseMessengerSplitPoints(node, sliceCount) {
    if (sliceCount <= 1) return [];
    if (sliceCount === 2) return [chooseMessengerSplitPoint(node)];

    const totalHeight = node.offsetHeight;
    const minY = totalHeight * 0.12;
    const maxY = totalHeight * 0.94;
    const minSliceHeight = totalHeight * 0.12;
    const idealSliceHeight = totalHeight / sliceCount;
    const candidates = [];

    const addCandidate = (point, weight = 0) => {
      if (!Number.isFinite(point) || point <= minY || point >= maxY) return;
      const rounded = Math.round(point);
      const existing = candidates.find((candidate) => Math.abs(candidate.point - rounded) < 8);
      if (existing) {
        existing.weight = Math.min(existing.weight, weight);
        return;
      }
      candidates.push({ point: rounded, weight });
    };

    node.querySelectorAll(".dayrow,.program-head,.sec.compact-sec,.foot").forEach((el) => {
      const top = getRelativeTop(el, node);
      const bottom = top + el.getBoundingClientRect().height;
      const isDay = el.classList.contains("dayrow");
      const isProgramHead = el.classList.contains("program-head");

      // Prefer starting a new Messenger image cleanly at the next day. If a day
      // is unusually tall, its bottom edge is still better than cutting text.
      addCandidate(top, isDay ? 0 : isProgramHead ? 12 : 6);
      if (isDay) addCandidate(bottom, 2);
    });

    if (candidates.length < sliceCount - 1) {
      return Array.from({ length: sliceCount - 1 }, (_, index) =>
        Math.round((totalHeight * (index + 1)) / sliceCount)
      );
    }

    const sortedCandidates = candidates.sort((a, b) => a.point - b.point);
    let bestPoints = null;
    let bestScore = Infinity;

    for (let firstIndex = 0; firstIndex < sortedCandidates.length; firstIndex++) {
      for (let secondIndex = firstIndex + 1; secondIndex < sortedCandidates.length; secondIndex++) {
        const selected = [sortedCandidates[firstIndex], sortedCandidates[secondIndex]];
        const points = selected.map((candidate) => candidate.point);
        const ranges = [points[0], points[1] - points[0], totalHeight - points[1]];
        if (ranges.some((height) => height < minSliceHeight)) continue;

        const targetPenalty = points.reduce((sum, point, index) => {
          const target = (totalHeight * (index + 1)) / sliceCount;
          return sum + Math.abs(point - target) / idealSliceHeight;
        }, 0);
        const balancePenalty = ranges.reduce(
          (sum, height) => sum + Math.abs(height - idealSliceHeight) / idealSliceHeight,
          0
        );
        const oversizePenalty = ranges.reduce(
          (sum, height) => sum + Math.max(0, height - MESSENGER_SINGLE_IMAGE_MAX_HEIGHT) / idealSliceHeight,
          0
        );
        const boundaryPenalty = selected.reduce((sum, candidate) => sum + candidate.weight, 0) / 20;
        const score = targetPenalty * 2 + balancePenalty + oversizePenalty * 4 + boundaryPenalty;

        if (score < bestScore) {
          bestScore = score;
          bestPoints = points;
        }
      }
    }

    if (bestPoints) return bestPoints;

    return Array.from({ length: sliceCount - 1 }, (_, index) => {
      const target = (totalHeight * (index + 1)) / sliceCount;
      const best = sortedCandidates.reduce((currentBest, current) =>
        Math.abs(current.point - target) < Math.abs(currentBest.point - target) ? current : currentBest
      );
      return best.point;
    }).sort((a, b) => a - b);
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
      img.onerror = () => reject(new Error("Messenger зураг хуваах үед poster зураг уншиж чадсангүй."));
      img.src = fullUrl;
    });

    const totalHeight = node.offsetHeight;
    const sliceCount = Math.min(
      MESSENGER_MAX_IMAGE_SLICES,
      Math.max(1, Math.ceil(totalHeight / MESSENGER_SINGLE_IMAGE_MAX_HEIGHT))
    );
    const splitPoints = chooseMessengerSplitPoints(node, sliceCount);
    const ranges = [0, ...splitPoints, totalHeight]
      .map((startY, index, points) => [startY, points[index + 1]])
      .filter((range) => Number.isFinite(range[1]) && range[1] > range[0]);
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

  // ---- Chatbot sync (user-confirmed) ----------------------------------
  // Open the modal: capture the rendered poster, then ask the chatbot which
  // trip(s) match. Nothing is written yet — the modal waits for confirmation.
  async function openChatbotSync() {
    if (!trip) return;
    if (!isChatbotSyncConfigured()) {
      setError("Чатботын тохиргоо алга байна (.env.local дотор NEXT_PUBLIC_CHATBOT_URL/SECRET).");
      return;
    }
    setSyncOpen(true);
    setSyncLoading(true);
    setSyncError("");
    setSyncResult(null);
    setSyncMatch(null);
    setSyncImages([]);

    try {
      // Capture the poster as Messenger-sized slices (the finished branded poster).
      const slices = await withExportMode(() => captureMessengerSlices());
      setSyncImages(slices.map((s) => s.url));

      const match = await matchTripOnChatbot(trip.title);
      if (!match.ok) {
        setSyncError(match.error || "Холболт амжилтгүй");
      } else {
        setSyncMatch({ candidates: match.candidates || [], allTrips: match.allTrips || [] });
      }
    } catch (e) {
      setSyncError(errorMessage(e));
    } finally {
      setSyncLoading(false);
    }
  }

  // Confirm: actually upload + attach. Only runs after the user picks in the modal.
  async function confirmChatbotSync({ tripId: targetId, createNew, mode }) {
    setSyncLoading(true);
    setSyncError("");
    try {
      const out = await commitPosterToChatbot({
        title: trip.title,
        images: syncImages,
        tripId: targetId,
        createNew,
        mode,
      });
      if (!out.ok) {
        setSyncError(out.error || "Хадгалах амжилтгүй");
      } else {
        setSyncResult(out);
      }
    } catch (e) {
      setSyncError(errorMessage(e));
    } finally {
      setSyncLoading(false);
    }
  }

  function closeChatbotSync() {
    if (syncLoading) return;
    setSyncOpen(false);
  }

  async function downloadSplitImages() {
    setBusy("Messenger зурагнуудыг бэлдэж байна…");
    try {
      await withExportMode(async () => {
        const captures = await captureMessengerSlices();
        const baseName = buildExportBaseName();

        for (const item of captures) {
          await downloadDataUrl(item.url, `${baseName}-messenger-${item.index + 1}.png`);
        }
      });
    } catch (e) {
      setError(errorMessage(e));
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
      setError(errorMessage(e));
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
          await downloadDataUrl(url, `${(trip.title || "poster").slice(0, 30)}-${i + 1}.png`);
        }
      });
    } catch (e) {
      setError(errorMessage(e));
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
      setError(errorMessage(e));
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
      setActiveDayPhotoIndex(index);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
      if (dayPhotoInputRefs.current[index]) dayPhotoInputRefs.current[index].value = "";
    }
  }

  useEffect(() => {
    if (!trip || activeDayPhotoIndex === null) return undefined;

    const onPaste = async (event) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }

      const items = Array.from(event.clipboardData?.items || []);
      const imageItem = items.find((item) => item.type?.startsWith("image/"));
      const file = imageItem?.getAsFile();
      if (!file) return;

      event.preventDefault();
      setError("");
      await onDayPhotoFile(activeDayPhotoIndex, file);
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [trip, activeDayPhotoIndex]);

  async function save() {
    setError("");
    setBusy("Хадгалж байна…");
    try {
      const cleanTrip = { ...normalizeTripData(trip), text_scale: textScale };
      const matchingTitles = history.filter((item) => {
        if (item.id === tripId) return false;
        return normalizeHistoryTitle(item.title) === normalizeHistoryTitle(cleanTrip.title);
      });
      const r = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tripId, title: cleanTrip.title, data: cleanTrip, source_file: source }),
      }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      setTrip(cleanTrip);
      setTripId(r.id);
      await loadHistory();
      if (matchingTitles.length > 0) {
        setError(`Ижил нэртэй ${matchingTitles.length} хадгалсан аялал байна: "${cleanTrip.title}"`);
      }
    } catch (e) {
      setError(errorMessage(e));
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
      setActiveDayPhotoIndex(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  }

  async function deleteTrip(id) {
    const previousHistory = history;
    setHistory((items) => items.filter((item) => item.id !== id));
    if (tripId === id) {
      setTrip(null);
      setTripId(null);
      setSource("");
    }

    try {
      const r = await fetch(`/api/trips/${id}`, { method: "DELETE" }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
    } catch (e) {
      setHistory(previousHistory);
      setError(errorMessage(e));
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
          {trip ? (
            /* Compact upload strip — shown when a poster is already open */
            <div
              className="upload-strip"
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("over"); }}
              onDragLeave={(e) => e.currentTarget.classList.remove("over")}
              onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("over"); handleFiles(e.dataTransfer.files); }}
            >
              <label className="upload-strip-file">
                <input type="file" multiple accept=".pdf,.docx,.txt,image/*" style={{ display: "none" }} onChange={(e) => { handleFiles(Array.from(e.target.files)); e.target.value = ""; }} />
                <span className="upload-strip-ic">⬆</span>
                <span className="upload-strip-label">Шинэ файл чирж тавих эсвэл дарах</span>
              </label>
              <button type="button" className="btn ghost upload-strip-tpl" onClick={startTemplate}>Хоосон template</button>
            </div>
          ) : (
            /* Full uploader — shown on empty state */
            <div className="uploader">
              <div className="lead">
                Хятадаас ирсэн файлаa оруулаад, брэнд постер бэлэн.
                <small>AI уншиж, аяллын постерийг ~10 секундэд үүсгэнэ.</small>
              </div>
              <label
                className="drop"
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("over"); }}
                onDragLeave={(e) => e.currentTarget.classList.remove("over")}
                onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("over"); handleFiles(e.dataTransfer.files); }}
              >
                <input type="file" multiple accept=".pdf,.docx,.txt,image/*" style={{ display: "none" }} onChange={(e) => { handleFiles(Array.from(e.target.files)); e.target.value = ""; }} />
                <div className="ic">⬆</div>
                <div className="dt">Файл эсвэл зураг энд чирж тавь</div>
                <div className="ds">{`Дээд тал нь ${MAX_UPLOAD_FILES} файл · тус бүр ${MAX_UPLOAD_SIZE_MB}MB хүртэл · Word (.docx), PDF, .txt · JPG, PNG, WEBP зураг`}</div>
              </label>
              <div className="template-start">
                <button type="button" className="btn" onClick={startTemplate}>Default template-ээр эхлэх</button>
                <span>Файлгүйгээр шууд poster нээгээд бүх текст, үнэ, өдөр, хоол, зураг засна.</span>
              </div>
            </div>
          )}
          {busy && <div className="note" style={{ marginTop: 10, textAlign: "center" }}>⏳ {busy}</div>}
          {error && <div className="err" style={{ textAlign: "center" }}>⚠ {error}</div>}

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
                  <button type="button" onClick={addDay}>+ Өдөр</button>
                  <button type="button" onClick={removeLastDay} disabled={(trip.days || []).length <= 1}>Сүүлийн өдөр устгах</button>
                  <button type="button" onClick={ensurePriceTable}>Үнийн хүснэгт асаах</button>
                  <button type="button" onClick={addPriceRow} disabled={!trip.price_table}>+ Үнэ мөр</button>
                  <button type="button" onClick={addPriceCol} disabled={!trip.price_table}>+ Үнэ багана</button>
                </div>

                <div className="text-scale">
                  <span className="text-scale-title">Бичвэрийн хэмжээ</span>
                  <button
                    type="button"
                    className="text-scale-step"
                    title="Багасгах"
                    onClick={() => changeTextScale(textScale - TEXT_SCALE_STEP)}
                    disabled={textScale <= TEXT_SCALE_MIN}
                  >
                    −
                  </button>
                  <input
                    className="text-scale-range"
                    type="range"
                    min={TEXT_SCALE_MIN}
                    max={TEXT_SCALE_MAX}
                    step={TEXT_SCALE_STEP}
                    value={textScale}
                    onChange={(e) => changeTextScale(e.target.value)}
                  />
                  <button
                    type="button"
                    className="text-scale-step"
                    title="Томсгох"
                    onClick={() => changeTextScale(textScale + TEXT_SCALE_STEP)}
                    disabled={textScale >= TEXT_SCALE_MAX}
                  >
                    +
                  </button>
                  <span className="text-scale-val">{Math.round(textScale * 100)}%</span>
                  <div className="text-scale-presets">
                    {TEXT_SCALE_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        className={textScale === preset.value ? "active" : ""}
                        onClick={() => changeTextScale(preset.value)}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-scale-hint">
                    Бүх бичвэр хамт томордог. Сонгосон хэмжээ энэ постертой хамт хадгалагдаж, дараагийн шинэ постер ч мөн энэ хэмжээгээр нээгдэнэ.
                  </span>
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
                <button className="btn" onClick={openChatbotSync} disabled={!!busy || syncOpen}>📤 Чатбот руу илгээх</button>
                <span className="note" style={{ alignSelf: "center" }}>
                  Бичвэр дээр дарж засаарай · хоолны таглыг дарж асаах/унтраах · Messenger split: main poster-оос 1-2 зураг, хэт урт бол 3
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
                    textScale={textScale}
                    onDayPhotoFile={onDayPhotoFile}
                    dayPhotoInputRefs={dayPhotoInputRefs}
                    activeDayPhotoIndex={activeDayPhotoIndex}
                    setActiveDayPhotoIndex={setActiveDayPhotoIndex}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="sidebar">
          <div className="card">
            <div className="hist-head">
              <h3>Түүх</h3>
              <span>{history.length}</span>
              {history.length > 0 && (
                <a
                  className="btn ghost hist-export-btn"
                  href="/api/trips/export"
                  download
                  title="Бүх аялалыг JSON файлаар татах"
                >
                  ⬇ Татах
                </a>
              )}
            </div>
            <div className="hist-controls">
              <label className="hist-search">
                <span>Хайх</span>
                <input
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Нэрээр хайх..."
                />
              </label>
              <div className="hist-filters">
                <label>
                  Эрэмбэ
                  <select value={historySort} onChange={(e) => setHistorySort(e.target.value)}>
                    <option value="newest">Шинэ эхэнд</option>
                    <option value="oldest">Хуучин эхэнд</option>
                    <option value="title">Нэрээр</option>
                  </select>
                </label>
                <label>
                  Бүлэг
                  <select value={historyGroup} onChange={(e) => setHistoryGroup(e.target.value)}>
                    <option value="date">Огноогоор</option>
                    <option value="duplicate">Давхардлаар</option>
                    <option value="none">Бүлэггүй</option>
                  </select>
                </label>
              </div>
              {trip && currentDuplicateCount > (tripId ? 1 : 0) && (
                <div className="hist-warning">Ижил нэртэй хадгалсан аялал байна.</div>
              )}
            </div>
            <div className="hist">
              {history.length === 0 && <div className="note">Хадгалсан постер алга</div>}
              {history.length > 0 && visibleHistoryGroups.every((group) => group.items.length === 0) && (
                <div className="note">Хайлтад тохирох аялал алга</div>
              )}
              {visibleHistoryGroups.map((group) => (
                <div className="hist-group" key={group.label || "all"}>
                  {group.label && <div className="hist-group-title">{group.label}</div>}
                  {group.items.map((h, index) => {
                    const duplicateCount = historyTitleCounts.get(normalizeHistoryTitle(h.title)) || 0;
                    return (
                      <div className={"hist-item" + (duplicateCount > 1 ? " duplicate" : "")} key={h.id}>
                        <div className="hist-num">{index + 1}</div>
                        <button type="button" className="hist-open" onClick={() => openTrip(h.id)}>
                          <div className="t">{h.title}</div>
                          <div className="d">
                            {h.source_file && <span className="hist-src">{h.source_file}</span>}
                            {new Date(h.updated_at).toLocaleString()}
                          </div>
                          {duplicateCount > 1 && <div className="dup-badge">Ижил нэр x{duplicateCount}</div>}
                        </button>
                        <button
                          type="button"
                          className="hist-delete"
                          title="Постер устгах"
                          onClick={() => deleteTrip(h.id)}
                          disabled={!!busy}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <SyncModal
        open={syncOpen}
        loading={syncLoading}
        matchData={syncMatch}
        error={syncError}
        result={syncResult}
        posterTitle={trip?.title || ""}
        imageCount={syncImages.length}
        onConfirm={confirmChatbotSync}
        onClose={closeChatbotSync}
      />
    </>
  );
}
