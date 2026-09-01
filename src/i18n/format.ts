/**
 * DeskWork Ticketing Core / TKT-023 — Helpers de formato.
 *
 * Locale-aware para fechas, horas, numeros, porcentajes, bytes y
 * minutos. Reutiliza `Intl.*` y mantiene los valores numericos que
 * vienen de la API sin alteracion.
 */
import type { Locale } from "./locale";

const LOCALE_TAG: Record<Locale, string> = {
  es: "es-CL",
  en: "en-US",
};

const TIMEZONE = "America/Santiago";

export function getLocaleTag(locale: Locale): string {
  return LOCALE_TAG[locale];
}

export function formatDateShort(
  value: string | Date,
  locale: Locale,
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    day: "numeric",
    month: "short",
    timeZone: TIMEZONE,
  }).format(d);
}

export function formatDateLong(
  value: string | Date,
  locale: Locale,
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TIMEZONE,
  }).format(d);
}

export function formatDateTime(
  value: string | Date,
  locale: Locale,
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIMEZONE,
  }).format(d);
}

export function formatTime(
  value: string | Date,
  locale: Locale,
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIMEZONE,
  }).format(d);
}

export function formatPercent(value: number, locale: Locale): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(LOCALE_TAG[locale], {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number, locale: Locale): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(LOCALE_TAG[locale]).format(value);
}

export function formatBytes(value: number, locale: Locale): string {
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value < 1024) {
    return new Intl.NumberFormat(LOCALE_TAG[locale], {
      style: "unit",
      unit: "byte",
      unitDisplay: "short",
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (value < 1024 * 1024) {
    return new Intl.NumberFormat(LOCALE_TAG[locale], {
      style: "unit",
      unit: "kilobyte",
      unitDisplay: "short",
      maximumFractionDigits: 1,
    }).format(value / 1024);
  }
  return new Intl.NumberFormat(LOCALE_TAG[locale], {
    style: "unit",
    unit: "megabyte",
    unitDisplay: "short",
    maximumFractionDigits: 1,
  }).format(value / (1024 * 1024));
}

export function formatMinutes(
  totalMinutes: number,
  locale: Locale,
  messages: { empty: string; hoursMinutes: string; minutesShort: string },
): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
    return messages.empty;
  }
  const total = Math.round(totalMinutes);
  if (total < 60) {
    return messages.minutesShort.replace("{n}", String(total));
  }
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return messages.hoursMinutes
    .replace("{h}", String(hours))
    .replace("{m}", String(minutes));
}
