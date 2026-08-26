export type MockUserRole = "technician" | "director" | "supervisor" | "administrative" | "volunteer";

export type MockUser = {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: MockUserRole;
  roleLabel: string;
  roleLevel: 0 | 1 | 2 | 3 | 4;
  department: string;
  title: string;
  supervisorId?: string;
};

export type MockTechnicianAvailability = "available" | "busy" | "away";

export type MockTechnician = {
  userId: string;
  availability: MockTechnicianAvailability;
  activeTickets: number;
  capacity: number;
  specialties: readonly string[];
};

export type MockCategory = {
  id: string;
  label: string;
  description: string;
};

export const MOCK_PRIORITY_CODES = ["P1", "P2", "P3", "P4"] as const;

export type MockPriorityCode = (typeof MOCK_PRIORITY_CODES)[number];

export type MockPriority = {
  code: MockPriorityCode;
  label: string;
  visualTone: "danger" | "warning" | "info" | "success";
};

export const MOCK_TICKET_STATES = [
  "ABIERTO",
  "EN_PROCESO",
  "ESPERANDO_USUARIO",
  "ESCALADO",
  "RESUELTO",
  "CERRADO",
] as const;

export type MockTicketState = (typeof MOCK_TICKET_STATES)[number];

export type MockTicketStateDefinition = {
  code: MockTicketState;
  label: string;
  visualTone: "info" | "warning" | "danger" | "success";
};

export type MockSlaStatus = "on_track" | "at_risk" | "overdue" | "met";

export type MockTicketTiming = {
  firstResponseMinutes: number | null;
  effectiveWorkMinutes: number;
  awaitingUserMinutes: number;
  resolutionMinutes: number | null;
  totalMinutes: number;
  slaStatus: MockSlaStatus;
};

export type MockTicket = {
  id: string;
  title: string;
  description: string;
  requesterId: string;
  technicianId?: string;
  categoryId: string;
  priority: MockPriorityCode;
  state: MockTicketState;
  createdAt: string;
  updatedAt: string;
  timing: MockTicketTiming;
};

export type MockTicketEventType = "created" | "assigned" | "state_changed" | "commented" | "attachment_added" | "resolved" | "closed";

export type MockTicketEvent = {
  id: string;
  ticketId: string;
  type: MockTicketEventType;
  actorId: string;
  occurredAt: string;
  summary: string;
  fromState?: MockTicketState;
  toState?: MockTicketState;
};

export type MockDailyKpi = {
  date: string;
  requestsReceived: number;
  requestsResolved: number;
  openAtEndOfDay: number;
  overdue: number;
  slaComplianceRate: number;
  averageFirstResponseMinutes: number;
  averageResolutionMinutes: number;
};

export type MockKpiSummary = {
  periodStart: string;
  periodEnd: string;
  requestsReceived: number;
  requestsResolved: number;
  pending: number;
  overdue: number;
  slaComplianceRate: number;
  averageFirstResponseMinutes: number;
  averageResolutionMinutes: number;
  refreshedAt: string;
};

