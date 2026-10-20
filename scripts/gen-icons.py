"""Draws the app icons (emerald tile with three Gantt bars) into public/.

Run: python scripts/gen-icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / 'public'
TOP, BOTTOM = (16, 185, 129), (4, 120, 87)  # emerald-500 → emerald-700
WHITE = (255, 255, 255, 255)
SOFT = (255, 255, 255, 150)
SS = 4  # supersampling for smooth edges


def gradient(size: int) -> Image.Image:
    img = Image.new('RGBA', (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        d.line([(0, y), (size, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM)) + (255,))
    return img


def bars(d: ImageDraw.ImageDraw, size: int, inset: float) -> None:
    """Three staggered Gantt bars with a 'today' line, inside the given inset."""
    area = size * (1 - 2 * inset)
    x0 = y0 = size * inset
    h = area * 0.14
    r = h / 2
    rows = [(0.08, 0.62), (0.30, 0.92), (0.52, 0.80)]
    for i, (a, b) in enumerate(rows):
        y = y0 + area * (0.20 + i * 0.24)
        d.rounded_rectangle([x0 + area * a, y, x0 + area * b, y + h], radius=r, fill=WHITE if i != 2 else SOFT)
    lx = x0 + area * 0.70
    d.rounded_rectangle([lx - area * 0.012, y0 + area * 0.10, lx + area * 0.012, y0 + area * 0.92], radius=area * 0.012, fill=(254, 205, 211, 255))


def icon(size: int, maskable: bool) -> Image.Image:
    big = size * SS
    tile = gradient(big)
    d = ImageDraw.Draw(tile)
    if maskable:
        bars(d, big, inset=0.22)  # keep inside the 80% safe zone
        out = tile
    else:
        bars(d, big, inset=0.16)
        mask = Image.new('L', (big, big), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, big - 1, big - 1], radius=big * 0.22, fill=255)
        out = Image.new('RGBA', (big, big), (0, 0, 0, 0))
        out.paste(tile, (0, 0), mask)
    return out.resize((size, size), Image.LANCZOS)


OUT.mkdir(exist_ok=True)
icon(192, False).save(OUT / 'icon-192.png')
icon(512, False).save(OUT / 'icon-512.png')
icon(512, True).save(OUT / 'icon-maskable-512.png')
icon(180, True).convert('RGB').save(OUT / 'apple-touch-icon.png')
icon(48, False).save(OUT / 'favicon.png')
print('icons written to', OUT)
