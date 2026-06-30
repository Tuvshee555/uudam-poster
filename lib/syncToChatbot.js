/**
 * Pushes day photos from the current trip to the Uudam chatbot admin.
 * Called automatically after any export (PNG, PDF, ZIP).
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_CHATBOT_URL=https://your-chatbot-domain.vercel.app
 *   NEXT_PUBLIC_CHATBOT_SECRET=your_admin_secret
 */
export async function syncToChatbot(trip) {
  const chatbotUrl = process.env.NEXT_PUBLIC_CHATBOT_URL?.replace(/\/$/, "");
  const chatbotSecret = process.env.NEXT_PUBLIC_CHATBOT_SECRET;

  if (!chatbotUrl || !chatbotSecret) return { skipped: true, reason: "not_configured" };

  const title = trip?.title?.trim();
  if (!title) return { skipped: true, reason: "no_title" };

  const photos = (trip?.days ?? [])
    .filter((d) => typeof d?.photo === "string" && d.photo.startsWith("data:image/"))
    .map((d, i) => ({
      dataUrl: d.photo,
      filename: `day-${i + 1}.jpg`,
    }));

  if (photos.length === 0) return { skipped: true, reason: "no_photos" };

  try {
    const res = await fetch(`${chatbotUrl}/api/admin/poster-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": chatbotSecret,
      },
      body: JSON.stringify({ tripTitle: title, photos }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: res.status, error: json.error ?? "sync failed" };
    }
    return { ok: true, ...json };
  } catch (err) {
    return { ok: false, error: err?.message ?? "network error" };
  }
}
