"""Genera una imagen por página del libro en paginas/<tema>-<pagina>.jpg (para el visor "Llévame al libro")."""
import os
import pypdf
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "paginas")
os.makedirs(OUT, exist_ok=True)
F = os.path.join(ROOT, "fuentes")

def save(img, name):
    img = img.convert("RGB")
    img.thumbnail((1400, 2000))
    img.save(os.path.join(OUT, name), quality=82, optimize=True)
    print(name, img.size)

# Cap. 28: fotos de móvil (mejor resolución) para 486-489, escaneos a doble página para el resto
fotos = {486: "7.jpg", 487: "1.jpg", 488: "11.jpg", 489: "9.jpg"}
for pag, f in fotos.items():
    save(Image.open(os.path.join(F, "cap28", f)), f"cap28-{pag}.jpg")
dobles = {490: "3.jpg", 492: "8.jpg", 494: "2.jpg", 496: "5.jpg", 498: "10.jpg"}
for izq, f in dobles.items():
    im = Image.open(os.path.join(F, "cap28", f))
    w, h = im.size
    save(im.crop((0, 0, int(w * 0.51), h)), f"cap28-{izq}.jpg")
    save(im.crop((int(w * 0.49), 0, w, h)), f"cap28-{izq + 1}.jpg")

# Taller 2: una página del PDF = una página del libro
libro = [792, 793, 794, 795, 796, 797, 798, 799, 800, 801, 802, 803, 804, 805, 806, 807, 808,
         809, 810, 811, 812, 813, 814, 790, 789]
r = pypdf.PdfReader(os.path.join(os.path.expanduser("~"), "Downloads", "Taller 2 HIGIENE Y CONFORT DEL PACIENTE_1.pdf"))
for i, p in enumerate(r.pages):
    save(p.images[0].image, f"taller2-{libro[i]}.jpg")
