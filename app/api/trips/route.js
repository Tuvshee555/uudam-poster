import { NextResponse } from "next/server";
import { sql } from "../../../lib/db";

export const runtime = "nodejs";

// list saved trips (history)
export async function GET() {
  try {
    const rows = await sql`
      select id, title, source_file, updated_at
      from trips order by updated_at desc limit 100`;
    return NextResponse.json({ trips: rows });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}

// create OR update a trip, and snapshot a version for history
export async function POST(req) {
  try {
    const { id, title, data, source_file, note } = await req.json();
    let tripId = id;
    if (tripId) {
      await sql`update trips set title=${title}, data=${data}, updated_at=now()
                where id=${tripId}`;
    } else {
      const ins = await sql`
        insert into trips (title, source_file, data)
        values (${title}, ${source_file || null}, ${data})
        returning id`;
      tripId = ins[0].id;
    }
    await sql`insert into trip_versions (trip_id, data, note)
              values (${tripId}, ${data}, ${note || null})`;
    return NextResponse.json({ id: tripId });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