export const mockUsers = [
  {
    id: "user-valentina-morales",
    name: "Valentina Morales",
    initials: "VM",
    email: "valentina.morales@demo.deskwork.local",
    role: "administrative",
    roleLabel: "Administrativo",
    roleLevel: 3,
    department: "Finanzas",
    title: "Analista de remuneraciones",
    supervisorId: "user-paula-silva",
  },
  {
    id: "user-matias-soto",
    name: "Matías Soto",
    initials: "MS",
    email: "matias.soto@demo.deskwork.local",
    role: "volunteer",
    roleLabel: "Voluntario",
    roleLevel: 4,
    department: "Operaciones",
    title: "Apoyo territorial",
    supervisorId: "user-paula-silva",
  },
  {
    id: "user-camila-rojas",
    name: "Camila Rojas",
    initials: "CR",
    email: "camila.rojas@demo.deskwork.local",
    role: "administrative",
    roleLabel: "Administrativo",
    roleLevel: 3,
    department: "Personas",
    title: "Coordinadora de selección",
    supervisorId: "user-paula-silva",
  },
  {
    id: "user-paula-silva",
    name: "Paula Silva",
    initials: "PS",
    email: "paula.silva@demo.deskwork.local",
    role: "supervisor",
    roleLabel: "Jefatura",
    roleLevel: 2,
    department: "Operaciones",
    title: "Jefa de operaciones",
  },
  {
    id: "user-ignacio-perez",
    name: "Ignacio Pérez",
    initials: "IP",
    email: "ignacio.perez@demo.deskwork.local",
    role: "director",
    roleLabel: "Gerente / Director",
    roleLevel: 1,
    department: "Administración",
    title: "Director de administración y finanzas",
  },
  {
    id: "user-carmen-vidal",
    name: "Carmen Vidal",
    initials: "CV",
    email: "carmen.vidal@demo.deskwork.local",
    role: "technician",
    roleLabel: "Técnico TI",
    roleLevel: 0,
    department: "Tecnología",
    title: "Especialista de soporte",
  },
  {
    id: "user-rodrigo-araya",
    name: "Rodrigo Araya",
    initials: "RA",
    email: "rodrigo.araya@demo.deskwork.local",
    role: "technician",
    roleLabel: "Técnico TI",
    roleLevel: 0,
    department: "Tecnología",
    title: "Analista de soporte",
  },
  {
    id: "user-maria-paz-soto",
    name: "María Paz Soto",
    initials: "MPS",
    email: "maria-paz.soto@demo.deskwork.local",
    role: "technician",
    roleLabel: "Técnico TI",
    roleLevel: 0,
    department: "Tecnología",
    title: "Administradora de plataformas",
  },
  {
    id: "user-tomas-fuentes",
    name: "Tomás Fuentes",
    initials: "TF",
    email: "tomas.fuentes@demo.deskwork.local",
    role: "administrative",
    roleLabel: "Administrativo",
    roleLevel: 3,
    department: "Comunicaciones",
    title: "Diseñador editorial",
    supervisorId: "user-ignacio-perez",
  },
] as const satisfies readonly MockUser[];

export const mockTechnicians = [
  {
    userId: "user-carmen-vidal",
    availability: "available",
    activeTickets: 4,
    capacity: 7,
    specialties: ["Computador", "Impresora", "Telefonía"],
  },
  {
    userId: "user-rodrigo-araya",
    availability: "busy",
    activeTickets: 6,
    capacity: 7,
    specialties: ["Internet / conectividad", "Correo", "Accesos / permisos"],
  },
  {
    userId: "user-maria-paz-soto",
    availability: "available",
    activeTickets: 3,
    capacity: 6,
    specialties: ["Software / aplicaciones", "Cuenta / usuario"],
  },
] as const satisfies readonly MockTechnician[];

export const mockCategories = [
  { id: "computador", label: "Computador", description: "Equipo, periféricos o sistema operativo." },
  { id: "correo", label: "Correo", description: "Cuenta, envío, recepción o configuración de correo." },
  { id: "internet-conectividad", label: "Internet / conectividad", description: "Red, Wi-Fi, VPN o acceso a internet." },
  { id: "impresora", label: "Impresora", description: "Impresión, escáner o consumibles." },
  { id: "telefonia", label: "Telefonía", description: "Teléfono, extensión o videollamada." },
  { id: "accesos-permisos", label: "Accesos / permisos", description: "Acceso a recursos, carpetas o servicios." },
  { id: "software-aplicaciones", label: "Software / aplicaciones", description: "Instalación, actualización o uso de aplicaciones." },
  { id: "cuenta-usuario", label: "Cuenta / usuario", description: "Credenciales, perfil o alta de usuario." },
  { id: "otro", label: "Otro", description: "Solicitud que aún necesita clasificación." },
] as const satisfies readonly MockCategory[];

export const mockPriorities = [
  { code: "P1", label: "Crítica", visualTone: "danger" },
  { code: "P2", label: "Alta", visualTone: "warning" },
  { code: "P3", label: "Normal", visualTone: "info" },
  { code: "P4", label: "Baja", visualTone: "success" },
] as const satisfies readonly MockPriority[];

