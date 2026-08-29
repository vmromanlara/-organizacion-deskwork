/**
 * Tests TKT-006 / Bloque 2: applyTransition (mutador seguro).
 *
 * Verifica que el wrapper TypeScript sobre la SECURITY DEFINER
 * `public.apply_ticket_transition`:
 *   - Mapea errores de Postgres a tipos discriminados correctos.
 *   - No llama rpc si el input es inválido (validation).
 *   - Pasa los parámetros correctos al RPC.
 *
 * Estos tests son unitarios (no requieren Supabase corriendo).
 */

import { describe, expect, it, vi } from "vitest";
import { applyTransition } from "./supabase-repository";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UpdateTicketStateInput } from "./repository";

type RpcResult =
  | { data: unknown; error: null }
  | { data: null; error: { code?: string; message: string } };

function makeMockSupabase(rpcResult: RpcResult) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  const from = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  });
  const mock = { rpc, from } as unknown as SupabaseClient;
  return { mock, rpc };
}

const baseInput: UpdateTicketStateInput = {
  ticketId: "11111111-1111-1111-1111-111111111111",
  fromState: "ABIERTO",
  toState: "EN_PROCESO",
  actorId: "user-1",
  reason: "test",
};

describe("applyTransition (TKT-006)", () => {
  it("rechaza input con toState inválido SIN llamar rpc", async () => {
    const { mock, rpc } = makeMockSupabase({
      data: null,
      error: null,
    });
    const result = await applyTransition(mock, {
      ...baseInput,
      toState: "INVALIDO" as never,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("validation");
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rechaza input con fromState inválido SIN llamar rpc", async () => {
    const { mock, rpc } = makeMockSupabase({ data: null, error: null });
    const result = await applyTransition(mock, {
      ...baseInput,
      fromState: "INVALIDO" as never,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("validation");
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("mapea error PGRST P0002 (ticket not found) a kind=not_found", async () => {
    const { mock } = makeMockSupabase({
      data: null,
      error: { code: "P0002", message: "ticket not found" },
    });
    const result = await applyTransition(mock, baseInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("not_found");
    }
  });

  it("mapea error 42501 (insufficient_privilege) a kind=forbidden", async () => {
    const { mock } = makeMockSupabase({
      data: null,
      error: {
        code: "42501",
        message: "actor not authorized to execute ticket transition",
      },
    });
    const result = await applyTransition(mock, baseInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("forbidden");
    }
  });

  it("mapea error 42501 con mensaje 'authentication required' a kind=forbidden", async () => {
    const { mock } = makeMockSupabase({
      data: null,
      error: { code: "42501", message: "authentication required" },
    });
    const result = await applyTransition(mock, baseInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("forbidden");
    }
  });

  it("mapea error P0001 (terminal/equals current) a kind=conflict", async () => {
    const { mock } = makeMockSupabase({
      data: null,
      error: {
        code: "P0001",
        message: "ticket is in terminal state CERRADO",
      },
    });
    const result = await applyTransition(mock, baseInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("conflict");
    }
  });

  it("mapea error desconocido a kind=db_error", async () => {
    const { mock } = makeMockSupabase({
      data: null,
      error: { code: "XX999", message: "something weird" },
    });
    const result = await applyTransition(mock, baseInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("db_error");
    }
  });

  it("mapea data=null sin error a kind=db_error", async () => {
    const { mock } = makeMockSupabase({ data: null, error: null });
    const result = await applyTransition(mock, baseInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("db_error");
    }
  });

  it("en éxito: llama rpc con parámetros correctos y retorna ticket", async () => {
    const ticketRow = {
      id: baseInput.ticketId,
      tenant_id: "tenant-1",
      requester_id: "user-req",
      category_id: "cat-1",
      priority: "P3",
      state: "EN_PROCESO",
      title: "Test",
      description: "Descripcion valida con suficiente longitud.",
      assigned_to: "user-1",
      area_id: null,
      team_id: null,
      first_response_at: "2026-08-29T12:00:00Z",
      resolved_at: null,
      closed_at: null,
      sla_status: "on_track",
      created_at: "2026-08-29T11:00:00Z",
      updated_at: "2026-08-29T12:00:00Z",
    };
    const { mock, rpc } = makeMockSupabase({ data: ticketRow, error: null });
    const result = await applyTransition(mock, baseInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ticket.state).toBe("EN_PROCESO");
      expect(result.ticket.tenantId).toBe("tenant-1");
    }
    expect(rpc).toHaveBeenCalledWith("apply_ticket_transition", {
      p_ticket_id: baseInput.ticketId,
      p_to_state: "EN_PROCESO",
      p_reason: "test",
    });
  });

  it("en éxito sin reason: pasa p_reason=null", async () => {
    const { mock, rpc } = makeMockSupabase({
      data: { id: "x", tenant_id: "t", state: "EN_PROCESO" },
      error: null,
    });
    await applyTransition(mock, { ...baseInput, reason: undefined });
    expect(rpc).toHaveBeenCalledWith(
      "apply_ticket_transition",
      expect.objectContaining({ p_reason: null }),
    );
  });
});
