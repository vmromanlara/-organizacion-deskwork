"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LocaleSwitcher, useI18n } from "@/i18n";

type DemoShellProps = {
  children: ReactNode;
};

type NavigationItem = {
  href: string;
  labelKey:
    | "nav.dashboard"
    | "nav.newTicket"
    | "nav.history"
    | "nav.techDashboard"
    | "nav.techQueue"
    | "nav.supervisor";
  sectionKey?: "nav.sectionRequests" | "nav.sectionOperations";
};

const navigationItems: readonly NavigationItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", sectionKey: "nav.sectionRequests" },
  { href: "/tickets/new", labelKey: "nav.newTicket" },
  { href: "/tickets", labelKey: "nav.history" },
  { href: "/tech", labelKey: "nav.techDashboard", sectionKey: "nav.sectionOperations" },
  { href: "/tech/tickets", labelKey: "nav.techQueue" },
  { href: "/supervisor", labelKey: "nav.supervisor" },
];

function DeskWorkMark() {
  return (
    <span className="demo-brand-mark" aria-hidden="true">
      <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="6" y="10" width="44" height="36" rx="10" fill="currentColor" />
        <path d="M15 18H41V35H15V18Z" stroke="currentColor" strokeWidth="2" />
        <path d="M15 24H41" stroke="currentColor" strokeWidth="2" />
        <circle cx="20" cy="21" r="1" fill="currentColor" />
        <circle cx="24" cy="21" r="1" fill="currentColor" />
        <path d="M28 39H36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function MenuGlyph({ open }: { open: boolean }) {
  return (
    <svg className="demo-menu-glyph" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {open ? (
        <>
          <path d="M6 6L18 18" />
          <path d="M18 6L6 18" />
        </>
      ) : (
        <>
          <path d="M4 7H20" />
          <path d="M4 12H20" />
          <path d="M4 17H20" />
        </>
      )}
    </svg>
  );
}

export function DemoShell({ children }: DemoShellProps) {
  const pathname = usePathname();
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const { t, locale } = useI18n();

  return (
    <div className="demo-app-shell">
      <header className="demo-header">
        <div className="demo-header-leading">
          <button
            className="demo-menu-button"
            type="button"
            aria-label={isSidebarOpen ? t("shell.menuClose") : t("shell.menuOpen")}
            aria-expanded={isSidebarOpen}
            aria-controls="demo-sidebar"
            onClick={() => setSidebarOpen((open) => !open)}
          >
            <MenuGlyph open={isSidebarOpen} />
          </button>
          <Link className="demo-brand" href="/dashboard" onClick={() => setSidebarOpen(false)}>
            <DeskWorkMark />
            <span>{t("shell.brand")}</span>
          </Link>
          <span className="demo-header-divider" aria-hidden="true" />
          <span className="demo-header-context">{t("shell.contextBadge")}</span>
        </div>
        <div className="demo-header-trailing">
          <LocaleSwitcher />
          <span className="demo-local-badge" aria-hidden="true">{locale.toUpperCase()}</span>
          <span className="demo-user-avatar" aria-label={t("shell.environmentLabel")}>D</span>
        </div>
      </header>

      <div className="demo-app-body">
        <aside
          className={`demo-sidebar ${isSidebarOpen ? "demo-sidebar-open" : ""}`}
          id="demo-sidebar"
        >
          <nav className="demo-navigation" aria-label={t("shell.sidebarAria")}>
            {navigationItems.map((item, index) => {
              const isActive = pathname === item.href;
              const previousItem = navigationItems[index - 1];
              const showSection =
                item.sectionKey &&
                (!previousItem || previousItem.sectionKey !== item.sectionKey);

              return (
                <div className="demo-navigation-entry" key={item.href}>
                  {showSection ? (
                    <p className="demo-navigation-section">{t(item.sectionKey!)}</p>
                  ) : null}
                  <Link
                    className={`demo-navigation-link ${isActive ? "demo-navigation-link-active" : ""}`}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <span className="demo-navigation-dot" aria-hidden="true" />
                    {t(item.labelKey)}
                  </Link>
                </div>
              );
            })}
          </nav>

          <div className="demo-sidebar-note">
            <span className="demo-sidebar-note-label">{t("shell.environmentLabel")}</span>
            <p>{t("shell.environmentBody")}</p>
          </div>
        </aside>

        {isSidebarOpen ? (
          <button
            className="demo-sidebar-scrim"
            type="button"
            aria-label={t("shell.sidebarScrimClose")}
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        <main className="demo-main" id="contenido-principal">
          {children}
          <footer className="demo-footer">
            <span>{t("shell.footerLeft")}</span>
            <span>{t("shell.footerRight")}</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
