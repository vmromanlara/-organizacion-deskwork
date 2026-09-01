/**
 * DeskWork Ticketing Core / TKT-023 — Selector de diccionario por locale.
 */
import type { Locale } from "../locale";
import { DEFAULT_LOCALE } from "../locale";
import { es } from "./es";
import { en } from "./en";

export type Messages = typeof es;

const dictionaries: Record<Locale, Messages> = {
  es,
  en: en as unknown as Messages,
};

export function getMessages(locale: Locale): Messages {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}
