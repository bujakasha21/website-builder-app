"use client";
import { syncShare } from "@/lib/share";
import { blocksPlugin, outlinePlugin, Puck, Render, usePuck, type Data } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Loading, SitePreview } from "@/components/shell";
import { config } from "@/editor/config";
import SettingsDrawer, { Tip } from "@/editor/SettingsDrawer";
import { BlockBar, VersionGallery } from "@/editor/VariantField";
import PascalBar from "@/components/PascalBar";
import TextMenu from "@/editor/pascal/TextMenu";
import { composePage, findPage, freeSlug, splitPage } from "@/lib/sitedata";
import { getProject, uid, updateProject, useProfile, useProject } from "@/lib/store";
import { isGuided } from "@/lib/profile";
import { commit, takeTag } from "@/doc/commit";
import { autoVersion, saveVersion } from "@/doc/versions";
import HistoryPanel, { UndoRedo } from "@/editor/HistoryPanel";
import { flag } from "@/lib/flags";
import { buildSubPage, PAGE_KINDS } from "@/lib/templates";
import type { Project, SitePage } from "@/lib/types";

const LANG_NAME: Record<string, string> = { "de-CH": "DE", "fr-CH": "FR", "it-CH": "IT", en: "EN" };

/** hover a block in the list to see what it looks like before dragging it in */
function BlockItem({ name, children, projectId }: { name: string; children: React.ReactNode; projectId: string }) {
  const [show, setShow] = useState(false);
  const [top, setTop] = useState(0);
  const c = (config.components as Record<string, { defaultProps?: Record<string, unknown> }>)[name];
  return (
    <div onMouseEnter={(e) => { setTop(Math.min(e.currentTarget.getBoundingClientRect().top, window.innerHeight - 260)); setShow(true); }} onMouseLeave={() => setShow(false)}>
      {children}
      {show && c ? (
        <div className="blk-preview rise" style={{ top }} aria-hidden>
          <div className="blk-preview-in">
            <Render config={config} data={{ root: { props: {} }, content: [{ type: name, props: { id: "preview", ...(c.defaultProps ?? {}), ...(name === "Gallery" ? { images: [{ src: "", caption: "Exterior" }, { src: "", caption: "Living room" }, { src: "", caption: "Kitchen" }] } : {}) } }], zones: {} } as Data} metadata={{ projectId, partial: true }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Puck treats overrides as components: they must keep their identity between renders,
// otherwise everything inside them (open tab of the settings panel, Pascal's chat) is reset on every change
interface Ctx { id: string; p: Project; page: SitePage | null; goPage: (slug: string | null) => void; mutate: (ops: unknown[], label: string) => void; saved: "saved" | "saving"; langs: string[]; cur: string; qs: string; switchLang: (l: string) => void; settings: boolean; setSettings: (v: boolean) => void; flush: () => void; reload: () => void; history: boolean; setHistory: (v: boolean) => void }
const EditorCtx = createContext<Ctx | null>(null);

// two sizes only, with words: the phone is 390 px wide, the desktop view is scaled to fit the canvas
const VIEWPORTS = [{ width: 390, height: "auto" as const, label: "Mobile", icon: "Smartphone" as const }, { width: 1280, height: "auto" as const, label: "Desktop", icon: "Monitor" as const }];
function ViewSwitch() {
  const { appState, dispatch } = usePuck();
  const vp = appState.ui.viewports;
  const mobile = Number(vp.current.width) <= 480;
  const go = (width: number) => dispatch({ type: "setUi", ui: { viewports: { ...vp, current: { ...vp.current, width, height: "auto" } } } });
  return (
    <div className="st-seg view-switch" role="group" aria-label="Preview size" style={{ height: 34 }}>
      <button type="button" aria-pressed={!mobile} onClick={() => go(1280)}>Desktop</button>
      <button type="button" aria-pressed={mobile} onClick={() => go(390)}>Mobile</button>
    </div>
  );
}

/** Pascal's chat bar needs the live page data, so it sits inside the editor */
function PascalDock() {
  const c = useContext(EditorCtx)!;
  const { appState, dispatch, selectedItem } = usePuck();
  return <PascalBar mode="editor" project={c.p} data={appState.data} selectedId={(selectedItem?.props.id as string | undefined) ?? null} onData={(d) => dispatch({ type: "setData", data: d })} onOpenSettings={() => c.setSettings(true)} />;
}

type Link = { label: string; href: string };
/** an operation that rewrites the menu bar's links (none if the page has no menu bar) */
function headerLinks(p: Project, fn: (links: Link[]) => Link[]) {
  const h = p.draft.content.find((b) => b.type === "Header");
  return h ? [{ op: "updateBlock", id: h.props.id as string, props: { links: fn(((h.props as { links?: Link[] }).links ?? [])) } }] : [];
}

/** which page of the site is being edited, plus adding, renaming and removing pages */
/** every page of the site with go-to, rename, delete and add; used in the header menu and in the left "Pages" panel */
function PagesList({ close }: { close?: () => void }) {
  const c = useContext(EditorCtx)!;
  const [adding, setAdding] = useState(false);
  const pages = c.p.pages ?? [];
  const add = (kind: string, title: string) => {
    const slug = freeSlug(c.p, title);
    const tpl = c.p.template;
    const hero = c.p.draft.content.find((b) => b.type === "Hero")?.props as { image?: string } | undefined;
    const gal = c.p.draft.content.find((b) => b.type === "Gallery")?.props as { images?: { src: string; caption: string }[] } | undefined;
    const draft = buildSubPage(kind, title, { ...c.p, heroImage: hero?.image, gallery: gal?.images }, tpl);
    // the new page goes into the menu bar straight away
    c.mutate([{ op: "createPage", id: uid(), title, slug, content: draft.content }, ...headerLinks(c.p, (l) => [...l, { label: title, href: `/${slug}` }])], `Added page “${title}”`);
    setAdding(false); close?.();
    c.goPage(slug);
  };
  const [del, setDel] = useState<string | null>(null);
  const [ren, setRen] = useState<{ id: string; title: string } | null>(null);
  const rename = (pg: SitePage, raw: string) => {
    const title = raw.trim();
    setRen(null);
    if (!title || title === pg.title) return;
    c.mutate([{ op: "renamePage", page: pg.id, title }, ...headerLinks(c.p, (l) => l.map((x) => (x.href === `/${pg.slug}` && x.label === pg.title ? { ...x, label: title } : x)))], `Renamed page “${pg.title}”`);
  };
  const remove = (pg: SitePage) => {
    setDel(null);
    if (c.page?.id === pg.id) c.goPage(null);
    c.mutate([{ op: "deletePage", page: pg.id }, ...headerLinks(c.p, (l) => l.filter((x) => x.href !== `/${pg.slug}`))], `Deleted page “${pg.title}”`);
  };
  return adding ? (
    <>
      <div className="pg-head">Add a page</div>
      {PAGE_KINDS.map((k) => <button key={k.id} type="button" role="menuitem" className="pg-kind" onClick={() => add(k.id, k.title)}><b>{k.title}</b><span>{k.note}</span></button>)}
      <button type="button" className="pg-back" onClick={() => setAdding(false)}>← Back</button>
    </>
  ) : (
    <>
      <button type="button" role="menuitem" className="pg-row" aria-current={!c.page ? "page" : undefined} onClick={() => { c.goPage(null); close?.(); }}><b>Home</b><span>/</span></button>
      {pages.map((pg) => (
        <div key={pg.id} className="pg-row" aria-current={c.page?.id === pg.id ? "page" : undefined}>
          {ren?.id === pg.id ? (
            <form className="pg-ren" onSubmit={(e) => { e.preventDefault(); rename(pg, ren.title); }}><input autoFocus value={ren.title} onChange={(e) => setRen({ id: pg.id, title: e.target.value })} onBlur={() => rename(pg, ren.title)} aria-label="Page name" /></form>
          ) : del === pg.id ? (
            <><span className="pg-ask">Delete this page and its menu link?</span><button type="button" className="pg-yes" onClick={() => remove(pg)}>Delete</button><button type="button" className="pg-act" aria-label="Keep the page" onClick={() => setDel(null)}>×</button></>
          ) : (
            <>
              <button type="button" role="menuitem" onClick={() => { c.goPage(pg.slug); close?.(); }}><b>{pg.title}</b><span>/{pg.slug}</span></button>
              <button type="button" className="pg-act" title="Rename" aria-label={`Rename ${pg.title}`} onClick={() => setRen({ id: pg.id, title: pg.title })}>✎</button>
              <button type="button" className="pg-act" title="Delete" aria-label={`Delete ${pg.title}`} onClick={() => setDel(pg.id)}>×</button>
            </>
          )}
        </div>
      ))}
      <button type="button" className="pg-add" onClick={() => setAdding(true)}>+ Add a page</button>
      <p className="pg-note">The menu bar and footer are the same on every page. Publish puts all pages live.</p>
    </>
  );
}

function PagesMenu() {
  const c = useContext(EditorCtx)!;
  const [open, setOpen] = useState(false);
  return (
    <div className="pg-menu">
      <button type="button" className="btn btn-sm pg-cur" style={{ height: 34 }} aria-expanded={open} onClick={() => setOpen(!open)}>
        <small>Page</small>{c.page?.title ?? "Home"}<i aria-hidden>▾</i>
      </button>
      {open ? <div className="pg-pop rise" role="menu"><PagesList close={() => setOpen(false)} /></div> : null}
    </div>
  );
}

/** the "Pages" panel in Puck's left rail */
function PagesPanel() {
  return (
    <div className="pg-panel" role="menu" aria-label="Pages">
      <PagesList />
    </div>
  );
}
const pagesIcon = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 3h9l3 3v12H8z" /><path d="M4 7v14h11" /></svg>;
// Puck lists its own panels first; a plugin given again moves to the end, so this reads: Layers, Pages, Blocks
const PLUGINS = [outlinePlugin({ label: "Layers" }), { name: "pages", label: "Pages", icon: pagesIcon, render: PagesPanel }, blocksPlugin()];

function HeaderActions({ children }: { children: React.ReactNode }) {
  const c = useContext(EditorCtx)!;
  return (
    <>
      <Link className="btn btn-sm editor-home" style={{ height: 34, width: 34, padding: 0, justifyContent: "center" }} href="/" onClick={c.flush} title="Back to the home page" aria-label="Home"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /></svg></Link>
      {flag("history") ? <UndoRedo projectId={c.id} before={c.flush} after={c.reload} /> : null}
      <PagesMenu />
      <VersionGallery projectId={c.id} />
      <ViewSwitch />
      <span style={{ fontSize: 12, color: "var(--muted)", marginRight: 4 }} role="status">{c.saved === "saving" ? "Saving …" : "Saved"}</span>
      {c.langs.length > 1 ? (
        <div className="st-seg" role="group" aria-label="Language being edited" style={{ height: 34 }}>
          {c.langs.map((l) => <button key={l} aria-pressed={l === c.cur} onClick={() => c.switchLang(l)}>{LANG_NAME[l] ?? l}</button>)}
        </div>
      ) : null}
      <Link className="btn btn-sm" style={{ height: 34 }} href={`/p/${c.id}`} onClick={c.flush}>Project</Link>
      <a className="btn btn-sm" style={{ height: 34 }} href={`/site/${c.id}${c.page ? `/${c.page.slug}` : ""}?${c.qs}`} target="_blank">Preview</a>
      <button className="btn btn-sm" style={{ height: 34 }} aria-expanded={c.settings} onClick={() => { c.setSettings(!c.settings); c.setHistory(false); }}>Site settings</button>
      {flag("history") ? <button className="btn btn-sm" style={{ height: 34 }} aria-expanded={c.history} onClick={() => { c.setHistory(!c.history); c.setSettings(false); }}>History</button> : null}
      {c.settings ? <SettingsDrawer project={c.p} onClose={() => c.setSettings(false)} /> : null}
      {c.history ? <HistoryPanel projectId={c.id} before={c.flush} after={c.reload} onClose={() => c.setHistory(false)} /> : null}
      <PascalDock />
      {children}
    </>
  );
}
// "Label||help" → label with an (i) tooltip
function FieldLabel({ children, label, icon, el, className }: { children?: React.ReactNode; label: string; icon?: React.ReactNode; el?: "label" | "div"; className?: string }) {
  const [text, tip] = String(label ?? "").split("||");
  const El = el ?? "label";
  return (
    <El className={`pk-field ${className ?? ""}`}>
      <div className="pk-label">{icon ? <span className="pk-icon">{icon}</span> : null}<span>{text}</span>{tip ? <Tip text={tip} /> : null}</div>
      {children}
    </El>
  );
}
function DrawerItem({ children, name }: { children: React.ReactNode; name: string }) {
  const c = useContext(EditorCtx)!;
  return <BlockItem name={name} projectId={c.id}>{children}</BlockItem>;
}
/** every text and long-text field gets the small Pascal menu underneath (links and addresses do not) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AiText({ children, name, value, onChange }: any) {
  const c = useContext(EditorCtx);
  const { selectedItem } = usePuck();
  const field = String(name ?? "").split(".").pop()!.replace(/\[\d+\]/g, "");
  if (/href|url|link|instagram|linkedin|facebook|video|phone|email|options|placeholder/i.test(field)) return <>{children}</>;
  return <>{children}<TextMenu value={typeof value === "string" ? value : ""} onChange={onChange} block={selectedItem?.type} field={field} project={c?.p} /></>;
}
const OVERRIDES = { headerActions: HeaderActions, fieldLabel: FieldLabel, drawerItem: DrawerItem, actionBar: BlockBar, fieldTypes: { text: AiText, textarea: AiText } };

export default function Editor() {
  const { id } = useParams<{ id: string }>();
  const p = useProject(id);
  const router = useRouter();
  const slug = useSearchParams().get("page");
  const [lang, setLang] = useState<string | null>(null);
  const start = useRef<{ key: string; data: Data } | null>(null);
  const last = useRef<Data | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saved, setSaved] = useState<"saved" | "saving">("saved");
  const [done, setDone] = useState(false);
  const [settings, setSettings] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState(false);
  const loaded = !!p;
  // beginners get the calmer editor: advanced options folded away (set in the profile on /new)
  const profile = useProfile();
  const guided = profile !== undefined && isGuided(profile);
  useEffect(() => { document.body.classList.toggle("ui-guided", guided); return () => document.body.classList.remove("ui-guided"); }, [guided]);
  useEffect(() => { if (id && loaded) autoVersion(id, "Opened the editor"); }, [id, loaded]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (p === undefined) return <Loading />;
  if (p === null) return <div className="p-10">Project not found. <Link className="underline" href="/">Back to projects</Link></div>;

  const langs = [p.locale, ...(p.locales ?? [])].filter((v, i, a) => v && a.indexOf(v) === i);
  const cur = lang && langs.includes(lang) ? lang : p.locale;
  const main = cur === p.locale;
  // further pages exist in the main language; another language edits its own copy of the home page
  const page = main ? findPage(p, slug) ?? null : null;
  const key = `${cur}:${page?.id ?? ""}:${nonce}`;
  // each language edits its own copy; a new language starts as a copy of the main page
  if (!start.current || start.current.key !== key) start.current = { key, data: page ? composePage(p.draft, page.draft) : main ? p.draft : p.drafts?.[cur] ?? (JSON.parse(JSON.stringify(p.draft)) as Data) };
  // every save is an operation: validated, recorded for undo, labelled with what really changed
  const save = (data: Data, l: string, pageId?: string) => {
    const x = getProject(id);
    if (!x) return;
    const ops = pageId
      ? (() => { const s = splitPage(x.draft, data); return [{ op: "replacePageData", data: s.home }, { op: "replacePageData", page: pageId, data: s.own }]; })()
      : [{ op: "replacePageData", lang: l === x.locale ? undefined : l, data }];
    const r = commit(id, ops, takeTag(id) ?? { source: "user" });
    if (!r.ok) setError(r.error);
  };
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    if (last.current) save(last.current, cur, page?.id);
    last.current = null;
    setSaved("saved");
  };
  const switchLang = (l: string) => { flush(); setLang(l); };
  // changes made outside the canvas (pages, menu links): save what is open first, then reload the canvas from the store
  const mutate = (ops: unknown[], label: string) => { flush(); const r = commit(id, ops, { source: "user", label }); if (!r.ok) setError(r.error); setNonce((n) => n + 1); };
  /** after undo, redo or a restore the canvas reloads from the store */
  const reload = () => { flush(); setNonce((n) => n + 1); };
  const goPage = (s: string | null) => { flush(); router.push(`/edit/${id}${s ? `?page=${s}` : ""}`); };
  const qs = `draft=1${main ? "" : `&lang=${cur}`}`;

  return (
    <EditorCtx.Provider value={{ id, p, page, goPage, mutate, saved, langs, cur, qs, switchLang, settings, setSettings, flush, reload, history, setHistory }}>
      <Puck
        key={key}
        config={config}
        data={start.current.data}
        metadata={{ projectId: id, lang: cur, page: page?.slug ?? null }}
        headerTitle={p.name}
        headerPath={(p.published ? "Live" : "Draft") + (langs.length > 1 ? ` · ${LANG_NAME[cur] ?? cur}` : "")}
        onChange={(data) => {
          last.current = data;
          setSaved("saving");
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => { save(data, cur, page?.id); setSaved("saved"); }, 500);
        }}
        onPublish={(data) => {
          if (timer.current) clearTimeout(timer.current);
          last.current = null;
          if (main && !page) syncShare(p, data);
          // one Publish for the whole site: the home page and every further page go live together
          updateProject(id, (x) => {
            if (!main) return x;
            const s = page ? splitPage(x.draft, data) : { home: data, own: null };
            return { ...x, draft: s.home, published: s.home, publishedAt: Date.now(), pages: (x.pages ?? []).map((q) => { const d = page && q.id === page.id && s.own ? s.own : q.draft; return { ...q, draft: d, published: d }; }) };
          });
          updateProject(id, (x) => (main ? x : { ...x, drafts: { ...(x.drafts ?? {}), [cur]: data }, publishedByLocale: { ...(x.publishedByLocale ?? {}), [cur]: data }, publishedAt: Date.now() }));
          saveVersion(id, `Published${main ? "" : ` (${cur})`}`, true);
          setDone(true);
        }}
        overrides={OVERRIDES}
        plugins={PLUGINS}
        viewports={VIEWPORTS}
      />
      {error ? <div className="toast-error" role="alert"><span>Not saved: {error}</span><button className="btn btn-sm btn-ghost" onClick={() => setError(null)} aria-label="Dismiss">×</button></div> : null}
      {done && (
        <div role="dialog" aria-modal aria-label="Published" onClick={() => setDone(false)} style={{ position: "fixed", inset: 0, background: "rgba(28,27,25,0.35)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="panel settle" onClick={(e) => e.stopPropagation()} style={{ width: 520, overflow: "hidden" }}>
            <div style={{ borderBottom: "1px solid var(--line)" }}><SitePreview data={(main ? p.published : p.publishedByLocale?.[cur]) ?? p.draft} projectId={id} accent={p.accent} width={518} height={300} /></div>
            <div style={{ padding: 20 }}>
              <div className="pub-tick" aria-hidden><i /></div>
              <div className="eyebrow">Published{main ? "" : ` · ${LANG_NAME[cur] ?? cur}`}</div>
              <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>{p.name} is live. Well done.</div>
              <div className="tnum" style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>{p.slug}.sitebuilder.ch · in this preview at /site/{id}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <a className="btn btn-primary" href={`/site/${id}${main ? "" : `?lang=${cur}`}`} target="_blank">Open website</a>
                <button className="btn" onClick={() => setDone(false)}>Keep editing</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </EditorCtx.Provider>
  );
}
