# Fábrica de preguntas (modo semiautomático)

Cuando alguien sube sus apuntes y pulsa **"Prepárame este examen"**, el examen pasa a *procesando*,
le llega un email al administrador y aparece en **Tu cuenta → Administración**. Se procesa así,
desde esta carpeta, con Claude Code:

```
node tools/fabrica.mjs pendientes
node tools/fabrica.mjs descargar <examen>
python tools/fabrica_paginas.py <examen>
```

`fabrica_paginas.py` deja en `contenido/<examen>/paginas/` las páginas (visor y miniaturas) y en
`fuentes/<examen>/paginas/` las palabras con posición del OCR (`<doc>-<n>.json`, para subrayar).

## Lo que hace Claude (el paso "semi")

1. **Leer cada página** (`contenido/<examen>/paginas/<doc>-<n>.jpg`) y escribir su **transcripción fiel**
   en `fuentes/<examen>/paginas/<doc>-<n>.transcripcion.txt`. Literal: sin resumir ni corregir.
2. **Mapa de conceptos**: apartados (`seccion`) y conceptos (`concepto`, un id corto) de todo el material,
   cada uno con su **importancia**: 3 = imprescindible, 2 = importante, 1 = detalle.
3. **Preguntas** en `fuentes/<examen>/preguntas/<bloque>.json` (lista), con este formato:

```json
{
  "id": "t1-001", "tema": "fotos", "seccion": "Prevención de infecciones", "concepto": "t1-higiene-manos",
  "pregunta": "Según el texto, …", "opciones": ["…", "…", "…", "…"], "correcta": 2,
  "fuente": "cita LITERAL de la transcripción que demuestra la respuesta",
  "pagina": 3, "importancia": 3
}
```

   - `tema` = el documento (`fotos`, `pdf1`, `pdf2`…, ver `contenido/<examen>/documentos.json`) y `pagina` su número.
   - Varias preguntas por concepto (para que no se repita siempre la misma), opciones trampa creíbles,
     y la correcta repartida entre las 4 posiciones.
   - Densidad según importancia: los ★★★ con más preguntas; los ★ con una o dos.

## Comprobar y publicar

```
node tools/fabrica.mjs construir <examen>
node tools/fabrica.mjs publicar <examen>
```

`construir` aplica la **regla de oro**: cada cita tiene que estar en la transcripción de su página
(≥ 90 % letra a letra) o la pregunta se rechaza. También descarta duplicadas y localiza la frase en la foto
con el OCR para el subrayado de "Llévame al libro" (si no la reconoce bien, la página se ve sin subrayar).

`publicar` sube el contenido al KV privado y marca el examen como listo: el usuario ve
*"¡Tus apuntes de … ya están listos!"* al abrir KAI.

Todo contra Cloudflare por defecto; con `--local`, contra `wrangler dev`.

## Límites (worker/limites.js)

20 MB por archivo · 300 MB por cuenta · 60 subidas por hora · 80 archivos por examen ·
**tope global de 8 GB** (por debajo de los 10 GB gratis de R2): al llegar se pausan las subidas y avisa por email.
