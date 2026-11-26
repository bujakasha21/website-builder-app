"use client";
import { Render, type Data } from "@puckeditor/core";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { config } from "@/editor/config";
import { pageData, siteQuery } from "@/lib/sitedata";
import { useProject } from "@/lib/store";

/** imprint and privacy policy of a site: header, the text from Site settings → Legal (or the starter wording), footer */
function LegalSite() {
  const { id, page } = useParams<{ id: string; page: string }>();
  const sp = useSearchParams();
  const draft = sp.get("draft") === "1";
  const lang = sp.get("lang");
  const p = useProject(id);
  if (p === undefined) return null;
  const data0 = p ? pageData(p, draft, lang) : null;
  if (!p || !data0 || (page !== "imprint" && page !== "privacy")) return <div className="p-10">This page does not exist.</div>;
  const find = (type: string) => (data0.content as { type: string; props: Record<string, unknown> }[]).find((c) => c.type === type);
  const q = siteQuery(draft, lang, p.locale);
  const base = `/site/${id}${q ? `?${q}` : ""}`;
  const data = {
    root: data0.root,
    zones: {},
    content: [find("Header"), { type: "LegalPage", props: { id: "legal-page", page, company: (find("Footer")?.props.company as string) ?? p.name } }, find("Footer")].filter(Boolean),
  } as Data;
  return (
    <>
      <Render config={config} data={data} metadata={{ projectId: id, draft, lang: lang ?? p.locale, base, partial: true, live: true }} />
      <nav className="owner-bar" aria-label="Owner tools">
        <span className="owner-state"><i style={{ background: draft ? "var(--warn)" : "var(--ok)" }} />{page === "imprint" ? "Imprint" : "Privacy policy"}</span>
        <a href={base}>← Back to the site</a>
        <a href={`/edit/${id}`}>Editor</a>
      </nav>
    </>
  );
}

export default function Page() {
  return <Suspense><LegalSite /></Suspense>;
}
