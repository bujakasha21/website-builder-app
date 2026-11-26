"use client";
import Link from "next/link";
import HomeShell, { EmptyState, PageHead } from "@/components/HomeShell";
import { Loading } from "@/components/shell";
import { useDb } from "@/lib/store";
import { download } from "@/lib/units-import";

export default function Leads() {
  const db = useDb();
  const leads = (db?.projects ?? []).filter((p) => !p.id.startsWith("__")).flatMap((p) => p.leads.map((l) => ({ ...l, project: p.name, pid: p.id }))).sort((a, b) => b.at - a.at);
  const fmt = (t: number) => new Date(t).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <HomeShell>
      <PageHead eyebrow="Leads" title="All enquiries" text="Contact form submissions from every website, newest first."
        action={<button className="btn" disabled={!leads.length} onClick={() => download("leads.csv", ["date;project;name;email;phone;unit;interests;message", ...leads.map((l) => [fmt(l.at), l.project, l.name, l.email, l.phone ?? "", l.unitRef ?? "", l.interests.join(", "), (l.message ?? "").replace(/[\n;]/g, " ")].join(";"))].join("\n"))}>Export CSV</button>} />
      {!db ? <Loading /> : (
        <div className="panel">
          {leads.length === 0 ? <EmptyState title="No enquiries yet" text="As soon as someone fills in a contact form on one of your websites, it shows up here." action={<Link href="/websites" className="btn">Open my websites</Link>} /> : (
            <table className="table">
              <thead><tr><th>Date</th><th>Name</th><th>Website</th><th>Unit</th><th>Interest</th></tr></thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.pid + l.id}>
                    <td className="tnum text-muted whitespace-nowrap">{fmt(l.at)}</td>
                    <td><div className="font-medium">{l.name}</div><div className="text-muted text-[13px]">{l.email}{l.phone ? ` · ${l.phone}` : ""}</div>{l.message ? <div className="text-[13px] mt-1">{l.message}</div> : null}</td>
                    <td><Link className="underline" href={`/p/${l.pid}`}>{l.project}</Link></td>
                    <td className="tnum">{l.unitRef || "–"}</td>
                    <td className="text-[13px]">{l.interests.join(", ") || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </HomeShell>
  );
}
