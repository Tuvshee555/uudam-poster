// Reads a messy China travel doc (text) and returns clean, structured trip data.
// OpenAI Structured Outputs keeps the extractor schema-backed instead of free-form JSON.

export const DEFAULT_CONTACTS = {
  phones: ["7713 6633", "8913 6633", "9117 2769", "9924 8000"],
  email: "uudamtravel6@gmail.com",
  address: 'Чингэлтэй дүүрэг, 4-р хороо, Анхарагийн гудамж-23, "Todtower" офис, 701 тоот',
};

export const AGENCY = "UUDAM TRAVEL AGENCY";

const TRIP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "subtitle",
    "duration_days",
    "duration_nights",
    "flights",
    "departures",
    "price_table",
    "price_note",
    "days",
    "includes",
    "excludes",
  ],
  properties: {
    title: { type: "string" },
    subtitle: { type: "string" },
    duration_days: { type: "number" },
    duration_nights: { type: "number" },
    flights: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["outbound", "return"],
          properties: {
            outbound: { type: "string" },
            return: { type: "string" },
          },
        },
        { type: "null" },
      ],
    },
    departures: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date"],
        properties: {
          date: { type: "string" },
        },
      },
    },
    price_table: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["columns", "rows", "note"],
          properties: {
            columns: { type: "array", items: { type: "string" } },
            rows: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["dates", "cells"],
                properties: {
                  dates: { type: "string" },
                  cells: { type: "array", items: { type: "string" } },
                },
              },
            },
            note: { type: "string" },
          },
        },
        { type: "null" },
      ],
    },
    price_note: { type: "string" },
    days: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "day",
          "route",
          "distance_km",
          "summary",
          "activities",
          "meals",
          "hotel",
          "flight",
          "bonus",
          "photo",
          "photo_caption",
        ],
        properties: {
          day: { type: "number" },
          route: { type: "string" },
          distance_km: { type: "number" },
          summary: { type: "string" },
          activities: { type: "array", items: { type: "string" } },
          meals: {
            type: "object",
            additionalProperties: false,
            required: ["breakfast", "lunch", "dinner"],
            properties: {
              breakfast: { type: "boolean" },
              lunch: { type: "boolean" },
              dinner: { type: "boolean" },
            },
          },
          hotel: { type: ["string", "null"] },
          flight: { type: ["string", "null"] },
          bonus: { type: "array", items: { type: "string" } },
          photo: { type: ["string", "null"] },
          photo_caption: { type: "string" },
        },
      },
    },
    includes: { type: "array", items: { type: "string" } },
    excludes: { type: "array", items: { type: "string" } },
  },
};

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function modelCandidates() {
  return unique([process.env.OPENAI_MODEL, "gpt-5.5", "gpt-4.1", "gpt-4o"]);
}

function getOutputText(data) {
  if (data?.output_text) return data.output_text;

  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && content.text) return content.text;
      if (content?.text) return content.text;
    }
  }

  return "";
}

function extractJsonCandidate(text) {
  let cleaned = String(text || "").trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  }

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);

  return cleaned
    .replace(/^\uFEFF/, "")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/}\s*(?={)/g, "},")
    .replace(/]\s*(?={)/g, "],")
    .trim();
}

function parseTripJson(text) {
  return JSON.parse(extractJsonCandidate(text));
}

