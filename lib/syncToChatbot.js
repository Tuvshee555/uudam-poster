/**
 * Two-step, user-confirmed sync from the poster generator to the Uudam chatbot.
 *
 * Step 1 — matchTripOnChatbot(title): read-only. Ask the chatbot which trips
 *          this poster title could attach to. Returns ranked candidates + the
 *          full trip list. Writes NOTHING. Used to populate a confirm modal.
 *
 * Step 2 — commitPosterToChatbot({...}): only called AFTER the user confirms in
 *          the modal. Uploads the rendered poster image(s) and attaches them to
 *          one EXPLICIT trip (or creates a new one). No guessing, no silent
 *          overwrite.
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_CHATBOT_URL=https://your-chatbot-domain.vercel.app
 *   NEXT_PUBLIC_CHATBOT_SECRET=your_admin_secret
 */

function getConfig() {
  const url = process.env.NEXT_PUBLIC_CHATBOT_URL?.replace(/\/$/, "");
  const secret = process.env.NEXT_PUBLIC_CHATBOT_SECRET;
  return { url, secret, ok: Boolean(url && secret) };
}

export function isChatbotSyncConfigured() {
  return getConfig().ok;
}

/** Step 1: ask the chatbot who matches. Read-only. */
export async function matchTripOnChatbot(title) {
  const { url, secret, ok } = getConfig();
  if (!ok) return { ok: false, error: "Чатботын тохиргоо алга (URL/secret)" };

  const trimmed = (title || "").trim();
  if (!trimmed) return { ok: false, error: "Постерт гарчиг алга" };

  try {
    const res = await fetch(`${url}/api/admin/poster-match`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": secret },
      body: JSON.stringify({ tripTitle: trimmed }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: res.status, error: json.error ?? "Холболт амжилтгүй" };
    }
    return { ok: true, ...json }; // { tripTitle, candidates, allTrips }
  } catch (err) {
    return { ok: false, error: err?.message ?? "Сүлжээний алдаа" };
  }
}

/**
 * Step 2: commit, only after explicit user confirmation.
 * opts = { title, images, tripId?, createNew?, mode? }
 *   - tripId       attach to this exact trip
 *   - createNew    create a new trip from `title` instead
 *   - mode         "replace" (default) | "append"
 */
export async function commitPosterToChatbot({ title, images, tripId, createNew, mode }) {
  const { url, secret, ok } = getConfig();
  if (!ok) return { ok: false, error: "Чатботын тохиргоо алга (URL/secret)" };

  const trimmed = (title || "").trim();
  const photos = (Array.isArray(images) ? images : [])
    .filter((u) => typeof u === "string" && u.startsWith("data:image/"))
    .map((u, i) => ({
      dataUrl: u,
      filename: `${trimmed.slice(0, 30).replace(/[^\p{L}\p{N}]+/gu, "-") || "poster"}-${i + 1}.png`,
    }));

  if (photos.length === 0) return { ok: false, error: "Илгээх зураг алга" };
  if (!tripId && !createNew) return { ok: false, error: "Аялал сонгоогүй байна" };

  try {
    const res = await fetch(`${url}/api/admin/poster-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": secret },
      body: JSON.stringify({
        tripId: tripId ?? undefined,
        createNew: createNew ? true : undefined,
        newTripTitle: createNew ? trimmed : undefined,
        mode: mode === "append" ? "append" : "replace",
        photos,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: res.status, error: json.error ?? "Хадгалах амжилтгүй" };
    }
    return { ok: true, ...json };
  } catch (err) {
    return { ok: false, error: err?.message ?? "Сүлжээний алдаа" };
  }
}
