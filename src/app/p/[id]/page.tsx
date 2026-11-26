"use client";
import { useParams } from "next/navigation";
import { deleteProject, useProject } from "@/lib/store";
import { STATUS_COLOR, STATUS_LABEL, type UnitStatus } from "@/lib/types";
import { download } from "@/lib/units-import";

export default function Overview() {
  const { id } = useParams<{ id: string }>();
  const p = useProject(id);
  if (!p) return null;
  const by = (s: UnitStatus) => p.units.filter((u) => u.status === s).length;
  const fmt = (t: number | string) => new Date(t).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const stats: [string, string | number][] = [
    ["Page views", p.views],
    ["Leads", p.leads.length],
    ["Bookings", p.bookings.length],
    ["Available units", `${by("available")} / ${p.units.length}`],
  ];
  const exportLeads = () =>
    download(`leads-${p.slug}.csv`, ["date;name;email;phone;unit;interests;message", ...p.leads.map((l) => [fmt(l.at), l.name, l.email, l.phone ?? "", l.unitRef ?? "", l.interests.join(", "), (l.message ?? "").replace(/[\n;]/g, " ")].join(";"))].join("\n"));

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 grid grid-cols-2 md:grid-cols-4 border-t border-ink">
        {stats.map(([l, v]) => (
          <div key={l} className="py-5 pr-4 border-b border-line">
            <div className="text-[28px] font-semibold tracking-tight tnum leading-none">{v}</div>
            <div className="text-muted text-[13px] mt-2">{l}</div>
          </div>
        ))}
      </div>

      <section className="col-span-12 lg:col-span-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[16px] font-semibold">Leads</h2>
          <button className="btn btn-sm" onClick={exportLeads} disabled={!p.leads.length}>Export CSV</button>
        </div>
        <div className="panel">
          {p.leads.length === 0 ? <div className="p-6 text-muted">No enquiries yet. Submit the contact form on the website to try it.</div> : (
            <table className="table">
              <thead><tr><th>Date</th><th>Name</th><th>Unit</th><th>Interest</th></tr></thead>
              <tbody>
                {p.leads.map((l) => (
                  <tr key={l.id} className="rise">
                    <td className="tnum text-muted whitespace-nowrap">{fmt(l.at)}</td>
                    <td><div className="font-medium">{l.name}</div><div className="text-muted text-[13px]">{l.email}{l.phone ? ` · ${l.phone}` : ""}</div>{l.message ? <div className="text-[13px] mt-1">{l.message}</div> : null}</td>
                    <td className="tnum">{l.unitRef || "–"}</td>
                    <td className="text-[13px]">{l.interests.join(", ") || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <aside className="col-span-12 lg:col-span-4 grid gap-6 content-start">
        <div>
          <h2 className="text-[16px] font-semibold mb-3">Unit status</h2>
          <div className="panel p-4 grid gap-2">
            {(["available", "reserved", "rented", "sold"] as UnitStatus[]).map((s) => (
              <div key={s} className="flex items-center text-[14px]"><span className="dot" style={{ background: STATUS_COLOR[s] }} />{STATUS_LABEL[s]}<span className="ml-auto tnum font-medium">{by(s)}</span></div>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[16px] font-semibold">Waiting list <span className="text-muted font-normal tnum">{(p.waitlist ?? []).length}</span></h2>
            <button className="btn btn-sm" disabled={!(p.waitlist ?? []).length} onClick={() => download(`waitlist-${p.slug}.csv`, ["date;name;email;phone;rooms;note", ...(p.waitlist ?? []).map((w) => [fmt(w.at), w.name, w.email, w.phone ?? "", w.rooms.join(", "), (w.note ?? "").replace(/[\n;]/g, " ")].join(";"))].join("\n"))}>CSV</button>
          </div>
          <div className="panel">
            {!(p.waitlist ?? []).length ? <div className="p-4 text-muted text-[13px]">Nobody yet. The “Waiting list” block on the website collects entries.</div> : (p.waitlist ?? []).map((w) => (
              <div key={w.id} className="p-4 border-b border-line last:border-0 rise">
                <div className="flex justify-between text-[14px]"><span className="font-medium">{w.name}</span><span className="tnum text-muted text-[12px]">{fmt(w.at)}</span></div>
                <div className="text-muted text-[13px]">{w.email}{w.phone ? ` · ${w.phone}` : ""}</div>
                {w.rooms.length ? <div className="text-[13px] mt-1">{w.rooms.join(", ")}</div> : null}
                {w.note ? <div className="text-[13px] mt-1">{w.note}</div> : null}
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-[16px] font-semibold mb-3">Viewings</h2>
          <div className="panel">
            {p.slots.length === 0 ? <div className="p-4 text-muted">No slots.</div> : p.slots.map((s) => {
              const b = p.bookings.filter((x) => x.slotId === s.id);
              return (
                <div key={s.id} className="p-4 border-b border-line last:border-0">
                  <div className="flex justify-between text-[14px]"><span className="font-medium tnum">{fmt(s.start)}</span><span className="tnum text-muted">{b.length}/{s.capacity}</span></div>
                  <div className="text-muted text-[13px]">{s.label}</div>
                  {b.map((x) => <div key={x.id} className="text-[13px] mt-1">{x.name} · {x.email}</div>)}
                </div>
              );
            })}
          </div>
        </div>
        <button className="text-[13px] text-err underline justify-self-start" onClick={() => { if (confirm(`Really delete “${p.name}”?`)) { deleteProject(p.id); location.href = "/"; } }}>Delete project</button>
      </aside>
    </div>
  );
}
