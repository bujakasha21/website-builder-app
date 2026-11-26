"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import { useMemo, useState } from "react";
import { uid, updateProject, useProject } from "@/lib/store";
import { fileToDataUrl } from "./blocks";
import { SECTION_DEFAULTS } from "@/lib/section-defaults";

/**
 * Sections for the other kinds of sites Streamnow builds next to residential projects:
 * shopping centres (shops, opening hours, news), booking sites (rooms, desks) and blogs.
 * Visitor input (bookings, sign-ups) is stored on the project like leads; nothing is sent anywhere in this preview.
 */
type P = Record<string, any>;
const T = (label: string) => ({ type: "text" as const, label, contentEditable: true });
const TA = (label: string) => ({ type: "textarea" as const, label, contentEditable: true });
const image = (label: string) => ({
  type: "custom" as const,
  label,
  render: ({ value, onChange }: any) => (
    <div style={{ display: "grid", gap: 6 }}>
      {value ? <img src={value} alt="" style={{ width: "100%", maxHeight: 120, objectFit: "cover", borderRadius: 6 }} /> : null}
      <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) onChange(await fileToDataUrl(f)); }} />
      {value ? <button type="button" className="btn btn-sm" onClick={() => onChange("")}>Remove</button> : null}
    </div>
  ),
});
const useP = (puck: any) => useProject(puck?.metadata?.projectId) ?? null;

