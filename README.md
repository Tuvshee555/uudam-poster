# Uudam Poster Generator

Turn a travel itinerary document into a clean, branded Uudam Travel poster.

**Flow:** drop a Word/PDF -> OpenAI reads it -> branded poster renders -> edit text/prices/meals/photos live -> download PNG/PDF -> save to history.

## Stack

- **Next.js 14** (App Router) - web UI + API routes
- **OpenAI Responses API** - extracts structured poster data from the document
- **Neon Postgres** - stores trips + edit history
- Browser rendering via **html-to-image** and **jsPDF**

## Run Locally

```bash
npm install
npm run dev:clean
```

## Environment Variables

Create `.env.local` and set the same values in Vercel:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.5
DATABASE_URL=postgresql://...
```

`OPENAI_MODEL` is optional. If it is missing or unavailable, the extractor falls back through stronger supported OpenAI models.

## Project Layout

- `app/page.js` - main workspace UI, upload, live edit, download, save, history
- `components/Poster.js` - editable poster design
- `app/api/extract` - file -> text -> OpenAI structured output -> poster JSON
- `app/api/trips` - save/list trips
- `app/api/trips/[id]` - load one trip
- `lib/openai.js` - OpenAI extraction
- `lib/defaultTrip.js` - default editable template
- `lib/parse.js` - docx/pdf/txt -> text
- `template.js` + `render.js` - CLI renderer: `npm run render <trip>.json`
