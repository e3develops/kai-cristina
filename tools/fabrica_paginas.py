"""Fábrica, paso 2: convierte los apuntes descargados en páginas para KAI y saca sus palabras con posición.

Uso: python tools/fabrica_paginas.py <examen_id>

Lee fuentes/<id>/originales/ (lo que bajó `fabrica.mjs descargar`) y escribe:
  contenido/<id>/paginas/<doc>-<n>.jpg   página para el visor (lado largo 2000 px)
  contenido/<id>/paginas/mini/…          miniatura para la pestaña Apuntes
  contenido/<id>/documentos.json         índice de documentos y páginas (lo lee la app)
  fuentes/<id>/paginas/<doc>-<n>.json    palabras con su caja (x, y, w, h en fracción de la página)
  fuentes/<id>/paginas/<doc>-<n>.txt     texto del OCR (orientativo: en fotos se salta palabras)

Después, al leer cada página para sacar preguntas, se escribe su transcripción fiel en
  fuentes/<id>/paginas/<doc>-<n>.transcripcion.txt
que es contra lo que se comprueban las citas (la regla de oro). El OCR solo se usa para subrayar.

Documentos: todas las fotos van juntas como "fotos" (en el orden en que se subieron); cada PDF es uno.
Las palabras salen del propio PDF si tiene texto, o del OCR de Windows (winocr) si es una foto o un escaneo.
"""
import asyncio, io, json, os, re, sys
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LADO, MINI = 2000, 220


def guardar(img, ruta, lado):
    img = img.convert("RGB")
    img.thumbnail((lado, lado))
    img.save(ruta, quality=82, optimize=True)


def ocr(img):
    """Palabras con caja (fracciones) usando el OCR de Windows en español.

    En fotos de libros (página curvada, varias columnas) el OCR junta columnas y se salta palabras,
    así que se lee en tres franjas verticales que se solapan y cada una ampliada a ~4000 px."""
    try:
        import winocr
    except ImportError:
        print("  (sin winocr: no habrá subrayado en esta página)")
        return []
    img = img.convert("RGB")
    W, H = img.size
    out = []
    for f, (a, b) in enumerate([(0, 0.52), (0.40, 0.80), (0.70, 1.0)]):
        trozo = img.crop((int(a * W), 0, int(b * W), H))
        k = min(3.0, 4000 / max(trozo.size))
        big = trozo.resize((int(trozo.width * k), int(trozo.height * k)), Image.LANCZOS) if k > 1.05 else trozo
        k = big.width / trozo.width
        r = asyncio.run(winocr.recognize_pil(big, "es"))
        for n, line in enumerate(r.lines):
            for w in line.words:
                bb = w.bounding_rect
                out.append({"t": w.text, "l": f * 10000 + n,
                            "b": [round((a * W + bb.x / k) / W, 4), round(bb.y / k / H, 4), round(bb.width / k / W, 4), round(bb.height / k / H, 4)]})
    return out


def palabras_pdf(page):
    W, H = page.rect.width, page.rect.height
    # w = (x0, y0, x1, y1, texto, bloque, línea, palabra): bloque y línea identifican la línea
    return [{"t": w[4], "l": w[5] * 1000 + w[6], "b": [round(w[0] / W, 4), round(w[1] / H, 4), round((w[2] - w[0]) / W, 4), round((w[3] - w[1]) / H, 4)]}
            for w in page.get_text("words")]


def main(eid):
    src = os.path.join(ROOT, "fuentes", eid, "originales")
    out = os.path.join(ROOT, "contenido", eid, "paginas")
    pal = os.path.join(ROOT, "fuentes", eid, "paginas")
    for d in (os.path.join(out, "mini"), pal):
        os.makedirs(d, exist_ok=True)
    meta = json.load(open(os.path.join(ROOT, "fuentes", eid, "documentos-subidos.json"), encoding="utf-8"))
    docs = []
    fotos = {"tema": "fotos", "titulo": "Fotos de los apuntes", "origen": "Fotos subidas", "paginas": [], "faltan": []}

    def pagina(doc, n, img, palabras):
        key = f"{doc['tema']}-{n}"
        guardar(img, os.path.join(out, f"{key}.jpg"), LADO)
        guardar(img, os.path.join(out, "mini", f"{key}.jpg"), MINI)
        json.dump(palabras, open(os.path.join(pal, f"{key}.json"), "w", encoding="utf-8"), ensure_ascii=False)
        open(os.path.join(pal, f"{key}.txt"), "w", encoding="utf-8").write(" ".join(w["t"] for w in palabras))
        doc["paginas"].append(n)
        print(f"  {key}: {len(palabras)} palabras")

    npdf = 0
    for d in meta:
        ruta = os.path.join(src, d["archivo"])
        if d["tipo"] == "application/pdf":
            import pymupdf
            npdf += 1
            doc = {"tema": f"pdf{npdf}", "titulo": re.sub(r"\.pdf$", "", d["nombre"], flags=re.I), "origen": "PDF subido", "paginas": [], "faltan": []}
            pdf = pymupdf.open(ruta)
            for i, page in enumerate(pdf, 1):
                pix = page.get_pixmap(dpi=150)
                img = Image.open(io.BytesIO(pix.tobytes("png")))
                words = palabras_pdf(page)
                pagina(doc, i, img, words if len(words) > 20 else ocr(img))  # escaneo sin texto → OCR
            docs.append(doc)
        else:
            img = ImageOps.exif_transpose(Image.open(ruta))
            pagina(fotos, len(fotos["paginas"]) + 1, img, ocr(img))
    if fotos["paginas"]:
        docs.insert(0, fotos)
    json.dump(docs, open(os.path.join(ROOT, "contenido", eid, "documentos.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{sum(len(d['paginas']) for d in docs)} páginas en {len(docs)} documentos")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
