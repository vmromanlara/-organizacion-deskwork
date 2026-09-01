/**
 * DeskWork Ticketing Core / TKT-023 — i18n.
 * Locale types + storage.
 *
 * Decisiones:
 *  - Solo "es" y "en" para TKT-023 (alcance del P2).
 *  - "es" es el default (preserva el comportamiento actual).
 *  - Persistencia en localStorage con la clave "deskwork.locale".
 *  - Si el locale almacenado no es valido, se cae a "es".
 *  - SSR-safe: las funciones que tocan localStorage se llaman solo
 *    desde el cliente (I18nProvider corre en "use client").
 */

export const DEFAULT_LOCALE = "es" as const;
export const STORAGE_KEY = "deskwork.locale";

export type Locale = "es" | "en";

export const SUPPORTED_LOCALES: ReadonlyArray<Locale> = ["es", "en"];

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function parseLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Carga el locale desde localStorage; cae al default si no hay nada valido. */
export function readStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return parseLocale(raw);
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Persiste el locale en localStorage. No-op si no hay window. */
export function writeStoredLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // localStorage puede fallar en modos privados o storage lleno.
    // La UI sigue funcionando en memoria; no propagamos el error.
  }
}
