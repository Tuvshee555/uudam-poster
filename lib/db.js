import { neon } from "@neondatabase/serverless";

// HTTP-based Neon client — perfect for serverless, no connection pooling headaches.
export const sql = neon(process.env.DATABASE_URL);
