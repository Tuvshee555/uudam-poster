import { NextResponse } from "next/server";
import { sql } from "../../../../lib/db";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  try {
    const rows = await sql`select id, title, source_file, data from trips where id=${params.id}`;
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ trip: rows[0] });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
