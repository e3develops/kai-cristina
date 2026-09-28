"""Genera los iconos de la app (cara de KAI) con PIL."""
from PIL import Image, ImageDraw

S = 1024
img = Image.new('RGB', (S, S), '#0FA38C')
d = ImageDraw.Draw(img)
# degradado suave de fondo
for y in range(S):
    t = y / S
    r = int(0x2E + (0x0B - 0x2E) * t); g = int(0xC4 + (0x85 - 0xC4) * t); b = int(0xA8 + (0x73 - 0xA8) * t)
    d.line([(0, y), (S, y)], fill=(r, g, b))

def eye(cx, cy, ang):
    w, h = 330, 270
    layer = Image.new('RGBA', (w + 40, h + 40), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.rounded_rectangle([20, 20, w + 20, h + 20], radius=120, fill='#E2E8F0', outline='#64748B', width=16)
    ex, ey = (w + 40) / 2, (h + 40) / 2 + 6
    R = 96
    ld.ellipse([ex - R, ey - R, ex + R, ey + R], fill='#1E2B3A')
    ld.ellipse([ex - R + 18, ey - R + 18, ex + R - 18, ey + R - 18], fill='#2C3E55')
    ld.ellipse([ex + 12, ey - 64, ex + 58, ey - 18], fill='white')
    ld.ellipse([ex - 50, ey + 30, ex - 32, ey + 48], fill='#CBD5E1')
    layer = layer.rotate(ang, resample=Image.BICUBIC, expand=True)
    img.paste(layer, (int(cx - layer.width / 2), int(cy - layer.height / 2)), layer)

# puente entre ojos
d.rounded_rectangle([452, 540, 572, 610], radius=20, fill='#94A3B8', outline='#64748B', width=10)
eye(330, 590, 7)
eye(694, 590, -7)
# cofia
d.polygon([(320, 360), (512, 190), (704, 360), (680, 420), (344, 420)], fill='white', outline='#CBD5E1')
d.rounded_rectangle([490, 250, 534, 370], radius=10, fill='#EF4444')
d.rounded_rectangle([452, 288, 572, 332], radius=10, fill='#EF4444')
# cuerpo asomando
d.rounded_rectangle([260, 850, 764, 1100], radius=70, fill='#F7B84B', outline='#C98421', width=14)
d.rounded_rectangle([482, 760, 542, 860], radius=20, fill='#94A3B8', outline='#64748B', width=10)

for size, name in [(512, 'icon-512.png'), (192, 'icon-192.png'), (180, 'apple-touch-icon.png')]:
    img.resize((size, size), Image.LANCZOS).save(f'icons/{name}')
print('ok')
