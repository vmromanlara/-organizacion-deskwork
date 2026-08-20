# PROMPT MAESTRO — CÓNDOR 360°

## PARTE 2 REVISADA — DESARROLLO DEL DOSSIER CORPORATIVO Y COMERCIAL

**Versión:** 2.0 Revisada  
**Fecha de revisión:** 2026-08-17  
**Base documental:** Modelo Maestro Consolidado v1.0

---

## 0. PRECONDICIONES Y RESTRICCIONES

### ✅ FUENTE ÚNICA DE VERDAD

**Desde este punto en adelante:**

- Utilizarás **exclusivamente** el documento `CONDOR_360_MODELO_MAESTRO_CONSOLIDADO.md` como fuente de verdad.
- No reinterpretarás el corpus histórico de chats (ChatGPT, Claude, Minimax, Codex) salvo cuando necesites citar una fuente específica dentro del Modelo Maestro.
- El Modelo Maestro ya contiene las decisiones consolidadas, jerarquía de autoridad, contradicciones resueltas y distinciones vigente/histórico.

### 🔴 LO QUE NO DEBES HACER

1. **No conviertas hipótesis en hechos**
   - ARPU (USD 800–2.500), cantidad de clientes (25–40), ARR (USD 0,5–0,8M) son hipótesis sin validación
   - Si aparecen, deben estar explícitamente marcadas como "estimaciones preliminares" o "market sizing hipotético"
   - No las presentes en sección "Modelo Comercial Vigente"; pueden ir en sección "Proyecciones"

2. **No presentes cinco soluciones con igual peso que el MVP**
   - MVP = Verifica + Legal (definido, Q4 2024)
   - Cinco soluciones = arquitectura comercial para años 1–3 (visión)
   - El dossier debe hacer clara esta diferencia: "Lo que construimos ahora" vs "Lo que será"

3. **No conviertas arquitectura candidata en implementada**
   - Next.js, Supabase, n8n, PostgreSQL, etc. son candidatos técnicos
   - No son decisiones arquitectónicas cerradas
   - La arquitectura debe estar en anexos técnicos, no en narrativa principal

4. **No inventes o especules sobre**
   - Capacidades técnicas no incluidas en el Modelo Maestro
   - Integraciones no mencionadas
   - Certificaciones no listadas
   - Clientes (incluso como hipótesis sin marcar)
   - Resultados de implementaciones reales

### ✅ LO QUE SÍ PUEDES HACER

1. **Usar la identidad visual cerrada**
   - Dark Premium (charcoal base)
   - Colores: Cobre, Sage, accent colors per theme
   - Tipografías: Fraunces (headers), Inter (body), JetBrains Mono (code/data)
   - Esta decisión es **D-008: CERRADA**

2. **Referir a decisiones cerradas como hechos**
   - Décadas 10 decisiones cerradas en el Modelo Maestro son verdades de producto
   - Ej: "Entity-first + Evidence-always" es principio fundacional
   - Ej: "Subordinación de IA a core estructurado" es arquitectura vigente

3. **Distinguir claramente**
   - Estado: IMPLEMENTADO vs DISEÑADO vs CONCEPTUAL vs PLANIFICADO
   - Timing: MVP (Q4 2024) vs SIGUIENTE (Q1–Q2 2025) vs FUTURO (Q3+)
   - Audiencia: Ejecutivos vs Técnicos vs Comercial

4. **Expandir la narrativa cuando sea necesario**
   - El Modelo Maestro contiene los hechos; el dossier debe contar la historia
   - Puedes elaborar ejemplos, analogías, narrativa — siempre basado en lo que ya existe en Modelo Maestro

---

## 1. OBJETIVO REVISADO

Desarrollar el **Dossier Corporativo y Comercial oficial de Cóndor 360°** que:

1. Presenta una **tesis de producto clara**: no una colección de features
2. Diferencia claramente **MVP vs Visión** de expansión
3. Explica el diferenciador central: **Entity-first + Evidence-always + Relationships + Intelligence**
4. Posiciona **IA como herramienta subordinada**, no como protagonista
5. Mantiene **credibilidad técnica** sin vender lo que no existe
6. Integra **identidad visual cerrada** de forma coherente
7. Permite ser base para presentaciones, website, pitch deck y materiales comerciales