export const mockTicketStates = [
  { code: "ABIERTO", label: "Abierto", visualTone: "info" },
  { code: "EN_PROCESO", label: "En proceso", visualTone: "warning" },
  { code: "ESPERANDO_USUARIO", label: "Esperando usuario", visualTone: "warning" },
  { code: "ESCALADO", label: "Escalado", visualTone: "danger" },
  { code: "RESUELTO", label: "Resuelto", visualTone: "success" },
  { code: "CERRADO", label: "Cerrado", visualTone: "success" },
] as const satisfies readonly MockTicketStateDefinition[];

export const mockTickets: readonly MockTicket[] = [
  {
    id: "DW-1048",
    title: "No puedo acceder a la carpeta compartida de Finanzas",
    description: "El acceso fue solicitado para el cierre mensual y aparece denegado.",
    requesterId: "user-valentina-morales",
    technicianId: "user-rodrigo-araya",
    categoryId: "accesos-permisos",
    priority: "P2",
    state: "EN_PROCESO",
    createdAt: "2026-08-25T09:12:00.000Z",
    updatedAt: "2026-08-25T10:38:00.000Z",
    timing: { firstResponseMinutes: 16, effectiveWorkMinutes: 54, awaitingUserMinutes: 0, resolutionMinutes: null, totalMinutes: 86, slaStatus: "on_track" },
  },
  {
    id: "DW-1047",
    title: "La red Wi-Fi se desconecta en sala de reuniones",
    description: "La conexión cae durante videollamadas de la mañana.",
    requesterId: "user-paula-silva",
    technicianId: "user-rodrigo-araya",
    categoryId: "internet-conectividad",
    priority: "P1",
    state: "ESCALADO",
    createdAt: "2026-08-25T08:06:00.000Z",
    updatedAt: "2026-08-25T10:11:00.000Z",
    timing: { firstResponseMinutes: 8, effectiveWorkMinutes: 71, awaitingUserMinutes: 0, resolutionMinutes: null, totalMinutes: 125, slaStatus: "at_risk" },
  },
  {
    id: "DW-1046",
    title: "Solicitud de acceso a la plataforma de proveedores",
    description: "Se requiere acceso de lectura para revisar documentos de compra.",
    requesterId: "user-camila-rojas",
    technicianId: "user-maria-paz-soto",
    categoryId: "cuenta-usuario",
    priority: "P3",
    state: "ESPERANDO_USUARIO",
    createdAt: "2026-08-24T15:20:00.000Z",
    updatedAt: "2026-08-25T09:45:00.000Z",
    timing: { firstResponseMinutes: 29, effectiveWorkMinutes: 38, awaitingUserMinutes: 922, resolutionMinutes: null, totalMinutes: 1105, slaStatus: "on_track" },
  },
  {
    id: "DW-1045",
    title: "El computador tarda varios minutos en iniciar",
    description: "El problema se repite desde la última actualización del sistema.",
    requesterId: "user-tomas-fuentes",
    technicianId: "user-carmen-vidal",
    categoryId: "computador",
    priority: "P3",
    state: "EN_PROCESO",
    createdAt: "2026-08-24T14:04:00.000Z",
    updatedAt: "2026-08-25T08:32:00.000Z",
    timing: { firstResponseMinutes: 44, effectiveWorkMinutes: 89, awaitingUserMinutes: 0, resolutionMinutes: null, totalMinutes: 1112, slaStatus: "overdue" },
  },
  {
    id: "DW-1044",
    title: "Impresora de recepción imprime con líneas",
    description: "La impresión de documentos presenta líneas verticales.",
    requesterId: "user-matias-soto",
    technicianId: "user-carmen-vidal",
    categoryId: "impresora",
    priority: "P3",
    state: "RESUELTO",
    createdAt: "2026-08-24T11:18:00.000Z",
    updatedAt: "2026-08-24T13:07:00.000Z",
    timing: { firstResponseMinutes: 21, effectiveWorkMinutes: 76, awaitingUserMinutes: 0, resolutionMinutes: 109, totalMinutes: 109, slaStatus: "met" },
  },
  {
    id: "DW-1043",
    title: "No recibo correos externos",
    description: "Los mensajes de proveedores no aparecen en la bandeja de entrada.",
    requesterId: "user-valentina-morales",
    technicianId: "user-rodrigo-araya",
    categoryId: "correo",
    priority: "P2",
    state: "RESUELTO",
    createdAt: "2026-08-23T16:35:00.000Z",
    updatedAt: "2026-08-24T08:41:00.000Z",
    timing: { firstResponseMinutes: 17, effectiveWorkMinutes: 62, awaitingUserMinutes: 0, resolutionMinutes: 966, totalMinutes: 966, slaStatus: "met" },
  },
  {
    id: "DW-1042",
    title: "Instalación de lector de PDF",
    description: "Se necesita el lector para revisar documentos enviados por clientes.",
    requesterId: "user-camila-rojas",
    technicianId: "user-maria-paz-soto",
    categoryId: "software-aplicaciones",
    priority: "P4",
    state: "CERRADO",
    createdAt: "2026-08-23T13:14:00.000Z",
    updatedAt: "2026-08-23T14:03:00.000Z",
    timing: { firstResponseMinutes: 14, effectiveWorkMinutes: 31, awaitingUserMinutes: 0, resolutionMinutes: 49, totalMinutes: 49, slaStatus: "met" },
  },
  {
    id: "DW-1041",
    title: "La extensión telefónica no recibe llamadas",
    description: "La llamada llega a la central, pero no al teléfono asignado.",
    requesterId: "user-paula-silva",
    technicianId: "user-carmen-vidal",
    categoryId: "telefonia",
    priority: "P2",
    state: "RESUELTO",
    createdAt: "2026-08-22T10:25:00.000Z",
    updatedAt: "2026-08-22T14:12:00.000Z",
    timing: { firstResponseMinutes: 12, effectiveWorkMinutes: 104, awaitingUserMinutes: 0, resolutionMinutes: 227, totalMinutes: 227, slaStatus: "met" },
  },
  {
    id: "DW-1040",
    title: "Actualizar firma de correo",
    description: "La firma debe reflejar el nuevo cargo y número de contacto.",
    requesterId: "user-tomas-fuentes",
    technicianId: "user-rodrigo-araya",
    categoryId: "correo",
    priority: "P4",
    state: "CERRADO",
    createdAt: "2026-08-22T09:42:00.000Z",
    updatedAt: "2026-08-22T10:26:00.000Z",
    timing: { firstResponseMinutes: 11, effectiveWorkMinutes: 26, awaitingUserMinutes: 0, resolutionMinutes: 44, totalMinutes: 44, slaStatus: "met" },
  },
  {
    id: "DW-1039",
    title: "El navegador no abre el portal institucional",
    description: "La página queda cargando en el equipo de recepción.",
    requesterId: "user-matias-soto",
    technicianId: "user-carmen-vidal",
    categoryId: "software-aplicaciones",
    priority: "P3",
    state: "RESUELTO",
    createdAt: "2026-08-21T14:30:00.000Z",
    updatedAt: "2026-08-21T16:18:00.000Z",
    timing: { firstResponseMinutes: 19, effectiveWorkMinutes: 74, awaitingUserMinutes: 0, resolutionMinutes: 108, totalMinutes: 108, slaStatus: "met" },
  },
  {
    id: "DW-1038",
    title: "Solicitud de cuenta para nueva integrante",
    description: "Se requiere habilitar correo y acceso inicial antes de su ingreso.",
    requesterId: "user-paula-silva",
    technicianId: "user-maria-paz-soto",
    categoryId: "cuenta-usuario",
    priority: "P2",
    state: "CERRADO",
    createdAt: "2026-08-21T09:05:00.000Z",
    updatedAt: "2026-08-21T13:27:00.000Z",
    timing: { firstResponseMinutes: 23, effectiveWorkMinutes: 83, awaitingUserMinutes: 0, resolutionMinutes: 262, totalMinutes: 262, slaStatus: "met" },
  },
  {
    id: "DW-1037",
    title: "Pantalla externa no es detectada",
    description: "El monitor adicional no aparece luego de conectar la estación.",
    requesterId: "user-valentina-morales",
    technicianId: "user-carmen-vidal",
    categoryId: "computador",
    priority: "P3",
    state: "CERRADO",
    createdAt: "2026-08-20T12:48:00.000Z",
    updatedAt: "2026-08-20T14:16:00.000Z",
    timing: { firstResponseMinutes: 18, effectiveWorkMinutes: 55, awaitingUserMinutes: 0, resolutionMinutes: 88, totalMinutes: 88, slaStatus: "met" },
  },
  {
    id: "DW-1036",
    title: "Se pierde conexión con la VPN",
    description: "La conexión se interrumpe al acceder desde fuera de la oficina.",
    requesterId: "user-ignacio-perez",
    technicianId: "user-rodrigo-araya",
    categoryId: "internet-conectividad",
    priority: "P1",
    state: "RESUELTO",
    createdAt: "2026-08-20T08:18:00.000Z",
    updatedAt: "2026-08-20T11:57:00.000Z",
    timing: { firstResponseMinutes: 7, effectiveWorkMinutes: 141, awaitingUserMinutes: 0, resolutionMinutes: 219, totalMinutes: 219, slaStatus: "met" },
  },
  {
    id: "DW-1035",
    title: "Error al abrir archivo de presupuesto",
    description: "El archivo compartido muestra un mensaje de formato no compatible.",
    requesterId: "user-tomas-fuentes",
    technicianId: "user-maria-paz-soto",
    categoryId: "software-aplicaciones",
    priority: "P3",
    state: "CERRADO",
    createdAt: "2026-08-19T15:11:00.000Z",
    updatedAt: "2026-08-19T16:24:00.000Z",
    timing: { firstResponseMinutes: 15, effectiveWorkMinutes: 48, awaitingUserMinutes: 0, resolutionMinutes: 73, totalMinutes: 73, slaStatus: "met" },
  },
  {
    id: "DW-1034",
    title: "Solicitud de permiso temporal a carpeta de contratos",
    description: "Se necesita consultar un contrato para responder una licitación.",
    requesterId: "user-camila-rojas",
    technicianId: "user-rodrigo-araya",
    categoryId: "accesos-permisos",
    priority: "P2",
    state: "CERRADO",
    createdAt: "2026-08-19T10:02:00.000Z",
    updatedAt: "2026-08-19T13:19:00.000Z",
    timing: { firstResponseMinutes: 22, effectiveWorkMinutes: 65, awaitingUserMinutes: 0, resolutionMinutes: 197, totalMinutes: 197, slaStatus: "met" },
  },
  {
    id: "DW-1033",
    title: "El escáner no guarda archivos en la carpeta de destino",
    description: "Los documentos escaneados no se encuentran luego del envío.",
    requesterId: "user-matias-soto",
    technicianId: "user-carmen-vidal",
    categoryId: "impresora",
    priority: "P3",
    state: "RESUELTO",
    createdAt: "2026-08-18T11:37:00.000Z",
    updatedAt: "2026-08-18T15:02:00.000Z",
    timing: { firstResponseMinutes: 26, effectiveWorkMinutes: 112, awaitingUserMinutes: 0, resolutionMinutes: 205, totalMinutes: 205, slaStatus: "met" },
  },
  {
    id: "DW-1032",
    title: "Consulta sobre licencia de diseño",
    description: "Se requiere validar si existe disponibilidad de licencia para una herramienta de diseño.",
    requesterId: "user-tomas-fuentes",
    categoryId: "otro",
    priority: "P4",
    state: "ABIERTO",
    createdAt: "2026-08-25T10:03:00.000Z",
    updatedAt: "2026-08-25T10:03:00.000Z",
    timing: { firstResponseMinutes: null, effectiveWorkMinutes: 0, awaitingUserMinutes: 0, resolutionMinutes: null, totalMinutes: 35, slaStatus: "on_track" },
  },
  {
    id: "DW-1031",
    title: "El equipo no reconoce el lector de tarjetas",
    description: "El dispositivo dejó de aparecer después de reiniciar la estación.",
    requesterId: "user-valentina-morales",
    technicianId: "user-carmen-vidal",
    categoryId: "computador",
    priority: "P2",
    state: "RESUELTO",
    createdAt: "2026-08-17T09:26:00.000Z",
    updatedAt: "2026-08-17T13:58:00.000Z",
    timing: { firstResponseMinutes: 13, effectiveWorkMinutes: 163, awaitingUserMinutes: 0, resolutionMinutes: 272, totalMinutes: 272, slaStatus: "met" },
  },
];

