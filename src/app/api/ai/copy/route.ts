import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AiCopySchema, CopyRequestSchema } from "@/lib/copy-schema";

/**
 * Pascal's copywriter: Claude writes a new site's texts from the interview.
 * The key stays on the server (ANTHROPIC_API_KEY in .env.local). Without it, GET says unavailable
 * and Pascal keeps the rule-based texts; nothing is sent anywhere.
 */
const MODEL = "claude-opus-5-5";

const available = () => !!process.env.ANTHROPIC_API_KEY;
// explicit endpoint: never inherit a base URL meant for another tool running on this machine
const client = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: process.env.SITEBUILDER_ANTHROPIC_BASE_URL || "https://api.anthropic.com", timeout: 90_000, maxRetries: 1 });

const SYSTEM = `You write the first texts of a new website built with the Streamnow website builder (Switzerland): residential and commercial property projects, shopping centres, booking sites and blogs.

Rules:
- Write in English, plain and warm, for the people the site is for (tenants, buyers, shoppers, guests). No marketing clichés, no exclamation marks, no emoji.
- Use only facts from the owner's name, description, town and offer. Never invent numbers, prices, distances, dates, amenities, awards or names. Where a fact is missing, write a neutral sentence the owner can complete, without placeholders in brackets.
- Lengths: heroText one sentence, at most 160 characters. aboutText 60 to 120 words. advantages exactly 4 items for residential and commercial sites, otherwise 0 to 4; each title at most 4 words, each text at most 16 words; pick a fitting icon. contactText and newsletterText one sentence each.
- posts: 3 short news items only if "blog" is among the features, else an empty list; each body 2 to 4 sentences, nothing invented. faq: 3 to 5 questions only if "faq" is among the features, else an empty list.
- seo.title at most 60 characters, includes the name; seo.description at most 155 characters.`;

export async function GET() {
  return Response.json({ available: available(), model: MODEL });
}

export async function POST(req: Request) {
  if (!available()) return Response.json({ error: "Claude is not connected: add ANTHROPIC_API_KEY to .env.local and restart the dev server." }, { status: 503 });
  const parsed = CopyRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const b = parsed.data;
  const brief = [
    `Site type: ${b.kind}`,
    `Name: ${b.name}`,
    b.city ? `Town: ${b.city}` : "",
    b.offer ? `Offer: ${b.offer === "sale" ? "for sale" : "for rent"}` : "",
    b.vibe ? `Look chosen: ${b.vibe}` : "",
    `Sections on the page: ${b.features.join(", ")}`,
    `Owner's description: ${b.description || "(none given)"}`,
  ].filter(Boolean).join("\n");

  try {
    const res = await client().beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(AiCopySchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: `Write the texts for this website.\n\n${brief}` }],
    });
    if (res.stop_reason === "refusal") return Response.json({ error: "Claude declined to write these texts." }, { status: 422 });
    if (res.stop_reason === "max_tokens" || !res.parsed_output) return Response.json({ error: "Claude's answer was incomplete." }, { status: 502 });
    const copy = AiCopySchema.parse(res.parsed_output);
    return Response.json({ copy, model: res.model });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return Response.json({ error: "The Claude API key was rejected." }, { status: 502 });
    if (e instanceof Anthropic.RateLimitError) return Response.json({ error: "Claude is busy (rate limit). Try again in a minute." }, { status: 503 });
    if (e instanceof Anthropic.APIError) return Response.json({ error: `Claude API error ${e.status ?? ""}`.trim() }, { status: 502 });
    return Response.json({ error: "Could not reach Claude." }, { status: 502 });
  }
}
