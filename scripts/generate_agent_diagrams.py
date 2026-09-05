from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs"
FONT_PATH = Path("C:/Windows/Fonts/arial.ttf")
FONT_BOLD_PATH = Path("C:/Windows/Fonts/arialbd.ttf")


def font(size: int, bold: bool = False):
    path = FONT_BOLD_PATH if bold else FONT_PATH
    return ImageFont.truetype(str(path), size) if path.exists() else ImageFont.load_default()


def box(draw, bounds, title, subtitle="", fill="#ffffff", outline="#d4c5a0"):
    draw.rounded_rectangle(bounds, radius=18, fill=fill, outline=outline, width=2)
    x1, y1, x2, y2 = bounds
    draw.text(((x1 + x2) / 2, y1 + 23), title, font=font(22, True), fill="#17382d", anchor="mm")
    if subtitle:
        draw.text(((x1 + x2) / 2, y1 + 53), subtitle, font=font(14), fill="#66756f", anchor="mm")


def arrow(draw, start, end, label=""):
    draw.line([start, end], fill="#9b7a2c", width=4)
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = max((dx * dx + dy * dy) ** 0.5, 1)
    ux, uy = dx / length, dy / length
    base = (end[0] - ux * 14, end[1] - uy * 14)
    perpendicular = (-uy * 7, ux * 7)
    draw.polygon([end, (base[0] + perpendicular[0], base[1] + perpendicular[1]), (base[0] - perpendicular[0], base[1] - perpendicular[1])], fill="#9b7a2c")
    if label:
        draw.text(((start[0] + end[0]) / 2, start[1] - 12), label, font=font(13), fill="#6d5622", anchor="ms")


def interactions():
    image = Image.new("RGB", (1500, 900), "#f5f2ea")
    draw = ImageDraw.Draw(image)
    draw.text((750, 48), "Employee Agent Hub — 7 Agents", font=font(34, True), fill="#17382d", anchor="mm")
    box(draw, (570, 110, 930, 220), "Shift Director", "manager-as-tools", "#e7f0eb")
    boxes = [
        (70, 330, 390, 435, "Reservation Matcher", "UNO / PMS"),
        (420, 330, 740, 435, "Call Compliance", "audio review 1"),
        (770, 330, 1090, 435, "Guest Experience", "audio review 2"),
        (1110, 330, 1430, 435, "Quality Coach", "coaching plan"),
        (245, 590, 565, 695, "Shift Scheduler", "coverage / handoff"),
        (590, 590, 910, 695, "Task & Marketing", "work + consulting"),
    ]
    for x1, y1, x2, y2, title, subtitle in boxes:
        box(draw, (x1, y1, x2, y2), title, subtitle)
        arrow(draw, (750, 220), ((x1 + x2) / 2, y1))
    box(draw, (935, 590, 1255, 695), "Encrypted Workspace", "tasks / shifts / QA / contracts", "#fff9e9")
    arrow(draw, (910, 642), (935, 642), "approved writes")
    box(draw, (485, 770, 1015, 850), "Human approval remains the final control", "no silent booking, contract, or campaign changes", "#dfe9e3", "#17382d")
    image.save(OUT / "agent-interactions.png", optimize=True)


def sequence():
    image = Image.new("RGB", (1500, 850), "#f5f2ea")
    draw = ImageDraw.Draw(image)
    draw.text((750, 48), "Call Review Sequence", font=font(34, True), fill="#17382d", anchor="mm")
    columns = [(160, "Employee"), (500, "Secure API"), (840, "Transcription"), (1180, "2 Review Agents")]
    for x, title in columns:
        box(draw, (x - 125, 100, x + 125, 175), title, "")
        draw.line([(x, 175), (x, 770)], fill="#c8c1b2", width=2)
    arrow(draw, (160, 245), (500, 245), "audio or transcript")
    arrow(draw, (500, 330), (840, 330), "audio only")
    arrow(draw, (840, 415), (1180, 415), "speaker-labeled text")
    arrow(draw, (500, 500), (1180, 500), "supervisor notes")
    arrow(draw, (1180, 600), (500, 600), "compliance + experience")
    arrow(draw, (500, 685), (160, 685), "stored review")
    draw.text((750, 795), "Raw audio is discarded; only analysis and a short transcript preview are stored.", font=font(18, True), fill="#17382d", anchor="mm")
    image.save(OUT / "agent-sequence.png", optimize=True)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    interactions()
    sequence()
