# KAI · Arquitectura (v2)

Documento vivo con lo decidido para pasar de "KAI para un examen" a una app de estudio completa.
Última revisión: 10/10/2026.

## Visión

Una app de estudio con **KAI como corazón**: un amigo de estudio que te conoce, te dice qué toca y por qué,
y te prepara cada examen a partir de **tus propios apuntes**.

- Usuarios iniciales: Cristina y Kike. Diseñada para poder abrirse al público y monetizarse algún día.
- Futuro posible: app nativa (Swift) sobre el mismo backend.

## Flujo del usuario

```
Login ─► Inicio ─► Biblioteca ─► Asignatura ─► Preparación de exámenes ─► Examen ─► Estudio (KAI de hoy)
          │
          ├── KAI: "Cris, te recomiendo que le metamos caña a… (?)"
          └── Calendario (se llena con las fechas de los exámenes)
```

### Crear examen

- Nombre (ej. "Tema 1 · La célula"), **fecha**, **documentos** (fotos del libro, PDF, material de clase).
- **Formato del examen**: nº de opciones, si resta por fallo y cuánto. Opción **"no lo sé"** → se asume el caso prudente (4 opciones, −1/3).
- Documentos editables en cualquier momento: añadir, sustituir, quitar.
- Estados: `subido → pendiente → procesando → listo`.

### Recomendación "¿qué estudio?"

KAI elige un examen y explica el porqué en un (?): días hasta el examen, lo que falta para el nivel elegido,
nota estimada y tiempo desde el último repaso. Prioriza lo más urgente y lo que peor va.

## Niveles (Fácil · Medio · Pro): el motor de confianza

- Se procesa **todo** el material una vez. Cada concepto lleva una importancia: ★★★ imprescindible, ★★ importante, ★ detalle.
- El nivel elegido decide **qué se estudia**; se puede subir de nivel sin volver a procesar y sin perder progreso.
- **La nota estimada siempre es sobre el examen entero**: lo no estudiado cuenta con probabilidad baja (algo más que azar).
- La nota se calcula con el **formato del examen** (opciones y penalización), no como un % de aciertos.

| Nivel | Estudia | Promete | Superado cuando… (hipótesis inicial) |
|---|---|---|---|
| Fácil | ★★★ | 5-6 | nota estimada ≥ 6,0 · todo ★★★ visto · 1 simulacro ≥ 6 |
| Medio | ★★★ + ★★ | 7-8 | ≥ 7,5 · cobertura ≥ 80 % de ★★★/★★ · 2 simulacros ≥ 7,5 |
| Pro | todo | 9-10 | ≥ 9,0 · cobertura ≥ 95 % · 2 simulacros ≥ 9 |

Al elegir nivel se muestra: conceptos que cubre, **qué deja fuera**, tiempo estimado y nota esperada.
Aviso honesto siempre visible: la previsión sale **del material subido**; lo que entre en el examen y no esté en él, KAI no lo sabe.

Al superar un nivel: "¡Nivel Medio superado! Nota ~7,5. Quedan 6 días: con ~1 h 40 más podrías ir a por el 9. ¿Subimos?".
KAI también recomienda el nivel según los días que quedan.

### Calibración con notas reales

- Tras la fecha del examen, KAI pregunta la nota (también se puede apuntar a mano).
- Se guarda: nota prevista, nota real, nivel, cobertura y formato.
- Calibración **global** (ajustar los umbrales de cada nivel) y **por usuario** (ajustar su previsión).
- Métrica de producto: "en Medio, el X % saca entre 7 y 8".

## Fábrica de preguntas

**Regla de oro:** la IA **elige** frases del documento; el código **comprueba** que existen literalmente. Si no, la pregunta se descarta.

