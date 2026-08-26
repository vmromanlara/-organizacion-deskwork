/**
 * Constrains post-auth navigation to an application-relative destination.
 *
 * `next` comes from the URL and is therefore untrusted. In particular,
 * protocol-relative URLs and a leading backslash can escape the DeskWork
 * origin even though they start with a slash.
 */
export function safeNext(next: string | undefined, fallback = "/"): string {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  if (next.startsWith("/\\")) return fallback;

  return next;
}
