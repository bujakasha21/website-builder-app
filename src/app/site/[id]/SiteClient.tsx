"use client";
import { Render } from "@puckeditor/core";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { config } from "@/editor/config";
import { findPage, pageData, pageUrl, subPageData } from "@/lib/sitedata";
import { buildPage, templateOf } from "@/lib/templates";
import type { TemplateId } from "@/lib/types";
import { syncShare } from "@/lib/share";
import { updateProject, useProject } from "@/lib/store";

function Site() {
  const { id, page } = useParams<{ id: string; page?: string }>();
  const sp = useSearchParams();
  const draft = sp.get("draft") === "1";
  const p = useProject(id);
  const framed = sp.get("frame") === "1";
  const counted = useRef(false);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    if (!p || draft || !p.published || counted.current) return;
    counted.current = true;
    updateProject(p.id, (x) => ({ ...x, views: x.views + 1 }));
    const pg = findPage(p, page);
    document.title = pg ? `${pg.title} · ${p.name}` : p.name;
  }, [p, draft, page]);

  // keep the link preview (thumbnail = main image) in step with what the page shows
  useEffect(() => { if (p) syncShare(p, p.published ?? p.draft); }, [p]);

  if (p === undefined) return null;
  if (p === null) return <div className="p-10">This website does not exist.</div>;
  const lang = sp.get("lang");
  // ?tpl=t3 shows the same project in another template without saving anything
  const tpl = templateOf(sp.get("tpl") ?? undefined);
  if (page && !findPage(p, page)) return <div className="p-10">This page does not exist. <a className="underline" href={pageUrl(p, null, draft, lang)}>Go to the home page</a></div>;
  let data = page ? subPageData(p, page, draft, lang) : pageData(p, draft, lang);
  if (tpl && data && !page) {
    const find = (type: string) => (data!.content as { type: string; props: Record<string, unknown> }[]).find((c) => c.type === type)?.props;
    data = buildPage({ ...p, heroImage: find("Hero")?.image as string | undefined, gallery: find("Gallery")?.images as { src: string; caption: string }[] | undefined }, tpl.id as TemplateId);
  }
  // ?fv=cards previews another version of the apartment section, again without saving
  const fv = sp.get("fv");
  if (fv && data) data = { ...data, content: data.content.map((c) => (c.type === "UnitFinder" ? { ...c, props: { ...c.props, variant: fv } } : c)) } as typeof data;
  if (!data) return <div className="p-10">This website is not published yet. <a className="underline" href={pageUrl(p, page, true, lang)}>View draft</a></div>;
  const frameSrc = `/site/${id}${page ? `/${page}` : ""}?${[...new URLSearchParams([...sp.entries()].filter(([k]) => k !== "frame")).entries()].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).concat("frame=1").join("&")}`;
  return (
    <>
      {mobile && !framed ? <div className="mobile-stage"><iframe src={frameSrc} title="Mobile preview" /></div> :
      <Render config={config} data={data} metadata={{ projectId: id, draft, lang: lang ?? p.locale, framed, live: !framed, accent: tpl?.accent, page: page ?? null, base: page ? pageUrl(p, null, draft, lang) : undefined }} />}
      {!framed ? (
        <nav className="owner-bar" aria-label="Owner tools">
          <span className="owner-state"><i style={{ background: draft ? "var(--warn)" : "var(--ok)" }} />{draft ? "Draft preview" : "Live site"}</span>
          <span className="owner-view" role="group" aria-label="Preview size"><button type="button" aria-pressed={!mobile} onClick={() => setMobile(false)}>Desktop</button><button type="button" aria-pressed={mobile} onClick={() => setMobile(true)}>Mobile</button></span>
          <a href={`/edit/${id}${page ? `?page=${page}` : ""}`}>← Back to editor</a>
          <a href={`/p/${id}`}>Project</a>
          <a href="/">Dashboard</a>
        </nav>
      ) : null}
    </>
  );
}

export default function SiteClient() {
  return <Suspense><Site /></Suspense>;
}
