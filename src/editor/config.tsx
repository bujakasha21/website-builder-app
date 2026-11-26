"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import type { Config } from "@puckeditor/core";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import Plan2D from "@/components/plan/Plan2D";
import { uid, updateProject, useProject } from "@/lib/store";
import { chf } from "@/lib/templates";
import { STATUS_COLOR, STATUS_LABEL, type Project } from "@/lib/types";
import { ADV_VARIANTS, Advantages, fileToDataUrl, Gallery, GALLERY_VARIANTS, GalleryField, Header, Hero, HERO_VARIANTS, ICON_OPTIONS, Location, MAP_VARIANTS, TextImage, TI_VARIANTS } from "./blocks";
import { Embed, Faq, Footer, LegalPage, TRAVEL_MODES, useLegalHref } from "./extras";
import { registerConfig, variantField } from "./VariantField";
import { DEFAULTS, sizeVars } from "./settings";
import SiteRoot from "./SiteRoot";
import { configureDoc } from "@/doc/commit";
import { MORE_COMPONENTS } from "./more";
import { FINDER_VARIANTS, UnitFinder, UnitPage } from "./UnitFinder";

/** shortcut from the block to the page where apartments, columns and the apply button are managed */
function ManageUnits() {
  const id = typeof window !== "undefined" ? window.location.pathname.split("/").pop() : "";
  return (
    <div className="manage-units">
      <span>Prices, PDFs, table columns and the apply button are managed on one page.</span>
      <a className="btn btn-sm" href={`/p/${id}/units`} target="_blank" rel="noreferrer">Edit apartments →</a>
    </div>
  );
}

const Plan3D = dynamic(() => import("@/components/plan/Plan3D"), { ssr: false });

type P = Record<string, any>;
const useP = (puck: any): Project | null => useProject(puck?.metadata?.projectId) ?? null;

// ── custom fields ────────────────────────────────────────────────
const imageField = (label: string) => ({
  type: "custom" as const,
  label,
  render: ({ value, onChange }: any) => (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
      {value ? <img src={value} alt="" style={{ width: "100%", borderRadius: 4, border: "1px solid #e2ded7" }} /> : null}
      <div style={{ display: "flex", gap: 8 }}>
        <label className="btn btn-sm" style={{ cursor: "pointer" }}>
          {value ? "Replace" : "Upload image"}
          <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) onChange(await fileToDataUrl(f)); }} />
        </label>
        {value ? <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange("")}>Remove</button> : null}
      </div>
    </div>
  ),
});

/** a document the visitor can download: upload it, or paste a link instead */
const fileField = {
  type: "custom" as const,
  label: "File",
  render: ({ value, onChange }: any) => (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>File</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label className="btn btn-sm" style={{ cursor: "pointer" }}>
          {value?.data ? "Replace file" : "Upload PDF"}
          <input type="file" accept="application/pdf,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => onChange({ data: String(r.result), name: f.name }); r.readAsDataURL(f); e.target.value = ""; }} />
        </label>
        {value?.data ? <><span style={{ fontSize: 12, color: "#6b665f", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150, whiteSpace: "nowrap" }}>{value.name}</span><button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange(null)}>Remove</button></> : null}
      </div>
    </div>
  ),
};

