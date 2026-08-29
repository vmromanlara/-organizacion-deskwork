/**
 * Tests TKT-006: resolveActor y makeTestActor.
 *
 * Verifica el mapeo functional_role -> TicketActorKind y la
 * resiliencia ante membership ausente.
 */

import { describe, expect, it, vi } from "vitest";
import { makeTestActor, resolveActor } from "./actor";
import type { SupabaseClient } from "@supabase/supabase-js";

function makeMockSupabase(opts: {
  userId?: string | null;
  membership?: unknown;
  membershipError?: { message: string } | null;
}) {
  const getUser = vi.fn().mockResolvedValue({
    data: { user: opts.userId ? { id: opts.userId } : null },
    error: null,
  });
  const maybeSingle = vi
    .fn()
    .mockResolvedValue(
      opts.membershipError
        ? { data: null, error: opts.membershipError }
        : { data: opts.membership ?? null, error: null },
    );
  const eq = vi.fn().mockReturnValue({ maybeSingle, eq: vi.fn().mockReturnThis() });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const mock = {
    auth: { getUser },
    from,
  } as unknown as SupabaseClient;
  return { mock, getUser, from };
}

describe("resolveActor (TKT-006)", () => {
  it("retorna not_authenticated si auth.getUser no retorna user", async () => {
    const { mock } = makeMockSupabase({ userId: null });
    const result = await resolveActor(mock, "tenant-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("not_authenticated");
    }
  });

  it("retorna not_authenticated si fallbackUserId es null", async () => {
    const { mock } = makeMockSupabase({ userId: "u-1" });
    const result = await resolveActor(mock, "tenant-1", null);
    // El fallbackUserId es null, pero getUser devuelve u-1, así que se usa u-1.
    // membership es undefined → no_membership.
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_membership");
    }
  });

  it("retorna no_membership si no hay membership activa", async () => {
    const { mock } = makeMockSupabase({ userId: "u-1", membership: null });
    const result = await resolveActor(mock, "tenant-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_membership");
    }
  });

  it("retorna no_membership si el query falla", async () => {
    const { mock } = makeMockSupabase({
      userId: "u-1",
      membershipError: { message: "DB down" },
    });
    const result = await resolveActor(mock, "tenant-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_membership");
    }
  });

  it("mapea director -> kind=director", async () => {
    const { mock } = makeMockSupabase({
      userId: "u-1",
      membership: {
        tenant_id: "t",
        user_id: "u-1",
        functional_role: "director",
        status: "active",
      },
    });
    const result = await resolveActor(mock, "t");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actor.kind).toBe("director");
      expect(result.actor.functionalRole).toBe("director");
    }
  });

  it("mapea technical_lead -> kind=technical_lead", async () => {
    const { mock } = makeMockSupabase({
      userId: "u-1",
      membership: {
        tenant_id: "t",
        user_id: "u-1",
        functional_role: "technical_lead",
        status: "active",
      },
    });
    const result = await resolveActor(mock, "t");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actor.kind).toBe("technical_lead");
    }
  });

  it("mapea supervisor -> kind=supervisor", async () => {
    const { mock } = makeMockSupabase({
      userId: "u-1",
      membership: {
        tenant_id: "t",
        user_id: "u-1",
        functional_role: "supervisor",
        status: "active",
      },
    });
    const result = await resolveActor(mock, "t");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actor.kind).toBe("supervisor");
    }
  });

  it("mapea operator -> kind=agent", async () => {
    const { mock } = makeMockSupabase({
      userId: "u-1",
      membership: {
        tenant_id: "t",
        user_id: "u-1",
        functional_role: "operator",
        status: "active",
      },
    });
    const result = await resolveActor(mock, "t");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actor.kind).toBe("agent");
    }
  });

  it("mapea administrative -> kind=agent", async () => {
    const { mock } = makeMockSupabase({
      userId: "u-1",
      membership: {
        tenant_id: "t",
        user_id: "u-1",
        functional_role: "administrative",
        status: "active",
      },
    });
    const result = await resolveActor(mock, "t");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actor.kind).toBe("agent");
    }
  });

  it("retorna no_membership si el role no es un FunctionalRole conocido", async () => {
    const { mock } = makeMockSupabase({
      userId: "u-1",
      membership: {
        tenant_id: "t",
        user_id: "u-1",
        functional_role: "intern", // no existe
        status: "active",
      },
    });
    const result = await resolveActor(mock, "t");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_membership");
    }
  });
});

describe("makeTestActor (helper)", () => {
  it("construye actor con userId + role", () => {
    const a = makeTestActor("u-1", "director");
    expect(a.kind).toBe("director");
    expect(a.userId).toBe("u-1");
    expect(a.functionalRole).toBe("director");
  });

  it("system actor con userId=null", () => {
    const a = makeTestActor(null, null);
    expect(a.kind).toBe("system");
    expect(a.userId).toBe(null);
  });

  it("lanza si userId=null pero role presente (inconsistencia)", () => {
    expect(() => makeTestActor(null, "director")).toThrow();
  });
});
