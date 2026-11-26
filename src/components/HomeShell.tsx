"use client";
import Link from "next/link";
import { useState } from "react";
import { useProfile } from "@/lib/store";
import { EXPERIENCE, ROLES } from "@/lib/profile";
import { ViewTransition } from "react";
import PascalBar from "./PascalBar";
import Playground from "./Playground";
import { usePathname } from "next/navigation";

const NAV: { href: string; label: string; hint: string }[] = [
  { href: "/", label: "Dashboard", hint: "Overview" },
  { href: "/websites", label: "Websites", hint: "Project sites" },
  { href: "/studio", label: "Floor plans", hint: "PDF → 2D & 3D" },
  { href: "/brochures", label: "Brochures", hint: "Print-ready PDF" },
  { href: "/leads", label: "Leads", hint: "All enquiries" },
];

export const USER = { name: "Davor", initials: "DB" };

/** shell for the home area: tools on the left, content on the right */
export default function HomeShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const profile = useProfile();
  // phones: the sidebar is a drawer behind the ☰ button; it closes on every page change
  const [menu, setMenu] = useState(false);
  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) { setLastPath(path); setMenu(false); }
  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
    <div className="flex-1 flex min-h-screen home-shell">
      <Playground />
      <header className="home-mtop">
        <Link href="/" aria-label="Streamnow Website Builder">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/streamnow.svg" alt="streamnow" style={{ height: 22 }} />
        </Link>
        <Link href="/new" className="btn btn-primary btn-sm">New website</Link>
        <button type="button" className="home-burger" aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu} onClick={() => setMenu(!menu)}><i /><i /><i /></button>
      </header>
      {menu ? <button type="button" className="home-scrim" aria-label="Close menu" onClick={() => setMenu(false)} /> : null}
      <aside className={`w-[232px] shrink-0 bg-surface flex flex-col sticky top-0 h-screen home-side ${menu ? "open" : ""}`}>
        <Link href="/" className="h-16 flex items-center px-5 border-b border-line" aria-label="Streamnow Website Builder">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/streamnow.svg" alt="streamnow" style={{ height: 24 }} />
        </Link>
        <div className="px-5 pt-4 eyebrow" style={{ fontSize: 10 }}>Website Builder</div>
        <nav className="p-3 grid gap-0.5" aria-label="Tools">
          {NAV.map((n) => {
            const on = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className={`nav-item px-3 py-2 pl-[15px] transition-colors ${on ? "bg-sunken" : "hover:bg-bg"}`} style={{ borderRadius: 10 }}>
                {on ? <ViewTransition name="nav-on" share="nav-slide" default="none"><span className="nav-on" aria-hidden /></ViewTransition> : null}
                <span className={`block text-[14px] ${on ? "font-semibold" : "font-medium"}`}>{n.label}</span>
                <span className="block text-[12px] text-muted">{n.hint}</span>
              </Link>
            );
          })}
        </nav>
        <div className="px-3 mt-2">
          <Link href="/new" className="btn btn-primary w-full">New website</Link>
        </div>
        <div className="mt-auto p-4 border-t border-line flex items-center gap-3">
          <span className="w-8 h-8 flex items-center justify-center text-xs font-semibold" style={{ borderRadius: "50%", background: "var(--accent)", color: "var(--accent-ink)" }}>{USER.initials}</span>
          <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium">{USER.name}</span><span className="block text-[12px] text-muted truncate">{profile ? `${ROLES.find((r) => r.id === profile.role)?.label ?? profile.roleOther ?? "Other"} · ${EXPERIENCE.find((x) => x.id === profile.experience)?.label}` : "Demo account"}</span></span>
          <Link href="/new?profile=1" className="btn btn-sm btn-ghost" title="Edit your profile" aria-label="Edit your profile">Edit</Link>
        </div>
      </aside>
      <main className="flex-1 min-w-0 px-8 pt-10 pb-32 home-main"><div className="max-w-[1080px] mx-auto">{children}</div></main>
      <PascalBar mode="home" />
    </div>
    </ViewTransition>
  );
}

export function PageHead({ eyebrow, title, text, action }: { eyebrow: string; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-6 pb-6 mb-6 flex-wrap">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="text-[40px] leading-[1.05] font-semibold tracking-tight mt-2">{title}</h1>
        {text ? <p className="text-muted text-[16px] mt-3 max-w-[46em]">{text}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** a friendly empty page: one sentence of encouragement and exactly one thing to do */
export function EmptyState({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="empty rise">
      <span className="empty-art" aria-hidden><i /><i /><i /></span>
      <div className="empty-title">{title}</div>
      <p>{text}</p>
      {action}
    </div>
  );
}
