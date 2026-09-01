"use client";

/**
 * DeskWork Ticketing Core / TKT-023 — Context de i18n.
 *
 * - "use client" porque la preferencia de locale vive en localStorage.
 * - Expone `useI18n()` con: `locale`, `setLocale`, `t`, `tf`, `messages`.
 * - `t(path)` busca en el diccionario activo; si no existe la clave,
 *   cae al ES (idioma base) y, en ultima instancia, devuelve la
 *   propia clave (t("missing.key") -> "missing.key") para que las
 *   claves faltantes sean detectables.
 * - `tf(path, params)` hace interpolacion simple `{name}`.
 *
 * NO traduce logica: los valores de estado/prioridad se mantienen
 * como estan; la traduccion visual vive en `labels.ts`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  readStoredLocale,
  writeStoredLocale,
  type Locale,
} from "./locale";
import { getMessages, type Messages } from "./messages";

interface I18nContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  /** t(path) — devuelve el string localizado (o fallback). */
  t: (path: string) => string;
  /** tf(path, params) — interpolacion con {placeholder}. */
  tf: (path: string, params: Record<string, string | number>) => string;
  messages: Messages;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function resolvePath(messages: Messages, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = messages;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      return String(params[key]);
    }
    return `{${key}}`;
  });
}

// Exportados para testing.
export { resolvePath, interpolate };

interface I18nProviderProps {
  children: ReactNode;
  /** Locale inicial server-side. Default: "es". */
  initialLocale?: Locale;
}

export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  // Hidratamos desde localStorage en cliente; en server usamos initialLocale.
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? DEFAULT_LOCALE);

  useEffect(() => {
    // Re-hidratar en cliente para preservar la preferencia del usuario.
    // Usamos un microtask para evitar setState sincronico en el effect.
    const handle = window.setTimeout(() => {
      const stored = readStoredLocale();
      if (stored !== locale) {
        setLocaleState(stored);
      }
    }, 0);
    return () => window.clearTimeout(handle);
    // Solo al montar: leemos el localStorage una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeStoredLocale(next);
  }, []);

  const messages = useMemo(() => getMessages(locale), [locale]);
  const fallbackMessages = useMemo(() => getMessages(DEFAULT_LOCALE), []);

  const t = useCallback(
    (path: string): string => {
      const v = resolvePath(messages, path);
      if (typeof v === "string") return v;
      const fb = resolvePath(fallbackMessages, path);
      if (typeof fb === "string") return fb;
      return path;
    },
    [messages, fallbackMessages],
  );

  const tf = useCallback(
    (path: string, params: Record<string, string | number>): string => {
      const v = resolvePath(messages, path);
      const template =
        typeof v === "string"
          ? v
          : (() => {
              const fb = resolvePath(fallbackMessages, path);
              return typeof fb === "string" ? fb : path;
            })();
      return interpolate(template, params);
    },
    [messages, fallbackMessages],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t, tf, messages }),
    [locale, setLocale, t, tf, messages],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return ctx;
}
