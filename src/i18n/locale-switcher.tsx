"use client";

/**
 * DeskWork Ticketing Core / TKT-023 — Selector de idioma.
 * Dos botones ES / EN, marca el activo. Estilo minimo para no
 * alterar el shell visual validado.
 */
import type { CSSProperties } from "react";
import { useI18n } from "./context";
import { SUPPORTED_LOCALES, type Locale } from "./locale";
import styles from "./locale-switcher.module.css";

export function LocaleSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div
      className={styles.root}
      role="group"
      aria-label={t("shell.localeLabel")}
    >
      {SUPPORTED_LOCALES.map((code: Locale) => {
        const isActive = code === locale;
        const style: CSSProperties = {
          fontWeight: isActive ? 600 : 400,
          opacity: isActive ? 1 : 0.65,
        };
        return (
          <button
            key={code}
            type="button"
            className={styles.button}
            data-active={isActive ? "true" : "false"}
            style={style}
            onClick={() => setLocale(code)}
            aria-pressed={isActive}
            aria-label={t(`locale.${code}`)}
          >
            {code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
