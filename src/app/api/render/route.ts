/**
 * Photo rendering: sends one plain 3D view to Google's Gemini image model and returns the photo it makes of it.
 * The key stays on the server (GEMINI_API_KEY in .env.local). Without a key the route says so and the UI keeps
 * the button off, so nothing pretends to be a render.
 */
const KEY = () => process.env.GEMINI_API_KEY ?? "";
const MODEL = () => process.env.GEMINI_IMAGE_MODEL || "gemini-nano-banana-2.1";
const SIZE = () => process.env.GEMINI_IMAGE_SIZE || "2K";

const STYLES: Record<string, string> = {
  scandinavian: "Scandinavian: light oak, white walls, soft wool and linen, pale daylight",
  japandi: "Japandi: warm wood, muted earth tones, low simple furniture, calm and uncluttered",
  modern: "modern: clean lines, neutral palette with a few dark accents, matte surfaces",
  classic: "classic: warm parquet, upholstered furniture, soft warm light",
};

export async function GET() {
  return Response.json({ available: !!KEY(), model: MODEL() });
}

export async function POST(req: Request) {
  if (!KEY()) return Response.json({ error: "No image model is connected. Add GEMINI_API_KEY to .env.local and restart the server." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { view?: string; room?: string; style?: string };
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.view ?? "");
  if (!m) return Response.json({ error: "The picture could not be read." }, { status: 400 });
  if (m[2].length > 8 * 1024 * 1024) return Response.json({ error: "The picture is too large." }, { status: 413 });
  const room = String(body.room ?? "room").replace(/[^\p{L}\p{N} /-]/gu, "").slice(0, 60) || "room";
  const style = STYLES[body.style ?? ""] ?? STYLES.scandinavian;

  const prompt = [
    `This is a plain 3D preview of a ${room} in an apartment, built to scale from the floor plan.`,
    "Turn it into a photorealistic interior photograph, as taken by a property photographer.",
    "Keep exactly: the camera position and angle, the walls, the ceiling height, every door and window with its position and size, and where each piece of furniture stands.",
    "Do not add, remove or move walls, doors or windows. Do not add rooms. Do not add people, text or logos.",
    "Change only: materials, textures, light and the detail of the furniture, plus a little decoration (plants, a rug, curtains, a lamp) that fits the room.",
    `Style: ${style}. Natural daylight from the windows, realistic shadows.`,
  ].join(" ");

  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL())}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": KEY() },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: m[1], data: m[2] } }] }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { imageSize: SIZE() } },
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    return Response.json({ error: "The image model did not answer in time. Try again." }, { status: 504 });
  }
  const json = (await res.json().catch(() => null)) as { error?: { message?: string }; candidates?: { finishReason?: string; content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[] } | null;
  if (!res.ok) {
    if (res.status === 429) {
      const free = /free.tier/i.test(json?.error?.message ?? "");
      return Response.json({ error: free ? "Google does not offer this image model on the free plan. Turn on billing for the key's project in Google AI Studio, then try again." : "Google's limit for this key is used up for now. Wait a minute and try again." }, { status: 429 });
    }
    const why = (json?.error?.message ?? `HTTP ${res.status}`).split("\n")[0].slice(0, 240);
    const hint = res.status === 404 ? ` Check GEMINI_IMAGE_MODEL (now “${MODEL()}”).` : "";
    return Response.json({ error: `The image model refused: ${why}${hint}` }, { status: 502 });
  }
  const part = json?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!part?.data) return Response.json({ error: `The image model returned no picture${json?.candidates?.[0]?.finishReason ? ` (${json.candidates[0].finishReason})` : ""}.` }, { status: 502 });
  return Response.json({ image: `data:${part.mimeType ?? "image/png"};base64,${part.data}`, model: MODEL() });
}
