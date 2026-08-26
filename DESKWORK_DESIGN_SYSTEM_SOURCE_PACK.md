# DESKWORK — DESIGN SYSTEM SOURCE PACK v1.0

> **Purpose:** technical source pack for Claude's final Design System audit and specification. This is an inventory of the current repository, not a design proposal or a normalization exercise.
>
> **Audit date:** 2026-08-26  
> **Scope:** read-only inspection of the current code, the approved Brand Book HTML, and current project documentation.  
> **Product changes:** none.  
> **Evidence convention:** `file:line` points to the real source inspected. `NOT VERIFIED — REQUIRES BROWSER` means the fact cannot be established from source alone.

---

## 1. Baseline

| Item | Recorded value |
|---|---|
| Repository | `C:\Users\cargi\Cóndor Group\0. Matriz\Cóndor HUBTEC-LAB\Frabric Lab\Proyectos\DeskWork` |
| Branch | `main` |
| HEAD | `fd719a6b692cd8077d31d69352b79b662bf76a8b` |
| Node | `v24.19.0` |
| pnpm | `11.19.0` |
| Next.js package declaration | `^16.0.0` |
| React package declaration | `^19.0.0` |
| TypeScript package declaration | `^5.0.0` |
| Working tree before audit | Existing P0/demo and P1-01 changes: `src/app/(demo)/`, `src/components/demo/`, `src/mock/`, `src/shared/auth/`, `src/security/`, two untracked Foundation reports, and `src/components/auth-form.tsx`. They were pre-existing and not modified by this audit. |
| Runtime visual stylesheet | one file: `src/app/(demo)/demo.css` |
| Approved Brand Book reference | `deskwork/manual-de-marca.html` |

The demo is intentionally local: UI → mock data → local interaction. It is not Ticketing Core or a production presentation layer.

## 2. Repository/UI inventory

| Surface | Real files / route family | What exists now |
|---|---|---|
| App shell | `src/app/(demo)/layout.tsx`, `src/components/demo/demo-shell.tsx` | Shared shell, responsive sidebar, header, main and footer. |
| Requester | `/dashboard`, `/tickets`, `/tickets/new`, `/tickets/[id]` | Dashboard, history, six-step request form and requester detail. |
| Technician | `/tech`, `/tech/tickets`, `/tech/tickets/[id]` | Technical dashboard, filterable/paginated queue and detail/actions. |
| Supervisor | `/supervisor` | KPI summary, state/priority distributions and 30-day bar trend. |
| Feedback | `loading.tsx`, `error.tsx`, `demo-feedback-state.tsx`, `demo-error-state.tsx` | Loading skeleton, empty and error state. |
| Runtime style source | `src/app/(demo)/demo.css` | Tokens, all demo component styling, responsive rules and motion. |
| Mock visual/domain data | `src/mock/deskwork-data.ts` | Categories, priorities, six states, tickets/events and KPI fixtures. |
| Shared visual modules | none outside the demo module | `src/shared/` contains auth/config/Supabase helpers, not icon, formatting or visual-token modules. |
| Foundation UI outside demo | `src/app/{login,register,app}`, `src/components/{auth-form,sign-out-button}.tsx` | Basic semantic authentication UI. It does not import `demo.css`; it is outside the demo design-system surface. |

There are no Tailwind files, component-library dependencies, public SVG assets, CSS Modules, Sass files, or a global product stylesheet in the inspected repository.

## 3. Real component catalog

