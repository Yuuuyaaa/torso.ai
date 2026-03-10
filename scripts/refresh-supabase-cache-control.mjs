const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const SUPABASE_STORAGE_BUCKET = String(process.env.SUPABASE_STORAGE_BUCKET || "app-assets");
const TARGET_PREFIXES = [
  "defaults/",
  "usr_",
];

function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing");
  }
}

async function storageApi(path, options = {}) {
  assertEnv();
  const response = await fetch(`${SUPABASE_URL}/storage/v1${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.error || text || `Storage error ${response.status}`);
  }
  return data;
}

async function listObjects(prefix = "", limit = 100, offset = 0) {
  return storageApi(`/object/list/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prefix,
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    }),
  });
}

async function downloadObject(path) {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}/${path.split("/").map(encodeURIComponent).join("/")}`);
  if (!response.ok) {
    throw new Error(`Failed to download ${path}: ${response.status}`);
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "application/octet-stream",
  };
}

async function uploadObject(path, buffer, contentType) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}/${encoded}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": contentType,
      "cache-control": "public, max-age=31536000, immutable",
      "x-upsert": "true",
    },
    body: buffer,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Upload failed for ${path}: ${response.status}`);
  }
}

async function walkPrefix(prefix) {
  const queue = [prefix];
  const files = [];
  while (queue.length > 0) {
    const current = queue.shift();
    const rows = await listObjects(current, 100, 0);
    for (const row of Array.isArray(rows) ? rows : []) {
      const fullPath = current ? `${current}${row.name}` : row.name;
      if (row.id == null && row.name) {
        queue.push(`${fullPath}/`);
        continue;
      }
      if (row.name) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

async function main() {
  const allFiles = [];
  for (const prefix of TARGET_PREFIXES) {
    const files = await walkPrefix(prefix);
    allFiles.push(...files);
  }
  let updated = 0;
  for (const path of allFiles) {
    const { buffer, contentType } = await downloadObject(path);
    await uploadObject(path, buffer, contentType);
    updated += 1;
    console.log(`updated cache-control: ${path}`);
  }
  console.log(JSON.stringify({ ok: true, updated }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
