"""Índice de documentos subidos (data/documentos.json) y miniaturas de sus páginas (paginas/mini/)."""
import json, os, re
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAG = os.path.join(ROOT, "paginas")
MINI = os.path.join(PAG, "mini")
os.makedirs(MINI, exist_ok=True)

# Documentos por tema (título y origen); las páginas se leen de paginas/<tema>-<pagina>.jpg
DOCS = {
    "cap28": {"titulo": "Libro · Capítulo 28", "origen": "Fotos y escaneos del libro (Unidad 5)"},
    "taller2": {"titulo": "Taller 2 · Higiene y confort del paciente", "origen": "PDF del taller (Capítulo 39 del libro)"},
}

paginas = {}
for f in sorted(os.listdir(PAG)):
    m = re.match(r"^(\w+)-(\d+)\.jpg$", f)
    if not m:
        continue
    tema, pag = m.group(1), int(m.group(2))
    paginas.setdefault(tema, []).append(pag)
    mini = os.path.join(MINI, f)
    if not os.path.exists(mini):
        im = Image.open(os.path.join(PAG, f)).convert("RGB")
        im.thumbnail((220, 320))
        im.save(mini, quality=72, optimize=True)

out = []
for tema, pags in paginas.items():
    pags.sort()
    faltan = [p for p in range(pags[0], pags[-1] + 1) if p not in pags]
    out.append({"tema": tema, **DOCS.get(tema, {"titulo": tema, "origen": ""}),
                "paginas": pags, "faltan": faltan})
with open(os.path.join(ROOT, "data", "documentos.json"), "w", encoding="utf-8") as fh:
    json.dump(out, fh, ensure_ascii=False, indent=1)
for d in out:
    print(d["tema"], len(d["paginas"]), "páginas", "faltan:", d["faltan"])
