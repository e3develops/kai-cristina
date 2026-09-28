"""Marca una versión nueva (fecha y hora) en js/app.js y version.json. Ejecutar antes de cada publicación."""
import datetime, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
v = datetime.datetime.now().strftime("%d/%m %H:%M")
p = os.path.join(ROOT, "js", "app.js")
s = open(p, encoding="utf-8").read()
s, n = re.subn(r"const VERSION = '[^']*';", f"const VERSION = '{v}';", s)
assert n == 1
open(p, "w", encoding="utf-8").write(s)
json.dump({"version": v}, open(os.path.join(ROOT, "version.json"), "w", encoding="utf-8"))
print("Versión:", v)