| Component | File | Type | Used in | Variants / states | Dependencies | Reusable | Observations |
|---|---|---|---|---|---|---|---|
| `DemoShell` | `src/components/demo/demo-shell.tsx:60` | layout, navigation | all demo routes via layout | desktop sidebar; tablet/mobile overlay; active nav item | Next Link/navigation, React state | Yes | Header, inline brand SVG, sidebar, scrim, footer. |
| `DeskWorkMark` | `demo-shell.tsx:26` | primitive, icon | `DemoShell` | fixed inline SVG | none | Internal only | Isotope-like mark; `aria-hidden`. |
| `MenuGlyph` | `demo-shell.tsx:41` | primitive, icon | `DemoShell` | menu / close | none | Internal only | Inline SVG; `aria-hidden`. |
| `DemoPage` | `demo-page.tsx:8` | layout, utility | not imported by current demo routes | scaffold / route-status | none | Yes, unused | D1 scaffold remains exported but no route consumes it. |
| `DemoStateProvider` | `demo-state.tsx:93` | utility, state | demo layout | hydration; local persistence; ticket state transitions | React Context, mock fixtures | Yes | Non-visual provider; affects dynamic visual state. |
| `useDemoState` | `demo-state.tsx:165` | utility | requester, technical, supervisor UI | error outside provider | React Context | Yes | State source for live views except requester dashboard. |
| `DemoEmptyState` | `demo-feedback-state.tsx:10` | feedback | history, technical queue | CTA optional | Next Link | Yes | Empty / actionable variation. |
| `DemoLoadingState` | `demo-feedback-state.tsx:23` | feedback | route loading, form/detail hydration | skeleton | none | Yes | `aria-busy`, `role=status`; pulse CSS. |
| `DemoErrorState` | `demo-error-state.tsx:3` | feedback | demo error boundary | retry action | error boundary `reset` | Yes | `role=alert`; Unicode `!` mark. |
| `NewTicketForm` | `new-ticket-form.tsx:26` | form, ticketing | `/tickets/new` | six steps; category selected; validation error; attachment filename; confirmation | React, mock data, demo state | No (flow-specific) | Real `<form>` and keyboard/heading focus logic. |
| `RequestHistory` | `request-history.tsx:14` | data display, ticketing | `/tickets` | rows / empty | mock catalog, demo state | No (requester-specific) | Semantic table with a horizontal wrapper. |
| `RequesterTicketDetail` | `requester-ticket-detail.tsx:28` | ticketing, data display | `/tickets/[id]` | loading; unavailable ticket; attachment/SLA/history variants | mock catalog, demo state | No | Requester-facing detail with facts and timer card. |
| `LiveTimer` | `tech-workspace.tsx:15` | utility, technical | queue and technical detail | compact / full | React interval, mock ticket | Yes | Inline clock SVG, one-second client update. |
| `TechDashboard` | `tech-workspace.tsx:23` | dashboard, technical | `/tech` | active/at-risk/none next ticket | demo state | No | Four KPI cards and focus CTA. |
| `TechQueue` | `tech-workspace.tsx:34` | technical, data display | `/tech/tickets` | filters; sort directions; pagination; empty | React state, mock catalog, demo state | No | Semantic table; four selects; two sort controls. |
| `TechTicketDetail` | `tech-workspace.tsx:68` | ticketing, technical | `/tech/tickets/[id]` | loading; unavailable; five actions; action active/disabled | demo state, mock catalog | No | Live timer, action matrix, history. |
| `SupervisorDashboard` | `supervisor-dashboard.tsx:12` | dashboard, supervisor | `/supervisor` | summary, distributions, trend | mock KPI series/catalog, demo state | No | Bars use inline percentage styles. |
| `AuthForm` | `src/components/auth-form.tsx:11` | form, Foundation | `/login`, `/register` | login/register; error/notice/loading | Supabase browser client | Outside demo | No CSS in this Source Pack applies to it. |
| `SignOutButton` | `src/components/sign-out-button.tsx:7` | utility, Foundation | `/app` | loading | Supabase browser client | Outside demo | No CSS in this Source Pack applies to it. |

## 4. Real token inventory

All runtime CSS custom properties are declared once in `src/app/(demo)/demo.css:3-59`. No second runtime token layer was found.

## 5. Color matrix

