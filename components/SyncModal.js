"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Confirmation modal for sending a rendered poster to the Uudam chatbot.
 *
 * Shows the matched trip(s) + how many photos each already has, lets the user
 * override the target, pick replace/append, or create a new trip — and does
 * NOTHING until they press "Илгээх". The actual commit is performed by the
 * parent via onConfirm(); this component is pure UI + selection state.
 *
 * Props:
 *   open        boolean
 *   loading     boolean         — true while matching or committing
 *   matchData   { candidates, allTrips } | null
 *   error       string          — error from match/commit, shown in the modal
 *   result      object | null   — success payload from commit
 *   posterTitle string
 *   imageCount  number
 *   onConfirm   ({ tripId, createNew, mode }) => void
 *   onClose     () => void
 */
export default function SyncModal({
  open,
  loading,
  matchData,
  error,
  result,
  posterTitle,
  imageCount,
  onConfirm,
  onClose,
}) {
  const candidates = matchData?.candidates ?? [];
  const allTrips = matchData?.allTrips ?? [];

  // Selection state: which trip to attach to, or "new", and replace/append.
  const [target, setTarget] = useState(""); // tripId | "__new__" | ""
  const [mode, setMode] = useState("replace");

  // Default the selection to the best candidate once match data arrives.
  useEffect(() => {
    if (!open) return;
    if (candidates.length > 0) setTarget(candidates[0].id);
    else setTarget(allTrips.length > 0 ? "" : "__new__");
    setMode("replace");
  }, [open, matchData]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedTrip = useMemo(() => {
    if (!target || target === "__new__") return null;
    return (
      candidates.find((c) => c.id === target) ||
      allTrips.find((t) => t.id === target) ||
      null
    );
  }, [target, candidates, allTrips]);

  if (!open) return null;

  const isNew = target === "__new__";
  const canConfirm =
    !loading && imageCount > 0 && (isNew || Boolean(selectedTrip)) && !result;

  const bestId = candidates[0]?.id;

  return (
    <div style={S.backdrop} onClick={loading ? undefined : onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.header}>
          <h3 style={S.title}>📤 Чатбот руу постер илгээх</h3>
          <button style={S.x} onClick={onClose} disabled={loading} aria-label="Хаах">
            ✕
          </button>
        </div>

        <p style={S.sub}>
          Постер: <b>{posterTitle || "(нэргүй)"}</b> · {imageCount} зураг
        </p>

        {/* SUCCESS STATE */}
        {result && (
          <div style={{ ...S.box, borderColor: "#1c7c4a", background: "#eafaf0" }}>
            <div style={{ fontWeight: 700, color: "#1c7c4a", marginBottom: 4 }}>
              ✓ Амжилттай илгээлээ
            </div>
            <div style={S.small}>
              {result.created ? "Шинэ аялал үүсгэв: " : "Аялал: "}
              <b>{result.tripName}</b>
              <br />
              Оруулсан: {result.uploaded} · Нийт зураг: {result.totalPhotos}
              {result.failed > 0 && ` · Амжилтгүй: ${result.failed}`}
            </div>
            <div style={{ marginTop: 12, textAlign: "right" }}>
              <button style={S.btnPrimary} onClick={onClose}>Болсон</button>
            </div>
          </div>
        )}

        {/* ERROR (non-fatal; user can still retry/adjust) */}
        {!result && error && (
          <div style={{ ...S.box, borderColor: "#c0392b", background: "#fdecea" }}>
            <span style={{ color: "#c0392b" }}>⚠ {error}</span>
          </div>
        )}

        {/* SELECTION UI */}
        {!result && (
          <>
            {loading && !matchData ? (
              <div style={S.small}>⏳ Тохирох аялал хайж байна…</div>
            ) : (
              <>
                {candidates.length > 0 ? (
                  <div style={S.box}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>
                      Тохирох аялал олдлоо
                    </div>
                    {candidates.map((c) => (
                      <label key={c.id} style={S.radioRow}>
                        <input
                          type="radio"
                          name="poster-target"
                          checked={target === c.id}
                          onChange={() => setTarget(c.id)}
                        />
                        <span style={{ flex: 1 }}>
                          <b>{c.route_name}</b>
                          {c.id === bestId && (
                            <span style={S.badge}>хамгийн тохирох</span>
                          )}
                          <br />
                          <span style={S.small}>
                            {c.category || "Ангилалгүй"} · одоо {c.photoCount} зурагтай
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div style={{ ...S.box, background: "#fff7e6", borderColor: "#e0a800" }}>
                    <span style={S.small}>
                      ⚠ «{posterTitle}» нэртэй тохирох аялал олдсонгүй. Доороос
                      гараар сонгох эсвэл шинэ аялал үүсгэнэ үү.
                    </span>
                  </div>
                )}

                {/* Manual override / wrong-match fallback */}
                <div style={{ marginTop: 12 }}>
                  <div style={{ ...S.small, marginBottom: 4 }}>
                    Өөр аялал сонгох (хэрэв буруу таарсан бол):
                  </div>
                  <select
                    value={isNew ? "" : target}
                    onChange={(e) => setTarget(e.target.value)}
                    style={S.select}
                  >
                    <option value="">— Аялал сонгох —</option>
                    {allTrips.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.route_name} ({t.photoCount} зураг)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Create new */}
                <label style={{ ...S.radioRow, marginTop: 10 }}>
                  <input
                    type="radio"
                    name="poster-target"
                    checked={isNew}
                    onChange={() => setTarget("__new__")}
                  />
                  <span style={S.small}>
                    ➕ Шинэ аялал болгож үүсгэх: <b>{posterTitle || "(нэргүй)"}</b>
                  </span>
                </label>

                {/* Replace vs append (only meaningful for existing trips with photos) */}
                {!isNew && selectedTrip && selectedTrip.photoCount > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ ...S.small, marginBottom: 4 }}>
                      Энэ аялалд аль хэдийн <b>{selectedTrip.photoCount}</b> зураг
                      байна:
                    </div>
                    <label style={S.modeRow}>
                      <input
                        type="radio"
                        name="poster-mode"
                        checked={mode === "replace"}
                        onChange={() => setMode("replace")}
                      />
                      <span>Хуучныг устгаад солих (зөвлөмж)</span>
                    </label>
                    <label style={S.modeRow}>
                      <input
                        type="radio"
                        name="poster-mode"
                        checked={mode === "append"}
                        onChange={() => setMode("append")}
                      />
                      <span>Хуучин дээр нэмэх</span>
                    </label>
                  </div>
                )}

                <div style={S.footer}>
                  <button style={S.btnGhost} onClick={onClose} disabled={loading}>
                    Болих
                  </button>
                  <button
                    style={{ ...S.btnPrimary, opacity: canConfirm ? 1 : 0.5 }}
                    disabled={!canConfirm}
                    onClick={() =>
                      onConfirm({
                        tripId: isNew ? null : target,
                        createNew: isNew,
                        mode,
                      })
                    }
                  >
                    {loading ? "Илгээж байна…" : "Илгээх"}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const S = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(8,20,35,.55)",
    zIndex: 10000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modal: {
    width: "min(520px, 100%)",
    maxHeight: "90vh",
    overflowY: "auto",
    background: "#fff",
    borderRadius: 14,
    boxShadow: "0 20px 60px rgba(0,0,0,.3)",
    padding: 20,
  },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  title: { margin: 0, fontSize: 18, color: "#0c2a47" },
  x: { border: "none", background: "transparent", fontSize: 18, cursor: "pointer", color: "#666" },
  sub: { margin: "6px 0 14px", fontSize: 13, color: "#555" },
  box: { border: "1px solid #d9e1ea", borderRadius: 10, padding: 12, marginTop: 8 },
  radioRow: { display: "flex", gap: 10, alignItems: "flex-start", padding: "6px 0", cursor: "pointer" },
  modeRow: { display: "flex", gap: 8, alignItems: "center", padding: "3px 0", fontSize: 13, cursor: "pointer" },
  badge: {
    marginLeft: 8,
    fontSize: 11,
    background: "#113e67",
    color: "#fff",
    borderRadius: 6,
    padding: "1px 6px",
  },
  small: { fontSize: 12, color: "#667" },
  select: { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #cdd6e0", fontSize: 14 },
  footer: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 },
  btnPrimary: {
    background: "#113e67",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "9px 18px",
    fontWeight: 600,
    cursor: "pointer",
  },
  btnGhost: {
    background: "#fff",
    color: "#333",
    border: "1px solid #cdd6e0",
    borderRadius: 8,
    padding: "9px 18px",
    cursor: "pointer",
  },
};
