/**
 * DeskWork Ticketing Core / TKT-023 — Diccionario ES (default).
 *
 * Convencion de claves: `<superficie>.<seccion>.<elemento>`.
 * Las claves planas sin seccion (ej. `common.save`) viven en
 * el namespace `common`.
 *
 * No traducir:
 *  - valores de estado/prioridad (eso vive en `labels.ts`);
 *  - codigos de error (eso vive en `error-messages.ts`);
 *  - textos de API / logs / contract codes.
 *
 * Si una clave no existe en el locale activo, el provider cae
 * al locale "es" y luego a la clave cruda.
 */
export const es = {
  common: {
    save: "Guardar",
    cancel: "Cancelar",
    send: "Enviar",
    loading: "Cargando…",
    retry: "Reintentar",
    refresh: "Actualizar",
    optional: "opcional",
    yes: "Sí",
    no: "No",
    none: "Ninguno",
    all: "Todos",
    close: "Cerrar",
    open: "Abrir",
    back: "Volver",
    required: "obligatorio",
    error: "Error",
    success: "Listo",
  },
  shell: {
    brand: "DeskWork",
    contextBadge: "Maqueta operativa",
    environmentLabel: "Entorno de demo",
    environmentBody:
      "Interacción local. No usa datos ni servicios de Foundation.",
    footerLeft: "DeskWork · maqueta operativa",
    footerRight: "UI local · sin conexión a Foundation",
    menuOpen: "Abrir navegación",
    menuClose: "Cerrar navegación",
    sidebarScrimClose: "Cerrar menú lateral",
    sidebarAria: "Navegación de la maqueta",
    localeLabel: "Idioma",
  },
  nav: {
    sectionRequests: "Solicitudes",
    sectionOperations: "Operación",
    dashboard: "Mi panel",
    newTicket: "Crear solicitud",
    history: "Mi historial",
    techDashboard: "Panel técnico",
    techQueue: "Cola de trabajo",
    supervisor: "Vista supervisión",
  },
  locale: {
    es: "Español",
    en: "English",
  },

  // ============================================================
  // Requester
  // ============================================================
  requester: {
    newTicket: {
      title: "Crear nueva solicitud",
      intro: "Describe lo que necesitas. Cuanto más claro, más rápido.",
      steps: {
        identification: "Identificación",
        category: "Categoría",
        description: "Descripción",
        attachment: "Adjunto",
        review: "Revisión",
        confirmation: "Confirmación",
      },
      stepCategory: "1. Categoría",
      stepDescription: "2. Descripción",
      stepAttachment: "3. Imagen",
      stepSubmit: "4. Enviar",
      categoryLabel: "Categoría",
      categoryPlaceholder: "Selecciona una categoría",
      titleLabel: "Título",
      titlePlaceholder: "Ej. No puedo abrir la carpeta de Finanzas",
      descriptionLabel: "Descripción",
      descriptionPlaceholder:
        "Explica qué pasa, desde cuándo y qué intentaste.",
      attachmentLabel: "Adjuntar imagen (opcional)",
      attachmentHelper:
        "Una sola imagen, máximo 5 MB. Formatos: PNG, JPG.",
      submit: "Enviar solicitud",
      sending: "Enviando…",
      created: "Solicitud creada correctamente.",
      errorCategory: "Selecciona una categoría.",
      errorTitle: "El título debe tener al menos 5 caracteres.",
      errorDescription: "La descripción debe tener al menos 10 caracteres.",
      errorAttachmentType: "Tipo de archivo no permitido.",
      errorAttachmentSize: "La imagen supera 5 MB.",
    },
    history: {
      title: "Mis solicitudes",
      empty: "Aún no has creado solicitudes.",
      loading: "Cargando solicitudes…",
      errorPrefix: "No pudimos cargar tus solicitudes:",
      openTicket: "Ver detalle",
      newTicketCta: "Crear nueva",
    },
    detail: {
      back: "Volver al historial",
      statusLabel: "Estado",
      priorityLabel: "Prioridad",
      categoryLabel: "Categoría",
      createdAtLabel: "Creada",
      assignedToLabel: "Asignada a",
      noAssignee: "Sin asignar",
      noDescription: "(sin descripción)",
      timelineTitle: "Línea de tiempo",
      commentsTitle: "Comentarios",
      attachmentsTitle: "Archivos",
      errorPrefix: "No pudimos cargar la solicitud:",
    },
  },

  // ============================================================
  // Technician
  // ============================================================
  tech: {
    dashboard: {
      title: "Panel técnico",
      subtitle: "Tu carga, prioridades y cola activa.",
      assignedToMe: "Asignadas a mí",
      inQueue: "En cola",
      awaitingUser: "Esperando usuario",
      escalated: "Escaladas",
      open: "Abiertas",
      inProgress: "En proceso",
      resolved: "Resueltas",
      closed: "Cerradas",
      noAssigned: "Sin tickets asignados. Revisa la cola de trabajo.",
      loading: "Cargando panel…",
    },
    queue: {
      title: "Cola de trabajo",
      subtitle: "Tickets sin asignar o que requieren tu atención.",
      filterAll: "Todas",
      filterUnassigned: "Sin asignar",
      filterMine: "Asignadas a mí",
      empty: "No hay tickets en la cola.",
      loading: "Cargando cola…",
      refresh: "Actualizar cola",
      assignToMe: "Tomar ticket",
    },
    detail: {
      back: "Volver a la cola",
      title: "Ticket",
      loading: "Cargando ticket…",
      errorPrefix: "No pudimos cargar el ticket:",
      assignSection: "Asignación",
      assignToMe: "Asignármelo",
      reassign: "Reasignar",
      noMembers: "No hay miembros disponibles.",
      memberPlaceholder: "Selecciona un miembro",
      assignAction: "Asignar",
      assigning: "Asignando…",
      assignSuccess: "Ticket asignado.",
      assignError: "No se pudo asignar el ticket.",
      transitionSection: "Transiciones",
      transitionLabel: "Nuevo estado",
      transitionReason: "Motivo (opcional)",
      transitionPlaceholder: "Ej. Esperando confirmación del usuario.",
      transitionAction: "Aplicar",
      transitioning: "Aplicando…",
      transitionSuccess: "Estado actualizado.",
      transitionError: "No se pudo cambiar el estado.",
      commentsTitle: "Comentarios",
      commentInternal: "Nota interna",
      commentPublic: "Comentario público",
      commentPlaceholder: "Escribe un comentario…",
      commentSubmit: "Comentar",
      attachmentsTitle: "Archivos",
      cannotTransition: "Esta transición no está permitida para tu rol.",
    },
  },

  // ============================================================
  // Supervisor / KPIs
  // ============================================================
  supervisor: {
    title: "Servicio en perspectiva",
    intro: "Resumen de operación del área a partir de tickets reales.",
    badgeLoading: "Cargando KPIs reales…",
    badgeError: "Error",
    periodBadge: "Datos reales · {start} — {end} · {time}",
    period: {
      days: "Últimos {days} días",
      from: "Desde",
      to: "Hasta",
    },
    kpis: {
      totalTitle: "Tickets en el período",
      totalSpan: "Creados en los últimos {days} días ({trend} según tendencia diaria)",
      assignmentTitle: "Asignación activa",
      assignmentSpan:
        "{assigned}/{active} tickets activos asignados · {operational}",
      assignmentOperational: "operacional, no SLA contractual",
      firstResponseTitle: "Primera respuesta (prom.)",
      firstResponseSpan: "{count} tickets con respuesta registrada",
      resolutionTitle: "Resolución (prom.)",
      resolutionSpan: "{count} tickets resueltos · {operational}",
      noData: "—",
    },
    byState: {
      title: "Solicitudes por estado",
      total: "{count} totales",
    },
    byPriority: {
      title: "Distribución actual",
      critical: "{count} críticas",
    },
    trend: {
      title: "Solicitudes creadas",
      ariaLabel: "Serie diaria de tickets creados (últimos {days} días)",
      noActivity: "Sin actividad en el período.",
      tooltip: "{date}: {count} ticket(s) creado(s)",
      left: "Desde",
      right: "Hasta",
    },
    empty: "Sin tickets registrados todavía.",
    errorRetry: "Reintentar",
    disclaimer:
      "Promedios derivados de {firstResponseField} y {resolvedField} — no contractual. TKT-008 (SLA) pendiente de decisión PO.",
  },

  // ============================================================
  // Estados / Prioridades (valores internos; labels localizados)
  // ============================================================
  states: {
    ABIERTO: "Abierto",
    EN_PROCESO: "En proceso",
    ESPERANDO_USUARIO: "Esperando usuario",
    ESCALADO: "Escalado",
    RESUELTO: "Resuelto",
    CERRADO: "Cerrado",
  },
  priorities: {
    P1: "Crítica",
    P2: "Alta",
    P3: "Normal",
    P4: "Baja",
  },

  // ============================================================
  // Errores (mapping codigo -> mensaje)
  // ============================================================
  // ============================================================
  // Comments
  // ============================================================
  comments: {
    title: "Comentarios",
    threadTitle: "Conversación",
    count: "{count} mensajes",
    empty: "Aún no hay comentarios en este ticket.",
    addLabel: "Agregar comentario",
    placeholder: "Escribe aquí tu comentario o solicitud de cambio de estado.",
    charCounter: "{n}/{max} caracteres",
    internalToggle: "Nota interna (sólo equipo técnico)",
    internalTag: "nota interna",
    submit: "Enviar comentario",
    submitting: "Enviando…",
    errorBody: "El comentario debe tener entre {min} y {max} caracteres.",
    errorPrefix: "No pudimos cargar los comentarios:",
    errorSend: "Error al enviar el comentario.",
    errorForbidden: "No autorizado",
  },

  // ============================================================
  // Attachments
  // ============================================================
  attachments: {
    title: "Archivos del ticket",
    count: "{count} archivos",
    empty: "Aún no hay adjuntos.",
    downloadAria: "Descargar {name}",
    downloading: "Generando URL…",
    noFile: "Sin archivo",
    pickFile: "Seleccionar archivo",
    uploading: "Subiendo {name}…",
    errorEmpty: "El archivo está vacío.",
    errorTooLarge: "Archivo demasiado grande ({size} > 25 MB).",
    errorType:
      "Tipo no permitido: {type}. Permitidos: imagen, PDF, texto.",
    errorUpload: "Error al subir el archivo.",
    errorDownload: "No se pudo generar la URL de descarga.",
    errorLegacy: "Este adjunto es solo metadata (legacy). Sube el archivo nuevamente.",
    tenantLabel: "Tenant",
    storageLabel:
      "Sube un archivo real al ticket (imagen, PDF o texto). El binario se almacena en Storage privado; la descarga se hace por URL temporal.",
  },

  // ============================================================
  // Errors
  // ============================================================
  errors: {
    network: "Sin conexión. Revisa tu red e inténtalo de nuevo.",
    unknown: "Algo salió mal. Inténtalo de nuevo.",
    authentication_required: "Necesitas iniciar sesión para continuar.",
    no_active_membership: "No perteneces a un tenant activo.",
    scope_institution_required:
      "No tienes permisos para acceder a este panel.",
    not_authorized: "No tienes permisos para realizar esta acción.",
    not_found: "El recurso solicitado no existe.",
    conflict: "El recurso cambió mientras lo editabas. Recarga e inténtalo.",
    validation: "Los datos enviados no son válidos.",
    validation_with_reason: "Los datos enviados no son válidos: {reason}",
    storage_disabled: "El almacenamiento no está configurado.",
    storage_error: "No se pudo acceder al almacenamiento.",
    file_too_large: "El archivo supera el tamaño máximo.",
    ticket_not_found: "No encontramos esta solicitud.",
    fsm_denied: "Esta transición no está permitida para tu rol.",
    forbidden: "No tienes permisos para acceder a este recurso.",
  },

  // ============================================================
  // Misc / compartido
  // ============================================================
  time: {
    now: "ahora",
    today: "hoy",
    yesterday: "ayer",
    minutesShort: "{n} min",
    hoursMinutes: "{h} h {m} min",
    empty: "—",
  },
} as const;

export type Messages = typeof es;