function occurredAfter(createdAt: string, minutes: number): string {
  return new Date(new Date(createdAt).getTime() + minutes * 60_000).toISOString();
}

function buildMockTicketHistory(ticket: MockTicket): readonly MockTicketEvent[] {
  const events: MockTicketEvent[] = [
    {
      id: `${ticket.id}-created`,
      ticketId: ticket.id,
      type: "created",
      actorId: ticket.requesterId,
      occurredAt: ticket.createdAt,
      summary: "Solicitud registrada desde la maqueta.",
      toState: "ABIERTO",
    },
  ];

  if (ticket.technicianId) {
    events.push({
      id: `${ticket.id}-assigned`,
      ticketId: ticket.id,
      type: "assigned",
      actorId: ticket.technicianId,
      occurredAt: occurredAfter(ticket.createdAt, 8),
      summary: "Solicitud asignada a un técnico de soporte.",
    });
  }

  if (ticket.state !== "ABIERTO") {
    events.push({
      id: `${ticket.id}-started`,
      ticketId: ticket.id,
      type: "state_changed",
      actorId: ticket.technicianId ?? ticket.requesterId,
      occurredAt: occurredAfter(ticket.createdAt, 16),
      summary: "La atención de la solicitud comenzó.",
      fromState: "ABIERTO",
      toState: "EN_PROCESO",
    });
  }

  if (ticket.categoryId === "internet-conectividad" || ticket.categoryId === "impresora") {
    events.push({
      id: `${ticket.id}-attachment`,
      ticketId: ticket.id,
      type: "attachment_added",
      actorId: ticket.requesterId,
      occurredAt: occurredAfter(ticket.createdAt, 22),
      summary: "Se adjuntó una evidencia para el diagnóstico.",
    });
  }

  if (ticket.state === "ESPERANDO_USUARIO" || ticket.state === "ESCALADO") {
    events.push({
      id: `${ticket.id}-waiting`,
      ticketId: ticket.id,
      type: "state_changed",
      actorId: ticket.technicianId ?? ticket.requesterId,
      occurredAt: occurredAfter(ticket.createdAt, 39),
      summary: ticket.state === "ESPERANDO_USUARIO" ? "Se solicitó información adicional a la persona solicitante." : "La solicitud fue escalada para continuar la atención.",
      fromState: "EN_PROCESO",
      toState: ticket.state,
    });
  } else if (ticket.state === "EN_PROCESO") {
    events.push({
      id: `${ticket.id}-comment`,
      ticketId: ticket.id,
      type: "commented",
      actorId: ticket.technicianId ?? ticket.requesterId,
      occurredAt: occurredAfter(ticket.createdAt, 42),
      summary: "Se registró un avance de diagnóstico.",
    });
  }

  if (ticket.state === "RESUELTO" || ticket.state === "CERRADO") {
    events.push({
      id: `${ticket.id}-resolved`,
      ticketId: ticket.id,
      type: "resolved",
      actorId: ticket.technicianId ?? ticket.requesterId,
      occurredAt: ticket.updatedAt,
      summary: "Se registró la resolución de la solicitud.",
      fromState: "EN_PROCESO",
      toState: "RESUELTO",
    });
  }

  if (ticket.state === "CERRADO") {
    events.push({
      id: `${ticket.id}-closed`,
      ticketId: ticket.id,
      type: "closed",
      actorId: ticket.technicianId ?? ticket.requesterId,
      occurredAt: ticket.updatedAt,
      summary: "La solicitud quedó cerrada.",
      fromState: "RESUELTO",
      toState: "CERRADO",
    });
  }

  return events;
}

