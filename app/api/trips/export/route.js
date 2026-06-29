import { NextResponse } from "next/server";
import { sql } from "../../../../lib/db";

export const runtime = "nodejs";

// Download all saved trips as a single JSON file (full data included)
export async function GET() {
  try {
    const rows = await sql`
      select id, title, source_file, updated_at, data
      from trips order by updated_at desc`;
    const payload = JSON.stringify({ exported_at: new Date().toISOString(), trips: rows }, null, 2);
    return new Response(payload, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="uudam-trips-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
