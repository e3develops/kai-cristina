# KAI · Estudia con Cristina 🤖🩺

App web (PWA) de tests inteligentes para preparar exámenes con tus propios apuntes.
Todas las preguntas salen literalmente de los apuntes; cada una guarda la cita y la página.

Plan de evolución (multiusuario, niveles, fábrica de preguntas): [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Estructura

- `index.html` + `src/`: la app, compilada con **Vite**.
  - `src/app.js`: pantallas.
  - `src/engine/`: el motor de estudio, independiente de las pantallas y del contenido.
    - `motor.js`: modelo de aprendizaje (repetición espaciada), elección de preguntas y "¿estás lista?".
    - `nota.js`: nota sobre 10 según el formato del examen, y niveles (Fácil · Medio · Pro).
    - `estado.js`: progreso guardado en el dispositivo (localStorage).
  - `src/config.js`: quién usa la app y qué examen se carga.
  - `src/kai.js`, `src/kaifun.js`: la mascota KAI y sus easter eggs.
  - `src/sw.js`: plantilla del service worker (la compilación rellena la lista de ficheros).
- `public/`: se publica tal cual.
  - `data/examen.json`: el examen (nombre, formato, nivel y de dónde salen sus datos).
  - `data/preguntas.json`: banco de preguntas (se genera, no se edita a mano).
  - `data/documentos.json`, `data/resaltados.json`, `paginas/`: apuntes y subrayados del visor.
- `fuentes/` (**no se sube a git**): fotos/PDF del libro, transcripciones y bancos por bloque.
- `tools/`: scripts de Python para generar preguntas, páginas, índice de apuntes e iconos.
- `tests/`: tests del motor (`npm test`).

## Formato del examen y niveles

`data/examen.json` define el formato: nº de opciones y cuánto resta cada fallo (`penalizacion`, `null` = "no lo sé":
se asume 4 opciones y −1/3). La nota estimada y la de los simulacros se calculan sobre 10 con ese formato.

| Nivel | Promete | Superado cuando… |
|---|---|---|
| Fácil | 5-6 | nota estimada ≥ 6,0 · todo lo ★★★ visto · 1 simulacro ≥ 6 |
| Medio | 7-8 | ≥ 7,5 · ≥ 80 % de cada tema respondido · media de 2 simulacros ≥ 7,5 |
| Pro | 9-10 | ≥ 9,0 · ≥ 95 % · media de 2 simulacros ≥ 9 |

Son hipótesis iniciales: se recalibrarán con las notas reales de los exámenes.

## Añadir contenido nuevo

1. Guardar el material en `fuentes/` y generar un `fuentes/preguntas/<bloque>.json` con el formato:
   `id, tema, seccion, concepto, pregunta, opciones[4], correcta (0-3), fuente (cita literal), pagina`.
2. Si es un tema nuevo, añadirlo a `TEMAS` en `tools/build_preguntas.py`.
3. `python tools/build_preguntas.py`
4. Si hay páginas nuevas en `public/paginas/`: `python tools/build_documentos.py` (índice de apuntes, miniaturas y aviso de páginas que faltan).

## Desarrollo

```
npm install
npm run dev       # http://localhost:5173
npm test          # tests del motor
npm run build     # compila en dist/
npm run preview   # sirve dist/ (con service worker)
```

## Cómo decide KAI

- **Prioridad en la práctica**: fallos recientes (vuelven a las ~4 preguntas) → fallos recuperados por confirmar (~6) → preguntas nuevas de los apartados más flojos y grandes. Tras un repaso siempre va una nueva.
- **"Bien" (progreso)**: la última vez que salió la pregunta, se acertó. Un fallo recuperado necesita 2 aciertos seguidos para darse por confirmado.
- **Nota estimada**: probabilidad de acierto de cada concepto (lo no visto se estima por lo acertado a la primera en su apartado), convertida a nota sobre 10 con el formato del examen. Se muestra a partir de 20 respuestas.
- **Olvido** (`src/engine/memoria.js`): cada concepto tiene una estabilidad en días; lo aprendido se va olvidando (curva de FSRS, el algoritmo de Anki) y repasar espaciado lo asienta más. Los conceptos que se están olvidando vuelven a la práctica.
- **Previsión para el día del examen**: si el examen tiene fecha, la nota y el "¿estás lista?" se calculan para ese día, contando lo que se olvidará hasta entonces.
- **"¡Estás lista!"**: lo que pida el nivel elegido (tabla de arriba).

### Calibración

`node tools/calibrar.mjs [estudiantes] [penalización]` simula estudiantes (que aprenden y olvidan con un modelo
distinto al del motor) con varios planes de estudio y compara la nota que estima KAI con la que sacarían.
Resultado actual: quien llega a "lista" en Medio saca de verdad 7,0-8,6 (y ~9 en Pro). Con quien aún no está
lista, KAI tiende a ser algo optimista en planes largos con parones (hasta +1,5): es lo primero que hay que
afinar con notas reales.
- El progreso se guarda en el navegador del dispositivo (localStorage).

## Publicar una versión nueva

```
npm run deploy
```

Pasa los tests, compila, aplica las migraciones pendientes de la base de datos y publica en Cloudflare
(https://kai.e3develops.com). La versión es la fecha y hora de la compilación; al abrirse, la app compara
la suya con `version.json` y, si hay una nueva, limpia la caché y se recarga sola.

La dirección antigua (GitHub Pages) solo sirve la página "KAI se ha mudado" (`mudanza/`), que se queda
guardada en los móviles que tenían la app vieja.
