/**
 * Tests TKT-009 follow-up: integración UI → API → Supabase.
 *
 * Cubre el wrapper client-api (que la UI usa para hablar con los
 * endpoints reales). Mockeamos `fetch` global y verificamos:
 *  - creación exitosa (POST /api/tickets)
 *  - listado (GET /api/tickets?scope=mine)
 *  - apertura (GET /api/tickets/[id])
 *  - error de validación (400)
 *  - error de autorización (401/403)
 *  - estado inicial del ticket devuelto (state=ABIERTO, priority asignada)
 *  - transición (POST /api/tickets/[id]/transitions)
 *
 * Estos tests simulan el flujo real: la UI llama al wrapper, que llama
 * a la API, que (en producción) toca Supabase. Acá mockeamos fetch para
 * validar el comportamiento de la capa de UI sin DB.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assignTicket,
  createComment,
  createTicket,
  getTicket,
  listComments,
  listTicketCategories,
  listTickets,
  listTenantMembers,
  transitionTicket,
} from "./client-api";

const TICKET_ID = "11111111-1111-1111-1111-111111111111";
const CATEGORY_ID = "22222222-2222-2222-2222-222222222222";
const TENANT_ID = "33333333-3333-3333-3333-333333333333";
const USER_ID = "44444444-4444-4444-4444-444444444444";

interface MockResponseInit {
  status?: number;
  body?: unknown;
  ok?: boolean;
}

function makeResponse({ status = 200, body, ok }: MockResponseInit = {}): Response {
  const finalOk = ok ?? (status >= 200 && status < 300);
  return {
    ok: finalOk,
    status,
    json: async () => body ?? {},
  } as unknown as Response;
}

function mockFetchOnce(response: Response) {
  const mock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", mock);
  return mock;
}

type AnyClientResult =
  | Awaited<ReturnType<typeof createTicket>>
  | Awaited<ReturnType<typeof listTickets>>
  | Awaited<ReturnType<typeof getTicket>>
  | Awaited<ReturnType<typeof transitionTicket>>
  | Awaited<ReturnType<typeof listTicketCategories>>
  | Awaited<ReturnType<typeof listComments>>
  | Awaited<ReturnType<typeof createComment>>
  | Awaited<ReturnType<typeof listTenantMembers>>
  | Awaited<ReturnType<typeof assignTicket>>;

function expectErrorKind(result: AnyClientResult, kind: string) {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.kind).toBe(kind);
  }
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("client-api (TKT-009 follow-up) — POST /api/tickets (crear)", () => {
  it("creación exitosa: devuelve ticket con state=ABIERTO y priority asignada", async () => {
    const createdAt = "2026-08-31T12:00:00Z";
    const fetchMock = mockFetchOnce(
      makeResponse({
        status: 201,
        body: {
          ticket: {
            id: TICKET_ID,
            tenantId: TENANT_ID,
            requesterId: USER_ID,
            categoryId: CATEGORY_ID,
            priority: "P2",
            state: "ABIERTO",
            title: "Carpeta compartida no abre",
            description: "El acceso a la carpeta de Finanzas aparece denegado desde esta mañana.",
            assignedTo: null,
            areaId: null,
            teamId: null,
            firstResponseAt: null,
            resolvedAt: null,
            closedAt: null,
            slaStatus: "on_track",
            createdAt,
            updatedAt: createdAt,
          },
          by: USER_ID,
        },
      }),
    );

    const result = await createTicket({
      categoryId: CATEGORY_ID,
      title: "Carpeta compartida no abre",
      description: "El acceso a la carpeta de Finanzas aparece denegado desde esta mañana.",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.ticket.id).toBe(TICKET_ID);
      expect(result.data.ticket.state).toBe("ABIERTO");
      expect(result.data.ticket.priority).toBe("P2");
      expect(result.data.ticket.requesterId).toBe(USER_ID);
      expect(result.data.ticket.tenantId).toBe(TENANT_ID);
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/tickets");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      categoryId: CATEGORY_ID,
      title: "Carpeta compartida no abre",
      description: "El acceso a la carpeta de Finanzas aparece denegado desde esta mañana.",
    });
  });

  it("error de validación (400): la UI recibe kind=validation con la razón", async () => {
    mockFetchOnce(
      makeResponse({
        status: 400,
        body: {
          error: "invalid_description_length",
          min: 10,
          max: 5000,
          received: 4,
        },
      }),
    );

    const result = await createTicket({
      categoryId: CATEGORY_ID,
      title: "Válido",
      description: "corto",
    });
    expectErrorKind(result, "validation");
    if (!result.ok) {
      expect(result.error.kind).toBe("validation");
      expect((result.error as { reason: string }).reason).toMatch(/invalid_description_length/);
    }
  });

  it("error de autorización (401): la UI recibe kind=forbidden", async () => {
    mockFetchOnce(
      makeResponse({
        status: 401,
        body: { error: "authentication_required" },
      }),
    );

    const result = await createTicket({
      categoryId: CATEGORY_ID,
      title: "Válido",
      description: "Descripción válida con suficiente longitud para pasar.",
    });
    expectErrorKind(result, "forbidden");
  });

  it("error de autorización (403): la UI recibe kind=forbidden", async () => {
    mockFetchOnce(
      makeResponse({
        status: 403,
        body: { error: "no_active_membership" },
      }),
    );

    const result = await createTicket({
      categoryId: CATEGORY_ID,
      title: "Válido",
      description: "Descripción válida con suficiente longitud para pasar.",
    });
    expectErrorKind(result, "forbidden");
  });

  it("error de red: la UI recibe kind=network", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Failed to fetch")),
    );

    const result = await createTicket({
      categoryId: CATEGORY_ID,
      title: "Válido",
      description: "Descripción válida con suficiente longitud para pasar.",
    });
    expectErrorKind(result, "network");
  });

  it("error 500 inesperado: la UI recibe kind=http con status", async () => {
    mockFetchOnce(
      makeResponse({
        status: 500,
        body: { error: "db_error", reason: "connection lost" },
      }),
    );

    const result = await createTicket({
      categoryId: CATEGORY_ID,
      title: "Válido",
      description: "Descripción válida con suficiente longitud para pasar.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("http");
      expect((result.error as { status: number }).status).toBe(500);
    }
  });
});

describe("client-api — GET /api/tickets (listar)", () => {
  it("happy path: lista tickets visibles para el actor", async () => {
    const createdAt = "2026-08-31T12:00:00Z";
    const fetchMock = mockFetchOnce(
      makeResponse({
        status: 200,
        body: {
          tickets: [
            {
              id: TICKET_ID,
              tenantId: TENANT_ID,
              requesterId: USER_ID,
              categoryId: CATEGORY_ID,
              priority: "P2",
              state: "ABIERTO",
              title: "Ticket A",
              description: "Descripción válida con suficiente longitud.",
              assignedTo: null,
              areaId: null,
              teamId: null,
              firstResponseAt: null,
              resolvedAt: null,
              closedAt: null,
              slaStatus: "on_track",
              createdAt,
              updatedAt: createdAt,
            },
          ],
          meta: { scope: "mine", filters: {}, limit: 50, total: 1 },
        },
      }),
    );

    const result = await listTickets("mine");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.tickets).toHaveLength(1);
      expect(result.data.tickets[0]?.id).toBe(TICKET_ID);
      expect(result.data.meta.total).toBe(1);
    }

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/tickets?scope=mine");
  });

  it("pasa filtros al query string", async () => {
    const fetchMock = mockFetchOnce(
      makeResponse({ status: 200, body: { tickets: [], meta: { total: 0 } } }),
    );
    await listTickets("assigned", { state: "EN_PROCESO", priority: "P1" });
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain("scope=assigned");
    expect(url).toContain("state=EN_PROCESO");
    expect(url).toContain("priority=P1");
  });

  it("401: kind=forbidden", async () => {
    mockFetchOnce(makeResponse({ status: 401, body: { error: "authentication_required" } }));
    const result = await listTickets("mine");
    expectErrorKind(result, "forbidden");
  });
});

describe("client-api — GET /api/tickets/[id] (abrir)", () => {
  it("happy path: devuelve el ticket solicitado", async () => {
    const createdAt = "2026-08-31T12:00:00Z";
    const fetchMock = mockFetchOnce(
      makeResponse({
        status: 200,
        body: {
          ticket: {
            id: TICKET_ID,
            tenantId: TENANT_ID,
            requesterId: USER_ID,
            categoryId: CATEGORY_ID,
            priority: "P2",
            state: "ABIERTO",
            title: "Ticket A",
            description: "Descripción válida con suficiente longitud.",
            assignedTo: null,
            areaId: null,
            teamId: null,
            firstResponseAt: null,
            resolvedAt: null,
            closedAt: null,
            slaStatus: "on_track",
            createdAt,
            updatedAt: createdAt,
          },
        },
      }),
    );

    const result = await getTicket(TICKET_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.ticket.id).toBe(TICKET_ID);
      expect(result.data.ticket.state).toBe("ABIERTO");
    }
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/tickets/${TICKET_ID}`);
  });

  it("404: kind=not_found", async () => {
    mockFetchOnce(makeResponse({ status: 404, body: { error: "ticket_not_found" } }));
    const result = await getTicket(TICKET_ID);
    expectErrorKind(result, "not_found");
  });

  it("ticket inexistente: la UI puede detectar el 404 y mostrar 'no encontrado'", async () => {
    mockFetchOnce(makeResponse({ status: 404, body: { error: "ticket_not_found" } }));
    const result = await getTicket("nonexistent-id");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("not_found");
    }
  });
});

describe("client-api — GET /api/ticket-categories (catálogo)", () => {
  it("happy path: devuelve categorías activas del tenant", async () => {
    const fetchMock = mockFetchOnce(
      makeResponse({
        status: 200,
        body: {
          categories: [
            {
              id: CATEGORY_ID,
              tenantId: TENANT_ID,
              slug: "computador",
              label: "Computador",
              description: "Equipo, periféricos o sistema operativo.",
              isActive: true,
              displayOrder: 10,
            },
          ],
          meta: { tenantId: TENANT_ID, total: 1 },
        },
      }),
    );

    const result = await listTicketCategories();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.categories).toHaveLength(1);
      expect(result.data.categories[0]?.slug).toBe("computador");
      expect(result.data.categories[0]?.label).toBe("Computador");
    }
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/ticket-categories");
  });

  it("401 sin sesión: kind=forbidden", async () => {
    mockFetchOnce(makeResponse({ status: 401, body: { error: "authentication_required" } }));
    const result = await listTicketCategories();
    expectErrorKind(result, "forbidden");
  });
});

describe("client-api — POST /api/tickets/[id]/transitions (transicionar)", () => {
  it("happy path: actualiza el estado del ticket", async () => {
    const createdAt = "2026-08-31T12:00:00Z";
    const fetchMock = mockFetchOnce(
      makeResponse({
        status: 200,
        body: {
          ticket: {
            id: TICKET_ID,
            tenantId: TENANT_ID,
            requesterId: USER_ID,
            categoryId: CATEGORY_ID,
            priority: "P2",
            state: "EN_PROCESO",
            title: "Ticket A",
            description: "Descripción válida con suficiente longitud.",
            assignedTo: USER_ID,
            areaId: null,
            teamId: null,
            firstResponseAt: createdAt,
            resolvedAt: null,
            closedAt: null,
            slaStatus: "on_track",
            createdAt,
            updatedAt: createdAt,
          },
          transition: { from: "ABIERTO", to: "EN_PROCESO", by: USER_ID },
        },
      }),
    );

    const result = await transitionTicket(TICKET_ID, "EN_PROCESO", "ok");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.ticket.state).toBe("EN_PROCESO");
      expect(result.data.ticket.firstResponseAt).toBe(createdAt);
    }

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/tickets/${TICKET_ID}/transitions`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ toState: "EN_PROCESO", reason: "ok" });
  });

  it("403 FSM denegado: kind=forbidden con la razón", async () => {
    mockFetchOnce(
      makeResponse({
        status: 403,
        body: {
          error: "fsm_denied",
          reason: "Supervisor no puede ejecutar EN_PROCESO",
          canRequest: true,
          fromState: "ABIERTO",
          toState: "EN_PROCESO",
        },
      }),
    );
    const result = await transitionTicket(TICKET_ID, "EN_PROCESO");
    expectErrorKind(result, "forbidden");
    if (!result.ok) {
      expect((result.error as { reason: string }).reason).toMatch(/Supervisor/);
    }
  });
});

describe("client-api — flujo end-to-end simulado (crear -> listar -> abrir)", () => {
  it("el ID devuelto por create aparece en listTickets y se puede recuperar con getTicket", async () => {
    const createdAt = "2026-08-31T12:00:00Z";
    const baseTicket = {
      id: TICKET_ID,
      tenantId: TENANT_ID,
      requesterId: USER_ID,
      categoryId: CATEGORY_ID,
      priority: "P2" as const,
      state: "ABIERTO" as const,
      title: "Flujo end-to-end",
      description: "Descripción válida con suficiente longitud para el flujo.",
      assignedTo: null,
      areaId: null,
      teamId: null,
      firstResponseAt: null,
      resolvedAt: null,
      closedAt: null,
      slaStatus: "on_track" as const,
      createdAt,
      updatedAt: createdAt,
    };

    // 1) Crear.
    mockFetchOnce(
      makeResponse({ status: 201, body: { ticket: baseTicket, by: USER_ID } }),
    );
    const createResult = await createTicket({
      categoryId: CATEGORY_ID,
      title: baseTicket.title,
      description: baseTicket.description,
    });
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;
    const createdId = createResult.data.ticket.id;
    expect(createdId).toBe(TICKET_ID);

    // 2) Listar (scope=mine) debe incluir el recién creado.
    mockFetchOnce(
      makeResponse({
        status: 200,
        body: { tickets: [baseTicket], meta: { total: 1 } },
      }),
    );
    const listResult = await listTickets("mine");
    expect(listResult.ok).toBe(true);
    if (!listResult.ok) return;
    expect(listResult.data.tickets.map((t) => t.id)).toContain(createdId);
    expect(listResult.data.tickets[0]?.state).toBe("ABIERTO");
    expect(listResult.data.tickets[0]?.priority).toBe("P2");

    // 3) Abrir el ticket creado.
    mockFetchOnce(makeResponse({ status: 200, body: { ticket: baseTicket } }));
    const getResult = await getTicket(createdId);
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.data.ticket.id).toBe(createdId);
    expect(getResult.data.ticket.state).toBe("ABIERTO");
  });
});

describe("client-api — Comments (TKT-013)", () => {
  it("listComments happy path: devuelve la conversación del ticket", async () => {
    const fetchMock = mockFetchOnce(
      makeResponse({
        status: 200,
        body: {
          comments: [
            {
              id: "c-1",
              tenantId: TENANT_ID,
              ticketId: TICKET_ID,
              authorId: USER_ID,
              body: "Estoy revisando el caso.",
              isInternal: false,
              createdAt: "2026-08-31T12:01:00Z",
              updatedAt: "2026-08-31T12:01:00Z",
            },
          ],
          meta: { total: 1 },
        },
      }),
    );

    const result = await listComments(TICKET_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.comments).toHaveLength(1);
      expect(result.data.comments[0]?.body).toMatch(/revisando/);
    }
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/tickets/${TICKET_ID}/comments`);
  });

  it("listComments 404 cuando el ticket no existe", async () => {
    mockFetchOnce(makeResponse({ status: 404, body: { error: "ticket_not_found" } }));
    const result = await listComments(TICKET_ID);
    expectErrorKind(result, "not_found");
  });

  it("listComments 403 sin permiso: kind=forbidden", async () => {
    mockFetchOnce(makeResponse({ status: 403, body: { error: "no_active_membership" } }));
    const result = await listComments(TICKET_ID);
    expectErrorKind(result, "forbidden");
  });

  it("createComment happy path: devuelve el comentario con isInternal correcto", async () => {
    const fetchMock = mockFetchOnce(
      makeResponse({
        status: 201,
        body: {
          comment: {
            id: "c-new",
            tenantId: TENANT_ID,
            ticketId: TICKET_ID,
            authorId: USER_ID,
            body: "Necesito el ticket en proceso, por favor.",
            isInternal: false,
            createdAt: "2026-08-31T12:02:00Z",
            updatedAt: "2026-08-31T12:02:00Z",
          },
          by: USER_ID,
          isInternal: false,
        },
      }),
    );

    const result = await createComment(TICKET_ID, {
      body: "Necesito el ticket en proceso, por favor.",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.comment.id).toBe("c-new");
      expect(result.data.comment.body).toMatch(/proceso/);
      expect(result.data.comment.isInternal).toBe(false);
      expect(result.data.by).toBe(USER_ID);
    }
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/tickets/${TICKET_ID}/comments`);
    expect(JSON.parse(init.body)).toEqual({
      body: "Necesito el ticket en proceso, por favor.",
    });
  });

  it("createComment con isInternal=true: pasa el flag al payload", async () => {
    const fetchMock = mockFetchOnce(
      makeResponse({
        status: 201,
        body: {
          comment: {
            id: "c-int",
            tenantId: TENANT_ID,
            ticketId: TICKET_ID,
            authorId: USER_ID,
            body: "Nota interna de prueba.",
            isInternal: true,
            createdAt: "2026-08-31T12:03:00Z",
            updatedAt: "2026-08-31T12:03:00Z",
          },
          by: USER_ID,
          isInternal: true,
        },
      }),
    );

    const result = await createComment(TICKET_ID, {
      body: "Nota interna de prueba.",
      isInternal: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.comment.isInternal).toBe(true);
    }
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      body: "Nota interna de prueba.",
      isInternal: true,
    });
  });

  it("createComment 400 validación: kind=validation con la razón", async () => {
    mockFetchOnce(
      makeResponse({
        status: 400,
        body: { error: "validation_failed", reason: "body_too_long" },
      }),
    );
    const result = await createComment(TICKET_ID, {
      body: "x".repeat(10001),
    });
    expectErrorKind(result, "validation");
  });

  it("createComment 403 sin permiso para crear: kind=forbidden", async () => {
    mockFetchOnce(
      makeResponse({
        status: 403,
        body: {
          error: "forbidden",
          reason: "actor not authorized to comment on this ticket",
        },
      }),
    );
    const result = await createComment(TICKET_ID, {
      body: "comentario válido con suficiente longitud para pasar.",
    });
    expectErrorKind(result, "forbidden");
  });

  it("createComment 404 ticket inexistente: kind=not_found", async () => {
    mockFetchOnce(
      makeResponse({ status: 404, body: { error: "ticket_not_found" } }),
    );
    const result = await createComment(TICKET_ID, {
      body: "comentario válido con suficiente longitud para pasar.",
    });
    expectErrorKind(result, "not_found");
  });
});

describe("client-api — Assignment (TKT-012)", () => {
  it("listTenantMembers happy path: devuelve miembros del tenant", async () => {
    const fetchMock = mockFetchOnce(
      makeResponse({
        status: 200,
        body: {
          members: [
            { user_id: USER_ID, functional_role: "operator" },
            { user_id: "22222222-2222-2222-2222-222222222222", functional_role: "technical_lead" },
          ],
          meta: { tenantId: TENANT_ID, total: 2 },
        },
      }),
    );
    const result = await listTenantMembers();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.members).toHaveLength(2);
      expect(result.data.members[0]?.functional_role).toBe("operator");
    }
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/tenant-members");
  });

  it("listTenantMembers 403 sin membership: kind=forbidden", async () => {
    mockFetchOnce(
      makeResponse({ status: 403, body: { error: "no_active_membership" } }),
    );
    const result = await listTenantMembers();
    expectErrorKind(result, "forbidden");
  });

  it("assignTicket happy path: devuelve la asignación creada", async () => {
    const fetchMock = mockFetchOnce(
      makeResponse({
        status: 201,
        body: {
          assignment: {
            id: "as-new",
            tenantId: TENANT_ID,
            ticketId: TICKET_ID,
            assigneeId: "22222222-2222-2222-2222-222222222222",
            assignedBy: USER_ID,
            assignedAt: "2026-08-31T12:10:00Z",
            unassignedAt: null,
          },
          ticket: {
            id: TICKET_ID,
            assignedTo: "22222222-2222-2222-2222-222222222222",
          },
        },
      }),
    );
    const result = await assignTicket(TICKET_ID, "22222222-2222-2222-2222-222222222222");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.assignment.id).toBe("as-new");
      expect(result.data.assignment.assigneeId).toBe("22222222-2222-2222-2222-222222222222");
      expect(result.data.ticket.assignedTo).toBe("22222222-2222-2222-2222-222222222222");
    }
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/tickets/${TICKET_ID}/assignments`);
    expect(JSON.parse(init.body)).toEqual({
      assigneeId: "22222222-2222-2222-2222-222222222222",
    });
  });

  it("assignTicket 403 sin permiso de asignación: kind=forbidden", async () => {
    mockFetchOnce(
      makeResponse({
        status: 403,
        body: {
          error: "forbidden",
          reason: "actor not authorized to assign tickets in this tenant",
        },
      }),
    );
    const result = await assignTicket(TICKET_ID, "22222222-2222-2222-2222-222222222222");
    expectErrorKind(result, "forbidden");
  });

  it("assignTicket 400 assignee no es miembro del tenant: kind=validation", async () => {
    mockFetchOnce(
      makeResponse({
        status: 400,
        body: {
          error: "validation",
          reason: "assignee is not an active member of the ticket tenant",
        },
      }),
    );
    const result = await assignTicket(TICKET_ID, "99999999-9999-9999-9999-999999999999");
    expectErrorKind(result, "validation");
  });

  it("assignTicket 404 ticket inexistente: kind=not_found", async () => {
    mockFetchOnce(
      makeResponse({ status: 404, body: { error: "ticket_not_found" } }),
    );
    const result = await assignTicket(TICKET_ID, "22222222-2222-2222-2222-222222222222");
    expectErrorKind(result, "not_found");
  });
});