---

## 2. ARQUITECTURA DEL DOSSIER (10 NIVELES)

El dossier debe estructurarse así — **no como catálogo de features, sino como tesis de negocio**:

### NIVEL 1: IDENTIDAD Y PROPÓSITO

**¿Qué es Cóndor 360°?**

Plataforma de **Corporate Intelligence & Decision Intelligence** que transforma información empresarial dispersa en inteligencia verificable, trazable y accionable.

**Declaración de propósito:** Ser la capa de inteligencia verificable que sirve como base común para compliance, investigación, riesgo, análisis legal, decisiones comerciales y operaciones de procurement.

**No es:**
- Un CRM
- Un dashboard
- Una base de datos
- Una herramienta de búsqueda aislada
- Un chatbot que genera respuestas desde web

---

### NIVEL 2: EL PROBLEMA QUE RESUELVE

**Problema central:** Las organizaciones investigan la misma contrapartida con herramientas distintas, repiten trabajo constantemente y pierden capacidad de decisión.

**Síntomas específicos:**
- Información fragmentada en múltiples sistemas
- Investigación duplicada por áreas (Compliance, Legal, Comercial, Riesgo investigan lo mismo)
- Falta de trazabilidad en decisiones
- Procesos manuales lentos
- Dificultad para verificar datos
- Exceso de datos sin contexto relacional
- Falta de integración entre herramientas

**Impacto empresarial:**
- ↑ Tiempo de investigación (días vs minutos)
- ↑ Costo operacional (personal dedicado)
- ↑ Riesgo regulatorio (decisiones sin evidencia)
- ↓ Velocidad en oportunidades comerciales

---

### NIVEL 3: EL CORE DIFERENCIADOR

**La solución no es agregar una herramienta más. Es resolver el problema en su raíz.**

La tesis de Cóndor 360° es una **arquitectura conceptual**:

```
ENTITY (Identidad única)
  ↓
EVIDENCE (Trazabilidad de fuentes)
  ↓
RELATIONSHIPS (Contexto relacional)
  ↓
INTELLIGENCE (Análisis especializado)
  ↓
DECISION (Recomendación explicable)
  ↓
ACTION (Operacionalización)
  ↓
MONITORING (Vigilancia continua)
```

**Principios que protegen esta arquitectura:**

1. **Entity-first:** Una empresa = una identidad canónica (no reinventar por cada módulo)
2. **Evidence-always:** Si no hay evidencia, no hay dato (respuesta honesta = UNKNOWN)
3. **Relationships matter:** Las conexiones entre entidades valen más que datos aislados
4. **Traceability native:** Cada decisión auditable de fuente a conclusión
5. **Human-in-the-loop:** IA apoya; humanos deciden (especialmente en compliance/legal)

---

### NIVEL 4: SOLUCIONES COMERCIALES (5 LÍNEAS)

Cóndor 360° entrega **cinco soluciones** construidas sobre un **núcleo común**. No son productos independientes; son vistas especializadas del mismo core de entidad + evidencia + relaciones.

**IMPORTANTE: El MVP es Verifica + Legal. Las otras tres llegan en meses posteriores.**

| Solución | Propósito | Timeline |
|----------|-----------|----------|
| **Cóndor Verifica** | Verificar identidad y datos con evidencia | MVP (Q4 2024) |
| **Cóndor Legal** | Análisis legal completo + litigiosidad | MVP (Q4 2024) |
| **Cóndor Compliance** | KYC/KYB, AML, sanciones, screening | Siguiente (Q1–Q2 2025) |
| **Cóndor Comercial** | Prospección informada, lookalike, ICP | Siguiente (Q1–Q2 2025) |
| **Cóndor Score** | Evaluación financiera con drivers | Siguiente (Q1–Q2 2025) |

