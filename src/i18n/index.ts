/**
 * DeskWork Ticketing Core / TKT-023 — Public surface.
 */
export {
  DEFAULT_LOCALE,
  STORAGE_KEY,
  SUPPORTED_LOCALES,
  isLocale,
  parseLocale,
  readStoredLocale,
  writeStoredLocale,
  type Locale,
} from "./locale";
export {
  I18nProvider,
  useI18n,
  resolvePath,
  interpolate,
} from "./context";
export { getMessages, type Messages } from "./messages";
export {
  TICKET_STATES,
  TICKET_PRIORITIES,
  isTicketStateCode,
  isTicketPriorityCode,
  getStateLabel,
  getPriorityLabel,
  type TicketStateCode,
  type TicketPriorityCode,
} from "./labels";
export {
  formatDateShort,
  formatDateLong,
  formatDateTime,
  formatTime,
  formatPercent,
  formatNumber,
  formatBytes,
  formatMinutes,
  getLocaleTag,
} from "./format";
export { getErrorMessage } from "./error-messages";
export { LocaleSwitcher } from "./locale-switcher";
