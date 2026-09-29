"""Generate design-like test images for the DM Studio end-to-end test.

Library set (6): one client's "established look" - vintage outdoor badges, rust / bone / ink palette.
Reference set (3): a brief's references - mountain + bear badge with text, a typography sample, a palette swatch card.
Bulk set (2): extra references for the bulk New cards test.
All images are 1024 px, real PNG/JPEG files the vision and image models can read.
"""
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).parent / "fixtures"
OUT.mkdir(parents=True, exist_ok=True)
FONTS = "/System/Library/Fonts/Supplemental/"

INK = (28, 27, 26)
BONE = (237, 230, 214)
RUST = (181, 71, 42)
PINE = (46, 74, 58)
MUSTARD = (214, 160, 58)
GREY = (128, 128, 128)


def font(name, size):
    try:
        return ImageFont.truetype(FONTS + name, size)
    except OSError:
        return ImageFont.load_default()


def arc_text(img, text, center, radius, fnt, fill, start_deg=-150, end_deg=-30):
    """Draw text along an arc above the centre."""
    d = ImageDraw.Draw(img)
    n = len(text)
    for i, ch in enumerate(text):
        a = math.radians(start_deg + (end_deg - start_deg) * (i + 0.5) / n)
        x = center[0] + radius * math.cos(a)
        y = center[1] + radius * math.sin(a)
        glyph = Image.new("RGBA", (fnt.size * 2, fnt.size * 2), (0, 0, 0, 0))
        ImageDraw.Draw(glyph).text((fnt.size // 2, fnt.size // 4), ch, font=fnt, fill=fill)
        rot = glyph.rotate(-math.degrees(a) - 90, resample=Image.BICUBIC)
        img.paste(rot, (int(x - rot.width / 2), int(y - rot.height / 2)), rot)


def mountains(d, cx, cy, w, h, fill):
    peaks = [(-0.45, 0.2), (-0.15, -0.35), (0.1, 0.05), (0.32, -0.25), (0.5, 0.2)]
    pts = [(cx - w / 2, cy + h / 2)] + [(cx + px * w, cy + py * h) for px, py in peaks] + [(cx + w / 2, cy + h / 2)]
    d.polygon(pts, fill=fill)


def pine(d, x, y, s, fill):
    for k in range(3):
        d.polygon([(x, y - s + k * s * 0.3), (x - s * 0.35, y - s * 0.4 + k * s * 0.3), (x + s * 0.35, y - s * 0.4 + k * s * 0.3)], fill=fill)
    d.rectangle([x - s * 0.05, y - s * 0.1 + s * 0.6, x + s * 0.05, y + s * 0.1 + s * 0.6], fill=fill)


def bear(d, cx, cy, s, fill):
    d.ellipse([cx - s, cy - s * 0.45, cx + s * 0.9, cy + s * 0.45], fill=fill)          # body
    d.ellipse([cx + s * 0.55, cy - s * 0.55, cx + s * 1.25, cy + s * 0.05], fill=fill)  # head
    d.ellipse([cx + s * 0.62, cy - s * 0.7, cx + s * 0.85, cy - s * 0.45], fill=fill)   # ear
    for lx in (-0.75, -0.35, 0.25, 0.6):
        d.rectangle([cx + lx * s, cy + s * 0.2, cx + (lx + 0.22) * s, cy + s * 0.75], fill=fill)


def badge(name, top_text, bottom_text, palette, subject="mountain", seed=0, bg=None, size=1024):
    random.seed(seed)
    ink, base, accent = palette
    img = Image.new("RGBA", (size, size), bg or GREY + (255,))
    d = ImageDraw.Draw(img)
    c = size // 2
    r = int(size * 0.42)
    d.ellipse([c - r, c - r, c + r, c + r], fill=ink)
    d.ellipse([c - r + 18, c - r + 18, c + r - 18, c + r - 18], fill=base)
    d.ellipse([c - r + 34, c - r + 34, c + r - 34, c + r - 34], outline=ink, width=6)
    inner = int(r * 0.62)
    d.ellipse([c - inner, c - inner, c + inner, c + inner], fill=accent)
    mountains(d, c, c + inner * 0.25, inner * 1.6, inner * 0.9, ink)
    if subject == "bear":
        bear(d, c - inner * 0.15, c + inner * 0.35, inner * 0.42, ink)
    for k in range(4):
        pine(d, c - inner * 0.75 + k * inner * 0.18, c + inner * 0.55, inner * 0.28, (46, 74, 58))
    # banner
    bw, bh = int(r * 1.5), int(r * 0.26)
    d.rectangle([c - bw // 2, c + r * 0.55, c + bw // 2, c + r * 0.55 + bh], fill=ink)
    f_banner = font("Impact.ttf", int(bh * 0.75))
    tw = d.textlength(bottom_text, font=f_banner)
    d.text((c - tw / 2, c + r * 0.55 + bh * 0.08), bottom_text, font=f_banner, fill=base)
    arc_text(img, top_text, (c, c), r - 70, font("Impact.ttf", 64), ink)
    # screen-print grain
    for _ in range(2500):
        x, y = random.randint(0, size - 1), random.randint(0, size - 1)
        if (x - c) ** 2 + (y - c) ** 2 < (r - 20) ** 2:
            d.point((x, y), fill=base if random.random() < 0.5 else ink)
    img.convert("RGB").save(OUT / name, quality=92)
    return OUT / name


def typography_sample(name):
    img = Image.new("RGB", (1024, 1024), BONE)
    d = ImageDraw.Draw(img)
    d.text((80, 180), "WILD", font=font("Impact.ttf", 260), fill=INK)
    d.text((80, 470), "& FREE", font=font("Impact.ttf", 200), fill=RUST)
    d.text((84, 720), "EST. 2019  ·  TRAIL CO.", font=font("Rockwell.ttc", 64), fill=INK)
    d.rectangle([80, 820, 944, 836], fill=INK)
    img.save(OUT / name)
    return OUT / name


def palette_card(name):
    img = Image.new("RGB", (1024, 1024), (245, 242, 235))
    d = ImageDraw.Draw(img)
    for i, (col, label) in enumerate([(BONE, "BONE #EDE6D6"), (RUST, "RUST #B5472A"), (INK, "INK #1C1B1A"), (PINE, "PINE #2E4A3A")]):
        y = 80 + i * 225
        d.rectangle([80, y, 944, y + 180], fill=col, outline=INK, width=4)
        d.text((110, y + 60), label, font=font("Arial Black.ttf", 54), fill=INK if col in (BONE,) else BONE)
    img.save(OUT / name)
    return OUT / name


if __name__ == "__main__":
    base = (INK, BONE, RUST)
    alt = (INK, BONE, MUSTARD)
    made = [
        badge("lib-1.jpg", "NORTH RIDGE", "HIKE CLUB", base, seed=1),
        badge("lib-2.jpg", "CAMP ALDER", "EST 1998", alt, seed=2),
        badge("lib-3.jpg", "PINE HOLLOW", "OUTFITTERS", base, subject="bear", seed=3),
        badge("lib-4.jpg", "LOST LAKE", "TRAIL CO", alt, subject="bear", seed=4),
        badge("lib-5.jpg", "SUMMIT SEEKERS", "SINCE 2005", base, seed=5),
        badge("lib-6.jpg", "BLUE MESA", "RANGERS", (INK, BONE, PINE), seed=6),
        badge("ref-1.png", "WILD & FREE", "MOUNTAIN BEAR", base, subject="bear", seed=7),
        typography_sample("ref-2.png"),
        palette_card("ref-3.png"),
        badge("bulk-1.jpg", "RIVER BEND", "PADDLE CO", alt, seed=8),
        badge("bulk-2.jpg", "FOX RUN", "BACKCOUNTRY", base, subject="bear", seed=9),
    ]
    for p in made:
        im = Image.open(p)
        print(p.name, im.size, im.mode, p.stat().st_size, "bytes")