const planField = {
  type: "custom" as const,
  label: "Floor plan",
  render: function PlanField({ value, onChange }: any) {
    const { id } = useParams<{ id: string }>();
    const p = useProject(id);
    return (
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Floor plan</div>
        <select className="select" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">– select –</option>
          {p?.floorPlans.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <a href={`/p/${id}/plans`} style={{ fontSize: 12, color: "var(--accent)" }}>Upload a PDF and confirm rooms</a>
      </div>
    );
  },
};

function Img({ src, label, className }: { src?: string; label: string; className?: string }) {
  return src ? <img className={`cover ${className ?? ""}`} src={src} alt={label} /> : <div className={`ph ${className ?? ""}`} style={{ height: "100%" }}>{label}</div>;
}

// ── blocks ───────────────────────────────────────────────────────
function UnitList({ title, showFilters, puck }: P) {
  const p = useP(puck);
  const [rooms, setRooms] = useState<number | null>(null);
  const [onlyFree, setOnlyFree] = useState(false);
  const units = p?.units ?? [];
  const roomOpts = useMemo(() => [...new Set(units.map((u) => u.rooms))].sort((a, b) => a - b), [units]);
  const list = units.filter((u) => (rooms === null || u.rooms === rooms) && (!onlyFree || u.status === "available"));
  return (
    <section id="units">
      <div className="wrap">
        <h2>{title}</h2>
        {showFilters === "yes" && units.length > 0 && (
          <div className="filters" role="group" aria-label="Filter">
            <button className="chip" aria-pressed={rooms === null} onClick={() => setRooms(null)}>All</button>
            {roomOpts.map((r) => <button key={r} className="chip" aria-pressed={rooms === r} onClick={() => setRooms(r)}>{r} rooms</button>)}
            <span style={{ width: 12 }} />
            <button className="chip" aria-pressed={onlyFree} onClick={() => setOnlyFree(!onlyFree)}>Available only</button>
            <span style={{ marginLeft: "auto", fontSize: 13, color: "#6b665f" }} className="tnum">{list.length} of {units.length}</span>
          </div>
        )}
        {units.length === 0 ? (
          <div className="note">No apartments yet. Import them in the dashboard under “Units”.</div>
        ) : (
          <table className="units">
            <thead><tr><th>No.</th><th>Rooms</th><th className="hide-sm">Floor</th><th className="num">Area</th><th className="num">{p?.type === "sale" ? "Price" : "Rent / mo."}</th><th>Status</th></tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className={u.status === "available" ? "" : "off"}>
                  <td>{u.ref}</td><td>{u.rooms}</td><td className="hide-sm">{u.floor === 0 ? "Ground" : `Floor ${u.floor}`}</td>
                  <td className="num">{u.areaM2} m²</td><td className="num">{chf(u.price)}</td>
                  <td><span className="status"><i style={{ background: STATUS_COLOR[u.status] }} />{STATUS_LABEL[u.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function FloorPlanBlock({ title, planId, view, puck }: P) {
  const p = useP(puck);
  const plan = p?.floorPlans.find((f) => f.id === planId) ?? p?.floorPlans[0];
  const [mode, setMode] = useState<"2d" | "3d">(view === "3d" ? "3d" : "2d");
  const [sel, setSel] = useState<string | null>(null);
  const rooms = plan?.rooms.filter((r) => r.confirmed) ?? [];
  const total = rooms.reduce((s, r) => s + r.areaM2, 0);
  return (
    <section id="floor-plan">
      <div className="wrap">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <h2>{title}</h2>
          {plan && (
            <div className="seg" role="group" aria-label="View">
              <button aria-pressed={mode === "2d"} onClick={() => setMode("2d")}>2D</button>
              <button aria-pressed={mode === "3d"} onClick={() => setMode("3d")}>3D</button>
            </div>
          )}
        </div>
        {!plan ? (
          <div className="note">No floor plan yet. Upload a PDF in the dashboard under “Floor plans” – the 2D and 3D views are generated from it.</div>
        ) : rooms.length === 0 ? (
          <div className="note">No rooms are confirmed for “{plan.name}” yet. Only confirmed rooms are published.</div>
        ) : (
          <div className="plan">
            <div className="stage">
              {mode === "2d" ? <Plan2D plan={plan} onlyConfirmed selected={sel} onSelect={setSel} /> : <Plan3D plan={plan} onlyConfirmed selected={sel} onSelect={setSel} accent={p?.accent} />}
            </div>
            <div className="side">
              <div className="s-eyebrow">{plan.name}</div>
              <ul>
                {rooms.map((r) => (
                  <li key={r.id} aria-current={sel === r.id} onClick={() => setSel(r.id)} onMouseEnter={() => setSel(r.id)}>
                    <span>{r.name}</span><span>{r.areaM2.toFixed(1)} m²</span>
                  </li>
                ))}
                <li style={{ fontWeight: 600, cursor: "default", borderBottom: 0 }}><span>Total</span><span>{total.toFixed(1)} m²</span></li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

interface FormField { label: string; type: string; placeholder?: string; required?: string; width?: string; options?: string }
export const DEFAULT_FIELDS: FormField[] = [
  { label: "Salutation", type: "select", placeholder: "", required: "no", width: "half", options: "Ms, Mr" },
  { label: "Company", type: "text", placeholder: "Optional", required: "no", width: "half" },
  { label: "First name", type: "text", placeholder: "", required: "yes", width: "half" },
  { label: "Last name", type: "text", placeholder: "", required: "yes", width: "half" },
  { label: "Email", type: "email", placeholder: "", required: "yes", width: "half" },
  { label: "Phone", type: "tel", placeholder: "", required: "no", width: "half" },
  { label: "Apartment", type: "apartment", placeholder: "", required: "no", width: "half" },
  { label: "Message", type: "textarea", placeholder: "", required: "no", width: "full" },
];
/** shown when the owner leaves the placeholder empty */
function defaultPlaceholder(f: FormField) {
  if (f.type === "email") return "name@example.ch";
  if (f.type === "tel") return "+41 79 123 45 67";
  if (f.type === "apartment") return "No preference";
  if (f.type === "select") return "Please choose";
  if (f.type === "textarea") return "How can we help?";
  if (f.type === "date") return "";
  if (/first/i.test(f.label)) return "First name";
  if (/last|surname/i.test(f.label)) return "Last name";
  if (/name/i.test(f.label)) return "First and last name";
  return f.label ? `Your ${f.label.toLowerCase()}` : "";
}
/** a lead needs name, email, phone and message; anything else the owner added goes into the message */
function leadFrom(fields: FormField[], f: FormData) {
  const out = { name: "", email: "", phone: "", message: "" };
  const extra: string[] = [];
  fields.forEach((fd, k) => {
    if (fd.type === "apartment") return;
    const v = String(f.get(`f${k}`) || "").trim();
    if (!v) return;
    if (fd.type === "email" && !out.email) out.email = v;
    else if (fd.type === "tel" && !out.phone) out.phone = v;
    else if (fd.type === "textarea" && !out.message) out.message = v;
    else if (fd.type === "text" && /name/i.test(fd.label)) out.name = [out.name, v].filter(Boolean).join(" ");
    else extra.push(`${fd.label}: ${v}`);
  });
  if (!out.name) { const i = extra.findIndex(() => true); if (i >= 0) out.name = extra.splice(i, 1)[0].replace(/^[^:]*: /, ""); }
  if (extra.length) out.message = [out.message, ...extra].filter(Boolean).join("\n");
  return out;
}

function ContactForm({ title, text, interests, privacyLabel, privacyHref, columns, presetUnit, fields, submitLabel, newsletter, newsletterLabel, puck }: P) {
  const p = useP(puck);
  const legal = useLegalHref(puck);
  const formFields: FormField[] = Array.isArray(fields) && fields.length ? fields : DEFAULT_FIELDS;
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");
  const [picked, setPicked] = useState<string | null>(null);
  // "Apply" in the apartment table preselects the unit here
  useEffect(() => {
    const on = (e: Event) => { setPicked(String((e as CustomEvent).detail ?? "")); setState("idle"); };
    window.addEventListener("sb-apply", on);
    return () => window.removeEventListener("sb-apply", on);
  }, []);
  presetUnit = picked ?? presetUnit;
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("website")) return; // honeypot
    if (!f.get("privacy")) return setState("err");
    if (!puck?.isEditing && p) {
      updateProject(p.id, (x) => ({
        ...x,
        leads: [{ id: uid(), at: Date.now(), ...leadFrom(formFields, f), unitRef: String(f.get("unit") || ""), interests: f.getAll("interest").map(String) }, ...x.leads],
      }));
    }
    setState("ok");
    e.currentTarget.reset();
  };
  return (
    <section id="contact">
      <div className="wrap">
        <h2>{title}</h2>
        <p style={{ marginBottom: 24, color: "#45413b" }}>{text}</p>
        {state === "ok" ? (
          <div className="note" role="status">Thank you. We have received your enquiry.</div>
        ) : (
          <form className={`form ${columns === "1" ? "one" : ""}`} onSubmit={submit} noValidate={false}>
            {formFields.map((fd, k) => {
              const ph = fd.placeholder?.trim() || defaultPlaceholder(fd);
              const name = `f${k}`;
              return (
                <div key={k} className={fd.type === "textarea" || fd.width === "full" ? "full" : ""}>
                  <label>{fd.label}{fd.required === "yes" ? <span aria-hidden style={{ color: "var(--accent)" }}> *</span> : null}
                    {fd.type === "apartment" ? (
                      <select name="unit" defaultValue={presetUnit ?? ""} key={presetUnit ?? "none"} required={fd.required === "yes"}>
                        <option value="">{ph}</option>
                        {p?.units.filter((u) => u.status === "available" || u.ref === presetUnit).map((u) => <option key={u.id} value={u.ref}>{u.ref} · {u.rooms} rooms · {u.areaM2} m²</option>)}
                      </select>
                    ) : fd.type === "select" ? (
                      <select name={name} defaultValue="" required={fd.required === "yes"}>
                        <option value="">{ph}</option>
                        {String(fd.options ?? "").split(/[,\n]/).map((o) => o.trim()).filter(Boolean).map((o) => <option key={o}>{o}</option>)}
                      </select>
                    ) : fd.type === "textarea" ? <textarea name={name} placeholder={ph} required={fd.required === "yes"} />
                      : <input type={fd.type === "email" ? "email" : fd.type === "tel" ? "tel" : fd.type === "date" ? "date" : "text"} name={name} placeholder={ph} required={fd.required === "yes"} autoComplete={fd.type === "email" ? "email" : fd.type === "tel" ? "tel" : /name/i.test(fd.label) ? "name" : "off"} />}
                  </label>
                </div>
              );
            })}
            {(interests ?? []).map((i: any, k: number) => (
              <label key={k} className="check full"><input type="checkbox" name="interest" value={i.label} />{i.label}</label>
            ))}
            {newsletter === "yes" ? <label className="check full"><input type="checkbox" name="interest" value="Newsletter" />{newsletterLabel || "Keep me posted about this project by email."}</label> : null}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" style={{ position: "absolute", left: -9999 }} aria-hidden />
            <label className="check full">
              <input type="checkbox" name="privacy" required />
              <span>{privacyLabel} <a href={legal(privacyHref, "privacy")} style={{ color: "var(--accent)" }}>Read the policy</a></span>
            </label>
            {state === "err" && <div className="note err full" role="alert">Please accept the privacy policy.</div>}
            <div className="full"><button className="s-btn" type="submit">{submitLabel || "Send enquiry"}</button></div>
          </form>
        )}
      </div>
    </section>
  );
}

function Waitlist({ title, text, privacyLabel, privacyHref, puck }: P) {
  const p = useP(puck);
  const legal = useLegalHref(puck);
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");
  const sizes = useMemo(() => [...new Set((p?.units ?? []).filter((u) => (u.use ?? "apartment") === "apartment" && u.rooms).map((u) => u.rooms))].sort((a, b) => a - b), [p?.units]);
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("website")) return; // honeypot
    if (!f.get("privacy")) return setState("err");
    if (!puck?.isEditing && p)
      updateProject(p.id, (x) => ({ ...x, waitlist: [{ id: uid(), at: Date.now(), name: String(f.get("name")), email: String(f.get("email")), phone: String(f.get("phone") || ""), rooms: f.getAll("rooms").map(String), note: String(f.get("note") || "") }, ...(x.waitlist ?? [])] }));
    setState("ok");
    e.currentTarget.reset();
  };
  return (
    <section id="waitlist">
      <div className="wrap">
        <div className="waitlist">
          <div>
            <h2>{title}</h2>
            <p style={{ color: "#45413b" }}>{text}</p>
          </div>
          {state === "ok" ? <div className="note" role="status">Thank you. You are on the waiting list and will hear from us as soon as a matching apartment becomes available.</div> : (
            <form className="form" onSubmit={submit}>
              <div><label>Name<input type="text" name="name" required autoComplete="name" /></label></div>
              <div><label>Email<input type="email" name="email" required autoComplete="email" /></label></div>
              <div className="full"><label>Phone<input type="tel" name="phone" autoComplete="tel" /></label></div>
              {sizes.length ? (
                <fieldset className="full" style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend style={{ fontSize: 13, color: "#45413b", marginBottom: 8 }}>I am interested in</legend>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {sizes.map((r) => <label key={r} className="pill"><input type="checkbox" name="rooms" value={`${r} rooms`} /><span>{r} rooms</span></label>)}
                  </div>
                </fieldset>
              ) : null}
              <div className="full"><label>Note (move-in date, budget …)<textarea name="note" style={{ height: 80 }} /></label></div>
              <input type="text" name="website" tabIndex={-1} autoComplete="off" style={{ position: "absolute", left: -9999 }} aria-hidden />
              <label className="check full"><input type="checkbox" name="privacy" required /><span>{privacyLabel} <a href={legal(privacyHref, "privacy")} style={{ color: "var(--accent)" }}>Read the policy</a></span></label>
              {state === "err" && <div className="note err full" role="alert">Please accept the privacy policy.</div>}
              <div className="full"><button className="s-btn" type="submit">Join the waiting list</button></div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function Viewing({ title, text, puck }: P) {
  const p = useP(puck);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);
  const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const book = (e: React.FormEvent<HTMLFormElement>, slotId: string) => {
    e.preventDefault();
    if (!p) return;
    const f = new FormData(e.currentTarget);
    const slot = p.slots.find((s) => s.id === slotId)!;
    const taken = p.bookings.filter((b) => b.slotId === slotId).length;
    if (taken >= slot.capacity) return setMsg({ id: slotId, ok: false, text: "This slot is fully booked." });
    if (!puck?.isEditing) updateProject(p.id, (x) => ({ ...x, bookings: [...x.bookings, { id: uid(), slotId, at: Date.now(), name: String(f.get("name")), email: String(f.get("email")) }] }));
    setOpen(null);
    setMsg({ id: slotId, ok: true, text: "Booked. A confirmation will follow by email." });
  };
  return (
    <section id="viewings">
      <div className="wrap">
        <h2>{title}</h2>
        <p style={{ marginBottom: 24, color: "#45413b" }}>{text}</p>
        {!p?.slots.length ? <div className="note">No viewings are scheduled at the moment.</div> : (
          <div className="slots">
            {p.slots.map((s) => {
              const left = s.capacity - p.bookings.filter((b) => b.slotId === s.id).length;
              return (
                <div className="slot" key={s.id}>
                  <div className="s-eyebrow">{s.label}</div>
                  <div className="when">{fmt(s.start)}</div>
                  <div style={{ fontSize: 13, color: "#6b665f" }} className="tnum">{s.durationMin} min · {left > 0 ? `${left} of ${s.capacity} free` : "fully booked"}</div>
                  {msg?.id === s.id && <div className={`note ${msg.ok ? "" : "err"}`} role="status" style={{ marginTop: 8 }}>{msg.text}</div>}
                  {open === s.id ? (
                    <form className="form" style={{ gridTemplateColumns: "1fr", marginTop: 8, gap: 8 }} onSubmit={(e) => book(e, s.id)}>
                      <input type="text" name="name" placeholder="Name" required aria-label="Name" />
                      <input type="email" name="email" placeholder="Email" required aria-label="Email" />
                      <button className="s-btn" type="submit">Confirm booking</button>
                    </form>
                  ) : (
                    <button className="s-btn ghost" style={{ marginTop: 8, alignSelf: "flex-start", height: 40 }} disabled={left <= 0} onClick={() => { setOpen(s.id); setMsg(null); }}>Book this slot</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

const T = (label: string) => ({ type: "text" as const, label, contentEditable: true });
const TA = (label: string) => ({ type: "textarea" as const, label, contentEditable: true });

export const config: Config = {
  categories: {
    content: { title: "Content", components: ["Header", "Hero", "Advantages", "TextImage", "Text", "Facts", "Gallery", "Embed", "Blog", "Testimonials", "Faq", "Downloads"] },
    offer: { title: "Offer", components: ["UnitFinder", "UnitList", "FloorPlanBlock", "Location"] },
    business: { title: "Business", components: ["Booking", "Shops", "Hours", "Newsletter"] },
    contact: { title: "Contact", components: ["ContactForm", "Waitlist", "Viewing", "Contacts", "Footer"] },
    internal: { title: "Internal", components: ["UnitPage", "LegalPage"], visible: false },
    other: { title: "Other", visible: false },
  },
  root: {
    // site-wide options live in the "Site settings" panel of the editor, not in this sidebar
    fields: {},
    defaultProps: DEFAULTS as any,
    render: SiteRoot as any,
  },
  components: {
    ...(MORE_COMPONENTS as any),
    Header: {
      label: "Menu bar",
      fields: {
        links: { type: "array", label: "Links", arrayFields: { label: { type: "text", label: "Label" }, href: { type: "text", label: "Goes to||A section such as #units, or a full web address." } }, getItemSummary: (i: any) => i.label || "Link", defaultItemProps: { label: "Link", href: "#" } },
        cta: { type: "text", label: "Button" }, ctaHref: { type: "text", label: "Button goes to" },
      },
      defaultProps: { links: [{ label: "Project", href: "#project" }, { label: "Apartments", href: "#units" }, { label: "Location", href: "#location" }, { label: "Gallery", href: "#gallery" }], cta: "Contact", ctaHref: "#contact" },
      render: Header as any,
    },
    UnitPage: { label: "Apartment page", fields: {}, defaultProps: { unitId: "" }, render: UnitPage as any },
    LegalPage: { label: "Legal page", fields: {}, defaultProps: { page: "imprint", company: "" }, render: LegalPage as any },
    Embed: {
      label: "Video / 360° tour",
      fields: {
        title: T("Title"), text: TA("Text"),
        url: { type: "text", label: "Link||Paste a YouTube or Vimeo link, or the link of your 360° tour." },
        ratio: { type: "radio", label: "Shape", options: [{ label: "Wide", value: "wide" }, { label: "Classic", value: "classic" }, { label: "Tall", value: "tall" }] },
      },
      defaultProps: { title: "Take a look around", text: "", url: "", ratio: "wide" },
      render: Embed as any,
    },
    Faq: {
      label: "Questions & answers",
      fields: { title: T("Title"), items: { type: "array", label: "Questions", arrayFields: { q: { type: "text", label: "Question" }, a: { type: "textarea", label: "Answer" } }, getItemSummary: (i: any) => i.q || "Question", defaultItemProps: { q: "Your question", a: "" } } },
      defaultProps: { title: "Good to know", items: [
        { q: "How do I apply for an apartment?", a: "Pick the apartment you like in the list and use the apply button next to it. We will get back to you within a few working days." },
        { q: "Can I visit the apartment first?", a: "Yes. Send us a message through the contact form and we will arrange a viewing with you." },
        { q: "Which documents do I need?", a: "Usually a copy of your ID or residence permit, a recent extract from the debt collection register and proof of income." },
      ] },
      render: Faq as any,
    },
    UnitFinder: {
      label: "Apartments",
      fields: { variant: variantField("variant", FINDER_VARIANTS), title: T("Title"), text: TA("Text"), note: { type: "textarea", label: "Footnote" }, manage: { type: "custom", label: "Apartments", render: ManageUnits } as any },
      defaultProps: { variant: "split", title: "Apartments", text: "", note: "" },
      render: UnitFinder as any,
    },
    Hero: {
      label: "Top section",
      fields: {
        variant: variantField("variant", HERO_VARIANTS),
        image: imageField("Image"),
        slides: { type: "custom", label: "Photos", render: ({ value, onChange }: any) => <GalleryField value={value} onChange={onChange} label="Slideshow photos" /> },
        video: { type: "text", label: "Video link||YouTube, Vimeo or a link to an .mp4 file. The image above shows until the video starts." },
        eyebrow: T("Small line above the title"), title: T("Title"), text: TA("Text"),
        cta: { type: "text", label: "Button" }, ctaHref: { type: "text", label: "Button goes to" },
        height: { type: "radio", label: "Height", options: [{ label: "Medium", value: "medium" }, { label: "Large", value: "large" }, { label: "Full screen", value: "full" }] },
        align: { type: "radio", label: "Text position", options: [{ label: "Left", value: "left" }, { label: "Centre", value: "center" }, { label: "Bottom", value: "bottom" }] },
        overlay: { type: "number", label: "Image darkening (%)||Makes text readable on bright photos. 0 = none.", min: 0, max: 90 },
      },
      defaultProps: { variant: "background", eyebrow: "Location", title: "Project name", text: "A short introduction to the project.", cta: "View apartments", ctaHref: "#units", image: "", slides: [], video: "", height: "large", align: "left", overlay: 45 },
      // only show what the chosen version uses
      resolveFields: (data: any, { fields }: any) => { const f = { ...fields }; const v = data.props?.variant; if (v !== "slider") delete f.slides; if (v !== "video") delete f.video; if (v === "plain") delete f.image; return f; },
      render: Hero as any,
    },
    Advantages: {
      label: "Advantages",
      fields: {
        variant: variantField("variant", ADV_VARIANTS),
        title: T("Title"),
        items: { type: "array", label: "Points", arrayFields: { icon: { type: "select", label: "Icon", options: ICON_OPTIONS }, title: { type: "text", label: "Title" }, text: { type: "textarea", label: "Text" } }, getItemSummary: (i: any) => i.title || "Point", defaultItemProps: { icon: "heart", title: "Advantage", text: "" } },
      },
      defaultProps: { variant: "band", title: "Good reasons to move in", items: [{ icon: "shop", title: "Shopping", text: "Everything for daily life is around the corner." }, { icon: "food", title: "Restaurants", text: "Cafés and restaurants nearby." }, { icon: "transport", title: "Transport", text: "Bus and train a short walk away." }, { icon: "park", title: "Green spaces", text: "Parks start at the door." }] },
      render: Advantages as any,
    },
    TextImage: {
      label: "Text + image",
      fields: { variant: variantField("variant", TI_VARIANTS), image: imageField("Image"), title: T("Title"), text: TA("Text"), cta: { type: "text", label: "Button" }, ctaHref: { type: "text", label: "Button goes to" } },
      defaultProps: { variant: "right", title: "The property", text: "Describe what makes the property special.", image: "", cta: "", ctaHref: "#units" },
      render: TextImage as any,
    },
    Text: {
      label: "Text",
      fields: { title: T("Title"), body: TA("Text"), columns: { type: "radio", label: "Columns", options: [{ label: "1", value: "1" }, { label: "2", value: "2" }] } },
      defaultProps: { title: "Title", body: "Text about the project.", columns: "1" },
      render: ({ title, body, columns }: P) => (
        <section id="project"><div className="wrap"><h2>{title}</h2><div className={`text-cols ${columns === "2" ? "two" : ""}`}>{body}</div></div></section>
      ),
    },
    Facts: {
      label: "Facts",
      fields: { title: T("Title"), items: { type: "array", label: "Facts", arrayFields: { value: { type: "text", label: "Value" }, label: { type: "text", label: "Label" } }, getItemSummary: (i: any) => i.label || "Fact", defaultItemProps: { value: "–", label: "Label" } } },
      defaultProps: { title: "At a glance", items: [{ value: "–", label: "Label" }] },
      render: ({ title, items }: P) => (
        <section><div className="wrap"><h2>{title}</h2><div className="facts">{(items ?? []).map((i: any, k: number) => <div key={k}><div className="v">{i.value}</div><div className="l">{i.label}</div></div>)}</div></div></section>
      ),
    },
    Gallery: {
      label: "Gallery",
      fields: {
        layout: variantField("layout", GALLERY_VARIANTS),
        title: T("Title"),
        columns: { type: "radio", label: "Columns||For grid and masonry.", options: [{ label: "2", value: "2" }, { label: "3", value: "3" }, { label: "4", value: "4" }] },
        images: { type: "custom", label: "Images", render: ({ value, onChange }: any) => <GalleryField value={value} onChange={onChange} /> },
      },
      defaultProps: { title: "Impressions", layout: "grid", columns: "3", images: [] },
      render: Gallery as any,
    },
    Downloads: {
      label: "Downloads",
      fields: { title: T("Title"), items: { type: "array", label: "Files", arrayFields: { label: { type: "text", label: "Label" }, file: fileField as any, href: { type: "text", label: "…or a link instead" } }, getItemSummary: (i: any) => i.label || "File", defaultItemProps: { label: "Document", file: null, href: "" } } },
      defaultProps: { title: "Downloads", items: [{ label: "Sales brochure", href: "#" }] },
      render: ({ title, items }: P) => (
        <section><div className="wrap"><h2>{title}</h2><div className="dl">{(items ?? []).map((i: any, k: number) => <a key={k} href={i.file?.data || i.href || "#"} download={i.file?.data ? i.file.name : undefined} target={i.file?.data ? undefined : "_blank"} rel="noreferrer"><span>{i.label}</span><span className="s-eyebrow">{/\.(jpe?g|png)$/i.test(i.file?.name ?? "") ? "Image" : "PDF"}</span></a>)}</div></div></section>
      ),
    },
    UnitList: {
      label: "Apartment table",
      fields: { title: T("Title"), showFilters: { type: "radio", label: "Filters", options: [{ label: "On", value: "yes" }, { label: "Off", value: "no" }] } },
      defaultProps: { title: "Availability", showFilters: "yes" },
      render: UnitList as any,
    },
    FloorPlanBlock: {
      label: "Floor plan",
      fields: { title: T("Title"), planId: planField, view: { type: "radio", label: "Opens in", options: [{ label: "2D", value: "2d" }, { label: "3D", value: "3d" }] } },
      defaultProps: { title: "Floor plan", planId: "", view: "2d" },
      render: (props: P) => <FloorPlanBlock key={props.view + props.planId} {...props} />,
    },
    Location: {
      label: "Location",
      fields: {
        layout: variantField("layout", MAP_VARIANTS),
        title: T("Title"), text: TA("Text"),
        mapStyle: { type: "radio", label: "Map colours", options: [{ label: "Muted", value: "grey" }, { label: "Colour", value: "colour" }] },
        mapHeight: { type: "radio", label: "Map height", options: [{ label: "Low", value: "s" }, { label: "Medium", value: "m" }, { label: "Tall", value: "l" }] },
        zoom: { type: "number", label: "Zoom||11 = whole region, 17 = street level.", min: 11, max: 17 },
        showAddress: { type: "radio", label: "Address card", options: [{ label: "Show", value: "yes" }, { label: "Hide", value: "no" }] },
        times: { type: "array", label: "How far is it?", arrayFields: { place: { type: "text", label: "Place" }, minutes: { type: "number", label: "Minutes", min: 1, max: 180 }, mode: { type: "select", label: "How", options: TRAVEL_MODES } }, getItemSummary: (i: any) => (i.place ? `${i.place} · ${i.minutes} min` : "Place"), defaultItemProps: { place: "Train station", minutes: 5, mode: "walk" } },
      },
      defaultProps: { title: "Location", text: "", layout: "stacked", mapStyle: "grey", mapHeight: "m", zoom: 15, showAddress: "yes", times: [] },
      render: Location as any,
    },
    ContactForm: {
      label: "Contact form",
      fields: {
        title: T("Title"), text: TA("Text"),
        fields: {
          type: "array", label: "Form fields", getItemSummary: (i: any) => `${i.label || "Field"}${i.required === "yes" ? " *" : ""}`,
          defaultItemProps: { label: "New field", type: "text", placeholder: "", required: "no", width: "half", options: "" },
          arrayFields: {
            label: { type: "text", label: "Label" },
            type: { type: "select", label: "Type", options: [{ label: "Text", value: "text" }, { label: "Email", value: "email" }, { label: "Phone", value: "tel" }, { label: "Long text", value: "textarea" }, { label: "Dropdown", value: "select" }, { label: "Date", value: "date" }, { label: "Apartment picker", value: "apartment" }] },
            placeholder: { type: "text", label: "Placeholder (empty = automatic)" },
            options: { type: "text", label: "Dropdown options, comma separated" },
            required: { type: "radio", label: "Required", options: [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }] },
            width: { type: "radio", label: "Width", options: [{ label: "Half", value: "half" }, { label: "Full", value: "full" }] },
          },
        },
        submitLabel: { type: "text", label: "Button text" },
        columns: { type: "radio", label: "Layout", options: [{ label: "Two columns", value: "2" }, { label: "One column", value: "1" }] },
        interests: { type: "array", label: "Extra tick boxes", arrayFields: { label: { type: "text", label: "Label" } }, getItemSummary: (i: any) => i.label || "Checkbox", defaultItemProps: { label: "Option" } },
        newsletter: { type: "radio", label: "Newsletter tick box", options: [{ label: "Show", value: "yes" }, { label: "Hide", value: "no" }] },
        newsletterLabel: { type: "text", label: "Newsletter text" },
        privacyLabel: { type: "text", label: "Privacy consent text (mandatory, cannot be removed)" },
        privacyHref: { type: "text", label: "Privacy policy link||Leave as it is to use the privacy page of this site." },
      },
      defaultProps: { title: "Contact", text: "", fields: DEFAULT_FIELDS, submitLabel: "Send enquiry", columns: "2", interests: [], newsletter: "no", newsletterLabel: "Keep me posted about this project by email.", privacyLabel: "I have read and accept the privacy policy.", privacyHref: "/privacy" },
      render: ContactForm as any,
    },
    Waitlist: {
      label: "Waiting list",
      fields: { title: T("Title"), text: TA("Text"), privacyLabel: { type: "text", label: "Privacy consent text (mandatory, cannot be removed)" }, privacyHref: { type: "text", label: "Privacy policy link" } },
      defaultProps: { title: "Waiting list", text: "Nothing suitable at the moment? Leave your details and we will contact you as soon as a matching apartment becomes available.", privacyLabel: "I have read and accept the privacy policy.", privacyHref: "/privacy" },
      render: Waitlist as any,
    },
    Viewing: {
      label: "Viewing booking",
      fields: { title: T("Title"), text: TA("Text") },
      defaultProps: { title: "Viewings", text: "Pick a slot." },
      render: Viewing as any,
    },
    Contacts: {
      label: "Contacts",
      fields: { title: T("Title"), people: { type: "array", label: "People", arrayFields: { photo: imageField("Photo"), name: { type: "text", label: "Name" }, role: { type: "text", label: "Role" }, phone: { type: "text", label: "Phone" }, email: { type: "text", label: "Email" } }, getItemSummary: (i: any) => i.name || "Person", defaultItemProps: { photo: "", name: "First Last", role: "", phone: "", email: "" } } },
      defaultProps: { title: "Your contacts", people: [{ name: "First Last", role: "", phone: "", email: "" }] },
      render: ({ title, people }: P) => (
        <section><div className="wrap"><h2>{title}</h2><div className="people">{(people ?? []).map((x: any, k: number) => (
          <div key={k} className={x.photo ? "has-photo" : ""}>{x.photo ? <img className="person-photo" src={x.photo} alt={x.name} /> : null}<div style={{ fontWeight: 600 }}>{x.name}</div><div style={{ color: "#6b665f", fontSize: 14 }}>{x.role}</div>
            {x.phone ? <div className="tnum"><a href={`tel:${x.phone}`}>{x.phone}</a></div> : null}{x.email ? <div><a href={`mailto:${x.email}`}>{x.email}</a></div> : null}</div>
        ))}</div></div></section>
      ),
    },
    Footer: {
      label: "Footer",
      fields: {
        company: { type: "text", label: "Company" },
        logos: { type: "custom", label: "Logos", render: ({ value, onChange }: any) => <GalleryField value={value} onChange={onChange} label="Partner logos" logos /> },
        logosTitle: { type: "text", label: "Line above the logos" },
        instagram: { type: "text", label: "Instagram link" }, linkedin: { type: "text", label: "LinkedIn link" }, facebook: { type: "text", label: "Facebook link" },
        imprintHref: { type: "text", label: "Imprint link||Leave as it is to use the imprint page of this site." }, privacyHref: { type: "text", label: "Privacy policy link||Leave as it is to use the privacy page of this site." },
      },
      defaultProps: { company: "Company", logos: [], logosTitle: "", instagram: "", linkedin: "", facebook: "", imprintHref: "/imprint", privacyHref: "/privacy" },
      render: Footer as any,
    },
  },
};

// every block except header and footer can override the site's font sizes; empty = default (shown as placeholder)
const SIZE_HINT: Record<string, [number, number]> = { Hero: [56, 20] }; // desktop sizes of the shared type scale
const sizeField = (label: string, hint: number) => ({
  type: "custom" as const,
  label,
  render: ({ value, onChange }: any) => (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{label} <span style={{ fontWeight: 400, color: "#6b665f" }}>px</span></span>
      <input className="input" type="number" min={8} max={160} value={value ?? ""} placeholder={`${hint} (site default)`} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")} />
    </label>
  ),
});
// everyday options stay on top; layout, size and behaviour sit behind one "Advanced settings" switch, closed by default
const ADVANCED: Record<string, string[]> = {
  Header: ["ctaHref"],
  Hero: ["ctaHref", "height", "align", "overlay"],
  UnitFinder: ["note"],
  TextImage: ["ctaHref"],
  Text: ["columns"],
  Gallery: ["columns"],
  Embed: ["ratio"],
  UnitList: ["showFilters"],
  FloorPlanBlock: ["view"],
  Location: ["mapStyle", "mapHeight", "zoom", "showAddress"],
  ContactForm: ["submitLabel", "columns", "interests", "newsletter", "newsletterLabel", "privacyLabel", "privacyHref"],
  Waitlist: ["privacyLabel", "privacyHref"],
  Footer: ["logosTitle", "instagram", "linkedin", "facebook", "imprintHref", "privacyHref"],
};
const advToggle = {
  type: "custom" as const,
  label: "Advanced settings",
  render: ({ value, onChange }: any) => (
    <button type="button" className={`adv-toggle ${value ? "open" : ""}`} aria-expanded={!!value} onClick={() => onChange(!value)}>
      <span>Advanced settings</span><small>{value ? "Hide" : "Layout, size and behaviour"}</small><i aria-hidden />
    </button>
  ),
};
for (const [name, c] of Object.entries(config.components) as [string, any][]) {
  if (name !== "Header" && name !== "Footer") {
    const [t, x] = SIZE_HINT[name] ?? [36, 17];
    c.fields = { ...c.fields, titleSize: sizeField("Title size", t), textSize: sizeField("Text size", x) };
  }
  const adv = [...(ADVANCED[name] ?? []), "titleSize", "textSize"].filter((k) => k in c.fields);
  if (adv.length) {
    const own = c.resolveFields;
    c.fields = { ...c.fields, _adv: advToggle };
    c.resolveFields = (data: any, params: any) => {
      const all = own ? own(data, params) : params.fields;
      const main: Record<string, any> = {}, more: Record<string, any> = {};
      for (const k of Object.keys(all)) if (k !== "_adv") (adv.includes(k) ? more : main)[k] = all[k];
      return data.props?._adv ? { ...main, _adv: advToggle, ...more } : { ...main, _adv: advToggle };
    };
  }
  const inner = c.render;
  const Inner = inner as React.ComponentType<any>;
  c.render = function Block(props: any) {
    return <div className="blk" style={{ display: "contents", ...sizeVars(props) }}><Inner {...props} /></div>;
  };
}
registerConfig(config);

// the command layer validates AI and editor operations against the blocks and fields that exist here
configureDoc({
  registry: Object.fromEntries(
    Object.entries(config.components as Record<string, any>).map(([type, c]) => [type, { label: c.label, fields: [...new Set([...Object.keys(c.fields ?? {}), ...Object.keys(c.defaultProps ?? {}), "_adv", "titleSize", "textSize"])] }]),
  ),
  defaults: (type) => JSON.parse(JSON.stringify((config.components as Record<string, any>)[type]?.defaultProps ?? {})),
});