| Token / actual value | File | Use | Frequency / duplicate | Possible equivalent | Observation |
|---|---|---|---|---|---|
| `--color-brand-primary` `#0d4f4a` | `demo.css:4` | primary CTA, active nav, timer, bars, focus semantic | high; repeated via variable | Brand Book `--primary` | Exact value match. |
| `--color-brand-primary-hover` / `active` `#0a3d39` | `demo.css:5-6` | hover nav and CTAs | two named tokens, same value | Brand Book `--primary-2` | Duplicated value intentionally named by interaction state. |
| `--color-brand-primary-contrast`, `--color-text-inverse` `#ffffff` | `demo.css:7,25` | inverse text | duplicate value | Brand Book white | Two semantic names share one value. |
| `--color-brand-primary-muted-contrast` `rgba(255,255,255,0.7)` | `demo.css:8` | timer-card labels | one token | Brand Book cover alpha values | Runtime only. |
| `--color-brand-secondary`, `--color-text-secondary` `#3a4256` | `demo.css:9,23` | secondary/regular text | duplicate value | Brand Book `--ink-2` | Two semantic names share one value. |
| `--color-brand-accent` `#6ee7df` | `demo.css:10` | declared only | no consumer found | Brand Book accent | Declared but currently unused by demo selectors. |
| success `#047857` / surface `#d1fae5` | `demo.css:11,15` | P4, resolved/closed, local/available statuses | high | Brand Book `--low` / `#d1fae5` | Exact foreground match. |
| warning `#a16207` / surface `#fef3c7` | `demo.css:12,16` | P2, in process, awaiting user | high | Brand Book `--normal` / `#fef3c7` | Exact normal/amber match. |
| danger `#b3331f` / surface `#fef0ee` | `demo.css:13,17` | P1, escalated, error | high | Brand Book `--critical`; manual has other red surface | Foreground matches. |
| info `#1d4ed8` / surface `#e0f2fe` | `demo.css:14,18` | P3, open | high | Brand Book `--info` / status open | Exact values. |
| surface background/elevated/muted | `demo.css:19-21` | canvas, cards, selection/hover | high | Brand Book `--bg`, `--bg-elev`, `--primary-fade` | Exact values. |
| text primary/muted | `demo.css:22,24` | default/muted text | high | Brand Book `--ink`, `--muted` | Exact values. |
| border subtle/strong | `demo.css:26-27` | separators and component borders | high | Brand Book `--line-soft`, `--line` | Exact values. |
| focus `#0d4f4a` | `demo.css:28` | global `:focus-visible` | one semantic alias | brand primary | Exact shared value. |
| raw `rgba(255,255,255,0.72)` | `demo.css:1404` | emphasized KPI helper text | one literal | muted inverse text | Hardcoded alpha, not a token. |
| raw `rgba(20,23,30,0.32)` | `demo.css:1734` | mobile sidebar scrim | one literal | overlay token candidate | Hardcoded overlay alpha, not a token. |

## 6. Typography matrix

| Current token/value | Evidence | Current use | Observation |
|---|---|---|---|
| `--font-sans: Outfit, system-ui, sans-serif` | `demo.css:29`; imported at `:1` | shell/body, forms, controls | runtime font source is Google Fonts. |
| `--font-display: Outfit, system-ui, sans-serif` | `demo.css:31` | H1/H2/cards/brand | Same family as sans, separately named. |
| `--font-mono: JetBrains Mono, monospace` | `demo.css:30` | timers, IDs, KPI figures, request-step numerals | Used consistently for operational data. |
| sizes | `demo.css:142,194,264,367,458,609,973,1069,1391,1579` | declared through spacing variables: 12, 16, 24, 32, 48, 64, 80 px; headings also use `clamp()` and `4vw`/`5vw` | There is no separate type-size token family. `--space-*` also acts as `font-size`. |
| weights | `demo.css:143,195,219,265,632,834,1170,1250,1392` | 300, 400, 500, 600, 700 | Actual values match available imported Outfit weights. |
| line height | `demo.css:72,369,376,460,498,975,1071,1579` | 1, 1.05, 1.08, 1.15, 1.45, 1.5, 1.55 | Values are literal; no line-height token names. |
| letter spacing | `demo.css:145,196,367,459,633,742,974,1393,1574` | `-0.06em` to `0.1em` | Values are literal; no tracking token names. |

## 7. Spacing matrix

| Token | Value | Evidence | Use |
|---|---:|---|---|
| `--space-0` | 0 | `demo.css:32` | resets, zero borders/offsets. |
| `--space-1` | 4px | `:33` | tight gaps, focus outline/offset. |
| `--space-2` | 8px | `:34` | compact control/card gaps. |
| `--space-3` | 12px | `:35` | labels, common gaps. |
| `--space-4` | 16px | `:36` | normal gaps/padding/text. |
| `--space-5` | 24px | `:37` | card/header padding, large type. |
| `--space-6` | 32px | `:38` | page/form padding. |
| `--space-7` | 48px | `:39` | desktop page spacing / large figures. |
| `--space-8` | 64px | `:40` | mobile header / large headings. |
| `--space-9` | 80px | `:41` | maximum heading clamp. |

**Hardcoded structural dimensions:** `1px` borders, `72px` header, `272px` sidebar, `1440px` max width are named tokens; but `960px`, `800px`, `760px`, `720px`, `680px`, `640px`, `440px`, `420px`, `224px`, `180px`, `164px`, `144px`, `116px`, `100px`, `84px` and percentage widths remain literal selector values (`demo.css:338,361,622,941,1079,1144,1199,1367,1452,2015,2021,2080-2081`). They are documented, not normalized.

## 8. Radius/shadow matrix