export const mockTicketHistory = mockTickets.flatMap(buildMockTicketHistory);

const mockKpiSeed = [
  [14, 12, 37, 3, 0.91, 44, 301], [17, 15, 39, 4, 0.92, 42, 286], [13, 14, 38, 3, 0.94, 39, 275],
  [18, 16, 40, 4, 0.93, 41, 289], [15, 13, 42, 5, 0.9, 46, 315], [11, 12, 41, 4, 0.95, 37, 264],
  [9, 10, 40, 3, 0.96, 35, 251], [16, 14, 42, 4, 0.92, 43, 297], [19, 17, 44, 5, 0.91, 45, 310],
  [14, 15, 43, 4, 0.94, 40, 280], [17, 16, 44, 4, 0.93, 42, 292], [20, 18, 46, 6, 0.9, 48, 326],
  [12, 13, 45, 5, 0.95, 38, 268], [10, 11, 44, 4, 0.96, 36, 255], [15, 14, 45, 4, 0.94, 41, 284],
  [18, 16, 47, 5, 0.92, 44, 304], [16, 17, 46, 4, 0.95, 39, 271], [13, 14, 45, 3, 0.96, 37, 260],
  [11, 12, 44, 3, 0.97, 34, 246], [17, 15, 46, 4, 0.93, 42, 295], [21, 18, 49, 6, 0.9, 49, 332],
  [16, 17, 48, 5, 0.94, 40, 279], [14, 15, 47, 4, 0.95, 38, 266], [19, 17, 49, 5, 0.92, 44, 307],
  [15, 14, 50, 6, 0.91, 46, 318], [12, 13, 49, 5, 0.95, 37, 259], [10, 11, 48, 4, 0.96, 35, 248],
  [16, 15, 49, 4, 0.94, 41, 287], [18, 17, 50, 5, 0.93, 43, 299], [14, 16, 48, 4, 0.95, 39, 273],
] as const;

