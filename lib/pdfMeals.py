import json
import sys

try:
    import fitz
except Exception:
    print("{}")
    raise SystemExit(0)


def is_green(r, g, b):
    return g > 135 and r < 90 and b < 120 and g > r * 1.6


def is_red(r, g, b):
    return r > 170 and g < 100 and b < 100 and r > g * 1.7


def components(mask, width, height):
    seen = bytearray(width * height)
    out = []
    queue = []

    for start, on in enumerate(mask):
        if not on or seen[start]:
            continue

        seen[start] = 1
        queue[:] = [start]
        min_x = width
        min_y = height
        max_x = max_y = count = 0

        for idx in queue:
            x = idx % width
            y = idx // width
            count += 1
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)

            for nxt in (
                idx - 1 if x > 0 else -1,
                idx + 1 if x + 1 < width else -1,
                idx - width if y > 0 else -1,
                idx + width if y + 1 < height else -1,
            ):
                if nxt >= 0 and mask[nxt] and not seen[nxt]:
                    seen[nxt] = 1
                    queue.append(nxt)

        box_w = max_x - min_x + 1
        box_h = max_y - min_y + 1
        if count >= 18 and box_w >= 8 and box_h >= 8:
            out.append(
                {
                    "x": (min_x + max_x) / 2,
                    "y": (min_y + max_y) / 2,
                    "w": box_w,
                    "h": box_h,
                    "area": count,
                }
            )

    return out


def day_headings(page, scale):
    headings = []
    data = page.get_text("dict")
    for block in data.get("blocks", []):
        for line in block.get("lines", []):
            text = "".join(span.get("text", "") for span in line.get("spans", []))
            upper = text.upper()
            if "DAY" not in upper:
                continue
            after = upper.split("DAY", 1)[1].lstrip()
            digits = ""
            for char in after:
                if char.isdigit():
                    digits += char
                elif digits:
                    break
            if not digits:
                continue
            x0, y0, x1, y1 = line["bbox"]
            headings.append(
                {
                    "day": int(digits),
                    "text": text.strip(),
                    "x": x0 * scale,
                    "y": y0 * scale,
                    "bottom": y1 * scale,
                }
            )
    return sorted(headings, key=lambda item: item["y"])


def page_marks(page, scale):
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    width, height = pix.width, pix.height
    samples = pix.samples
    green = bytearray(width * height)
    red = bytearray(width * height)

    for y in range(height):
        row = y * width
        for x in range(int(width * 0.68), width):
            offset = (row + x) * 3
            r, g, b = samples[offset], samples[offset + 1], samples[offset + 2]
            if is_green(r, g, b):
                green[row + x] = 1
            elif is_red(r, g, b):
                red[row + x] = 1

    marks = []
    for color, included in ((green, True), (red, False)):
        for comp in components(color, width, height):
            if comp["area"] > 2500:
                continue
            marks.append({**comp, "included": included})

    return sorted(marks, key=lambda item: item["y"])


def route_from_heading(text):
    if ":" in text:
        return text.split(":", 1)[1].strip()
    upper = text.upper()
    if "DAY" in upper:
        tail = text[upper.index("DAY") + 3 :].strip()
        while tail and (tail[0].isdigit() or tail[0] in ".:- "):
            tail = tail[1:].strip()
        return tail
    return ""


def clean_line(text):
    text = " ".join(text.split())
    if not text:
        return ""
    upper = text.upper()
    if "UUDAM" in upper or "TRAVEL AGENCY" in upper:
        return ""
    if "МАНАЙ АЯЛАЛ" in upper or "АЯЛЛЫН ЗУРГУУДААС" in upper:
        return ""
    if upper.startswith("DAY"):
        return ""
    return text


def extract_day_text(page, headings):
    days = {}
    page_width = page.rect.width
    page_height = page.rect.height
    data = page.get_text("dict")

    for index, heading in enumerate(headings):
        next_y = headings[index + 1]["y"] if index + 1 < len(headings) else page_height
        lines = []

        for block in data.get("blocks", []):
            for line in block.get("lines", []):
                x0, y0, x1, y1 = line["bbox"]
                cy = (y0 + y1) / 2
                if cy <= heading["bottom"] + 2 or cy >= next_y - 2:
                    continue
                if x0 > page_width * 0.78:
                    continue
                text = clean_line("".join(span.get("text", "") for span in line.get("spans", [])))
                if text:
                    lines.append(text)

        days[str(heading["day"])] = {
            "route": route_from_heading(heading["text"]),
            "summary": " ".join(lines).strip(),
        }

    return days


def extract(path):
    doc = fitz.open(path)
    scale = 2
    meals = {}
    days = {}

    for page in doc:
        text_headings = day_headings(page, 1)
        days.update(extract_day_text(page, text_headings))

        headings = day_headings(page, scale)
        if not headings:
            continue

        marks = page_marks(page, scale)
        page_height = page.rect.height * scale

        for index, heading in enumerate(headings):
            next_y = headings[index + 1]["y"] if index + 1 < len(headings) else page_height
            block_marks = [
                mark
                for mark in marks
                if heading["y"] - 8 <= mark["y"] < next_y - 4
            ]

            if len(block_marks) >= 3:
                selected = sorted(block_marks, key=lambda item: item["y"])[:3]
                meals[str(heading["day"])] = {
                    "breakfast": bool(selected[0]["included"]),
                    "lunch": bool(selected[1]["included"]),
                    "dinner": bool(selected[2]["included"]),
                }
            elif len(block_marks) == 0:
                meals[str(heading["day"])] = {
                    "breakfast": False,
                    "lunch": False,
                    "dinner": False,
                }

    return {"meals": meals, "days": days}


if __name__ == "__main__":
    try:
        print(json.dumps(extract(sys.argv[1]), ensure_ascii=True))
    except Exception:
        print("{}")
