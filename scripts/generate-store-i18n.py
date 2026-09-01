#!/usr/bin/env python3
"""Generate Edge Add-ons / Firefox AMO listing assets (all locales)."""

from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ICON_PATH = ROOT / "icons" / "icon128.png"

LOCALES = ["zh_CN", "zh_TW", "en", "ja", "ko"]
SHOT_W, SHOT_H = 1280, 800
SHOT_CAPTION_H = 52
SHOT_PAD = 28

SCREENSHOT_SPECS = [
    {"id": "01-popup", "caption_key": "caption_popup", "builder": "popup"},
    {"id": "02-options", "caption_key": "caption_options", "builder": "options"},
    {"id": "03-updates", "caption_key": "caption_updates", "builder": "updates"},
]

BG = "#10151c"
BG_ELEV = "#18212c"
BG_HOVER = "#223042"
LINE = "#2b3a4d"
TEXT = "#e8eef6"
MUTED = "#8ea0b5"
ACCENT = "#4c9dff"
ACCENT_STRONG = "#2f7eeb"
OK = "#3dd68c"
WARN = "#f5c15d"


def store_paths(store: str) -> tuple[Path, Path, str]:
    if store == "edge":
        return ROOT / "store" / "edge", ROOT / "scripts" / "store-edge-copy.json", "Edge Add-ons"
    if store == "firefox":
        return ROOT / "store" / "firefox", ROOT / "scripts" / "store-firefox-copy.json", "Firefox Add-ons"
    raise SystemExit(f"unknown store: {store} (use edge or firefox)")


def load_copy(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def font_paths(locale: str, bold: bool = False) -> list[Path]:
    win = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"
    mac = Path("/System/Library/Fonts")
    mac_sup = mac / "Supplemental"
    paths: list[Path] = []
    if locale in ("zh_CN", "zh_TW"):
        paths += [
            mac / "Hiragino Sans GB.ttc",
            mac / "STHeiti Medium.ttc",
            mac / "PingFang.ttc",
            win / "msyhbd.ttc" if bold else win / "msyh.ttc",
            win / "msyh.ttc",
        ]
    if locale == "ja":
        paths += [
            mac / "ヒラギノ角ゴシック W6.ttc",
            mac / "ヒラギノ角ゴシック W3.ttc",
            mac / "Hiragino Sans GB.ttc",
            win / "msgothic.ttc",
            win / "YuGothB.ttc" if bold else win / "YuGothM.ttc",
        ]
    if locale == "ko":
        paths += [
            mac / "AppleSDGothicNeo.ttc",
            win / "malgunbd.ttf" if bold else win / "malgun.ttf",
            win / "malgun.ttf",
        ]
    if bold:
        paths += [win / "segoeuib.ttf", win / "arialbd.ttf"]
    paths += [
        mac_sup / "Arial Unicode.ttf",
        mac / "Helvetica.ttc",
        win / "segoeui.ttf",
        win / "arial.ttf",
    ]
    return paths


def load_font(locale: str, size: int, bold: bool = False):
    for path in font_paths(locale, bold):
        if not path.exists():
            continue
        for index in range(8):
            try:
                return ImageFont.truetype(str(path), size=size, index=index)
            except OSError:
                continue
    return ImageFont.load_default()


def text_width(draw: ImageDraw.ImageDraw, text: str, font) -> int:
    box = draw.textbbox((0, 0), text, font=font)
    return box[2] - box[0]


def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def draw_dark_gradient(size: tuple[int, int]) -> Image.Image:
    w, h = size
    top, bot = hex_rgb("#0b1220"), hex_rgb("#152238")
    img = Image.new("RGB", size, bot)
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        color = tuple(int(a + (b - a) * t) for a, b in zip(top, bot))
        draw.line([(0, y), (w, y)], fill=color)
    return img


def draw_ui_canvas(size: tuple[int, int]) -> Image.Image:
    img = Image.new("RGB", size, BG)
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, size[0], 3), fill=ACCENT)
    return img


