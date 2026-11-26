"use client";
/* eslint-disable @next/next/no-img-element, @typescript-eslint/no-explicit-any */
import { useParams } from "next/navigation";
import Plan2D from "@/components/plan/Plan2D";
import { Loading } from "@/components/shell";
import { locate, subPlan } from "@/lib/building";
import { useProject } from "@/lib/store";
import { chf } from "@/lib/templates";
import { STATUS_LABEL } from "@/lib/types";

/** one A4 sheet per apartment: floor plan, key figures and contact. "Save as PDF" in the print dialog gives the file. */
export default function UnitPlan() {
  const { id, unit: unitId } = useParams<{ id: string; unit: string }>();
  const p = useProject(id);
  if (p === undefined) return <Loading />;
  const unit = p?.units.find((u) => u.id === unitId);
  if (!p || !unit) return <div className="p-10">This apartment does not exist.</div>;
  const loc = locate(p, unit);
  const plan = loc ? subPlan(loc.plan, loc.group) : null;
  const rooms = plan ? (plan.rooms.some((r) => r.confirmed) ? plan.rooms.filter((r) => r.confirmed) : plan.rooms) : [];
  const total = rooms.reduce((s, r) => s + r.areaM2, 0);
  const rent = p.type === "rent";
  const place = [p.address, [p.zip, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const contact = ((p.draft.content as any[]).find((c) => c.type === "Contacts")?.props?.people ?? [])[0];
  const floor = unit.floor === 0 ? "Ground floor" : `${unit.floor}. floor`;
  return (
    <div className="brochure">
      <div className="b-bar">
        <button className="btn btn-sm" onClick={() => (history.length > 1 ? history.back() : (location.href = `/site/${p.id}?draft=1`))}>← Back</button>
        <a className="btn btn-sm" href={`/edit/${p.id}`}>Editor</a>
        <a className="btn btn-sm" href="/">Dashboard</a>
        <span className="font-medium">{p.name} · Apartment {unit.ref}</span>
        <span className="text-muted text-[13px]">A4 · floor plan</span>
        <span style={{ flex: 1 }} />
        <button className="btn btn-sm btn-primary" onClick={() => window.print()}>Print / Save as PDF</button>
      </div>
      <section className="sheet" style={{ ["--accent" as string]: p.accent }}>
        <div className="b-head"><span>{p.name}</span><span>{place}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "10mm" }}>
          <div>
            <div className="b-eyebrow">Building {unit.building} · {floor}</div>
            <h2 style={{ marginTop: "2mm", marginBottom: 0 }}>Apartment {unit.ref}</h2>
          </div>
          {p.logo && !p.logoOnDark ? <img src={p.logo} alt="" style={{ maxHeight: "14mm", maxWidth: "50mm", objectFit: "contain" }} /> : null}
        </div>
        <div className="b-draw" style={{ height: "128mm", margin: "8mm 0 6mm" }}>
          {plan && rooms.length ? <Plan2D plan={{ ...plan, rooms }} /> : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b665f", border: "1px dashed #cfc9bf" }}>No floor plan is assigned to this apartment yet.</div>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10mm" }}>
          <div>
            <h3 style={{ marginTop: 0 }}>Key figures</h3>
            <div className="b-rooms" style={{ gridTemplateColumns: "1fr", marginTop: 0 }}>
              <div><span>Rooms</span><span>{unit.rooms}</span></div>
              <div><span>Living space</span><span>{unit.areaM2} m²</span></div>
              {rent ? (<><div><span>Net rent / month</span><span>{chf(unit.price)}</span></div><div><span>Charges / month</span><span>{unit.charges ? chf(unit.charges) : "–"}</span></div><div><span><b>Gross rent / month</b></span><span><b>{chf(unit.price + (unit.charges ?? 0))}</b></span></div></>) : <div><span><b>Price</b></span><span><b>{chf(unit.price)}</b></span></div>}
              <div><span>Status</span><span>{STATUS_LABEL[unit.status]}</span></div>
            </div>
          </div>
          <div>
            <h3 style={{ marginTop: 0 }}>Rooms</h3>
            <div className="b-rooms" style={{ gridTemplateColumns: "1fr", marginTop: 0 }}>
              {rooms.slice(0, 9).map((r) => <div key={r.id}><span>{r.name}</span><span>{r.areaM2.toFixed(1)} m²</span></div>)}
              {rooms.length ? <div><span><b>Total of rooms shown</b></span><span><b>{total.toFixed(1)} m²</b></span></div> : null}
            </div>
          </div>
        </div>
        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", gap: "10mm", borderTop: "1px solid #1c1b19", paddingTop: "3mm", fontSize: "8.5pt", color: "#45413b" }}>
          <span>{contact ? [contact.name, contact.role, contact.phone, contact.email].filter(Boolean).join(" · ") : p.name}</span>
          <span>Plan not to scale. Areas are approximate. As of {new Date().toLocaleDateString("en-GB")}.</span>
        </div>
      </section>
    </div>
  );
}
