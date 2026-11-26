import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** link-preview data per site: the main image as a 1200×630 JPEG plus title and description.
 * The projects themselves live in the browser in this preview, so this small store is what a crawler can read. */
const DIR = path.join(process.cwd(), ".data", "og");
const safe = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const img = await readFile(path.join(DIR, `${safe(id)}.jpg`));
    return new Response(new Uint8Array(img), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=300" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = safe(id);
  if (!key) return Response.json({ ok: false }, { status: 400 });
  const body = (await req.json()) as { image?: string; title?: string; description?: string };
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(body.image ?? "");
  await mkdir(DIR, { recursive: true });
  if (m) {
    const buf = Buffer.from(m[1], "base64");
    if (buf.length > 3 * 1024 * 1024) return Response.json({ ok: false, error: "too large" }, { status: 413 });
    await writeFile(path.join(DIR, `${key}.jpg`), buf);
  }
  await writeFile(path.join(DIR, `${key}.json`), JSON.stringify({ title: String(body.title ?? "").slice(0, 140), description: String(body.description ?? "").slice(0, 300), image: !!m, at: Date.now() }));
  return Response.json({ ok: true });
}