**Diferenciador:** Mientras competidores ofrecen soluciones aisladas, Cóndor 360° comparte evidencia y contexto entre todas.

---

### NIVEL 5: CAPACIDADES TRANSVERSALES

Más allá de las cinco soluciones, Cóndor 360° ofrece capacidades de infraestructura que elevan el valor:

| Capacidad | Función |
|-----------|---------|
| **Monitoreo Continuo** | Detección automática de cambios relevantes |
| **Procurement Intelligence** | Evaluación de proveedores pre-adjudicación |
| **IA Estructurada** | Agentes subordinados a datos verificables |
| **API-First** | Integración con sistemas existentes |
| **Evidence Engine** | Auditoría completa de cada dato |
| **Decision Support** | Recomendaciones explicables |

---

### NIVEL 6: CASOS DE USO

**Cada caso de uso demuestra cómo la arquitectura entrega valor.**

Incluir **mínimo 3–4 casos** que muestren:
- Antes/después (tiempo, costo, riesgo)
- Protagonistas (Compliance Officer, General Counsel, VP Comercial, Procurement Manager)
- Proceso y flujo
- Resultado cuantificable

**Casos recomendados:**
1. Screening de compliance (1–2 días → 15 min)
2. Due diligence legal (400 horas → 80 horas)
3. Prospección comercial (manual → lookalike inteligente)
4. Monitoreo de proveedores (manual → automatizado)

**Importante:** Marcar si son casos "reales", "validados en proyecto piloto" o "conceptuales basados en arquitectura".

---

### NIVEL 7: MODELO DE IMPLEMENTACIÓN

Explicar cómo un cliente pasa de "consideración" a "operacional".

**6 fases típicas:**

1. **Discovery (Sem 1–2):** Entender procesos, necesidades, ecosistema
2. **Configuración (Sem 3–4):** Políticas, conectores, integraciones iniciales
3. **Integración (Sem 5–6):** Conectar sistemas existentes
4. **Piloto (Sem 7–8):** Validar con usuarios reales
5. **Go-live (Sem 9):** Producción
6. **Optimización (Mes 2–3):** Mejorar adoption, identificar nuevos casos

**Timeline total:** 8–12 semanas

**Equipo requerido:** Sponsor ejecutivo, PM, Business Analyst, Data Owner, IT, + Equipo Cóndor

---

### NIVEL 8: ARQUITECTURA Y TECNOLOGÍA (RESPALDO, NO PROTAGONISTA)

**Esta sección va EN ANEXOS técnicos, NO en narrativa principal.**

Incluir:

- Diagrama ejecutivo de capas (Ingestión → Core → Inteligencia)
- Componentes del core (Entity Resolution, Evidence Engine, Knowledge Graph)
- Tecnologías candidatas (con claridad de "candidata", no "decidida")
- Características de seguridad (Multi-tenancy, RLS, Auditoría, Encriptación)
- Conformidad (SOC 2, GDPR, Regulación local)

**Tono:** Técnico suficiente para credibilidad; sin pretender que está todo decidido.

---

### NIVEL 9: MVP — VERIFICA + LEGAL

**Definición clara del MVP:**

El **MVP es un producto comercializable y demostrativo** que:

✅ Contiene las capacidades Verifica + Legal  
✅ Demuestra completamente la tesis (Entity → Evidence → Relationships → Intelligence)  
✅ Genera valor inmediato (verificación de identidad + análisis legal)  
✅ Permite validación de mercado  
✅ Base técnica para expansión posterior  

**Capacidades MVP:**
- Búsqueda de empresa
- Resolución de entidad
- Ficha 360° con 20 secciones
- Verificación de datos con evidencia
- Timeline de eventos
- Análisis de relaciones
- Hallazgos legales
- Case management
- Decisiones documentadas
- API beta cerrada

**Timeline MVP:** Q4 2024

**No incluye en MVP:** Compliance v1, Score, Comercial, Monitoreo. Estos son "siguiente".

---

### NIVEL 10: ROADMAP Y VISIÓN LATAM

**Diferenciación clara:**

