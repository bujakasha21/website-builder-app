/**
 * Turning a 3D view into a photo is the job of an image model (the way nestermind.studio does it: geometry from
 * the plan, the model only adds material and light). This is the seam for it. Without a server key `findRenderer`
 * returns `noRenderer` and the UI says so instead of pretending.
 */
export interface RenderRequest { /** the plain 3D view as a data URL: fixes walls, windows and camera */ view: string; room: string; style: RenderStyle }
export type RenderStyle = "scandinavian" | "japandi" | "modern" | "classic";
export const RENDER_STYLES: { id: RenderStyle; label: string }[] = [{ id: "scandinavian", label: "Scandinavian" }, { id: "japandi", label: "Japandi" }, { id: "modern", label: "Modern" }, { id: "classic", label: "Classic" }];
export interface RenderProvider { id: string; label: string; available: boolean; render(req: RenderRequest): Promise<{ image: string }> }

export const noRenderer: RenderProvider = {
  id: "none",
  label: "No image model connected",
  available: false,
  async render() { throw new Error("No image model is connected."); },
};

/** shrinks the model's picture to a JPEG so a flat full of photos still fits in the browser's storage */
const toJpeg = (url: string, max = 1920) => new Promise<string>((ok, fail) => {
  const img = new Image();
  img.onload = () => {
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    ok(c.toDataURL("image/jpeg", 0.9));
  };
  img.onerror = () => fail(new Error("The photo could not be read."));
  img.src = url;
});

/** Google's Gemini image model behind /api/render; the key lives on the server, the picture leaves the browser */
export const geminiRenderer: RenderProvider = {
  id: "gemini",
  label: "AI photo by Google Gemini",
  available: true,
  async render(req) {
    const res = await fetch("/api/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
    const json = (await res.json().catch(() => ({}))) as { image?: string; error?: string };
    if (!res.ok || !json.image) throw new Error(json.error ?? "Rendering failed.");
    return { image: await toJpeg(json.image) };
  },
};

/** asks the server whether a key is set; without one the UI keeps the button off and says why */
export async function findRenderer(): Promise<RenderProvider> {
  try {
    const j = (await (await fetch("/api/render")).json()) as { available?: boolean };
    return j.available ? geminiRenderer : noRenderer;
  } catch { return noRenderer; }
}
