"use client";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowLeft,
  BookOpen,
  FileCheck2,
  GitCompareArrows,
  LayoutDashboard,
  Menu,
  Network,
  Plus,
  Settings,
  X,
} from "lucide-react";
import { Brand } from "./brand";
import WalletButton from "./wallet-button";

const navigation = [
  { view: "dashboard", label: "Overview", icon: LayoutDashboard },
  { view: "scanner", label: "New investigation", icon: Plus },
  { view: "history", label: "Scan history", icon: Activity },
  { view: "comparisons", label: "Comparisons", icon: GitCompareArrows },
  { view: "evidence", label: "Evidence graph", icon: Network },
  { view: "passports", label: "Hook Passports", icon: FileCheck2 },
  { view: "settings", label: "Settings", icon: Settings },
  { view: "deploy", label: "Operate", icon: Network },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState("dashboard");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    setView(q.get("view") || (q.has("scan") ? "scanner" : "dashboard"));
  }, []);
  const title =
    navigation.find((item) => item.view === view)?.label ||
    (view === "registry" ? "Report registry" : "Investigation");
  return (
    <div className="app-shell">
      <aside
        className={open ? "app-sidebar is-open" : "app-sidebar"}
        aria-label="Workbench navigation"
      >
        <a className="sidebar-brand" href="/">
          <Brand />
          <span>Investigation workbench</span>
        </a>
        <div className="sidebar-section-label">Workspace</div>
        <nav>
          {navigation.map(({ view: id, label, icon: Icon }) => (
            <a
              key={id}
              className={view === id ? "active" : ""}
              aria-current={view === id ? "page" : undefined}
              href={"/app?view=" + id}
              onClick={() => setOpen(false)}
            >
              <Icon size={17} strokeWidth={1.7} />
              {label}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <p>
            Observe the contract.
            <br />
            Trace the evidence.
            <br />
            Preserve the record.
          </p>
          <a href="/" className="back-site">
            <ArrowLeft size={15} /> Back to Klyro
          </a>
        </div>
      </aside>
      {open && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="app-main">
        <header className="app-topbar">
          <button
            className="shell-menu"
            aria-label={
              open ? "Close workspace navigation" : "Open workspace navigation"
            }
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={21} /> : <Menu size={21} />}
          </button>
          <div>
            <span className="app-breadcrumb">Klyro / Workbench</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <WalletButton />
            <span className="network-label">
              <span aria-hidden="true" className="network-glyph" />
              Read-only investigation
            </span>
            <a
              href="https://github.com/gnana2007/Klyro#readme"
              target="_blank"
              rel="noreferrer"
              aria-label="Open documentation"
            >
              <BookOpen size={18} />
            </a>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
