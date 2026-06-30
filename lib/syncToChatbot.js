/**
 * Pushes the RENDERED poster image(s) of the current trip to the Uudam
 * chatbot admin, so the bot can send the finished poster to customers
 * who ask about that trip.
 *
 * `images` is an array of data URLs (PNG) of the rendered poster — exactly
 * what the PNG/ZIP export already produces. The chatbot uploads them to
 * Cloudinary and replaces that trip's photo_urls (poster = source of truth).
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_CHATBOT_URL=https://your-chatbot-domain.vercel.app
 *   NEXT_PUBLIC_CHATBOT_SECRET=your_admin_secret
 */
export async function syncToChatbot(trip, images) {
  const chatbotUrl = process.env.NEXT_PUBLIC_CHATBOT_URL?.replace(/\/$/, "");
  const chatbotSecret = process.env.NEXT_PUBLIC_CHATBOT_SECRET;

  if (!chatbotUrl || !chatbotSecret) return { skipped: true, reason: "not_configured" };

  const title = trip?.title?.trim();
  if (!title) return { skipped: true, reason: "no_title" };

  const photos = (Array.isArray(images) ? images : [])
    .filter((url) => typeof url === "string" && url.startsWith("data:image/"))
    .map((url, i) => ({
      dataUrl: url,
      filename: `${title.slice(0, 30).replace(/[^\p{L}\p{N}]+/gu, "-")}-${i + 1}.png`,
    }));

  if (photos.length === 0) return { skipped: true, reason: "no_images" };

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
