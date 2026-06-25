// Creates the tables for trips + edit history, then verifies a write/read round-trip.
import fs from "node:fs";
import pg from "pg";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
  if (m) env[m[1]] = m[2];
}

const client = new pg.Client({ connectionString: env.DATABASE_URL });
await client.connect();

await client.query(`
  create table if not exists trips (
    id           uuid primary key default gen_random_uuid(),
    title        text not null,
    source_file  text,
    data         jsonb not null,           -- current structured trip
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
  );
  create table if not exists trip_versions (
    id         uuid primary key default gen_random_uuid(),
    trip_id    uuid not null references trips(id) on delete cascade,
    data       jsonb not null,             -- a saved edit snapshot (history)
    note       text,
    created_at timestamptz not null default now()
  );
  create index if not exists idx_versions_trip on trip_versions(trip_id, created_at desc);
`);
console.log("✅ tables created (trips, trip_versions)");

// write/read round-trip
const ins = await client.query(
  "insert into trips(title, source_file, data) values($1,$2,$3) returning id",
  ["__healthcheck__", "test", JSON.stringify({ ok: true })]
);
const id = ins.rows[0].id;
const got = await client.query("select title, data from trips where id=$1", [id]);
console.log("✅ write/read OK:", got.rows[0].title, JSON.stringify(got.rows[0].data));
await client.query("delete from trips where id=$1", [id]);
console.log("✅ cleanup OK");
await client.end();
