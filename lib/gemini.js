// Reads a messy China travel doc (text) and returns clean, structured trip data.
// This is the ONE place AI is used — reading, not drawing.

export const DEFAULT_CONTACTS = {
  phones: ["7713 6633", "8913 6633", "9117 2769", "9924 8000"],
  email: "uudamtravel6@gmail.com",
  address:
    'Чингэлтэй дүүрэг, 4-р хороо, Анхарагийн гудамж-23, "Todtower" офис, 701 тоот',
};
export const AGENCY = "UUDAM TRAVEL AGENCY";

const SCHEMA = `{
  "title": "string — short trip name in Mongolian, UPPERCASE ok",
  "subtitle": "string — one short line (e.g. flight type / theme), or \\"\\"",
  "duration_days": number,
  "duration_nights": number,
  "flights": { "outbound": "string e.g. 'MR855 УБ → Датун 16:30-18:10'", "return": "string" } | null,
  "departures": [{ "date": "string e.g. '7-р сар 4'" }],
  "price_table": {
    "columns": ["string column labels, e.g. 'Том хүн','Хүүхэд'"],
    "rows": [{ "dates": "string", "cells": ["string price like '2,340,000₮' per column"] }],
    "note": "string or \\"\\""
  } | null,
  "price_note": "string warning/condition or \\"\\"",
  "days": [{
    "day": number,
    "route": "string e.g. 'УБ → Датун'",
    "distance_km": number or 0,
    "activities": ["MAX 3 SHORT bullet points, concise, NOT long paragraphs"],
    "meals": { "breakfast": boolean, "lunch": boolean, "dinner": boolean },
    "hotel": "string or null",
    "flight": "string or null",
    "bonus": ["optional paid add-ons, or empty array"]
  }],
  "includes": ["string"],
  "excludes": ["string"]
}`;

export async function extractTrip(docText) {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const prompt = `You are a data extractor for a Mongolian travel agency's trip poster.
Read the document below (Mongolian and/or Chinese) and output ONLY JSON matching this shape:
${SCHEMA}

RULES:
- Output Mongolian text (translate Chinese parts to Mongolian).
- Prices: prefer the Mongolian selling price in ₮ with thousands separators (e.g. "2,340,000₮").
- Keep activities SHORT and scannable — max 3 bullets per day, no long sentences.
- Infer breakfast/lunch/dinner inclusion from the doc; if unclear, breakfast=true on days after day 1.
- If there is only one price for everyone, still use price_table with one row.
- Do not invent contacts; omit them.

DOCUMENT:
${docText}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
    }),
  });
  if (!res.ok) {
    throw new Error("Gemini error " + res.status + ": " + (await res.text()).slice(0, 300));
  }
  const data = await res.json();
  const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!txt) throw new Error("Gemini returned no content");
  const trip = JSON.parse(txt);

  // inject the agency's fixed details
  trip.contacts = DEFAULT_CONTACTS;
  trip.agency = AGENCY;
  // light normalization
  trip.departures ||= [];
  trip.days ||= [];
  trip.includes ||= [];
  trip.excludes ||= [];
  for (const d of trip.days) {
    d.activities ||= [];
    d.bonus ||= [];
    d.meals ||= { breakfast: true, lunch: false, dinner: true };
  }
  return trip;
}
