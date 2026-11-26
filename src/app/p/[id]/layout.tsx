"use client";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Loading, TopBar } from "@/components/shell";
import { useProject } from "@/lib/store";

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const path = usePathname();
  const p = useProject(id);
  const tabs = [
    [`/p/${id}`, "Overview"],
    [`/p/${id}/units`, "Apartments"],
    [`/p/${id}/isometry`, "Isometry"],
    [`/p/${id}/plans`, "Floor plans"],
  ];
  return (
    <>
      <TopBar>
        <span className="text-line-strong">/</span>
        <span className="font-medium">{p?.name ?? "…"}</span>
      </TopBar>
      {p === undefined ? <Loading /> : p === null ? (
        <div className="p-10">Project not found. <Link className="underline" href="/">Back to projects</Link></div>
      ) : (
        <main className="flex-1 w-full max-w-[1320px] mx-auto px-6 py-8">
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div>
              <div className="eyebrow">{p.type === "rent" ? "For rent" : "For sale"} · {p.zip} {p.city}</div>
              <h1 className="text-[28px] leading-tight font-semibold tracking-tight mt-1">{p.name}</h1>
            </div>
            <div className="flex gap-2">
              <a className="btn" href={`/site/${p.id}${p.published ? "" : "?draft=1"}`} target="_blank">{p.published ? "View website" : "View draft"}</a>
              <Link className="btn btn-primary" href={`/edit/${p.id}`}>Open editor</Link>
            </div>
          </div>
          <nav className="flex gap-6 border-b border-line mt-6" aria-label="Project">
            {tabs.map(([href, label]) => (
              <Link key={href} href={href} aria-current={path === href ? "page" : undefined} className={`pb-3 -mb-px border-b-2 text-[14px] transition-colors ${path === href ? "border-ink font-medium" : "border-transparent text-muted hover:text-ink"}`}>{label}</Link>
            ))}
          </nav>
          <div className="pt-8">{children}</div>
        </main>
      )}
    </>
  );
}
