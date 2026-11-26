"use client";
/* eslint-disable @next/next/no-img-element, @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { useParams } from "next/navigation";
import { IsometryView } from "@/components/Isometry";
import Plan2D from "@/components/plan/Plan2D";
import { Loading } from "@/components/shell";
import { groupColor, groupOf, groupsOf } from "@/lib/building";
import { useProject } from "@/lib/store";
import { chf, facts } from "@/lib/templates";
import { STATUS_LABEL, type Unit } from "@/lib/types";

const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const floor = (f: number) => (f === 0 ? "GF" : f < 0 ? `B${-f}` : `${f}. floor`);
const money = (n?: number) => (n ? chf(n).replace("CHF ", "") + ".–" : "–");

/** print-ready letting brochure built from the website's own data; "Print" saves it as PDF */
export default function Brochure() {
  const { id } = useParams<{ id: string }>();
  const p = useProject(id);
  if (p === undefined) return <Loading />;
  if (p === null) return <div className="p-10">Project not found. <Link className="underline" href="/brochures">Back</Link></div>;

  const block = (type: string): Record<string, any> | undefined => (p.draft.content as any[]).find((c) => c.type === type)?.props;
  const hero = block("Hero"), text = block("Text"), gallery = block("Gallery"), contacts = block("Contacts");
  const f = facts(p);
  const rent = p.type === "rent";
  const place = [p.address, [p.zip, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const apts = p.units.filter((u) => (u.use ?? "apartment") === "apartment");
  const others = p.units.filter((u) => u.use && u.use !== "apartment");
  const images: { src: string; caption: string }[] = ((gallery?.images as any[]) ?? []).filter((i) => i.src).slice(0, 4);
  const pages: React.ReactNode[] = [];
  const Head = ({ title }: { title: string }) => (
    <div className="b-head"><span>{p.name}</span><span>{title}</span></div>
  );

  pages.push(
    <section className="sheet cover" key="cover" style={{ ["--accent" as string]: p.accent }}>
      <div className="b-logo">{p.logo && !p.logoOnDark ? <img src={p.logo} alt="" /> : <strong>{p.name}</strong>}</div>
      <div className="cover-img">{hero?.image ? <img src={hero.image} alt="" /> : <div className="cover-fill" />}</div>
      <div>
        <div className="b-eyebrow">{place}</div>
        <h1>{p.name}</h1>
        <p className="b-lead">{typeof hero?.text === "string" ? hero.text : ""}</p>
      </div>
    </section>
  );

  pages.push(
    <section className="sheet" key="project" style={{ ["--accent" as string]: p.accent }}>
      <Head title="The project" />
      <h2>{typeof text?.title === "string" ? text.title : "The project"}</h2>
      <p className="b-text">{typeof text?.body === "string" ? text.body : ""}</p>
      {f ? (
        <div className="b-facts">
          <div><b>{f.count}</b><span>Apartments</span></div>
          <div><b>{f.rooms}</b><span>Rooms</span></div>
          <div><b>{f.area} m²</b><span>Living space</span></div>
          <div><b>{f.priceFrom ? chf(f.priceFrom) : "on request"}</b><span>{rent ? "Rent from / month" : "Price from"}</span></div>
        </div>
      ) : null}
      {images.length ? <div className="b-gallery">{images.map((i, k) => <figure key={k}><img src={i.src} alt="" />{i.caption ? <figcaption>{i.caption}</figcaption> : null}</figure>)}</div> : null}
    </section>
  );

  if (p.isometry)
    pages.push(
      <section className="sheet" key="iso" style={{ ["--accent" as string]: p.accent }}>
        <Head title="Overview" />
        <h2>The building</h2>
        <div className="b-draw"><IsometryView iso={p.isometry} units={apts} accent={p.accent} /></div>
        <p className="b-note">Tinted: available · grey: let or sold.</p>
      </section>
    );

  const table = (rows: Unit[], withRooms: boolean) => (
    <table className="b-table">
      <thead><tr><th>No.</th>{withRooms ? <><th>Floor</th><th>Rooms</th></> : <th>Type</th>}<th className="r">Area</th>{rent ? <><th className="r">Net</th><th className="r">Charges</th><th className="r">Gross</th></> : <th className="r">Price</th>}<th>Status</th></tr></thead>
      <tbody>
        {rows.map((u) => (
          <tr key={u.id} className={u.status === "available" ? "" : "off"}>
            <td>{u.ref}</td>{withRooms ? <><td>{floor(u.floor)}</td><td>{u.rooms}</td></> : <td>{u.label ?? u.use}</td>}
            <td className="r">{u.areaM2 ? `${u.areaM2} m²` : "–"}</td>
            {rent ? <><td className="r">{money(u.price)}</td><td className="r">{money(u.charges)}</td><td className="r">{money(u.price + (u.charges ?? 0))}</td></> : <td className="r">{money(u.price)}</td>}
            <td>{STATUS_LABEL[u.status]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  chunk(apts, 22).forEach((rows, i, all) =>
    pages.push(
      <section className="sheet" key={"units" + i}>
        <Head title={`Apartments${all.length > 1 ? ` ${i + 1}/${all.length}` : ""}`} />
        <h2>Apartments</h2>
        {table(rows, true)}
        <p className="b-note">Prices in CHF per month{rent ? "; charges are paid on account" : ""}. As of {new Date().toLocaleDateString("en-GB")}. Subject to change.</p>
      </section>
    )
  );
  if (others.length)
    pages.push(<section className="sheet" key="others"><Head title="Commercial and parking" /><h2>Commercial and parking</h2>{table(others, false)}</section>);

  p.floorPlans.forEach((plan) => {
    const rooms = plan.rooms.filter((r) => r.confirmed).length ? plan.rooms.filter((r) => r.confirmed) : plan.rooms;
    pages.push(
      <section className="sheet" key={plan.id} style={{ ["--accent" as string]: p.accent }}>
        <Head title="Floor plan" />
        <h2>{plan.name}</h2>
        <div className="b-draw"><Plan2D plan={{ ...plan, rooms }} colorFor={(r) => groupColor(groupOf(plan, r.group), groupsOf(plan)[groupOf(plan, r.group)]?.common)} /></div>
        <div className="b-rooms">{rooms.slice(0, 24).map((r) => <div key={r.id}><span>{r.name}</span><span>{r.areaM2.toFixed(1)} m²</span></div>)}</div>
      </section>
    );
  });

  pages.push(
    <section className="sheet" key="contact" style={{ ["--accent" as string]: p.accent }}>
      <Head title="Contact" />
      <h2>Contact and viewings</h2>
      <div className="b-contact">
        {((contacts?.people as any[]) ?? []).map((x, k) => (
          <div key={k}><b>{x.name}</b><span>{x.role}</span><span>{x.phone}</span><span>{x.email}</span></div>
        ))}
        <div><b>Address</b><span>{p.name}</span><span>{place}</span></div>
        <div><b>Website</b><span>{p.slug}.sitebuilder.ch</span></div>
      </div>
      {p.slots.length ? (<><h3>Next viewings</h3><div className="b-rooms">{p.slots.map((s) => <div key={s.id}><span>{new Date(s.start).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</span><span>{s.label}</span></div>)}</div></>) : null}
    </section>
  );

  return (
    <div className="brochure">
      <div className="b-bar">
        <Link href="/brochures" className="btn btn-sm">← Brochures</Link>
        <Link href="/" className="btn btn-sm">Dashboard</Link>
        <span className="font-medium">{p.name}</span>
        <span className="text-muted text-[13px] tnum">{pages.length} pages · A4</span>
        <span style={{ flex: 1 }} />
        <Link href={`/edit/${p.id}`} className="btn btn-sm">Edit content in the website</Link>
        <button className="btn btn-sm btn-primary" onClick={() => window.print()}>Print / Save as PDF</button>
      </div>
      {pages}
    </div>
  );
}
