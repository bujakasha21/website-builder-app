import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { PlanReadSchema } from "@/lib/floorplan/read-schema";

/**
 * Claude reads a floor plan picture: room names and printed areas, room outlines, door swings and built-in fittings.
 * The wall detector in the browser stays in charge of exact wall geometry; this answer is merged with it there.
 * The key stays on the server (ANTHROPIC_API_KEY in .env.local). Without it GET says unavailable and the
 * detector's result is used as it is; nothing is sent anywhere.
 */
const MODEL = "claude-opus-5-5";

const available = () => !!process.env.ANTHROPIC_API_KEY;
// explicit endpoint: never inherit a base URL meant for another tool running on this machine
const client = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: process.env.SITEBUILDER_ANTHROPIC_BASE_URL || "https://api.anthropic.com", timeout: 120_000, maxRetries: 1 });

const SYSTEM = `You read architectural floor plans of apartments (Swiss sales and rental plans, usually German labels) and return their layout as data.

The picture has a thin red grid: lines every 0.1 of the width and height, labelled 0.1 … 0.9 along the top and left edge. Give every coordinate as a fraction of the picture, x from the left edge, y from the top edge, to three decimals. Use the grid to be exact.

Rules:
- rooms: every enclosed room and every balcony, loggia or terrace. Outline along the inner face of the walls. Rooms that are open to each other without a wall (e.g. an Entrée marked off only by a dashed line) are separate rooms split along that line. Keep right angles.
- name: as printed. areaM2: the printed m² value, else null. Never invent an area.
- doors: every door leaf drawn with a swing arc, including balcony doors. Double doors are two leaves. Leave out sliding doors and openings without a leaf.
- fixtures: only what is drawn on the plan: shower tray, bathtub, toilet, washbasin, washing machine / dryer (WM, TU), the kitchen run (one 'counter' box for the whole worktop with hob and sink), tall kitchen units or fridge ('fridge'), built-in wardrobes. Do not add furniture that is not drawn.
- If the picture holds several apartments, return all of them.`;

export async function GET() {
  return Response.json({ available: available(), model: MODEL });
}

export async function POST(req: Request) {
  if (!available()) return Response.json({ error: "Claude is not connected: add ANTHROPIC_API_KEY to .env.local and restart the dev server." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { image?: string };
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.image ?? "");
  if (!m) return Response.json({ error: "The picture could not be read." }, { status: 400 });
  if (m[2].length > 6 * 1024 * 1024) return Response.json({ error: "The picture is too large." }, { status: 413 });

  try {
    const res = await client().beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format: betaZodOutputFormat(PlanReadSchema) },
      system: SYSTEM,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: m[1] as "image/jpeg" | "image/png" | "image/webp", data: m[2] } },
          { type: "text", text: "Read this floor plan." },
        ],
      }],
    });
    if (res.stop_reason === "refusal") return Response.json({ error: "Claude declined to read this plan." }, { status: 422 });
    if (res.stop_reason === "max_tokens" || !res.parsed_output) return Response.json({ error: "Claude's answer was incomplete." }, { status: 502 });
    return Response.json({ read: PlanReadSchema.parse(res.parsed_output), model: res.model });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return Response.json({ error: "The Claude API key was rejected." }, { status: 502 });
    if (e instanceof Anthropic.RateLimitError) return Response.json({ error: "Claude is busy (rate limit). Try again in a minute." }, { status: 503 });
    if (e instanceof Anthropic.APIError) return Response.json({ error: `Claude API error ${e.status ?? ""}`.trim() }, { status: 502 });
    return Response.json({ error: "Could not reach Claude." }, { status: 502 });
  }
}
