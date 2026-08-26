import { describe, expect, it } from "vitest";
import { safeNext } from "../shared/auth/safe-next";

describe("SESS-001 safe post-auth redirect", () => {
  const fallback = "/app";

  it.each([
    [undefined, "missing destination"],
    ["", "empty destination"],
    ["//evil.com", "protocol-relative destination"],
    ["///evil.com", "repeated protocol-relative destination"],
    ["////evil.com", "many-slash protocol-relative destination"],
    ["/\\evil.com", "leading backslash destination"],
    ["https://evil.com", "HTTPS external destination"],
    ["http://evil.com", "HTTP external destination"],
    ["javascript:alert(1)", "JavaScript destination"],
    ["data:text/html,malicious", "data URL destination"],
  ])("uses the fallback for %s (%s)", (next, _description) => {
    void _description;
    expect(safeNext(next, fallback)).toBe(fallback);
  });

  it("preserves valid application-relative destinations", () => {
    expect(safeNext("/dashboard", fallback)).toBe("/dashboard");
    expect(safeNext("/dashboard?q=//evil.com", fallback)).toBe("/dashboard?q=//evil.com");
  });
});
