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
  getAttachmentUrl,
  getTicket,
  getTicketKpis,
  listAttachments,
  listComments,
  listTicketCategories,
  listTickets,
  listTenantMembers,
  registerAttachment,
  transitionTicket,
  uploadAttachment,
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
  | Awaited<ReturnType<typeof assignTicket>>
  | Awaited<ReturnType<typeof listAttachments>>
  | Awaited<ReturnType<typeof registerAttachment>>
  | Awaited<ReturnType<typeof uploadAttachment>>
  | Awaited<ReturnType<typeof getAttachmentUrl>>
  | Awaited<ReturnType<typeof getTicketKpis>>;

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

describe("client-api — Attachments (TKT-014 v1)", () => {
  it("listAttachments happy path: devuelve la metadata de adjuntos", async () => {
    const fetchMock = mockFetchOnce(
      makeResponse({
        status: 200,
        body: {
          attachments: [
            {
              id: "at-1",
              tenantId: TENANT_ID,
              ticketId: TICKET_ID,
              uploadedBy: USER_ID,
              storagePath: `ticket-attachments/${TENANT_ID}/${TICKET_ID}/captura.png`,
              originalName: "captura.png",
              mimeType: "image/png",
              sizeBytes: 1024,
              sha256: null,
              createdAt: "2026-08-31T12:20:00Z",
            },
          ],
          meta: { total: 1 },
        },
      }),
    );
    const result = await listAttachments(TICKET_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.attachments).toHaveLength(1);
      expect(result.data.attachments[0]?.originalName).toBe("captura.png");
    }
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/tickets/${TICKET_ID}/attachments`);
  });

  it("listAttachments 404 ticket inexistente: kind=not_found", async () => {
    mockFetchOnce(
      makeResponse({ status: 404, body: { error: "ticket_not_found" } }),
    );
    const result = await listAttachments(TICKET_ID);
    expectErrorKind(result, "not_found");
  });

  it("registerAttachment happy path: envía payload correcto y devuelve attachment", async () => {
    const fetchMock = mockFetchOnce(
      makeResponse({
        status: 201,
        body: {
          attachment: {
            id: "at-new",
            tenantId: TENANT_ID,
            ticketId: TICKET_ID,
            uploadedBy: USER_ID,
            storagePath: `ticket-attachments/${TENANT_ID}/${TICKET_ID}/log.txt`,
            originalName: "log.txt",
            mimeType: "text/plain",
            sizeBytes: 2048,
            sha256: null,
            createdAt: "2026-08-31T12:21:00Z",
          },
          by: USER_ID,
        },
      }),
    );
    const result = await registerAttachment(TICKET_ID, {
      originalName: "log.txt",
      mimeType: "text/plain",
      sizeBytes: 2048,
      storagePath: `ticket-attachments/${TENANT_ID}/${TICKET_ID}/log.txt`,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.attachment.id).toBe("at-new");
      expect(result.data.attachment.sizeBytes).toBe(2048);
    }
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/tickets/${TICKET_ID}/attachments`);
    expect(JSON.parse(init.body)).toEqual({
      originalName: "log.txt",
      mimeType: "text/plain",
      sizeBytes: 2048,
      storagePath: `ticket-attachments/${TENANT_ID}/${TICKET_ID}/log.txt`,
    });
  });

  it("registerAttachment 400 storage_path no coincide: kind=validation", async () => {
    mockFetchOnce(
      makeResponse({
        status: 400,
        body: {
          error: "validation",
          reason: "storage_path no sigue la convención del tenant/ticket",
        },
      }),
    );
    const result = await registerAttachment(TICKET_ID, {
      originalName: "log.txt",
      mimeType: "text/plain",
      sizeBytes: 2048,
      storagePath: "wrong/path/log.txt",
    });
    expectErrorKind(result, "validation");
  });

  it("registerAttachment 403 sin permiso: kind=forbidden", async () => {
    mockFetchOnce(
      makeResponse({
        status: 403,
        body: {
          error: "forbidden",
          reason: "actor not authorized to attach files to this ticket",
        },
      }),
    );
    const result = await registerAttachment(TICKET_ID, {
      originalName: "log.txt",
      mimeType: "text/plain",
      sizeBytes: 2048,
      storagePath: `ticket-attachments/${TENANT_ID}/${TICKET_ID}/log.txt`,
    });
    expectErrorKind(result, "forbidden");
  });
});

// =====================================================================
// TKT-014 v2 — Binary upload (multipart) + signed URL
// =====================================================================