| Token | Value | Evidence | Uses |
|---|---|---|---|
| `--radius-sm` | 6px | `demo.css:42` | inputs, error, skeleton, menu. |
| `--radius-md` | 10px | `:43` | buttons, nav links, category cards, priority markers. |
| `--radius-lg` | 16px | `:44` | cards, feedback, attachment field. |
| `--radius-full` | 9999px | `:45` | avatars, pills, dots, bars. |
| `--shadow-sm` | `0 1px 2px rgba(20,23,30,.04)` | `:46` | all standard cards. |
| `--shadow-md` | `0 4px 16px -2px rgba(20,23,30,.06)` | `:47` | declared; no consumer found. |
| `--shadow-lg` | `0 12px 32px -4px rgba(20,23,30,.08)` | `:48`, `:1718` | mobile sidebar. |

## 9. Motion matrix

| Token / rule | Evidence | Real behavior |
|---|---|---|
| `--duration-fast: 150ms`; `--duration-normal: 250ms`; `--duration-slow: 400ms`; `--easing-standard: ease` | `demo.css:49-52` | timing primitives. |
| Links/buttons | `:269`, `:1146`, `:1254`, `:1339`, `:1454` | background/border/color transitions; primary action translates `-1px` on hover (`:1348-1350`). |
| Sidebar | `:1723-1724` | tablet/mobile off-canvas `translateX` transition. |
| Skeleton | `:2067-2095` | `demo-skeleton-pulse`, 400ms, infinite alternate, opacity .55→1. |
| Reduced motion | `:2111-2120` | transitions set to zero and skeleton animation disabled. |

## 10. Breakpoint matrix

| Breakpoint | File | Rule | Behavior |
|---:|---|---|---|
| `max-width: 1024px` | `demo.css:1704-1765` | tablet and below | hamburger displayed; sidebar becomes fixed off-canvas + scrim; main padding 32px; summary/category grids become two columns; headings/queue stack. |
| `max-width: 640px` | `demo.css:1767-2003`, `:2097-2109` | mobile | 64px header; context/badge hidden; 24/16px main padding; CTA full width; cards/grid/technical details/supervisor/status actions collapse; request progress is 3 columns; tables retain wrapper overflow rather than transform. |
| `prefers-reduced-motion: reduce` | `demo.css:2111-2120` | user preference | transition duration zero, skeleton no animation. |

`NOT VERIFIED — REQUIRES BROWSER`: exact perceived layout, overflow, scroll reachability, focus retention while opening/closing the sidebar, and touch-target geometry at each viewport.

## 11. UI states

| State | Present | Evidence |
|---|---|---|
| default | PRESENT | base selectors throughout `demo.css`. |
| hover | PRESENT | navigation `:280`, category `:1149`, buttons `:1264`, rows `:1461`, trend bars `:953`. |
| focus / focus-visible | PRESENT | global visible outline `:1699-1702`; sort control `:653-656`. |
| active / selected | PRESENT | nav active `:285-293`; form progress current/completed `:1032-1051`; category selected `:1154-1158`; status action active `:845-851`. |
| disabled | PRESENT | pagination `:798-801`; current state action disabled `tech-workspace.tsx:75`. |
| loading | PRESENT | `DemoLoadingState`; skeleton `demo.css:2062-2095`. |
| error | PRESENT | form error `demo.css:1222-1230`; route error state `demo-error-state.tsx:5-12`. |
| success | PRESENT | confirmation step; available/local badges; semantic-success state. |
| warning | PRESENT | semantic-warning status/priority visuals. |
| empty | PRESENT | `DemoEmptyState`, history and queue branches. |
| readonly | PARTIAL | identification/review use non-editable `<dl>` data; no `readonly` control style found. |

## 12. Domain states

All six code values are defined in `src/mock/deskwork-data.ts:42-49` and mapped to label/visual tone at `:270-277`.

| Domain state | Code label | Visual tone | Status | Real surfaces |
|---|---|---|---|---|
| `ABIERTO` | Abierto | info | PRESENT | requester dashboard/history/detail; technician queue/detail; supervisor distribution. |
| `EN_PROCESO` | En proceso | warning | PRESENT | same surfaces plus operation action. |
| `ESPERANDO_USUARIO` | Esperando usuario | warning | PRESENT | same surfaces plus operation action. |
| `ESCALADO` | Escalado | danger | PRESENT | same surfaces plus operation action. |
| `RESUELTO` | Resuelto | success | PRESENT | same surfaces plus operation action. |
| `CERRADO` | Cerrado | success | PRESENT | same surfaces plus operation action. |

The shared `demo-state-pill` carries both text and a color dot (`demo.css:1526-1560`); color is not the only representation.

## 13. Priority system

