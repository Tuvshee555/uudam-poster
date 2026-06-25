# Uudam Poster Generator

Turn a travel itinerary document (from China) into a clean, branded Uudam Travel poster — automatically.

**Flow:** drop a Word/PDF → AI (Gemini) reads it → branded poster renders → edit any text/price/meal live → download PNG + PDF → saved to the database with history.

## Stack
- **Next.js 14** (App Router) — web UI + API routes
- **Gemini** (`gemini-2.5-flash`) — reads the doc into structured data
- **Neon Postgres** — stores trips + edit history
- Poster renders **in the browser** (html-to-image / jsPDF) → no server Chrome, runs free on Vercel

## Run locally
```bash
npm install
npm run dev      # http://localhost:3000
```

## Environment variables
Create `.env.local` (and set the same in Vercel):
```
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
DATABASE_URL=postgresql://...   # Neon
# STABILITY_API_KEY=...         # optional, not required
```

## Deploy (Vercel)
1. Push this repo to GitHub.
2. Import into Vercel, set the 3 env vars above.
3. Deploy. (Root directory = this folder.)

## Project layout
- `app/page.js` — main UI (upload, live edit, download, save, history)
- `components/Poster.js` — the editable poster (the design)
- `app/api/extract` — file → text → Gemini → JSON
- `app/api/trips` — save / list; `app/api/trips/[id]` — load
- `lib/` — `db.js` (Neon), `gemini.js` (extraction), `parse.js` (docx/pdf → text)
- `template.js` + `render.js` — standalone CLI version: `npm run render <trip>.json`