def paste_icon(base: Image.Image, xy: tuple[int, int], size: int) -> None:
    icon = Image.open(ICON_PATH).convert("RGBA")
    icon = icon.resize((size, size), Image.Resampling.LANCZOS)
    base.paste(icon, xy, icon)


def wrap_text(text: str, font, max_width: int, draw: ImageDraw.ImageDraw) -> list[str]:
    if text_width(draw, text, font) <= max_width:
        return [text]
    parts: list[str] = []
    for chunk in text.replace(" · ", "\n").split("\n"):
        if text_width(draw, chunk, font) <= max_width:
            parts.append(chunk)
            continue
        words = chunk.split(" ")
        if len(words) <= 1:
            parts.append(chunk)
            continue
        line = words[0]
        for word in words[1:]:
            trial = f"{line} {word}"
            if text_width(draw, trial, font) <= max_width:
                line = trial
            else:
                parts.append(line)
                line = word
        parts.append(line)
    return parts


def draw_toggle(draw: ImageDraw.ImageDraw, xy: tuple[int, int], on: bool = True) -> None:
    x, y = xy
    fill = ACCENT if on else LINE
    draw.rounded_rectangle((x, y, x + 42, y + 24), radius=12, fill=fill)
    cx = x + 30 if on else x + 12
    draw.ellipse((cx - 8, y + 4, cx + 8, y + 20), fill="#ffffff")


def draw_pill(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, font, kind: str = "accent") -> None:
    x, y = xy
    w = text_width(draw, text, font) + 16
    fills = {
        "accent": ("#163353", "#b9d7ff"),
        "ok": ("#123b2c", OK),
        "warn": ("#3b3218", WARN),
    }
    bg, fg = fills[kind]
    draw.rounded_rectangle((x, y, x + w, y + 18), radius=9, fill=bg)
    draw.text((x + 8, y + 2), text, font=font, fill=fg)