| Priority | Data definition | Color / indicator | Table | Detail | Dashboard | Accessibility evidence |
|---|---|---|---|---|---|---|
| P1 / Crítica | `mock data:264` | danger foreground `#b3331f`, danger surface `#fef0ee`, mono square marker | requester/technical tables | requester and technical badges | supervisor distribution | `aria-label` exists on requester dashboard/detail markers; table/technical markers expose visible `P1` text but have no specific aria-label. |
| P2 / Alta | `:265` | warning `#a16207`, `#fef3c7` | yes | yes | yes | visible text marker. |
| P3 / Normal | `:266` | info `#1d4ed8`, `#e0f2fe` | yes | yes | yes | visible text marker. |
| P4 / Baja | `:267` | success `#047857`, `#d1fae5` | yes | yes | yes | visible text marker. |

`demo-priority-marker` is 48×48px (`demo.css:1488-1517`) and uses mono typography. There is no priority-specific icon besides the textual code.

## 14. Iconography

| Element | Method | File | Function | Functional / decorative | Accessibility |
|---|---|---|---|---|---|
| Brand mark | inline SVG | `demo-shell.tsx:26-39` | home/brand marker | decorative inside labelled DeskWork link | `aria-hidden=true`. |
| Menu/close | inline SVG | `demo-shell.tsx:41-58` | opens/closes navigation | functional | SVG hidden; button has dynamic aria-label/expanded/controls. |
| Clock | inline SVG | `tech-workspace.tsx:13` | timer context | decorative accompanying text | `aria-hidden=true`. |
| CTA plus | Unicode `+` | dashboard `page.tsx:51-54` | create-request affordance | decorative | `aria-hidden=true`. |
| Sort arrows | Unicode `↑`, `↓`, `↕` | `tech-workspace.tsx:62` | current sort direction | functional indicator | glyph is hidden; button contains dynamic aria-label. |
| Back arrow | Unicode `←` | `tech-workspace.tsx:74` | back link | functional plus text | visible text gives purpose; no additional aria label. |
| Empty mark | Unicode `○` | `demo-feedback-state.tsx:13` | empty state decoration | decorative | `aria-hidden=true`. |
| Error mark | Unicode `!` | `demo-error-state.tsx:6` | error decoration | decorative | `aria-hidden=true`. |
| Status dot | CSS circle / `currentColor` | `demo.css:1535-1539` | state accent | decorative because label is adjacent | requester dashboard hides dot; some other uses do not explicitly set `aria-hidden`; visible label remains present. |

No icon-library package and no emoji characters were found in the runtime demo sources. Inline SVG and Unicode glyphs are the actual implementation, diverging from the Brand Book's stated Lucide-only direction.

## 15. Forms

`NewTicketForm` is a genuine six-step form (`new-ticket-form.tsx:110`) with `onSubmit`, custom Enter handling (`:82-91`), logical heading focus on step change (`:35-41`) and an explicit form name via `aria-labelledby`.

| Control | Evidence | Labels / validation / state |
|---|---|---|
| identification | `:118-123` | semantic `<dl>` review only; no input. |
| category | `:137-159` | `<fieldset>` + `<legend>`; each radio has `id` and matching label `htmlFor`; error uses `aria-describedby` and `role=alert`. |
| description | `:174-190` | label `htmlFor`; textarea has max 600, helper `aria-describedby`, `aria-invalid`, 10-character local validation and alert error. |
| attachment | `:205-215` | label `htmlFor`; file accepts `image/*`; displays selected filename; explicitly mock-only. |
| review | `:223-240` | non-editable `<dl>` review. |
| confirmation | `:243-255` | local ticket ID and CTA links; no production submit. |
| navigation buttons | `:124-253` | primary controls are `type=submit`; Back controls are `type=button`; button styles have 44px min-height. |

The Foundation `AuthForm` is outside this demo pack but uses `<form onSubmit>`, native labels and `role=alert`/`role=status` (`src/components/auth-form.tsx:36-58`).

## 16. Tables

| Table | Columns / controls | State / interaction | Responsive evidence |
|---|---|---|---|
| Requester history | ID, request, state, updated (`request-history.tsx:28-33`) | ticket rows or `DemoEmptyState`; no sort/pagination | `.demo-history-table-wrap { overflow-x:auto }`, min-width 760px (`demo.css:614-623`). |
| Technical queue | priority, request, state, technician, updated/timer (`tech-workspace.tsx:61-62`) | four filters, priority/updated sorting, 8-row page size, disabled pagination and empty state | wrapper horizontal overflow; controls become 2-column filters/mobile pagination stacks at 640px (`demo.css:1940-1965`). |

No loading or error state belongs directly to a table component; route/hydration loading and route error handling are outside these table branches. `NOT VERIFIED — REQUIRES BROWSER`: horizontal-scroll usability and data-density readability on mobile.

