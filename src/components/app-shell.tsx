"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Activity, ArrowRight, CalendarDays, Clock3, Menu, Search, Users, X } from "lucide-react";
import { useSupabase } from "@/lib/supabase-context";

type Props = {
  active: "overview" | "athletes";
  breadcrumb: string;
  campCount: number;
  athleteCount: number;
  search?: { value: string; onChange: (value: string) => void; label: string };
  children: ReactNode;
};

export function AppShell({ active, breadcrumb, campCount, athleteCount, search, children }: Props) {
  const { client, session } = useSupabase();
  const [navOpen, setNavOpen] = useState(false);
  const email = session?.user.email ?? "";
  const initials = client ? (email.slice(0, 2).toUpperCase() || "AC") : "JD";
  const closeNav = () => setNavOpen(false);

  return (
    <div className="app-shell" id="top">
      <aside className={`sidebar ${navOpen ? "sidebar-open" : ""}`}>
        <Link className="brand" href="/" aria-label="Stride home" onClick={closeNav}>
          <span className="brand-mark"><Activity size={20} strokeWidth={2.6} /></span>
          <span>stride<span className="brand-light">camp</span></span>
        </Link>

        <div className="workspace-switcher">
          <div className="workspace-avatar">S</div>
          <div className="workspace-copy"><strong>Stride Athletics</strong><span>{client ? email : "Demo workspace"}</span></div>
        </div>

        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation" className="main-nav">
          <Link className={`nav-link ${active === "overview" ? "nav-link-active" : ""}`} href="/" onClick={closeNav}><Activity size={18} />Overview</Link>
          <Link className="nav-link" href="/#camps" onClick={closeNav}><CalendarDays size={18} />Camps<span className="nav-count">{campCount}</span></Link>
          <Link className="nav-link" href="/#schedule" onClick={closeNav}><Clock3 size={18} />Schedule</Link>
          <Link className={`nav-link ${active === "athletes" ? "nav-link-active" : ""}`} href="/participants" onClick={closeNav}><Users size={18} />Athlete records<span className="nav-count">{athleteCount}</span></Link>
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon"><Activity size={16} /></div>
            <strong>Keep your camps moving</strong>
            <p>Record payments to confirm places, then take attendance as athletes arrive.</p>
            <Link href="/#schedule" onClick={closeNav}>View schedule <ArrowRight size={14} /></Link>
          </div>
          {client ? (
            <button className="profile-button" onClick={() => client.auth.signOut()} type="button">
              <span className="profile-avatar">{initials}</span>
              <span className="profile-copy"><strong>{email}</strong><span>Click to sign out</span></span>
            </button>
          ) : (
            <div className="profile-button">
              <span className="profile-avatar">JD</span>
              <span className="profile-copy"><strong>Jordan Davis</strong><span>Demo admin</span></span>
            </div>
          )}
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setNavOpen(!navOpen)} aria-label="Toggle navigation" type="button">
            {navOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="breadcrumbs"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{breadcrumb}</strong></div>
          <div className="topbar-actions">
            {search && (
              <label className="global-search"><Search size={17} /><input aria-label={search.label} placeholder={search.label} value={search.value} onChange={(event) => search.onChange(event.target.value)} /></label>
            )}
            <span className="topbar-avatar" aria-label={client ? email : "Jordan Davis"}>{initials}</span>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
