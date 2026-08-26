"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

type DemoShellProps = {
  children: ReactNode;
};

type NavigationItem = {
  href: string;
  label: string;
  section?: "Solicitudes" | "Operación";
};

const navigationItems: readonly NavigationItem[] = [
  { href: "/dashboard", label: "Mi panel", section: "Solicitudes" },
  { href: "/tickets/new", label: "Crear solicitud" },
  { href: "/tickets", label: "Mi historial" },
  { href: "/tech", label: "Panel técnico", section: "Operación" },
  { href: "/tech/tickets", label: "Cola de trabajo" },
  { href: "/supervisor", label: "Vista supervisión" },
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

  return (
    <div className="demo-app-shell">
      <header className="demo-header">
        <div className="demo-header-leading">
          <button
            className="demo-menu-button"
            type="button"
            aria-label={isSidebarOpen ? "Cerrar navegación" : "Abrir navegación"}
            aria-expanded={isSidebarOpen}
            aria-controls="demo-sidebar"
            onClick={() => setSidebarOpen((open) => !open)}
          >
            <MenuGlyph open={isSidebarOpen} />
          </button>
          <Link className="demo-brand" href="/dashboard" onClick={() => setSidebarOpen(false)}>
            <DeskWorkMark />
            <span>DeskWork</span>
          </Link>
          <span className="demo-header-divider" aria-hidden="true" />
          <span className="demo-header-context">Maqueta operativa</span>
        </div>
        <div className="demo-header-trailing">
          <span className="demo-local-badge">Local</span>
          <span className="demo-user-avatar" aria-label="Usuario de demostración">D</span>
        </div>
      </header>

      <div className="demo-app-body">
        <aside
          className={`demo-sidebar ${isSidebarOpen ? "demo-sidebar-open" : ""}`}
          id="demo-sidebar"
        >
          <nav className="demo-navigation" aria-label="Navegación de la maqueta">
            {navigationItems.map((item, index) => {
              const isActive = pathname === item.href;
              const previousItem = navigationItems[index - 1];
              const showSection = item.section && (!previousItem || previousItem.section !== item.section);

              return (
                <div className="demo-navigation-entry" key={item.href}>
                  {showSection ? <p className="demo-navigation-section">{item.section}</p> : null}
                  <Link
                    className={`demo-navigation-link ${isActive ? "demo-navigation-link-active" : ""}`}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <span className="demo-navigation-dot" aria-hidden="true" />
                    {item.label}
                  </Link>
                </div>
              );
            })}
          </nav>

          <div className="demo-sidebar-note">
            <span className="demo-sidebar-note-label">Entorno de demo</span>
            <p>Interacción local. No usa datos ni servicios de Foundation.</p>
          </div>
        </aside>

        {isSidebarOpen ? (
          <button
            className="demo-sidebar-scrim"
            type="button"
            aria-label="Cerrar menú lateral"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        <main className="demo-main" id="contenido-principal">
          {children}
          <footer className="demo-footer">
            <span>DeskWork · maqueta operativa</span>
            <span>UI local · sin conexión a Foundation</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