## 17. Navigation

* Header, sidebar, footer and mobile scrim are in `demo-shell.tsx:64-142`.
* Real navigation destinations are `/dashboard`, `/tickets/new`, `/tickets`, `/tech`, `/tech/tickets`, `/supervisor` (`:17-24`). There is no hardcoded `/tickets/DW-1024` link.
* Current route gets `aria-current="page"` (`:105-113`) and active visual style (`demo.css:285-293`).
* At `≤1024px`, the hamburger control exposes `aria-label`, `aria-expanded` and `aria-controls`; sidebar becomes an overlay (`demo.css:1704-1742`). At `≤640px`, header context, divider and local badge disappear (`:1767-1800`).
* Breadcrumbs and a generic sidebar-collapse mode do not exist. Technical detail has a single back link (`tech-workspace.tsx:74`).

## 18. Dashboards

| Dashboard | Real components/panels | Shared visual primitives |
|---|---|---|
| Requester `/dashboard` | hero CTA; four summary cards; ticket row list | `demo-dashboard-hero`, `demo-primary-action`, `demo-summary-card`, `demo-ticket-row`. |
| Technical `/tech` | hero CTA; four queue KPI cards; next-priority focus card | same hero/cards; `demo-tech-focus-card`. |
| Supervisor `/supervisor` | four KPI cards; two distribution cards; 30-day bar trend | same summary cards; `demo-supervisor-card`, `demo-distribution-bar`, `demo-trend-bars`. |

The supervisor trend has CSS bars and inline `width`/`height` percentages (`supervisor-dashboard.tsx:20-23`); it is not a chart library. The requester dashboard reads `mockTickets` directly (`dashboard/page.tsx:35-41`) while the other live dashboards use `useDemoState`; this is an existing mock-data presentation divergence, not a Design System conclusion.

## 19. Ticket UI

| Element | Data / visual | Interaction / responsive / accessibility |
|---|---|---|
| requester ticket row | title, ID, category, P1–P4 marker, state pill, timestamp (`dashboard/page.tsx:95-112`) | whole row link; mobile stacks at 640px; priority has aria-label; state visible text plus dot. |
| history/queue row | semantic table row with same marker/pill language | technical queue adds filters, sorting, live compact timer and pagination. |
| requester detail | context facts, timer breakdown, attachment presence, simulated SLA, event history (`requester-ticket-detail.tsx:44-48`) | unavailable-ticket branch; mobile detail grids stack. |
| technical detail | facts, full live timer, five state actions, history (`tech-workspace.tsx:74-76`) | action state changes only local demo state; action matrix becomes one column at 640px. |
| attachment | only filename/mock event evidence | no upload or persistence; explicitly stated in UI. |
| comments | no comment-entry UI | mock event type permits `commented`, but no component renders a comment composer. |

## 20. Accessibility evidence

| Evidence | Location |
|---|---|
| structural landmarks | header, `aside`, labelled `nav`, `main`, footer in `demo-shell.tsx:66-140`. |
| current navigation | `aria-current=page`, `demo-shell.tsx:105-113`. |
| mobile menu semantics | label/expanded/controls and labelled scrim, `demo-shell.tsx:68-77,125-131`. |
| focus visibility | global `.demo-app-shell :focus-visible`, `demo.css:1699-1702`. |
| form labels and validation relation | `new-ticket-form.tsx:110-215`; see Forms section. |
| error/live feedback | form alerts, route `role=alert`, loading/empty `role=status`, pagination `aria-live=polite`. |
| decorative icon handling | brand/menu/clock/plus/empty/error use `aria-hidden`; see Iconography. |
| reduced motion | `demo.css:2111-2120`. |
| native semantic data | `<table>`, `<fieldset>`, `<legend>`, `<dl>`, `<time>`, `<ol>` used across feature views. |

No source-only conclusion of WCAG conformance is made. `NOT VERIFIED — REQUIRES BROWSER`: keyboard traversal in every state, actual screen-reader announcement behavior, actual focus return after menu closure, contrast ratios in rendered font sizes, and user preference handling across browsers.

## 21. Responsive evidence

The only real width breakpoints are 1024px and 640px; the values in max-width properties are not media breakpoints. Components that change or collapse are documented in the Breakpoint matrix. Tables remain tables with horizontal scroll rather than becoming cards. The sidebar becomes an overlay only at `≤1024px`.

## 22. Duplications

