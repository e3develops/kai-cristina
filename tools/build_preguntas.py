"""Une los bancos de preguntas de fuentes/preguntas/*.json en data/preguntas.json y los valida."""
import glob, json, os, sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMAS = [
    {"id": "cap28", "nombre": "Prevención y control de las infecciones", "corto": "Cap. 28", "emoji": "🧤",
     "fuente": "Libro · Capítulo 28 (págs. 486-499)"},
    {"id": "taller2", "nombre": "Higiene y confort del paciente", "corto": "Taller 2", "emoji": "🛁",
     "fuente": "Taller 2 · Capítulo 39 del libro"},
]
FIELDS = ["id", "tema", "seccion", "concepto", "pregunta", "opciones", "correcta", "fuente", "pagina"]

# Correcciones de la revisión de contenido (opcional)
corr_path = os.path.join(ROOT, "fuentes", "preguntas", "_correcciones.json")
corr = {"eliminar": [], "modificar": {}}
if os.path.exists(corr_path):
    with open(corr_path, encoding="utf-8") as f:
        corr.update(json.load(f))
eliminar = set(corr.get("eliminar", []))
modificar = corr.get("modificar", {})

preguntas, errores = [], []
for path in sorted(glob.glob(os.path.join(ROOT, "fuentes", "preguntas", "*.json"))):
    if os.path.basename(path).startswith("_"):
        continue
    with open(path, encoding="utf-8") as f:
        items = json.load(f)
    for q in items:
        if q.get("id") in eliminar:
            continue
        if q.get("id") in modificar:
            q = {**q, **modificar[q["id"]]}
        falta = [k for k in FIELDS if k not in q]
        if falta:
            errores.append(f"{os.path.basename(path)} {q.get('id')}: faltan {falta}")
            continue
        if len(q["opciones"]) != 4 or q["correcta"] not in range(4) or len(set(q["opciones"])) != 4:
            errores.append(f"{q['id']}: opciones/correcta inválidas")
            continue
        preguntas.append({k: q[k] for k in FIELDS})
    print(f"{os.path.basename(path)}: {len(items)}")

ids = Counter(q["id"] for q in preguntas)
errores += [f"id duplicado: {i}" for i, n in ids.items() if n > 1]
temas_ok = {t["id"] for t in TEMAS}
errores += [f"{q['id']}: tema desconocido {q['tema']}" for q in preguntas if q["tema"] not in temas_ok]

if errores:
    print("\n".join(errores)); sys.exit(1)

orden = {t["id"]: i for i, t in enumerate(TEMAS)}
preguntas.sort(key=lambda q: (orden[q["tema"]], q["pagina"], q["id"]))
out = {"version": 1, "temas": TEMAS, "preguntas": preguntas}
with open(os.path.join(ROOT, "data", "preguntas.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

print(f"\nTotal: {len(preguntas)} preguntas, {len({q['concepto'] for q in preguntas})} conceptos")
for t in TEMAS:
    qs = [q for q in preguntas if q["tema"] == t["id"]]
    print(f"  {t['id']}: {len(qs)} preguntas, {len({q['seccion'] for q in qs})} apartados")
print("Reparto de 'correcta':", dict(sorted(Counter(q["correcta"] for q in preguntas).items())))
