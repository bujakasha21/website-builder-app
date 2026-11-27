import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { EditAnswerSchema, EditRequestSchema } from "@/lib/edit-schema";

/**
 * Pascal's understanding in the editor: Claude turns a sentence ("make the footer logo bigger, copyright in the middle")
 * into section changes. It only proposes; the browser checks every change with the command layer, shows it, and applies
 * it after the owner confirms. The key stays on the server (ANTHROPIC_API_KEY).
 */
const MODEL = "claude-opus-5-5";
const client = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: process.env.SITEBUILDER_ANTHROPIC_BASE_URL || "https://api.anthropic.com", timeout: 60_000, maxRetries: 1 });

const SYSTEM = `You are Pascal, the assistant inside a website editor. The owner asks for a change in plain words; you answer with changes to the sections of the current page.

How the page works:
- The page is a list of sections (blocks), each with an id, a type and props. "catalog" lists, for every section type, the fields it has, their kind and allowed values. Only use fields and values from the catalog.
- Text fields may be changed freely. For select/radio fields use one of the listed options exactly. Array fields (lists) must be given in full, as the complete new array.
- In the footer's copyright line, {year} and {company} are filled in automatically.
- To change the look of one section, prefer its own fields (layout, size, variant) over adding new sections.

Answer:
- "changes": the smallest set of changes that does what was asked. "props" holds only the fields that change, each value as JSON (a string value is written with quotes, e.g. "\\"Impressum\\"").
- If the request cannot be done with the available fields, make no changes and say plainly in "reply" what is missing. Never claim something will change that is not in "changes".
- "reply": one or two short sentences in the owner's language, saying what you are about to change.`;

export async function GET() {
  return Response.json({ available: !!process.env.ANTHROPIC_API_KEY, model: MODEL });
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "Claude is not connected (no ANTHROPIC_API_KEY)." }, { status: 503 });
  const parsed = EditRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const r = parsed.data;
  const context = JSON.stringify({ site: r.site, selectedSection: r.selectedId ?? null, page: r.page, catalog: r.catalog });
  try {
    const res = await client().beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(EditAnswerSchema) },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: [{ type: "text", text: `Current page and catalog:\n${context}` }, { type: "text", text: `Request: ${r.text}` }] }],
    });
    if (res.stop_reason === "refusal") return Response.json({ error: "Claude declined this request." }, { status: 422 });
    if (!res.parsed_output) return Response.json({ error: "Claude's answer was incomplete." }, { status: 502 });
    const a = EditAnswerSchema.parse(res.parsed_output);
    // JSON-string values → real values; a value that does not parse is dropped and reported
    const dropped: string[] = [];
    const ops = a.changes.map((c) => {
      const props: Record<string, unknown> = {};
      for (const p of c.props) { try { props[p.field] = JSON.parse(p.json); } catch { dropped.push(p.field); } }
      if (c.kind === "update") return { op: "updateBlock", id: c.blockId, props };
      if (c.kind === "remove") return { op: "deleteBlock", id: c.blockId };
      if (c.kind === "move") return { op: "moveBlock", id: c.blockId, to: Math.max(0, c.position) };
      return { op: "addBlock", index: c.position >= 0 ? c.position : undefined, block: { type: c.blockType, props } };
    });
    return Response.json({ reply: a.reply, ops, dropped, model: res.model });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return Response.json({ error: "The Claude API key was rejected." }, { status: 502 });
    if (e instanceof Anthropic.RateLimitError) return Response.json({ error: "Claude is busy (rate limit). Try again in a minute." }, { status: 503 });
    if (e instanceof Anthropic.APIError) return Response.json({ error: `Claude API error ${e.status ?? ""}`.trim() }, { status: 502 });
    return Response.json({ error: "Could not reach Claude." }, { status: 502 });
  }
}