| Duplicate / overlap | Evidence | Severity | Note |
|---|---|---|---|
| card construction repeated across selectors | `demo.css:396-403,582-591,865-870,1053-1058,1360-1369,1411-1417,1592-1602,1633-1639` | LOW | Same elevated surface/border/radius/shadow pattern is declared per component group, not a `.card` primitive. |
| primary and secondary controls | `demo.css:1240-1282`; `:1328-1351` | LOW | `demo-primary-action` duplicates much of `demo-primary-link/button` but adds CTA sizing/elevation/motion. |
| three card types use similar heading styles | `demo.css:603-612,880-892,1436-1442` | LOW | Shared visual purpose, separate selector groups. |
| same CSS values under multiple semantic tokens | color matrix | INFO | Primary active/hover, text inverse/brand contrast, secondary text/brand secondary. |

## 23. Divergences

| Divergence | Evidence | Severity |
|---|---|---|
| Brand Book calls for Lucide-only, no emoji; runtime uses inline SVG and functional Unicode glyphs instead. | manual `:650-651`; `demo-shell.tsx:26-58`, `tech-workspace.tsx:13,62,74`, feedback state. | MEDIUM |
| Brand Book uses a distinct high/orange `#c2410c` and waiting soft orange `#fed7aa`; runtime maps P2, `EN_PROCESO`, and `ESPERANDO_USUARIO` to the same warning `#a16207`/`#fef3c7`. | manual `:23-26,248-256,544-566`; mock `:264-277`; CSS `:1504-1507,1547-1550`. | MEDIUM |
| Brand Book declares `--primary-soft: #d9eae7`; runtime has no equivalent value/consumer and uses `#f0f7f5` as muted surface. | manual `:21`; CSS `:21`. | LOW |
| Brand Book shows a 4px scale and manual breakpoint 800px; runtime tokens use the same 4px increments but actual responsive breakpoints are 1024px and 640px. | manual `:688-714,117,135,261,293`; CSS `:32-41,1704,1767`. | MEDIUM |
| Runtime typography uses spacing tokens as type-size tokens; manual uses independent literal type samples. | CSS `:142,367,458`; manual `:57-60,588-628`. | LOW |

## 24. Hardcoded values

1. Raw alpha colors are present for the emphasized KPI helper text and the sidebar scrim (`demo.css:1404,1734`).
2. Layout/content constraints remain literals: 960, 800, 760, 720, 680, 640, 440 and 420px; component minimum heights include 116, 180, 164, 144, 100, 84 and 224px. See Spacing matrix.
3. Typography tracking and line-heights are literal. See Typography matrix.
4. Chart/bar geometry is inline style percentage data in `supervisor-dashboard.tsx:20-23`.
5. The demo has no raw hex colors in TSX components; CSS color literals are confined to token declarations except two alpha values above.

## 25. Manual vs Code comparison

| Element | Code current | Manual | Coincides | Divergence | Severity |
|---|---|---|---|---|---|
| Brand primary / hover | `#0d4f4a` / `#0a3d39` | same | Yes | none | INFO |
| neutrals/text/borders | `#fafaf7`, `#fff`, `#14171e`, `#3a4256`, `#7c7a72`, `#e9e3d6`, `#f0ebde` | same | Yes | none | INFO |
| font families | Outfit + JetBrains Mono | same | Yes | runtime weights max 700 while manual Google import includes 800 | LOW |
| spacing/radius/shadows | 4px increments; 6/10/16/pill; three documented shadows | same values | Yes | runtime combines type sizing with spacing names | LOW |
| functional priority palette | runtime has four tones | manual distinguishes critical/high/normal/low and their state surfaces | Partial | high and waiting treatments differ | MEDIUM |
| state count | six domain states in mock | manual visual examples say five states | No | manual visual vocabulary does not map one-to-one to real code states | MEDIUM |
| icons | inline SVG + Unicode | Lucide-only | No | runtime has no Lucide library | MEDIUM |
| responsive | 1024/640 media queries | 800px examples | No | different actual thresholds | MEDIUM |
| focus/reduced motion | present in runtime CSS | not established as a manual implementation rule in inspected HTML | N/A | runtime adds evidence beyond manual | INFO |

## 26. Claude audit cross-check

No standalone Claude Design System audit artifact was found in the repository or `C:\DeskWork`. The following cross-check evaluates the ten findings supplied in the PO authorization, not an unlocated report.