// ── blog / news ─────────────────────────────────────────────
function Blog({ title, text, posts, layout }: P) {
  const list: { title: string; date: string; category: string; image: string; excerpt: string; body: string }[] = posts ?? [];
  const cats = [...new Set(list.map((p) => p.category).filter(Boolean))];
  const [cat, setCat] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const shown = list.map((p, i) => ({ ...p, i })).filter((p) => !cat || p.category === cat);
  const post = open !== null ? list[open] : null;
  return (
    <section id="news" className="blog">
      <div className="wrap">
        <h2>{title}</h2>
        {text ? <p className="s-lead" style={{ marginBottom: 24 }}>{text}</p> : null}
        {cats.length > 1 ? (
          <div className="chips" role="group" aria-label="Filter by category">
            <button type="button" aria-pressed={!cat} onClick={() => setCat("")}>All</button>
            {cats.map((c) => <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
          </div>
        ) : null}
        <div className={`blog-grid bl-${layout ?? "cards"}`}>
          {shown.map((p) => (
            <article key={p.i} className="blog-card">
              {p.image ? <img className="cover" src={p.image} alt="" /> : <div className="blog-ph" aria-hidden />}
              <div className="blog-body">
                <div className="s-eyebrow">{[p.category, p.date].filter(Boolean).join(" · ")}</div>
                <h3>{p.title}</h3>
                <p>{p.excerpt}</p>
                {p.body ? <button type="button" className="blog-more" onClick={() => setOpen(p.i)}>Read more →</button> : null}
              </div>
            </article>
          ))}
        </div>
        {!list.length ? <div className="note">No posts yet. Add the first one in the editor.</div> : null}
      </div>
      {post ? (
        <div className="s-modal" role="dialog" aria-modal aria-label={post.title} onClick={() => setOpen(null)}>
          <div className="s-modal-box blog-post" onClick={(e) => e.stopPropagation()}>
            <div className="s-modal-body">
              <button className="s-modal-x" onClick={() => setOpen(null)} aria-label="Close">×</button>
              <div className="s-eyebrow">{[post.category, post.date].filter(Boolean).join(" · ")}</div>
              <h2>{post.title}</h2>
              {post.image ? <img className="cover" src={post.image} alt="" style={{ margin: "16px 0", borderRadius: "var(--r-img, 4px)" }} /> : null}
              {post.body.split(/\n{2,}/).map((para, k) => <p key={k} style={{ marginTop: 12 }}>{para}</p>)}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ── booking system (rooms, desks, services) ─────────────────
const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const toMin = (t: string) => { const [h, m] = String(t || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
function openDays(now: number, ahead: number, days: string) {
  const out: Date[] = [];
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  for (let i = 0; out.length < ahead && i < ahead * 3; i++) {
    const d = new Date(d0.getTime() + i * DAY);
    const wd = d.getDay();
    if (days === "mon-fri" && (wd === 0 || wd === 6)) continue;
    if (days === "mon-sat" && wd === 0) continue;
    out.push(d);
  }
  return out;
}
function Booking({ title, text, resources, openFrom, openTo, slotMinutes, daysAhead, days, puck }: P) {
  const p = useP(puck);
  const res: { name: string; note: string; price: string }[] = (resources ?? []).filter((r: any) => r?.name);
  const [r, setR] = useState(0);
  // the clock is read once when the section opens, not on every render
  const [now] = useState(() => Date.now());
  const dates = useMemo(() => openDays(now, Number(daysAhead) || 10, days ?? "mon-fri"), [now, daysAhead, days]);
  const [day, setDay] = useState(0);
  const [slot, setSlot] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const step = Math.max(15, Number(slotMinutes) || 60);
  const d = dates[Math.min(day, dates.length - 1)];
  const slots: string[] = [];
  if (d) for (let m = toMin(openFrom ?? "08:00"); m + step <= toMin(openTo ?? "18:00"); m += step) {
    const t = new Date(d); t.setHours(Math.floor(m / 60), m % 60, 0, 0);
    if (t.getTime() > now) slots.push(t.toISOString());
  }
  const resource = res[Math.min(r, res.length - 1)]?.name ?? "";
  const taken = new Set((p?.bookings ?? []).filter((b) => b.resource === resource).map((b) => b.start));
  const book = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!p || !slot) return;
    const f = new FormData(e.currentTarget);
    if (taken.has(slot)) return setDone("Sorry, someone just booked this time. Please pick another.");
    if (!puck?.isEditing) updateProject(p.id, (x) => ({ ...x, bookings: [...x.bookings, { id: uid(), slotId: `resource:${resource}@${slot}`, resource, start: slot, durationMin: step, at: Date.now(), name: String(f.get("name")), email: String(f.get("email")) }] }));
    const t = new Date(slot);
    setDone(`Booked: ${resource}, ${t.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} at ${pad(t.getHours())}:${pad(t.getMinutes())}. A confirmation follows by e-mail.`);
    setSlot(null);
  };
  return (
    <section id="booking" className="booking">
      <div className="wrap">
        <h2>{title}</h2>
        {text ? <p className="s-lead" style={{ marginBottom: 24 }}>{text}</p> : null}
        {!res.length ? <div className="note">Add rooms, desks or services in the editor to open bookings.</div> : (
          <div className="bk">
            <div className="bk-res" role="radiogroup" aria-label="What to book">
              {res.map((x, k) => (
                <button key={k} type="button" role="radio" aria-checked={k === r} className="bk-res-item" onClick={() => { setR(k); setSlot(null); setDone(null); }}>
                  <b>{x.name}</b>{x.note ? <span>{x.note}</span> : null}{x.price ? <span className="tnum">{x.price}</span> : null}
                </button>
              ))}
            </div>
            <div className="bk-cal">
              <div className="bk-days" role="radiogroup" aria-label="Day">
                {dates.map((x, k) => (
                  <button key={k} type="button" role="radio" aria-checked={k === day} onClick={() => { setDay(k); setSlot(null); setDone(null); }}>
                    <small>{x.toLocaleDateString("en-GB", { weekday: "short" })}</small><b className="tnum">{x.getDate()}</b><small>{x.toLocaleDateString("en-GB", { month: "short" })}</small>
                  </button>
                ))}
              </div>
              <div className="bk-slots" role="radiogroup" aria-label="Time">
                {slots.length ? slots.map((s) => {
                  const t = new Date(s);
                  const busy = taken.has(s);
                  return <button key={s} type="button" role="radio" aria-checked={slot === s} disabled={busy} onClick={() => { setSlot(s); setDone(null); }} className="tnum">{pad(t.getHours())}:{pad(t.getMinutes())}{busy ? <small>booked</small> : null}</button>;
                }) : <p className="bk-empty">No free times left on this day.</p>}
              </div>
              {done ? <div className="note" role="status">{done}</div> : null}
              {slot ? (
                <form className="form bk-form" onSubmit={book}>
                  <input type="text" name="name" placeholder="Name" required aria-label="Name" />
                  <input type="email" name="email" placeholder="Email" required aria-label="Email" />
                  <button className="s-btn" type="submit">Book {new Date(slot).getHours()}:{pad(new Date(slot).getMinutes())}</button>
                </form>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── shop directory ──────────────────────────────────────────
function Shops({ title, text, shops }: P) {
  const list: { name: string; category: string; floor: string; hours: string; logo: string; href: string }[] = (shops ?? []).filter((s: any) => s?.name);
  const cats = [...new Set(list.map((s) => s.category).filter(Boolean))].sort();
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const shown = list.filter((s) => (!cat || s.category === cat) && (!q || s.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <section id="shops" className="shops">
      <div className="wrap">
        <h2>{title}</h2>
        {text ? <p className="s-lead" style={{ marginBottom: 24 }}>{text}</p> : null}
        <div className="shops-bar">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search shops" aria-label="Search shops" />
          <div className="chips" role="group" aria-label="Filter by category">
            <button type="button" aria-pressed={!cat} onClick={() => setCat("")}>All <small className="tnum">{list.length}</small></button>
            {cats.map((c) => <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
          </div>
        </div>
        <ul className="shops-grid">
          {shown.map((s, k) => (
            <li key={k}>
              {s.logo ? <img src={s.logo} alt="" className="shop-logo" /> : <span className="shop-logo ph" aria-hidden>{s.name.slice(0, 1)}</span>}
              <div><b>{s.href ? <a href={s.href}>{s.name}</a> : s.name}</b><small>{[s.category, s.floor].filter(Boolean).join(" · ")}</small>{s.hours ? <small className="tnum">{s.hours}</small> : null}</div>
            </li>
          ))}
        </ul>
        {!shown.length ? <p className="bk-empty">No shop matches.</p> : null}
      </div>
    </section>
  );
}

// ── opening hours ───────────────────────────────────────────
function Hours({ title, rows, note }: P) {
  const list: { days: string; time: string }[] = rows ?? [];
  return (
    <section id="hours" className="hours">
      <div className="wrap">
        <h2>{title}</h2>
        <dl className="hours-list">{list.map((r, k) => <div key={k}><dt>{r.days}</dt><dd className="tnum">{r.time}</dd></div>)}</dl>
        {note ? <p className="hours-note">{note}</p> : null}
      </div>
    </section>
  );
}

// ── testimonials ────────────────────────────────────────────
function Testimonials({ title, items }: P) {
  const list: { quote: string; name: string; role: string }[] = (items ?? []).filter((i: any) => i?.quote);
  return (
    <section id="testimonials" className="reviews">
      <div className="wrap">
        <h2>{title}</h2>
        <div className="reviews-grid">{list.map((i, k) => <figure key={k}><blockquote>“{i.quote}”</blockquote><figcaption><b>{i.name}</b>{i.role ? <span>{i.role}</span> : null}</figcaption></figure>)}</div>
      </div>
    </section>
  );
}

// ── newsletter ──────────────────────────────────────────────
function Newsletter({ title, text, button, privacyLabel, puck }: P) {
  const p = useP(puck);
  const [sent, setSent] = useState(false);
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (p && !puck?.isEditing) updateProject(p.id, (x) => ({ ...x, leads: [{ id: uid(), at: Date.now(), name: "", email: String(f.get("email")), interests: ["Newsletter"] }, ...x.leads] }));
    setSent(true);
  };
  return (
    <section id="newsletter" className="newsletter">
      <div className="wrap nl">
        <div><h2>{title}</h2>{text ? <p className="s-lead">{text}</p> : null}</div>
        {sent ? <div className="note" role="status">Thank you. Please confirm the e-mail we just sent you.</div> : (
          <form className="nl-form" onSubmit={submit}>
            <div className="nl-row"><input type="email" name="email" placeholder="Your e-mail" required aria-label="E-mail" /><button className="s-btn" type="submit">{button}</button></div>
            <label className="check"><input type="checkbox" required /><span>{privacyLabel}</span></label>
          </form>
        )}
      </div>
    </section>
  );
}

const arr = (label: string, fields: Record<string, unknown>, summary: (i: any) => string, item: Record<string, unknown>) => ({ type: "array" as const, label, arrayFields: fields, getItemSummary: summary, defaultItemProps: item });

/** registered in config.tsx next to the other blocks */
export const MORE_COMPONENTS = {
  Blog: {
    label: "Blog / news",
    fields: {
      title: T("Title"), text: TA("Intro"),
      layout: { type: "radio", label: "Layout", options: [{ label: "Cards", value: "cards" }, { label: "List", value: "list" }] },
      posts: arr("Posts", { title: { type: "text", label: "Title" }, date: { type: "text", label: "Date" }, category: { type: "text", label: "Category" }, image: image("Picture"), excerpt: { type: "textarea", label: "Teaser" }, body: { type: "textarea", label: "Full text" } }, (i) => i.title || "Post", { title: "New post", date: "", category: "News", image: "", excerpt: "", body: "" }),
    },
    defaultProps: SECTION_DEFAULTS.Blog,
    render: Blog,
  },
  Booking: {
    label: "Booking system",
    fields: {
      title: T("Title"), text: TA("Text"),
      resources: arr("What can be booked", { name: { type: "text", label: "Name" }, note: { type: "text", label: "Short note" }, price: { type: "text", label: "Price" } }, (i) => i.name || "Item", { name: "Meeting room", note: "Up to 8 people", price: "CHF 40 / hour" }),
      openFrom: { type: "text", label: "Open from (HH:MM)" }, openTo: { type: "text", label: "Open until (HH:MM)" },
      slotMinutes: { type: "select", label: "Booking length", options: [{ label: "30 minutes", value: 30 }, { label: "1 hour", value: 60 }, { label: "2 hours", value: 120 }, { label: "Half day (4 h)", value: 240 }] },
      days: { type: "radio", label: "Open on", options: [{ label: "Mon–Fri", value: "mon-fri" }, { label: "Mon–Sat", value: "mon-sat" }, { label: "Every day", value: "all" }] },
      daysAhead: { type: "number", label: "Days bookable ahead", min: 1, max: 60 },
    },
    defaultProps: SECTION_DEFAULTS.Booking,
    render: Booking,
  },
  Shops: {
    label: "Shop directory",
    fields: {
      title: T("Title"), text: TA("Text"),
      shops: arr("Shops", { name: { type: "text", label: "Name" }, category: { type: "text", label: "Category" }, floor: { type: "text", label: "Floor" }, hours: { type: "text", label: "Opening hours (if different)" }, logo: image("Logo"), href: { type: "text", label: "Link" } }, (i) => i.name || "Shop", { name: "New shop", category: "Fashion", floor: "Ground floor", hours: "", logo: "", href: "" }),
    },
    defaultProps: SECTION_DEFAULTS.Shops,
    render: Shops,
  },
  Hours: {
    label: "Opening hours",
    fields: { title: T("Title"), rows: arr("Rows", { days: { type: "text", label: "Days" }, time: { type: "text", label: "Time" } }, (i) => i.days || "Row", { days: "Mon–Fri", time: "09:00–19:00" }), note: TA("Note (holidays, exceptions)") },
    defaultProps: SECTION_DEFAULTS.Hours,
    render: Hours,
  },
  Testimonials: {
    label: "Testimonials",
    fields: { title: T("Title"), items: arr("Quotes", { quote: { type: "textarea", label: "Quote" }, name: { type: "text", label: "Name" }, role: { type: "text", label: "Role" } }, (i) => i.name || "Quote", { quote: "", name: "", role: "" }) },
    defaultProps: SECTION_DEFAULTS.Testimonials,
    render: Testimonials,
  },
  Newsletter: {
    label: "Newsletter",
    fields: { title: T("Title"), text: TA("Text"), button: { type: "text", label: "Button" }, privacyLabel: { type: "text", label: "Privacy consent text" } },
    defaultProps: SECTION_DEFAULTS.Newsletter,
    render: Newsletter,
  },
};