| Horizonte | Qué | Timing |
|-----------|-----|--------|
| **NOW** | MVP Verifica + Legal | Q4 2024 |
| **NEXT** | Compliance v1 + Score v1 + Monitoreo v1 | Q1–Q2 2025 |
| **SOON** | Comercial v0 + Procurement v0 | Q2–Q3 2025 |
| **FUTURE** | Expansión LATAM (Perú, Argentina, Colombia) | Q4 2025+ |
| **VISIÓN** | Plataforma de referencia de inteligencia corporativa en LATAM | 3–5 años |

**Proyecciones hipotéticas (si se incluyen):**
- Clientes (25–40 año 1): Estimación preliminar, sujeta a validación
- ARR (USD 500K–800K año 1): Market sizing hipotético, no vinculante
- Mercados LATAM: Expansión condicional a éxito en Chile

---

## 3. RESTRICCIONES ESPECÍFICAS POR SECCIÓN

### Sección "Propuesta de Valor"
- ✅ Puedes decir: "Reduce tiempo de investigación de días a minutos"
- ❌ No puedes decir: "Clientes reportan 70% reducción" (sin case study real)
- ✅ Puedes decir: "Arquitectura diseñada para reducir investigación duplicada"
- ❌ No puedes decir: "Probado en 50 implementaciones"

### Sección "Soluciones Comerciales"
- ✅ Explica qué hace cada solución (Compliance, Verifica, Comercial, Legal, Score)
- ❌ No presentes las cinco con igual peso; MVP = Verifica + Legal, las otras llegan después
- ✅ Diferencia: "Ahora disponible" vs "En desarrollo" vs "Planificado"

### Sección "Casos de Uso"
- ✅ Presenta casos "conceptuales basados en arquitectura" si son realistas
- ❌ No inventes resultados de clientes reales
- ✅ Marca claramente: "Caso conceptual", "Basado en validación de mercado", "Implementación piloto"

### Sección "Arquitectura Técnica"
- ✅ Explica qué problemas resuelve cada componente
- ✅ Menciona tecnologías candidatas con claridad: "PostgreSQL (candidata), Supabase (evaluando), n8n (propuesta)"
- ❌ No vendas "Next.js + Supabase + n8n + Claude" como si fuera un stack decidido

### Sección "Seguridad y Gobernanza"
- ✅ Explica lo que está por diseño: Multi-tenancy, RLS, Auditoría, Encriptación
- ❌ No menciones certificaciones no alcanzadas (SOC 2, ISO 27001 están "en evaluación")
- ✅ Puedes hablar de roadmap de cumplimiento: "Evaluando SOC 2 Type II"

### Sección "Diferenciadores"
- ✅ Compara contra competidores reales (Wherex, Pirani, ZoomInfo, ComplyAdvantage)
- ✅ Enfatiza: "Core compartido", "Evidencia trazable", "Contexto relacional", "LATAM-first"
- ❌ No compares features menores; habla de tesis de producto

---

## 4. IDENTIDAD VISUAL INTEGRADA

### Paleta Autorizada (Decisión D-008: CERRADA)

**Base:**
- Dark Charcoal (fondos, bases)
- Neutral Grays (secundarios)

**Primaria:**
- Cobre (accents, CTAs, elementos principales)

**Secundaria:**
- Sage Green (información, señales positivas)

**Tipografía:**
- **Headers:** Fraunces (serif, sofisticada)
- **Body:** Inter (sans-serif, legible)
- **Data/Code:** JetBrains Mono (monospace, técnica)

### Usos en Dossier

- Portada: Dark + Cobre + Fraunces
- Secciones principales: Cobre como color de acento
- Datos/Tablas: Gris + Interlineado limpio + JetBrains Mono para números
- Diagramas: Dark background, Cobre para flujos principales, Sage para secundarios
- Citas/callouts: Fondo Charcoal, texto Cobre

### Principio de Diseño

Cada elemento visual debe explicar algo. No decoración por decoración.

---

## 5. TONO Y LENGUAJE