| Hallazgo Claude / supplied topic | Verificado en código | Refutado | No verificable | Evidencia |
|---|---|---|---|---|
| doble capa de tokens | No | Yes for runtime CSS | No | only `demo.css:3-59` declares CSS variables; Brand Book/skill are documents, not a second runtime CSS layer. |
| `--success` / `--warning` / `--error` | Partial | No | No | exact bare tokens absent; semantic equivalents `--color-semantic-success`, `warning`, `danger`, `info` exist at `demo.css:11-18`. |
| emoji funcional | No | Yes | No | no emoji found; inline SVG and Unicode symbols are used. |
| estados incompletos | No | Yes | No | all six domain states are defined and rendered, mock `:42-49,270-277`; state surfaces listed above. |
| spacing fuera de escala | Partial | No | No | base scale uses 4px increments, but hardcoded structural dimensions and literal line-heights/tracking exist. |
| reduced-motion | Yes | No | Browser verification pending | source rule `demo.css:2111-2120`. |
| contraste | No | No | Yes | actual color values are inventoried; no contrast-tool/browser measurement performed. |
| catálogo de componentes | Yes | No | No | complete exported component catalog is Section 3. |
| responsive | Yes | No | Browser verification pending | only 1024/640 source breakpoints; matrix in Section 10. |
| accesibilidad | Yes, as evidence | No | Browser/screen-reader verification pending | semantic, aria, focus and reduced-motion evidence in Section 20. |

## 27. Confirmed findings

| Finding | Severity | Evidence |
|---|---|---|
| Runtime differs from the Brand Book's functional high/waiting color treatments. | MEDIUM | Section 23; exact values and mappings cited. |
| Runtime differs from the Brand Book's Lucide-only iconography instruction. | MEDIUM | Section 14 and manual `:650-651`. |
| Runtime breakpoints differ from the manual's 800px examples. | MEDIUM | Section 10 and manual CSS references. |
| Component/card and control styles are repeated rather than represented by one component primitive. | LOW | Section 22. |
| Some visual/structural values remain hardcoded rather than named tokens. | LOW | Section 24. |
| The runtime has no separate typographic scale token family. | LOW | Section 6. |

## 28. Refuted findings

| Finding | Result | Evidence |
|---|---|---|
| Runtime has two CSS token layers. | REFUTED | only `demo.css:3-59` declares runtime custom properties. |
| Runtime uses functional emoji. | REFUTED | source contains inline SVG, CSS forms and Unicode glyphs; no emoji found. |
| Six DeskWork states are absent/incomplete in code. | REFUTED | mock definitions and requester/tech/supervisor rendering listed in Sections 12 and 19. |
| No reduced-motion implementation exists. | REFUTED | `demo.css:2111-2120`. |

## 29. Unknown / requires visual validation

* `NOT VERIFIED — REQUIRES BROWSER`: visual alignment, responsive density and content overflow at 1024px/640px and intermediate widths.
* `NOT VERIFIED — REQUIRES BROWSER + contrast measurement`: WCAG contrast ratios for every rendered text/background pair, including muted text and alpha inverse text.
* `NOT VERIFIED — REQUIRES ASSISTIVE TECHNOLOGY`: actual screen-reader announcements for validation, pagination and error/loading states.
* `NOT VERIFIED — REQUIRES BROWSER`: keyboard focus/return behavior of the overlay sidebar and visible focus in all interactive control variants.
* `NOT VERIFIED — REQUIRES USER PREFERENCE ENVIRONMENT`: observed behavior with `prefers-reduced-motion`, although source provides a rule.

## 30. Recommendations for Claude

1. Use the runtime CSS variable list in Sections 4–9 as the actual token input. Do not assume manual names already exist in code.
2. Decide governance for the actual divergence between Brand Book `high`/waiting colors and the runtime's shared warning mapping; this Source Pack makes no choice.
3. Decide whether inline SVG + Unicode glyphs may remain or whether the Brand Book's Lucide-only statement should become an implementation constraint.
4. Decide whether card/control repetition is acceptable composition or should become a component primitive. Do not infer a current primitive that does not exist.
5. Separate spacing, typography, layout and motion scales if the final system requires it; today the runtime uses `--space-*` for both spacing and many font sizes.
6. Run browser/assistive-technology/contrast verification for every item in Section 29 before making conformance claims.
7. Preserve the six domain states and four priorities as real code vocabulary; the manual's five visual examples do not replace them automatically.

---

## Source status

### SOURCE OF TRUTH ACTUAL

This is the observed source order for the next audit; it is documentation of current evidence, not a governance decision:

1. Current real code and runtime stylesheet.
2. Approved Brand Book: `deskwork/manual-de-marca.html`.
3. Current product/project documentation.
4. Historical HTML/mockups.

Historical closure context only: D-09, P0-39, D-01, D-03, D-05 and SESS-001 were not reopened or assessed as defects in this document.
