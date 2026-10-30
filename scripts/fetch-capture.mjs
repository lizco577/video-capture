// Download an uploaded capture from Supabase and stitch its chunks back into
// playable video files, one per segment, plus session.json.
//
//   SUPABASE_SERVICE_ROLE_KEY=… node scripts/fetch-capture.mjs <session id> [out dir]
//   SUPABASE_SERVICE_ROLE_KEY=… node scripts/fetch-capture.mjs --list
//
// The service role key (Project Settings → API Keys) can read the private bucket.
// Keep it in your shell only: never in .env.local or the app.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function envFile() {
  try {
    return Object.fromEntries(
      readFileSync(new URL("../.env.local", import.meta.url), "utf8")
        .split("\n")
        .filter((l) => /^\w+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
    );
  } catch {
    return {};
  }
}

const url = process.env.SUPABASE_URL ?? envFile().VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY (and VITE_SUPABASE_URL in .env.local).");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });
const bucket = sb.storage.from("captures");

const [arg, outArg] = process.argv.slice(2);
if (!arg || arg === "--list") {
  const { data, error } = await sb
    .from("capture_sessions")
    .select("id, created_at, platform, codec, duration_s, bytes, fps_min, drift_deg")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  console.table(data);
  process.exit(0);
}

const out = outArg ?? join("captures", arg.slice(0, 8));
await mkdir(out, { recursive: true });

const { data: top, error } = await bucket.list(arg);
if (error) throw error;
for (const entry of top) {
  if (entry.name === "session.json") {
    const { data } = await bucket.download(`${arg}/session.json`);
    await writeFile(join(out, "session.json"), Buffer.from(await data.arrayBuffer()));
    continue;
  }
  if (!/^seg\d+$/.test(entry.name)) continue;
  const { data: parts } = await bucket.list(`${arg}/${entry.name}`, { limit: 10000, sortBy: { column: "name", order: "asc" } });
  const buffers = [];
  let type = "";
  for (const p of parts) {
    const { data } = await bucket.download(`${arg}/${entry.name}/${p.name}`);
    type ||= data.type;
    buffers.push(Buffer.from(await data.arrayBuffer()));
  }
  const ext = type.includes("mp4") ? "mp4" : "webm";
  const file = join(out, `${entry.name}.${ext}`);
  await writeFile(file, Buffer.concat(buffers));
  console.log(`${file}: ${parts.length} chunks`);
}
console.log(`Saved to ${out}`);