1. **Ingesta**: cada documento se divide en páginas (imagen + texto + posición de cada palabra). PDF con texto: pdf.js. Fotos: OCR con posiciones.
2. **Conceptos** [IA]: apartados y conceptos con importancia ★/★★/★★★. Al añadir documentos, recibe los conceptos existentes y amplía en vez de duplicar.
3. **Preguntas** [IA]: 4 opciones, cita literal, página.
4. **Validación** [código]: la cita existe, sin duplicados (parecido de texto), opciones equilibradas.
5. **Subrayado** [código]: buscar la cita entre las palabras posicionadas → cajas para "Llévame al libro".

Al quitar o sustituir un documento, sus preguntas se **retiran** (no se borran); el progreso va ligado al concepto.

### Modo de proceso

- **Fase semiautomática (ahora)**: Cris sube → aviso a Kike (email + push) → Kike lo procesa con Claude Code → publicar → push a Cris: "¡Tus documentos de … ya están listos! ¿Empezamos?".
- **Fase automática (más adelante)**: Worker → API de Claude en batch. Estimación: ~1-1,5 $ por tema de ~30 págs. con Sonnet en batch (Haiku para transcribir, Sonnet para preguntas). Se medirá con los primeros temas reales.

## Plataforma

| Pieza | Tecnología |
|---|---|
| Web | PWA con **Vite**, desplegada en **Cloudflare** en `kai.e3develops.com` (la web de `e3develops.com` no se toca) |
| API | **Cloudflare Workers** |
| Login | **Better Auth** dentro del Worker (email, Google, passkeys); usuarios en nuestra BD |
| Base de datos | **Cloudflare D1** (SQL) |
| Archivos | **Cloudflare R2**, privados por usuario |
| Avisos | Web push (nativas en iPhone con la app instalada, iOS 16.4+) y email desde el Worker para el admin |

- **Sin conexión**: la app guarda en el móvil y sincroniza con la BD cuando hay red.
- **Actualización inmediata**: se mantiene (build con nombres con hash + comprobación de versión).
- **Repo privado (obligatorio en la migración)**: al publicar desde Cloudflare el repo pasa a privado y se retira GitHub Pages; nada del proyecto queda público.

### Modelo de datos (borrador)

```
usuarios ─< asignaturas ─< examenes (fecha, formato, nivel, estado)
                             ├─< documentos ─< paginas (imagen, palabras con posición)
                             ├─< conceptos (importancia) ─< preguntas (cita, página, cajas, documento)
                             ├─< progreso (por usuario y pregunta/concepto) · simulacros
                             └─  resultado real (nota prevista vs real)
```

## Datos y legal

- Todo el material subido se guarda; el usuario y el admin tienen acceso. Se avisa en términos y privacidad (RGPD).
- Fotos, PDF y citas literales: **solo para quien los subió** (y el admin).
- Banco compartido futuro: preguntas, respuestas y conceptos propios + referencia ("Libro X, pág. Y"), **sin texto literal**.
- Antes de abrirla al público o cobrar: consulta con abogado de propiedad intelectual.

## Fases

| Fase | Contenido |
|---|---|
| 0 ✅ | Desacoplar el motor de KAI del contenido (examen como dato). Migrar a Vite. Olvido con los días (FSRS), previsión para el día del examen en rango, los "?" de KAI. Calibración con estudiantes simulados (`tools/calibrar.mjs`). |
| 1 ✅ | Cloudflare: login (registro abierto), BD, sincronización entre dispositivos, contenido privado en KV, `kai.e3develops.com`. (Se empieza limpio: sin migrar el progreso antiguo.) |
| 2 ✅ | Biblioteca: Inicio con "te recomiendo…" (?), asignaturas (emoji y color), exámenes con fecha/formato/nivel, calendario con plan diario (?), nota real tras el examen. |
| 3 | Fábrica semiautomática: subida, estados, avisos, publicación. Niveles y nota por formato. |
| 4 | Fábrica automática con la API. |
| 5 | Pregunta de nota real y calibración. Extras. |

Sesión aparte: **KAI como personaje** (memoria del usuario, explica sus decisiones, crece contigo, reacciones).
