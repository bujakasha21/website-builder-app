"use client";
import Link from "next/link";
import HomeShell, { PageHead } from "@/components/HomeShell";
import ProjectCards from "@/components/ProjectCards";
import { Loading } from "@/components/shell";
import { useDb } from "@/lib/store";

export default function Websites() {
  const db = useDb();
  return (
    <HomeShell>
      <PageHead eyebrow="Websites" title="Your project websites" text="Hover a card to delete a website." action={<Link href="/new" className="btn btn-primary">New website</Link>} />
      {!db ? <Loading /> : <ProjectCards projects={db.projects.filter((p) => !p.id.startsWith("__"))} />}
    </HomeShell>
  );
}