const MOCK_KPI_START = Date.UTC(2026, 6, 27);

export const mockKpiSeries: readonly MockDailyKpi[] = mockKpiSeed.map((seed, index) => ({
  date: new Date(MOCK_KPI_START + index * 86_400_000).toISOString().slice(0, 10),
  requestsReceived: seed[0],
  requestsResolved: seed[1],
  openAtEndOfDay: seed[2],
  overdue: seed[3],
  slaComplianceRate: seed[4],
  averageFirstResponseMinutes: seed[5],
  averageResolutionMinutes: seed[6],
}));

function total(selector: (entry: MockDailyKpi) => number): number {
  return mockKpiSeries.reduce((sum, entry) => sum + selector(entry), 0);
}

function average(selector: (entry: MockDailyKpi) => number): number {
  return Math.round((total(selector) / mockKpiSeries.length) * 100) / 100;
}

export const mockKpiSummary: MockKpiSummary = {
  periodStart: mockKpiSeries[0].date,
  periodEnd: mockKpiSeries.at(-1)?.date ?? mockKpiSeries[0].date,
  requestsReceived: total((entry) => entry.requestsReceived),
  requestsResolved: total((entry) => entry.requestsResolved),
  pending: mockTickets.filter((ticket) => ticket.state !== "RESUELTO" && ticket.state !== "CERRADO").length,
  overdue: mockTickets.filter((ticket) => ticket.timing.slaStatus === "overdue").length,
  slaComplianceRate: average((entry) => entry.slaComplianceRate),
  averageFirstResponseMinutes: average((entry) => entry.averageFirstResponseMinutes),
  averageResolutionMinutes: average((entry) => entry.averageResolutionMinutes),
  refreshedAt: "2026-08-25T12:00:00.000Z",
};

export function getMockTicket(ticketId: string): MockTicket | undefined {
  return mockTickets.find((ticket) => ticket.id === ticketId);
}

export function getMockTicketHistory(ticketId: string): readonly MockTicketEvent[] {
  return mockTicketHistory.filter((event) => event.ticketId === ticketId);
}

export function getMockUser(userId: string): MockUser | undefined {
  return mockUsers.find((user) => user.id === userId);
}
