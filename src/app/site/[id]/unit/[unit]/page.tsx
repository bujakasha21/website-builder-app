"use client";
import { Render, type Data } from "@puckeditor/core";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { config } from "@/editor/config";
import { pageData, siteQuery } from "@/lib/sitedata";
import { useProject } from "@/lib/store";

/** one page per apartment (as on lecorti.ch): plan, position in the building, key figures, and the enquiry form with this apartment preselected */
function UnitSite() {
  const { id, unit } = useParams<{ id: string; unit: string }>();
  const sp = useSearchParams();
  const draft = sp.get("draft") === "1";
  const lang = sp.get("lang");
  const p = useProject(id);
  if (p === undefined) return null;
  const u = p?.units.find((x) => x.id === unit);
  const page = p ? pageData(p, draft, lang) : null;
  if (!p || !u || !page) return <div className="p-10">This apartment does not exist.</div>;
  const find = (type: string) => (page.content as { type: string; props: Record<string, unknown> }[]).find((c) => c.type === type);
  const q = siteQuery(draft, lang, p.locale);
  const base = `/site/${id}${q ? `?${q}` : ""}`;
  const contact = find("ContactForm") ?? { type: "ContactForm", props: { id: "c", title: "Contact", text: "", interests: [], columns: "2", privacyLabel: "I have read and accept the privacy policy.", privacyHref: "/privacy" } };
  const data = {
    root: page.root,
    zones: {},
    content: [
      find("Header"),
      { type: "UnitPage", props: { id: "unit-page", unitId: u.id } },
      { ...contact, props: { ...contact.props, id: "unit-contact", title: "Interested in this apartment?", presetUnit: u.ref } },
      find("Footer"),
    ].filter(Boolean),
  } as Data;
  return (
    <>
      <Render config={config} data={data} metadata={{ projectId: id, draft, lang: lang ?? p.locale, base, partial: true, live: true }} />
      <nav className="owner-bar" aria-label="Owner tools">
        <span className="owner-state"><i style={{ background: draft ? "var(--warn)" : "var(--ok)" }} />Apartment {u.ref}</span>
        <a href={base}>← Back to the site</a>
        <a href={`/edit/${id}`}>Editor</a>
        <a href="/">Dashboard</a>
      </nav>
    </>
  );
}

export default function Page() {
  return <Suspense><UnitSite /></Suspense>;
}