### Para Ejecutivos
- Claridad sobre problemas y soluciones
- Métricas y beneficio empresarial
- Timeline realista

### Para Técnicos
- Arquitectura de componentes
- Decisiones de diseño
- Roadmap técnico
- Stack candidato (con claridad de status)

### Para Comercial
- Casos de uso
- Diferenciadores vs competencia
- Modelo de implementación
- Pricing hipotético (marcado como tal)

**Evitar:**
- Jerga IA genérica ("revolucionario", "IA de vanguardia")
- Promesas sin base ("solución completa")
- Tecnicismos innecesarios en narrativa principal

---

## 6. ESTRUCTURA FINAL RECOMENDADA

```
PORTADA
├─ Título: Cóndor 360° — Plataforma de Corporate Intelligence
├─ Subtítulo: Transformar información dispersa en decisiones trazables
└─ Identidad visual (Dark + Cobre)

ÍNDICE EJECUTIVO

SECCIÓN 1: IDENTIDAD Y PROPÓSITO
├─ Qué es Cóndor 360°
├─ Propósito y visión
├─ Lo que NO es
└─ Filosofía de producto

SECCIÓN 2: EL PROBLEMA
├─ Problema central
├─ Síntomas específicos
├─ Impacto empresarial
└─ Por qué importa ahora

SECCIÓN 3: EL DIFERENCIADOR
├─ Arquitectura conceptual (Entity → Evidence → Relationships → Intelligence)
├─ Cinco principios (Entity-first, Evidence-always, Relationships, Traceability, Human-in-the-loop)
├─ Por qué es diferente de la competencia
└─ Comparación executiva

SECCIÓN 4: LAS CINCO SOLUCIONES
├─ Tabla: Solución | Propósito | Timeline
├─ Diferenciador: Core compartido, no silos
├─ IMPORTANTE: MVP = Verifica + Legal
└─ Capacidades transversales (Monitoreo, Procurement Intelligence, IA, API, Evidence, Decision)

SECCIÓN 5: CASOS DE USO
├─ Caso 1: Compliance screening
├─ Caso 2: Due diligence legal
├─ Caso 3: Prospección comercial
├─ Caso 4: Monitoreo de proveedores
└─ Cada caso: Antes/Después/Beneficio

SECCIÓN 6: MODELO DE IMPLEMENTACIÓN
├─ 6 fases (Discovery → Configuración → Integración → Piloto → Go-live → Optimización)
├─ Timeline (8–12 semanas típico)
├─ Equipo requerido
└─ Hito de valor

SECCIÓN 7: MODELO COMERCIAL
├─ Opciones de contratación (SaaS, Servicios, Bundle)
├─ Precios indicativos (con disclaimer de hipótesis)
├─ ROI típico para mid-market
└─ Modelo de valor

SECCIÓN 8: MVP — VERIFICA + LEGAL
├─ Definición clara
├─ Capacidades incluidas
├─ Timeline Q4 2024
├─ Por qué empieza aquí
└─ Validación de mercado esperada

SECCIÓN 9: ROADMAP Y EXPANSIÓN LATAM
├─ NOW (MVP)
├─ NEXT (Compliance + Score + Monitoreo)
├─ SOON (Comercial + Procurement)
├─ FUTURE (Expansión LATAM)
└─ Visión 3–5 años

SECCIÓN 10: ARQUITECTURA Y TECNOLOGÍA
├─ Diagram ejecutivo (Ingestión → Core → Inteligencia)
├─ Componentes (Entity Resolution, Evidence Engine, Knowledge Graph)
├─ Tecnologías candidatas (con claridad)
├─ Seguridad (Multi-tenancy, RLS, Auditoría)
└─ Conformidad (Roadmap)

ANEXOS
├─ Matriz competitiva detallada
├─ Plan de seguridad y cumplimiento
├─ Glosario técnico
├─ Plan de capacitación
└─ FAQ

CONTACTO Y PRÓXIMOS PASOS
```

---

## 7. CRITERIOS DE ACEPTACIÓN

