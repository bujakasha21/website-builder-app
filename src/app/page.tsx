"use client";
import Link from "next/link";
import HomeShell, { USER } from "@/components/HomeShell";
import ProjectCards from "@/components/ProjectCards";
import { Loading } from "@/components/shell";
import { CountUp } from "@/components/Playground";
import { resetDemo, useDb } from "@/lib/store";

const TOOLS = [
  { href: "/new", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18M7 6.5h.01M10 6.5h.01" /></svg>, title: "Website", text: "A project site for a whole building: unit list, isometry, viewings and contact form.", cta: "Start the wizard" },
  { href: "/studio", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 20V8l9-5 9 5v12H3Z" /><path d="M3 13h7v7M14 20v-5h7" /></svg>, title: "Floor plan 2D / 3D", text: "Upload an architect’s PDF and get a clean vector plan and a 3D model to download.", cta: "Open floor plans" },
  { href: "/brochures", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 3h9l4 4v14H6V3Z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></svg>, title: "Brochure (PDF)", text: "A print-ready letting brochure from the data of a website: facts, units, plans, contact.", cta: "Make a brochure" },
];

export default function Dashboard() {
  const db = useDb();
  // no redirect: the dashboard always opens first; the questions about the person come with "New website"
  const projects = (db?.projects ?? []).filter((p) => !p.id.startsWith("__"));
  const apts = projects.flatMap((p) => p.units.filter((u) => (u.use ?? "apartment") === "apartment"));
  const leads = projects.flatMap((p) => p.leads.map((l) => ({ ...l, project: p.name, pid: p.id }))).sort((a, b) => b.at - a.at);
  const hour = new Date().getHours();
  const live = projects.filter((p) => p.published).length;
  const free = apts.filter((u) => u.status === "available").length;
  const stats: { label: string; value: number; of?: number; tone: string; icon: string }[] = [
    { label: "Websites", value: projects.length, tone: "sky", icon: "M4 6h16v12H4zM4 10h16" },
    { label: "Live", value: live, tone: "mint", icon: "M5 12.5l4.5 4.5L19 7.5" },
    { label: "Available apartments", value: free, of: apts.length, tone: "sun", icon: "M4 11 12 4l8 7v9H4zM10 20v-6h4v6" },
    { label: "Leads", value: leads.length, tone: "coral", icon: "M4 6h16v12H4zM4 7l8 6 8-6" },
  ];
  const nudge = !projects.length ? "Let's build your first website. It takes a few minutes." : leads.length ? `You have ${leads.length} ${leads.length === 1 ? "enquiry" : "enquiries"} waiting.` : live < projects.length ? `${projects.length - live} of your websites ${projects.length - live === 1 ? "is" : "are"} still a draft. Ready to go live?` : "Everything is live. What shall we build next?";
  return (
    <HomeShell>
      <div className="dash-hello">
        <div>
          <div className="eyebrow">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
          <h1 className="text-[40px] leading-[1.05] font-semibold tracking-tight mt-2">{hour < 12 ? "Good morning" : hour < 18 ? "Welcome back" : "Good evening"}, <span className="mark">{USER.name}</span></h1>
          <p className="text-muted text-[16px] mt-3">{db ? nudge : " "}</p>
        </div>
        <Link href="/new" className="btn btn-primary dash-go">New website <span aria-hidden>→</span></Link>
      </div>
      {!db ? <Loading /> : (
        <>
          <dl className="dash-line">
            {stats.map((st) => (
              <div key={st.label}><dd className="tnum"><CountUp value={st.value} />{st.of !== undefined ? <small> / {st.of}</small> : null}</dd><dt>{st.label}</dt></div>
            ))}
          </dl>

          <div className="flex items-baseline justify-between mt-10 mb-4">
            <h2 className="text-[20px] font-semibold tracking-tight">Your websites</h2>
            {projects.length > 3 ? <Link href="/websites" className="text-[13px] underline">All {projects.length}</Link> : null}
          </div>
          <ProjectCards projects={projects.slice(0, 3)} />

          <h2 className="text-[20px] font-semibold tracking-tight mt-14 mb-2">Make something new</h2>
          <div className="dash-tools">
            {TOOLS.map((t, i) => (
              <Link key={t.href} href={t.href} className="dash-tool rise" style={{ animationDelay: `${i * 50}ms` }}>
                <span className="dash-tool-n tnum">{String(i + 1).padStart(2, "0")}</span>
                <span className="dash-tool-t">{t.title}</span>
                <span className="dash-tool-d">{t.text}</span>
                <span className="dash-tool-go">{t.cta} <i aria-hidden>→</i></span>
              </Link>
            ))}
          </div>

          <div className="flex items-baseline justify-between mt-12 mb-4">
            <h2 className="text-[20px] font-semibold tracking-tight">Latest leads</h2>
            {leads.length ? <Link href="/leads" className="text-[13px] underline">All {leads.length}</Link> : null}
          </div>
          <div className="panel">
            {leads.length === 0 ? <div className="p-5 text-muted text-[13px]">No enquiries yet.</div> : leads.slice(0, 4).map((l) => (
              <Link key={l.id} href={`/p/${l.pid}`} className="flex items-center gap-4 px-4 py-3 border-b border-line last:border-0 hover:bg-bg transition-colors text-[14px]">
                <span className="text-muted tnum text-[13px] w-[86px] shrink-0">{new Date(l.at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
                <span className="font-medium">{l.name}</span>
                <span className="text-muted truncate">{l.message || l.interests.join(", ") || l.email}</span>
                <span className="ml-auto text-[13px] text-muted shrink-0">{l.project}{l.unitRef ? ` · ${l.unitRef}` : ""}</span>
              </Link>
            ))}
          </div>

          <div className="mt-12 text-xs text-muted flex gap-4 items-center">
            <span>Preview: all data is stored locally in this browser.</span>
            <button className="underline" onClick={() => { if (confirm("Delete all local data and reload the demo project?")) resetDemo(); }}>Reset demo</button>
          </div>
        </>
      )}
    </HomeShell>
  );
}
