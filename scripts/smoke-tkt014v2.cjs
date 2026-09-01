// Smoke test TKT-014 v2 — Storage backend real.
// Verifica: upload binario + signed URL + download via signed URL.
//
// Uso:
//   1) Asegúrate de que `supabase start` esté corriendo.
//   2) `node scripts/smoke-tkt014v2.cjs`
//
// Lee SUPABASE_SERVICE_ROLE_KEY y NEXT_PUBLIC_SUPABASE_URL del .env.local.

/* eslint-disable @typescript-eslint/no-require-imports */

const path = require("path");
const fs = require("fs");

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "ERROR: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY faltantes en .env.local.",
  );
  process.exit(1);
}

async function main() {
  const { createClient } = require("@supabase/supabase-js");
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  console.log("[1] admin client OK");

  const tenantId = "11111111-aaaa-bbbb-cccc-000000000001";
  const ticketId = "33333333-aaaa-bbbb-cccc-000000000001";
  const bucket = "ticket-attachments";

  const fileName = `smoke-${Date.now()}.txt`;
  const path_ = `${tenantId}/${ticketId}/${fileName}`;
  const body = new Uint8Array(Buffer.from("Hola desde smoke test TKT-014 v2!"));

  const { data: upData, error: upErr } = await admin.storage
    .from(bucket)
    .upload(path_, body, { contentType: "text/plain", upsert: false });
  if (upErr) {
    console.error("upload FAILED:", upErr);
    process.exit(1);
  }
  console.log("[2] upload OK:", upData.path);

  const { data: listData, error: listErr } = await admin.storage
    .from(bucket)
    .list(`${tenantId}/${ticketId}`);
  if (listErr) {
    console.error("list FAILED:", listErr);
    process.exit(1);
  }
  const found = listData.find((o) => o.name === fileName);
  if (!found) {
    console.error("object NOT in Storage. list:", listData);
    process.exit(1);
  }
  console.log("[3] object in Storage OK:", found.name, found.metadata?.size, "bytes");

  const { data: signData, error: signErr } = await admin.storage
    .from(bucket)
    .createSignedUrl(path_, 60);
  if (signErr || !signData) {
    console.error("signed URL FAILED:", signErr);
    process.exit(1);
  }
  console.log("[4] signed URL OK:", signData.signedUrl.substring(0, 80) + "...");

  const dl = await fetch(signData.signedUrl);
  if (!dl.ok) {
    console.error("download FAILED:", dl.status);
    process.exit(1);
  }
  const text = await dl.text();
  const expected = "Hola desde smoke test TKT-014 v2!";
  if (text !== expected) {
    console.error("content MISMATCH:", text);
    process.exit(1);
  }
  console.log("[5] download via signed URL OK (content matches)");

  await admin.storage.from(bucket).remove([path_]);
  console.log("[6] cleanup OK");

  console.log("\n*** TKT-014 v2 STORAGE BACKEND SMOKE TEST: ALL CHECKS PASSED ***");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