El dossier está listo cuando:

- ✅ Un potencial cliente puede responder todas estas preguntas después de leerlo:
  1. ¿Qué es Cóndor 360°?
  2. ¿Qué problema resuelve?
  3. ¿Qué soluciones puedo contratar ahora vs después?
  4. ¿Cómo funciona?
  5. ¿Cómo se implementa?
  6. ¿Qué valor obtiene mi organización?
  7. ¿Por qué debería elegirlo?
  8. ¿Cuál es el MVP y cuándo está disponible?

- ✅ No hay confusion entre MVP (definido) y cinco soluciones (visión futura)

- ✅ No hay presentación de hipótesis de negocio como hechos (ARPU, clientes, ARR marcados claramente)

- ✅ No hay arquitectura técnica presentada como decidida (todas las tecnologías marcadas como "candidatas")

- ✅ Identity visual está integrada consistentemente

- ✅ Tesis de producto (Entity → Evidence → Relationships → Intelligence) está clara en cada sección

- ✅ IA está correctamente posicionada como herramienta subordinada, no protagonista

- ✅ Documento puede servir como base para:
  - Presentación ejecutiva (20–30 minutos)
  - Presentación comercial (45–60 minutos)
  - Website corporativo
  - Pitch deck
  - Demo script
  - Materiales de venta

---

## 8. REGLA CRÍTICA: COHERENCIA CON MODELO MAESTRO

**En caso de duda:**

1. Consulta el Modelo Maestro Consolidado
2. Verifica la sección relevante
3. Usa eso como fuente de verdad
4. No improvises ni interpoles

**Decisiones cerradas** (usa como hechos):
- Cinco soluciones
- Entity-first + Evidence-always
- Core compartido
- Identity visual (Dark Premium + Cobre)
- MVP = Verifica + Legal
- Diferenciadores técnicos
- Multi-tenancy nativa
- AI subordinada a core estructurado

**Decisiones abiertas** (marca como tales):
- Stack técnico (Next.js/Supabase/n8n son candidatos)
- Fuentes de datos (acceso a SII, Poder Judicial pendiente)
- ARPU y proyecciones (hipótesis sin validación)
- Exacto timing de Compliance/Score (Q1–Q2 probable)
- Planes exactos de expansión LATAM

---

## 9. ENTREGA ESPERADA

El resultado debe ser:

**Dossier Corporativo y Comercial de Cóndor 360°**

- Formato: Markdown + estructura modular
- Largo: 8,000–12,000 palabras
- Incluyendo: Portada, 10 secciones + anexos + contacto
- Estado: Listo para convertir a PDF, presentación, website, materiales de venta
- Tono: Profesional, técnicamente creíble, comercialmente convincente
- Narrativa: Tesis de producto, no catálogo de features

**Artefactos secundarios (opcional pero recomendado):**
- Resumen ejecutivo 2–3 páginas
- Pitch deck outline (10–15 slides)
- FAQ document (10+ preguntas frecuentes)

---

## 10. PROCESO DE VALIDACIÓN

Después de generar el dossier:

1. **Auto-revisión:** Verifica cada sección contra Modelo Maestro
2. **Verificación de estado:** MVP vs Visión está claro en todo
3. **Verificación de hipótesis:** ARPU, clientes, ARR están marcados como tales
4. **Verificación de arquitectura:** Tech stack está en anexos, no protagonista
5. **Verificación de narrativa:** Tesis de producto clara vs catálogo de features

Si alguna sección falla, regresa a Modelo Maestro y reescribe.

---

# RESULTADO ESPERADO

Un **Dossier Corporativo y Comercial oficial de Cóndor 360°** que:

- Utiliza el Modelo Maestro como fuente única de verdad
- Distingue claramente MVP (ahora) vs Visión (años 1–3)
- Protege hipótesis vs decisiones cerradas
- Mantiene credibilidad técnica sin vender lo que no existe
- Integra identidad visual cerrada
- Cuenta una tesis de producto coherente
- Sirve como base para todas las presentaciones y materiales comerciales posteriores