/** Crea un File-like mínimo para los tests del wrapper. */
function makeTestFile(
  name: string,
  content: string,
  type = "text/plain",
): File {
  return new File([content], name, { type });
}

describe("client-api — TKT-014 v2 uploadAttachment (multipart)", () => {
  it("happy path: envía FormData con file + devuelve attachment + storage path", async () => {
    const fetchMock = mockFetchOnce(
      makeResponse({
        status: 201,
        body: {
          attachment: {
            id: "at-bin",
            tenantId: TENANT_ID,
            ticketId: TICKET_ID,
            uploadedBy: USER_ID,
            storagePath: `ticket-attachments/${TENANT_ID}/${TICKET_ID}/captura.png`,
            originalName: "captura.png",
            mimeType: "image/png",
            sizeBytes: 1024,
            sha256: null,
            createdAt: "2026-08-31T13:00:00Z",
          },
          by: USER_ID,
          storage: {
            bucket: "ticket-attachments",
            path: `ticket-attachments/${TENANT_ID}/${TICKET_ID}/captura.png`,
          },
        },
      }),
    );

    const file = makeTestFile("captura.png", "fake-png-bytes", "image/png");
    const result = await uploadAttachment(TICKET_ID, file, {
      sha256: "a".repeat(64),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.attachment.id).toBe("at-bin");
      expect(result.data.attachment.storagePath).toMatch(/captura\.png$/);
      expect(result.data.storage.bucket).toBe("ticket-attachments");
      expect(result.data.by).toBe(USER_ID);
    }

    // El body debe ser FormData (multipart), NO JSON.
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.body).toBeInstanceOf(FormData);
    // Content-Type NO debe fijarse manualmente: el browser setea el boundary.
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();

    const form = init.body as FormData;
    expect(form.get("file")).toBeInstanceOf(File);
    expect((form.get("file") as File).name).toBe("captura.png");
    expect(form.get("sha256")).toBe("a".repeat(64));
  });

  it("usa file.name como originalName cuando no se pasa options.originalName", async () => {
    const fetchMock = mockFetchOnce(
      makeResponse({
        status: 201,
        body: {
          attachment: {
            id: "at-auto",
            tenantId: TENANT_ID,
            ticketId: TICKET_ID,
            uploadedBy: USER_ID,
            storagePath: "x",
            originalName: "auto.txt",
            mimeType: "text/plain",
            sizeBytes: 5,
            sha256: null,
            createdAt: "2026-08-31T13:01:00Z",
          },
          by: USER_ID,
          storage: { bucket: "ticket-attachments", path: "x" },
        },
      }),
    );
    const file = makeTestFile("auto.txt", "hello", "text/plain");
    const result = await uploadAttachment(TICKET_ID, file);
    expect(result.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0]!;
    const form = init.body as FormData;
    expect(form.has("originalName")).toBe(false);
  });

  it("respeta options.originalName cuando se provee (override del nombre del File)", async () => {
    const fetchMock = mockFetchOnce(
      makeResponse({
        status: 201,
        body: {
          attachment: {
            id: "at-ov",
            tenantId: TENANT_ID,
            ticketId: TICKET_ID,
            uploadedBy: USER_ID,
            storagePath: "x",
            originalName: "renombrado.png",
            mimeType: "image/png",
            sizeBytes: 10,
            sha256: null,
            createdAt: "2026-08-31T13:02:00Z",
          },
          by: USER_ID,
          storage: { bucket: "ticket-attachments", path: "x" },
        },
      }),
    );
    const file = makeTestFile("original.png", "x", "image/png");
    const result = await uploadAttachment(TICKET_ID, file, {
      originalName: "renombrado.png",
      mimeType: "image/png",
    });
    expect(result.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0]!;
    const form = init.body as FormData;
    expect(form.get("originalName")).toBe("renombrado.png");
    expect(form.get("mimeType")).toBe("image/png");
  });

  it("URL apunta al endpoint POST /api/tickets/[id]/attachments", async () => {
    const fetchMock = mockFetchOnce(
      makeResponse({
        status: 201,
        body: {
          attachment: {
            id: "at-x",
            tenantId: TENANT_ID,
            ticketId: TICKET_ID,
            uploadedBy: USER_ID,
            storagePath: "x",
            originalName: "x",
            mimeType: "text/plain",
            sizeBytes: 1,
            sha256: null,
            createdAt: "2026-08-31T13:03:00Z",
          },
          by: USER_ID,
          storage: { bucket: "ticket-attachments", path: "x" },
        },
      }),
    );
    await uploadAttachment(TICKET_ID, makeTestFile("x", "y"));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/tickets/${TICKET_ID}/attachments`);
    expect(init.method).toBe("POST");
  });

  it("413 file_too_large: la UI recibe kind=http(413)", async () => {
    mockFetchOnce(
      makeResponse({
        status: 413,
        body: { error: "file_too_large", max: 26_214_400, received: 30_000_000 },
      }),
    );
    const result = await uploadAttachment(
      TICKET_ID,
      makeTestFile("big.bin", "x"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("http");
      expect((result.error as { status: number }).status).toBe(413);
    }
  });

  it("415 expected_multipart: la UI recibe kind=http(415) y la razón del backend", async () => {
    mockFetchOnce(
      makeResponse({
        status: 415,
        body: {
          error: "expected_multipart",
          hint: "TKT-014 v2: enviar multipart/form-data con campo 'file'.",
        },
      }),
    );
    const result = await uploadAttachment(
      TICKET_ID,
      makeTestFile("x", "y"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("http");
      expect((result.error as { status: number }).status).toBe(415);
    }
  });

  it("403 sin permiso: kind=forbidden", async () => {
    mockFetchOnce(
      makeResponse({
        status: 403,
        body: { error: "forbidden", reason: "no_active_membership" },
      }),
    );
    const result = await uploadAttachment(
      TICKET_ID,
      makeTestFile("x", "y"),
    );
    expectErrorKind(result, "forbidden");
  });

  it("404 ticket no existe: kind=not_found", async () => {
    mockFetchOnce(
      makeResponse({ status: 404, body: { error: "ticket_not_found" } }),
    );
    const result = await uploadAttachment(
      TICKET_ID,
      makeTestFile("x", "y"),
    );
    expectErrorKind(result, "not_found");
  });

  it("503 storage_disabled: la UI recibe kind=http(503)", async () => {
    mockFetchOnce(
      makeResponse({
        status: 503,
        body: {
          error: "storage_disabled",
          reason: "Storage no configurado (SUPABASE_SERVICE_ROLE_KEY faltante).",
        },
      }),
    );
    const result = await uploadAttachment(
      TICKET_ID,
      makeTestFile("x", "y"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("http");
      expect((result.error as { status: number }).status).toBe(503);
    }
  });

  it("error de red: kind=network", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Failed to fetch")),
    );
    const result = await uploadAttachment(
      TICKET_ID,
      makeTestFile("x", "y"),
    );
    expectErrorKind(result, "network");
  });
});

describe("client-api — TKT-014 v2 getAttachmentUrl (signed URL)", () => {
  const ATTACHMENT_ID = "55555555-5555-5555-5555-555555555555";

  it("happy path: devuelve URL temporal con expiresAt", async () => {
    const fetchMock = mockFetchOnce(
      makeResponse({
        status: 200,
        body: {
          url: "https://example.supabase.co/storage/v1/object/sign/ticket-attachments/tenant/ticket/captura.png?token=xxx",
          expiresAt: "2026-08-31T13:10:00Z",
          expiresInSeconds: 300,
        },
      }),
    );

    const result = await getAttachmentUrl(TICKET_ID, ATTACHMENT_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.url).toMatch(/supabase\.co/);
      expect(result.data.expiresInSeconds).toBe(300);
      expect(result.data.expiresAt).toBe("2026-08-31T13:10:00Z");
    }
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      `/api/tickets/${TICKET_ID}/attachments/${ATTACHMENT_ID}/url`,
    );
  });

  it("pasa expiresInSeconds como query string", async () => {
    const fetchMock = mockFetchOnce(
      makeResponse({
        status: 200,
        body: {
          url: "https://example.supabase.co/signed",
          expiresAt: "2026-08-31T13:11:00Z",
          expiresInSeconds: 600,
        },
      }),
    );
    await getAttachmentUrl(TICKET_ID, ATTACHMENT_ID, 600);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain("expiresInSeconds=600");
  });

  it("404 attachment no existe: kind=not_found", async () => {
    mockFetchOnce(
      makeResponse({
        status: 404,
        body: {
          error: "not_found",
          reason: "attachment no encontrado para el ticket.",
        },
      }),
    );
    const result = await getAttachmentUrl(TICKET_ID, ATTACHMENT_ID);
    expectErrorKind(result, "not_found");
  });

  it("403 actor no es miembro del tenant del attachment: kind=forbidden", async () => {
    mockFetchOnce(
      makeResponse({
        status: 403,
        body: {
          error: "forbidden",
          reason: "no es miembro del tenant del attachment.",
        },
      }),
    );
    const result = await getAttachmentUrl(TICKET_ID, ATTACHMENT_ID);
    expectErrorKind(result, "forbidden");
  });

  it("404 attachment sin storage_path (metadata-only legacy): kind=not_found", async () => {
    mockFetchOnce(
      makeResponse({
        status: 404,
        body: {
          error: "not_found",
          reason: "attachment sin storage_path (metadata-only legacy).",
        },
      }),
    );
    const result = await getAttachmentUrl(TICKET_ID, ATTACHMENT_ID);
    expectErrorKind(result, "not_found");
  });

  it("502 storage_error: kind=http(502) cuando falla createSignedUrl", async () => {
    mockFetchOnce(
      makeResponse({
        status: 502,
        body: { error: "storage_error", reason: "object not found" },
      }),
    );
    const result = await getAttachmentUrl(TICKET_ID, ATTACHMENT_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("http");
      expect((result.error as { status: number }).status).toBe(502);
    }
  });

  it("400 invalid_expires: kind=validation si el cliente manda expires fuera de rango", async () => {
    mockFetchOnce(
      makeResponse({
        status: 400,
        body: { error: "invalid_expires", min: 60, max: 3600, default: 300 },
      }),
    );
    const result = await getAttachmentUrl(TICKET_ID, ATTACHMENT_ID, 30);
    expectErrorKind(result, "validation");
  });
});

describe("client-api — TKT-014 v2 request() omite Content-Type cuando body es FormData", () => {
  it("JSON path: mantiene Content-Type: application/json y body es string", async () => {
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
            title: "Test JSON path",
            description: "Descripción válida con suficiente longitud para pasar.",
            assignedTo: null,
            areaId: null,
            teamId: null,
            firstResponseAt: null,
            resolvedAt: null,
            closedAt: null,
            slaStatus: "on_track",
            createdAt: "2026-08-31T13:00:00Z",
            updatedAt: "2026-08-31T13:00:00Z",
          },
          by: USER_ID,
        },
      }),
    );
    await createTicket({
      categoryId: CATEGORY_ID,
      title: "Test JSON path",
      description: "Descripción válida con suficiente longitud para pasar.",
    });
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(typeof init.body).toBe("string");
  });

  it("FormData path: NO fija Content-Type (browser setea boundary)", async () => {
    const fetchMock = mockFetchOnce(
      makeResponse({
        status: 201,
        body: {
          attachment: {
            id: "at-noct",
            tenantId: TENANT_ID,
            ticketId: TICKET_ID,
            uploadedBy: USER_ID,
            storagePath: "x",
            originalName: "x",
            mimeType: "text/plain",
            sizeBytes: 1,
            sha256: null,
            createdAt: "2026-08-31T13:30:00Z",
          },
          by: USER_ID,
          storage: { bucket: "ticket-attachments", path: "x" },
        },
      }),
    );
    await uploadAttachment(TICKET_ID, makeTestFile("x", "y"));
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
  });
});

// =====================================================================
// TKT-021 — KPIs del supervisor dashboard
// =====================================================================

describe("client-api — TKT-021 getTicketKpis (KPIs supervisor dashboard)", () => {
  it("happy path: devuelve totales, averages, dailyTrend y period", async () => {
    const fetchMock = mockFetchOnce(
      makeResponse({
        status: 200,
        body: {
          totals: {
            total: 42,
            active: 18,
            unassigned: 5,
            byState: [
              { state: "ABIERTO", count: 12 },
              { state: "EN_PROCESO", count: 4 },
              { state: "ESCALADO", count: 2 },
              { state: "RESUELTO", count: 22 },
              { state: "CERRADO", count: 2 },
            ],
            byPriority: [
              { priority: "P1", count: 3 },
              { priority: "P2", count: 8 },
              { priority: "P3", count: 20 },
              { priority: "P4", count: 11 },
            ],
          },
          operationalAverages: {
            firstResponseMinutes: 47.5,
            resolutionMinutes: 312.8,
            firstResponseCount: 40,
            resolvedCount: 22,
          },
          dailyTrend: [
            { date: "2026-08-25", created: 5 },
            { date: "2026-08-26", created: 7 },
            { date: "2026-08-27", created: 4 },
          ],
          period: {
            days: 30,
            start: "2026-07-29",
            end: "2026-08-27",
          },
          generatedAt: "2026-08-27T15:00:00Z",
        },
      }),
    );

    const result = await getTicketKpis(30);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totals.total).toBe(42);
      expect(result.data.totals.active).toBe(18);
      expect(result.data.totals.unassigned).toBe(5);
      expect(result.data.totals.byState).toHaveLength(5);
      expect(result.data.totals.byPriority).toHaveLength(4);
      expect(result.data.operationalAverages.firstResponseMinutes).toBe(47.5);
      expect(result.data.operationalAverages.resolvedCount).toBe(22);
      expect(result.data.dailyTrend).toHaveLength(3);
      expect(result.data.period.days).toBe(30);
    }
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/tickets/kpis?periodDays=30");
  });

  it("omite el query string cuando no se pasa periodDays", async () => {
    const fetchMock = mockFetchOnce(
      makeResponse({
        status: 200,
        body: {
          totals: { total: 0, active: 0, unassigned: 0, byState: [], byPriority: [] },
          operationalAverages: {
            firstResponseMinutes: 0,
            resolutionMinutes: 0,
            firstResponseCount: 0,
            resolvedCount: 0,
          },
          dailyTrend: [],
          period: { days: 30, start: "2026-07-29", end: "2026-08-27" },
          generatedAt: "2026-08-27T15:00:00Z",
        },
      }),
    );
    await getTicketKpis();
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/tickets/kpis");
  });

  it("empty state: totales en 0, arrays vacíos", async () => {
    mockFetchOnce(
      makeResponse({
        status: 200,
        body: {
          totals: { total: 0, active: 0, unassigned: 0, byState: [], byPriority: [] },
          operationalAverages: {
            firstResponseMinutes: 0,
            resolutionMinutes: 0,
            firstResponseCount: 0,
            resolvedCount: 0,
          },
          dailyTrend: [],
          period: { days: 30, start: "2026-07-29", end: "2026-08-27" },
          generatedAt: "2026-08-27T15:00:00Z",
        },
      }),
    );
    const result = await getTicketKpis();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totals.total).toBe(0);
      expect(result.data.totals.byState).toEqual([]);
      expect(result.data.totals.byPriority).toEqual([]);
      expect(result.data.dailyTrend).toEqual([]);
    }
  });

  it("401 sin sesion: kind=forbidden", async () => {
    mockFetchOnce(
      makeResponse({ status: 401, body: { error: "authentication_required" } }),
    );
    const result = await getTicketKpis();
    expectErrorKind(result, "forbidden");
  });

  it("403 sin membership activa: kind=forbidden", async () => {
    mockFetchOnce(
      makeResponse({ status: 403, body: { error: "no_active_membership" } }),
    );
    const result = await getTicketKpis();
    expectErrorKind(result, "forbidden");
  });

  it("403 sin scope institution: kind=forbidden", async () => {
    mockFetchOnce(
      makeResponse({
        status: 403,
        body: { error: "scope_institution_required" },
      }),
    );
    const result = await getTicketKpis();
    expectErrorKind(result, "forbidden");
  });

  it("403 SECURITY DEFINER rechaza sin institution scope: kind=forbidden", async () => {
    mockFetchOnce(
      makeResponse({
        status: 403,
        body: {
          error: "forbidden",
          reason: "actor does not have institution scope in this tenant",
        },
      }),
    );
    const result = await getTicketKpis();
    expectErrorKind(result, "forbidden");
  });

  it("500 db_error: kind=http(500)", async () => {
    mockFetchOnce(
      makeResponse({ status: 500, body: { error: "db_error", reason: "lost" } }),
    );
    const result = await getTicketKpis();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("http");
      expect((result.error as { status: number }).status).toBe(500);
    }
  });

  it("error de red: kind=network", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Failed to fetch")),
    );
    const result = await getTicketKpis();
    expectErrorKind(result, "network");
  });

  it("URL acepta periodDays custom y lo pasa al query string", async () => {
    const fetchMock = mockFetchOnce(
      makeResponse({
        status: 200,
        body: {
          totals: { total: 0, active: 0, unassigned: 0, byState: [], byPriority: [] },
          operationalAverages: {
            firstResponseMinutes: 0,
            resolutionMinutes: 0,
            firstResponseCount: 0,
            resolvedCount: 0,
          },
          dailyTrend: [],
          period: { days: 7, start: "2026-08-21", end: "2026-08-27" },
          generatedAt: "2026-08-27T15:00:00Z",
        },
      }),
    );
    await getTicketKpis(7);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain("periodDays=7");
  });
});
