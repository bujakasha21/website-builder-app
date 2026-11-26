"use client";
import HomeShell, { PageHead } from "@/components/HomeShell";
import ProjectCards from "@/components/ProjectCards";
import { Loading } from "@/components/shell";
import { useDb } from "@/lib/store";

export default function Brochures() {
  const db = useDb();
  return (
    <HomeShell>
      <PageHead eyebrow="Brochures" title="Letting brochure as PDF" text="Pick a website. Its facts, unit list, floor plans and contacts are laid out on A4 pages you can print or save as PDF." />
      {!db ? <Loading /> : <ProjectCards action="brochure" projects={db.projects.filter((p) => !p.id.startsWith("__"))} />}
    </HomeShell>
  );
}