def build_mock_popup(locale: str, copy: dict) -> Image.Image:
    w, h = 420, 640
    img = draw_ui_canvas((w, h))
    draw = ImageDraw.Draw(img)
    title_font = load_font(locale, 20, bold=True)
    sub_font = load_font(locale, 12)
    small_font = load_font(locale, 11)
    body_font = load_font(locale, 13)

    paste_icon(img, (18, 16), 28)
    draw.text((56, 16), copy["name"], font=title_font, fill=TEXT)
    draw.text((56, 42), copy["ui_page_url"], font=small_font, fill=MUTED)
    settings_w = text_width(draw, copy["ui_settings"], sub_font)
    draw.text((w - 18 - settings_w, 22), copy["ui_settings"], font=sub_font, fill=ACCENT)

    y = 72
    sections = [
        (copy["ui_blocked"], "3", [
            ("doubleclick.net", "/gampad/ads", copy["ui_source_net"], "ok"),
            ("pagead2.googlesyndication.com", "/pagead/js", copy["ui_source_net"], "ok"),
            ("adservice.google.com", "/adsid/google/ui", copy["ui_source_net"], "ok"),
        ]),
        (copy["ui_suspect"], "2", [
            ("ad.example.net", "/banner.js", copy["ui_source_dom"], "warn"),
            ("cdn.tracker.test", "/pixel.gif", copy["ui_source_net"], "warn"),
        ]),
    ]
    for title, count, rows in sections:
        draw.text((18, y), title, font=body_font, fill=TEXT)
        count_w = text_width(draw, count, small_font)
        draw.rounded_rectangle((w - 18 - count_w - 14, y, w - 18, y + 18), radius=9, fill=BG_ELEV)
        draw.text((w - 18 - count_w - 7, y + 2), count, font=small_font, fill=MUTED)
        y += 28
        for domain, path, source, kind in rows:
            draw.rounded_rectangle((18, y, w - 18, y + 70), radius=10, fill=BG_ELEV, outline=LINE)
            if kind == "warn":
                draw.rounded_rectangle((26, y + 28, 38, y + 40), radius=3, outline=ACCENT, width=2)
            draw.text((48 if kind == "warn" else 30, y + 10), domain, font=body_font, fill=TEXT)
            draw.text((48 if kind == "warn" else 30, y + 30), path, font=small_font, fill=MUTED)
            draw_pill(draw, (30, y + 46), source, small_font, kind)
            if kind == "ok":
                draw_pill(draw, (30 + text_width(draw, source, small_font) + 28, y + 46), copy["ui_status_blocked"], small_font, "ok")
            y += 80

    draw.rounded_rectangle((18, y, w - 18, y + 36), radius=8, fill=ACCENT)
    add_font = load_font(locale, 12, bold=True)
    add_w = text_width(draw, copy["ui_add"], add_font)
    draw.text(((w - add_w) // 2, y + 10), copy["ui_add"], font=add_font, fill="#ffffff")
    y += 52

    draw.text((18, y), copy["ui_my_rules"], font=body_font, fill=TEXT)
    draw.rounded_rectangle((w - 40, y, w - 18, y + 18), radius=9, fill=BG_ELEV)
    draw.text((w - 33, y + 2), "1", font=small_font, fill=MUTED)
    y += 28
    draw.rounded_rectangle((18, y, w - 18, y + 58), radius=10, fill=BG_ELEV, outline=LINE)
    draw.text((30, y + 10), "ad.example.net", font=body_font, fill=TEXT)
    draw_pill(draw, (30, y + 32), copy["ui_status_on"], small_font, "ok")
    disable_w = text_width(draw, copy["ui_disable"], small_font)
    draw.text((w - 26 - disable_w, y + 32), copy["ui_disable"], font=small_font, fill=MUTED)
    return img


def build_mock_options(locale: str, copy: dict) -> Image.Image:
    w, h = 920, 620
    img = draw_ui_canvas((w, h))
    draw = ImageDraw.Draw(img)
    title_font = load_font(locale, 28, bold=True)
    sub_font = load_font(locale, 15)
    body_font = load_font(locale, 16, bold=True)
    small_font = load_font(locale, 13)

    draw.text((40, 28), copy["ui_options_title"], font=title_font, fill=TEXT)
    y = 72
    for line in wrap_text(copy["ui_options_lead"], sub_font, w - 80, draw):
        draw.text((40, y), line, font=sub_font, fill=MUTED)
        y += 22

    def card(top: int, height: int, heading: str) -> int:
        draw.rounded_rectangle((40, top, w - 40, top + height), radius=12, fill=BG_ELEV, outline=LINE)
        draw.text((60, top + 18), heading, font=body_font, fill=TEXT)
        return top + 52

    y = card(y + 10, 168, copy["ui_static"])
    for label, desc in (("EasyList", copy["ui_easylist_desc"]), ("EasyList China", copy["ui_china_desc"])):
        draw.text((60, y), label, font=sub_font, fill=TEXT)
        draw.text((60, y + 22), desc, font=small_font, fill=MUTED)
        draw_toggle(draw, (w - 108, y + 8), True)
        y += 52

    y = card(y + 28, 118, copy["ui_cosmetic"])
    draw.text((60, y), copy["ui_hide_ad"], font=sub_font, fill=TEXT)
    draw.text((60, y + 22), copy["ui_hide_desc"], font=small_font, fill=MUTED)
    draw_toggle(draw, (w - 108, y + 8), True)
    return img


def build_mock_updates(locale: str, copy: dict) -> Image.Image:
    w, h = 920, 560
    img = draw_ui_canvas((w, h))
    draw = ImageDraw.Draw(img)
    title_font = load_font(locale, 24, bold=True)
    sub_font = load_font(locale, 15)
    small_font = load_font(locale, 13)

    draw.rounded_rectangle((40, 36, w - 40, 210), radius=12, fill=BG_ELEV, outline=LINE)
    draw.text((60, 56), copy["ui_updates"], font=title_font, fill=TEXT)
    refresh_w = text_width(draw, copy["ui_refresh"], small_font)
    btn = (w - 60 - refresh_w - 28, 54, w - 60, 86)
    draw.rounded_rectangle(btn, radius=8, outline=LINE)
    draw.text((btn[0] + 14, 62), copy["ui_refresh"], font=small_font, fill=TEXT)
    draw.text((60, 108), copy["ui_last_ok"], font=sub_font, fill=MUTED)
    draw.text((60, 138), copy["ui_extra"], font=sub_font, fill=OK)
    draw.text((60, 168), copy["promo_sub2"], font=small_font, fill=MUTED)

    draw.rounded_rectangle((40, 236, w - 40, 520), radius=12, fill=BG_ELEV, outline=LINE)
    draw.text((60, 256), copy["ui_dynamic"], font=title_font, fill=TEXT)
    quota_w = text_width(draw, copy["ui_quota"], small_font)
    draw.rounded_rectangle((w - 60 - quota_w - 16, 258, w - 60, 282), radius=9, fill=BG)
    draw.text((w - 52 - quota_w, 262), copy["ui_quota"], font=small_font, fill=MUTED)

    rows = [
        ("ad.example.net", copy["ui_status_on"]),
        ("cdn.tracker.test", copy["ui_status_on"]),
        ("pagead2.googlesyndication.com", copy["ui_status_blocked"]),
    ]
    y = 310
    for domain, status in rows:
        draw.rounded_rectangle((60, y, w - 60, y + 56), radius=10, fill=BG, outline=LINE)
        draw.text((80, y + 16), domain, font=sub_font, fill=TEXT)
        draw_pill(draw, (w - 180, y + 18), status, small_font, "ok")
        y += 66
    return img


def build_promo_small(locale: str, copy: dict, out: Path) -> None:
    w, h = 440, 280
    img = draw_dark_gradient((w, h))
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, 6, h), fill=ACCENT)
    paste_icon(img, (28, (h - 96) // 2), 96)

    title_font = load_font(locale, 28, bold=True)
    sub_font = load_font(locale, 14)
    x = 140
    draw.text((x, 72), copy["name"], font=title_font, fill="#ffffff")
    y = 116
    for line in wrap_text(copy["promo_sub"], sub_font, w - x - 20, draw):
        draw.text((x, y), line, font=sub_font, fill=ACCENT)
        y += 20
    for line in wrap_text(copy["promo_sub2"], sub_font, w - x - 20, draw):
        draw.text((x, y), line, font=sub_font, fill="#cbd5e1")
        y += 20

    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, format="PNG", optimize=True)


def build_promo_large(locale: str, copy: dict, out: Path) -> None:
    w, h = 1400, 560
    img = draw_dark_gradient((w, h))
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, 8, h), fill=ACCENT)
    paste_icon(img, (56, (h - 160) // 2), 160)

    title_font = load_font(locale, 54, bold=True)
    tag_font = load_font(locale, 26)
    feat_font = load_font(locale, 22)
    x = 250
    draw.text((x, 120), copy["name"], font=title_font, fill="#ffffff")

    y = 200
    for line in wrap_text(copy["promo_large_tagline"], tag_font, w - x - 420, draw):
        draw.text((x, y), line, font=tag_font, fill=ACCENT)
        y += 34
    y += 12
    for key in ("promo_feat1", "promo_feat2", "promo_feat3"):
        draw.text((x, y), f"• {copy[key]}", font=feat_font, fill="#e2e8f0")
        y += 34

    panel = Image.new("RGBA", (360, 420), (24, 33, 44, 160))
    panel_draw = ImageDraw.Draw(panel)
    panel_draw.rounded_rectangle((24, 40, 336, 380), radius=12, outline=ACCENT, width=2)
    for i, hh in enumerate([0.55, 0.95, 0.72]):
        panel_draw.rounded_rectangle(
            (70 + i * 70, 280 - int(hh * 140), 118 + i * 70, 280),
            radius=6,
            fill=OK if i == 1 else ACCENT,
        )
    img.paste(panel, (w - 420, (h - 420) // 2), panel)

    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, format="PNG", optimize=True)


def build_screenshot(locale: str, copy: dict, spec: dict, out: Path) -> None:
    builders = {
        "popup": build_mock_popup,
        "options": build_mock_options,
        "updates": build_mock_updates,
    }
    mock = builders[spec["builder"]](locale, copy)

    canvas = draw_dark_gradient((SHOT_W, SHOT_H))
    inner_w = SHOT_W - SHOT_PAD * 2
    inner_h = SHOT_H - SHOT_CAPTION_H - SHOT_PAD * 2
    fitted = mock.copy()
    fitted.thumbnail((inner_w, inner_h), Image.Resampling.LANCZOS)
    x = (SHOT_W - fitted.width) // 2
    y = SHOT_PAD + (inner_h - fitted.height) // 2
    canvas.paste(fitted, (x, y))

    draw = ImageDraw.Draw(canvas)
    bar_y0 = SHOT_H - SHOT_CAPTION_H
    draw.rectangle((0, bar_y0, SHOT_W, SHOT_H), fill=BG_ELEV)
    draw.rectangle((0, bar_y0, SHOT_W, bar_y0 + 3), fill=ACCENT)

    title_font = load_font(locale, 26, bold=True)
    sub_font = load_font(locale, 17)
    brand_font = load_font(locale, 15)
    caption = copy[spec["caption_key"]]
    draw.text((36, bar_y0 + 10), copy["name"], font=title_font, fill="#ffffff")
    name_w = text_width(draw, copy["name"], title_font)
    draw.text((36 + name_w + 16, bar_y0 + 13), caption, font=sub_font, fill=ACCENT)
    store_label = copy["store_label"]
    label_w = text_width(draw, store_label, brand_font)
    draw.text((SHOT_W - label_w - 28, bar_y0 + 16), store_label, font=brand_font, fill=MUTED)

    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out, format="PNG", optimize=True)


def build_shared_icon(out: Path) -> None:
    icon = Image.open(ICON_PATH).convert("RGBA").resize((300, 300), Image.Resampling.LANCZOS)
    out.parent.mkdir(parents=True, exist_ok=True)
    icon.save(out, format="PNG", optimize=True)


def write_listing(copy: dict, out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(copy["description"].strip() + "\n", encoding="utf-8")


def write_keywords(copy: dict, out: Path, store_title: str) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    words = copy.get("keywords") or []
    lines = [f"# {store_title} search keywords", ", ".join(words), ""]
    lines.extend(words)
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(store: str | None = None) -> None:
    if store is None:
        store = sys.argv[1] if len(sys.argv) > 1 else "edge"
    store_dir, copy_path, store_title = store_paths(store)
    copy = load_copy(copy_path)
    shared_icon = store_dir / "_shared" / "extension-icon-300x300.png"
    build_shared_icon(shared_icon)

    for locale in LOCALES:
        loc_copy = copy[locale]
        loc_dir = store_dir / locale
        loc_dir.mkdir(parents=True, exist_ok=True)

        build_promo_small(locale, loc_copy, loc_dir / "promo-small-440x280.png")
        build_promo_large(locale, loc_copy, loc_dir / "promo-large-1400x560.png")
        write_listing(loc_copy, loc_dir / "listing-description.txt")
        write_keywords(loc_copy, loc_dir / "listing-keywords.txt", store_title)
        shutil.copy2(shared_icon, loc_dir / "extension-icon-300x300.png")

        for spec in SCREENSHOT_SPECS:
            out = loc_dir / "screenshots" / f"{spec['id']}-1280x800.png"
            build_screenshot(locale, loc_copy, spec, out)
            print(f"[{store}/{locale}] {out.relative_to(ROOT)}")

    print("done:", store, ", ".join(LOCALES))


if __name__ == "__main__":
    main()
