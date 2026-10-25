#!/usr/bin/env python3
"""Rysuje ikonę aplikacji (szuflada z przegródkami) do src-tauri/icons/."""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src-tauri', 'icons')
ACC, INK, LIGHT = (15, 122, 108), (27, 33, 30), (248, 249, 246)


def draw(n):
    s = 4 * n  # rysujemy większą i zmniejszamy — gładkie krawędzie
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.22, fill=ACC)
    m, w = s * 0.18, max(2, s * 0.055)
    x0, y0, x1, y1 = m, m, s - m, s - m
    d.rounded_rectangle([x0, y0, x1, y1], radius=s * 0.06, outline=LIGHT, width=round(w))
    xm, ym = x0 + (x1 - x0) * 0.45, y0 + (y1 - y0) * 0.55
    d.line([xm, y0, xm, y1], fill=LIGHT, width=round(w))
    d.line([x0, ym, xm, ym], fill=LIGHT, width=round(w))
    d.line([xm, y0 + (y1 - y0) * 0.33, x1, y0 + (y1 - y0) * 0.33], fill=LIGHT, width=round(w))
    return im.resize((n, n), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)
for name, n in (('32x32.png', 32), ('128x128.png', 128), ('128x128@2x.png', 256), ('icon.png', 512)):
    draw(n).save(os.path.join(OUT, name))
draw(256).save(os.path.join(OUT, 'icon.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('ikony w', OUT)