async function askOpenAI(model, docText) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_output_tokens: 14000,
      input: [
        {
          role: "system",
          content:
            "You extract travel documents into polished Mongolian poster data. Stay factual, translate Chinese to Mongolian when needed, and never invent contacts.",
        },
        {
          role: "user",
          content: `Create structured data for a UUDAM Travel poster from this document.

Rules:
- Output Mongolian text.
- Copy the day summary EXACTLY as written in the source — do NOT rewrite, improve, or paraphrase. Paste the original text word for word.
- Keep activities as 3-4 concise bullets per day, copied directly from the source without rewriting.
- In price_table, extract every price column you can find (e.g. "Том хүн", "15 насаас доош", "1.2м доош", "0-2 настай").
- CRITICALLY: DO NOT leave cells empty. Each row's cells array must match columns length exactly with the actual price values.
- If a price has both yuan and tugrik (e.g. "4180 юань / 2,340,000₮"), put both in the cell like "4,180 юань / 2,340,000₮".
- The dates field per row should be the departure date(s) (e.g. "2026-07-04").
- columns must NOT include a date/огноо column — dates go in the "dates" field only.
- Infer meals from the document. If unclear, breakfast is usually included after day 1, lunch is often not included, dinner is included only when stated or likely from the program.
- Use null for unknown flights/hotels/photos, not made-up data.
- Keep includes and excludes arrays empty unless the source clearly lists them.

DOCUMENT:
${docText}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "trip_extraction",
          strict: true,
          schema: TRIP_SCHEMA,
        },
      },
    }),
  });

  const body = await res.text();
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message = data?.error?.message || body.slice(0, 500);
    throw new Error(`OpenAI ${model} error ${res.status}: ${message}`);
  }

  const output = getOutputText(data);
  if (!output) throw new Error(`OpenAI ${model} returned no text output`);
  return output;
}

async function extractWithFallback(docText) {
  const errors = [];

  for (const model of modelCandidates()) {
    try {
      const output = await askOpenAI(model, docText);
      return parseTripJson(output);
    } catch (error) {
      errors.push(error.message);
      const shouldTryNext =
        /model|not found|does not exist|unsupported|invalid|unrecognized|access/i.test(error.message) &&
        model !== modelCandidates().at(-1);
      if (!shouldTryNext) break;
    }
  }

  throw new Error(errors.join(" | "));
}

export async function extractTripFromImage(base64, mimeType) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  const errors = [];
  for (const model of unique([process.env.OPENAI_MODEL, "gpt-4.1", "gpt-4o"])) {
    try {
      const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          max_output_tokens: 14000,
          input: [
            {
              role: "system",
              content:
                "You extract travel documents into polished Mongolian poster data. Stay factual, translate Chinese to Mongolian when needed, and never invent contacts.",
            },
            {
              role: "user",
              content: [
                {
                  type: "input_image",
                  image_url: `data:${mimeType};base64,${base64}`,
                },
                {
                  type: "input_text",
                  text: `Create structured data for a UUDAM Travel poster from this image of a travel document.

Rules:
- Output Mongolian text.
- Copy the day summary EXACTLY as written in the source — do NOT rewrite, improve, or paraphrase. Paste the original text word for word.
- Keep activities as 3-4 concise bullets per day, copied directly from the source without rewriting.
- Prices should use Mongolian tugrik with thousands separators when available, like 2,340,000₮.
- In price_table, columns must NOT include a date/огноо column — dates go in the "dates" field of each row, not in columns.
- CRITICALLY: DO NOT leave cells empty. Each row's cells array must match columns length exactly with the actual price values.
- If a price has both yuan and tugrik, put both in the cell like "4,180 юань / 2,340,000₮".
- Infer meals from the document. If unclear, breakfast is usually included after day 1, lunch is often not included, dinner is included only when stated.
- Use null for unknown flights/hotels/photos, not made-up data.
- Keep includes and excludes arrays empty unless the source clearly lists them.`,
                },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "trip_extraction",
              strict: true,
              schema: TRIP_SCHEMA,
            },
          },
        }),
      });

      const body = await res.text();
      let data;
      try { data = JSON.parse(body); } catch { data = null; }
      if (!res.ok) throw new Error(`OpenAI ${model} error ${res.status}: ${data?.error?.message || body.slice(0, 300)}`);
      const output = getOutputText(data);
      if (!output) throw new Error(`OpenAI ${model} returned no text output`);
      const trip = parseTripJson(output);

      trip.contacts = DEFAULT_CONTACTS;
      trip.agency = AGENCY;
      trip.departures ||= [];
      trip.days ||= [];
      trip.includes ||= [];
      trip.excludes ||= [];
      for (const [index, day] of trip.days.entries()) {
        day.day = Number(day.day || index + 1);
        day.summary ||= "";
        day.activities ||= [];
        day.bonus ||= [];
        day.meals ||= { breakfast: true, lunch: false, dinner: true };
        day.hotel ??= null;
        day.flight ??= null;
        day.photo = null;
        day.photo_caption ||= "";
      }
      return trip;
    } catch (error) {
      errors.push(error.message);
      const shouldTryNext =
        /model|not found|does not exist|unsupported|invalid|unrecognized|access/i.test(error.message) &&
        model !== "gpt-4o";
      if (!shouldTryNext) break;
    }
  }
  throw new Error(errors.join(" | "));
}

export async function extractTrip(docText) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY. Add it to .env.local or your deployment environment.");
  }

  const trip = await extractWithFallback(docText);

  trip.contacts = DEFAULT_CONTACTS;
  trip.agency = AGENCY;
  trip.departures ||= [];
  trip.days ||= [];
  trip.includes ||= [];
  trip.excludes ||= [];

  for (const [index, day] of trip.days.entries()) {
    day.day = Number(day.day || index + 1);
    day.summary ||= "";
    day.activities ||= [];
    day.bonus ||= [];
    day.meals ||= { breakfast: true, lunch: false, dinner: true };
    day.hotel ??= null;
    day.flight ??= null;
    day.photo = null;
    day.photo_caption ||= "";
  }

  return trip;
}
