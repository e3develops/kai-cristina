# KAI · Estudia con Cristina 🤖🩺

App web (PWA) de tests inteligentes para preparar los exámenes de enfermería.
Todas las preguntas salen literalmente de los apuntes; cada una guarda la cita y la página.

## Estructura

- `index.html`, `css/`, `js/`: la app (HTML + JS sin compilación).
  - `js/app.js`: pantallas y motor de aprendizaje (repetición espaciada + nota estimada).
  - `js/kai.js`: la mascota KAI en SVG.
- `data/preguntas.json`: banco de preguntas que carga la app (se genera, no se edita a mano).
- `fuentes/` (**no se sube a git**): fotos/PDF del libro, transcripciones y bancos por bloque.
- `tools/build_preguntas.py`: une y valida `fuentes/preguntas/*.json` → `data/preguntas.json`.
- `tools/make_icons.py`: genera los iconos.

## Añadir contenido nuevo

1. Guardar el material en `fuentes/` y generar un `fuentes/preguntas/<bloque>.json` con el formato:
   `id, tema, seccion, concepto, pregunta, opciones[4], correcta (0-3), fuente (cita literal), pagina`.
2. Si es un tema nuevo, añadirlo a `TEMAS` en `tools/build_preguntas.py`.
3. `python tools/build_preguntas.py`
4. Si hay páginas nuevas en `paginas/`: `python tools/build_documentos.py` (índice de apuntes, miniaturas y aviso de páginas que faltan).

## Probar en local

```
python -m http.server 5173
```

y abrir http://localhost:5173

## Cómo decide KAI

- **Prioridad en la práctica**: fallos recientes (vuelven a las ~4 preguntas) → fallos recuperados por confirmar (~6) → preguntas nuevas de los apartados más flojos y grandes. Tras un repaso siempre va una nueva.
- **"Bien" (progreso)**: la última vez que salió la pregunta, se acertó. Un fallo recuperado necesita 2 aciertos seguidos para darse por confirmado.
- **Previsión de nota**: media de la probabilidad de acierto de cada concepto (lo no visto se estima por lo acertado a la primera en su apartado). Se muestra a partir de 20 respuestas.
- **"¡Estás lista!"**: previsión de nota ≥ 82 %, cada tema con ≥ 80 % de sus preguntas respondidas y ≥ 70 % de previsión, y media de los 2 últimos simulacros ≥ 80 %.
- El progreso se guarda en el navegador del dispositivo (localStorage).

## Publicar una versión nueva

```
python tools/bump_version.py
git add -A && git commit -m "..." && git push
```

Al abrirse, la app compara su versión con `version.json` y, si hay una nueva, limpia la caché y se recarga sola.
