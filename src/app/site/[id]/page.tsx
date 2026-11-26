import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import SiteClient from "./SiteClient";

/** title, description and thumbnail for link previews (WhatsApp, Slack, LinkedIn …) */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const key = id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  try {
    const d = JSON.parse(await readFile(path.join(process.cwd(), ".data", "og", `${key}.json`), "utf8")) as { title: string; description: string; image: boolean; at: number };
    const images = d.image ? [{ url: `/api/og/${key}?v=${d.at}`, width: 1200, height: 630, alt: d.title }] : undefined;
    return {
      title: d.title,
      description: d.description,
      openGraph: { type: "website", title: d.title, description: d.description, images },
      twitter: { card: images ? "summary_large_image" : "summary", title: d.title, description: d.description, images: images?.map((i) => i.url) },
    };
  } catch {
    return {};
  }
}

/** the link preview is read per request, so this route is marked as dynamic */
async function Dynamic() {
  await connection();
  return null;
}

export default function Page() {
  return <><SiteClient /><Suspense><Dynamic /></Suspense></>;
}
