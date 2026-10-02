"""Generate the placeholder icon set of each flavor.

Run from apps/reference:  python3 scripts/generate-icons.py
Requires Pillow. Output goes to assets/brand/<flavor>/, relative to the
current directory. Replace the generated files with real artwork when a
brand adopts the app; the file names are what app.config.ts reads.
"""

from pathlib import Path

from PIL import Image, ImageDraw

# Background colour per flavor. Keep in sync with the brand tokens.
FLAVORS = {
    "public": (15, 118, 110),
    "corporate": (55, 48, 163),
}
WHITE = (255, 255, 255, 255)


def draw_check(draw: ImageDraw.ImageDraw, size: int, scale: float, colour) -> None:
    """Draw a check mark centred in a square of `size`, covering `scale` of it."""
    span = size * scale
    left = (size - span) / 2
    top = (size - span) / 2
    points = [
        (left + span * 0.10, top + span * 0.55),
        (left + span * 0.40, top + span * 0.82),
        (left + span * 0.90, top + span * 0.22),
    ]
    width = max(4, int(span * 0.14))
    draw.line(points, fill=colour, width=width, joint="curve")
    radius = width / 2
    for x, y in (points[0], points[-1]):
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=colour)


def glyph(size: int, scale: float, background, colour=WHITE) -> Image.Image:
    image = Image.new("RGBA", (size, size), background)
    draw_check(ImageDraw.Draw(image), size, scale, colour)
    return image


def main() -> None:
    for flavor, rgb in FLAVORS.items():
        out = Path("assets/brand") / flavor
        out.mkdir(parents=True, exist_ok=True)
        transparent = (0, 0, 0, 0)
        # iOS and store icon: opaque, no alpha channel.
        glyph(1024, 0.52, (*rgb, 255)).convert("RGB").save(out / "icon.png")
        # Android adaptive icon: the glyph stays inside the central safe zone.
        glyph(1024, 0.36, transparent).save(out / "adaptive-foreground.png")
        glyph(1024, 0.36, transparent).save(out / "adaptive-monochrome.png")
        glyph(512, 0.70, transparent).save(out / "splash-icon.png")


if __name__ == "__main__":
    main()
