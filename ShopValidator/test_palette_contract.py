#!/usr/bin/env python3
"""Color-system contract for the Warm Newsprint visual palette."""

from pathlib import Path
import re


ROOT = Path(__file__).resolve().parent
CSS = (ROOT / "styles.css").read_text(encoding="utf-8")

EXPECTED = {
    "--ink": "#18130E",
    "--paper": "#E5D8BE",
    "--paper-warm": "#DDCBA8",
    "--paper-soft": "#F3EBDD",
    "--paper-note": "#D2BC91",
    "--paper-blue": "#C6BFB1",
    "--white": "#F8F1E3",
    "--container": "#D8C9AC",
    "--container-high": "#CDBB96",
    "--thermal-gray": "#877E6F",
    "--muted": "rgba(24, 19, 14, .74)",
    "--faint": "rgba(24, 19, 14, .70)",
    "--error": "#8F3828",
    "--line": "#18130E",
    "--green-dark": "#3E4A35",
    "--paper-dim": "rgba(229, 216, 190, .78)",
    "--paper-faint": "rgba(243, 235, 221, .68)",
    "--ledger-bg": "#C4B38F",
    "--ledger-deep": "#2B241C",
}

roots = re.findall(r":root\s*\{(.*?)\}", CSS, re.S)
assert roots, "styles.css has no :root block"
active_root = roots[-1]
tokens = dict(re.findall(r"(--[\w-]+)\s*:\s*([^;]+);", active_root))

for name, expected in EXPECTED.items():
    actual = tokens.get(name, "").strip().upper()
    assert actual == expected.upper(), f"{name}: expected {expected}, got {actual}"

lower_css = CSS.lower()
assert "#5c3d2e" not in lower_css
assert "#422b21" not in lower_css
assert not re.search(r"rgba\(\s*6\s*,\s*5\s*,\s*4\s*,", lower_css)
assert not re.search(r"rgba\(\s*245\s*,\s*245\s*,\s*240\s*,", lower_css)


def final_property(selector: str, property_name: str) -> str:
    blocks = []
    for header, block in re.findall(r"([^{}]+)\{([^{}]*)\}", CSS, re.S):
        selectors = tuple(part.strip() for part in header.split(","))
        if selector in selectors:
            blocks.append(block)
    assert blocks, f"missing selector {selector}"
    values = []
    for block in blocks:
        values.extend(
            re.findall(
                rf"(?:^|;)\s*{re.escape(property_name)}\s*:\s*([^;]+)",
                block,
                re.S,
            )
        )
    assert values, f"{selector} has no {property_name} declaration"
    return re.sub(r"\s*!important\s*$", "", values[-1].strip())


final_color_rules = {
    ".section-conclusion": "var(--ink)",
    ".yongge-section .section-kicker": "var(--ink)",
    ".yongge-section .landing-section-heading h2": "var(--paper-soft)",
    ".barcode": "var(--paper-soft)",
    ".barcode-wrap span": "var(--paper-faint)",
}
for selector, expected_color in final_color_rules.items():
    actual_color = final_property(selector, "color")
    assert actual_color == expected_color, (
        f"{selector}: expected final color {expected_color}, got {actual_color}"
    )

required_mappings = (
    ".topbar",
    ".hero-shortline",
    ".landing-section-heading h2",
    ".judge-heading h2",
)
for selector in required_mappings:
    actual_color = final_property(selector, "color")
    assert actual_color == "var(--ink)", f"{selector}: final color {actual_color}"

dark_surface_rules = {
    ".landing-conclusion": "var(--ledger-deep)",
    ".yongge-section": "var(--ledger-deep)",
    "footer": "var(--ledger-deep)",
    ".preopen-ranking-hero": "var(--ledger-deep)",
}
for selector, expected_background in dark_surface_rules.items():
    actual_background = final_property(selector, "background")
    assert actual_background == expected_background, (
        f"{selector}: expected {expected_background}, got {actual_background}"
    )

preopen_surface_rules = {
    ".preopen-recommendation": "var(--paper-warm)",
    ".preopen-ranking-explanation": "var(--paper-note)",
    ".preopen-ranking-list": "var(--paper-warm)",
    ".preopen-rank-card": "var(--paper-soft)",
    ".preopen-rank-validate": "var(--paper-blue)",
}
for selector, expected_background in preopen_surface_rules.items():
    actual_background = final_property(selector, "background")
    assert actual_background == expected_background, (
        f"{selector}: expected {expected_background}, got {actual_background}"
    )

preopen_text_rules = {
    ".preopen-ranking-explanation > p": "var(--muted)",
    ".preopen-rank-order p": "var(--muted)",
    ".preopen-rank-reasons dd": "var(--muted)",
    ".preopen-rank-validate p": "var(--muted)",
}
for selector, expected_color in preopen_text_rules.items():
    actual_color = final_property(selector, "color")
    assert actual_color == expected_color, (
        f"{selector}: expected {expected_color}, got {actual_color}"
    )


def parse_hex(value: str) -> tuple[float, float, float]:
    return tuple(int(value[index:index + 2], 16) / 255 for index in (1, 3, 5))


def parse_rgba(value: str) -> tuple[tuple[float, float, float], float]:
    match = re.fullmatch(
        r"rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)",
        value,
        re.I,
    )
    assert match, f"invalid rgba token: {value}"
    channels = tuple(int(match.group(index)) / 255 for index in (1, 2, 3))
    return channels, float(match.group(4))


def composite(
    foreground: tuple[float, float, float],
    background: tuple[float, float, float],
    alpha: float,
) -> tuple[float, float, float]:
    return tuple(
        foreground[index] * alpha + background[index] * (1 - alpha)
        for index in range(3)
    )


def luminance(color: tuple[float, float, float]) -> float:
    linear = tuple(
        channel / 12.92
        if channel <= 0.04045
        else ((channel + 0.055) / 1.055) ** 2.4
        for channel in color
    )
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def contrast(
    foreground: tuple[float, float, float],
    background: tuple[float, float, float],
) -> float:
    lighter, darker = sorted(
        (luminance(foreground), luminance(background)),
        reverse=True,
    )
    return (lighter + 0.05) / (darker + 0.05)


ink = parse_hex(tokens["--ink"])
ledger = parse_hex(tokens["--ledger-bg"])
ledger_deep = parse_hex(tokens["--ledger-deep"])
faint_rgb, faint_alpha = parse_rgba(tokens["--faint"])
muted_rgb, muted_alpha = parse_rgba(tokens["--muted"])
paper_faint_rgb, paper_faint_alpha = parse_rgba(tokens["--paper-faint"])

for surface_name in ("--paper-note", "--paper-blue", "--container"):
    surface = parse_hex(tokens[surface_name])
    ratio = contrast(composite(faint_rgb, surface, faint_alpha), surface)
    assert ratio >= 4.5, f"--faint on {surface_name}: {ratio:.2f}:1"

paper_faint_ratio = contrast(
    composite(paper_faint_rgb, ledger_deep, paper_faint_alpha),
    ledger_deep,
)
assert paper_faint_ratio >= 4.5, (
    f"--paper-faint on --ledger-deep: {paper_faint_ratio:.2f}:1"
)

canvas_ratio = contrast(ink, ledger)
assert canvas_ratio >= 4.5, f"--ink on --ledger-bg: {canvas_ratio:.2f}:1"

for token_name, color, alpha in (
    ("--muted", muted_rgb, muted_alpha),
    ("--faint", faint_rgb, faint_alpha),
):
    ratio = contrast(composite(color, ledger, alpha), ledger)
    assert ratio >= 4.5, f"{token_name} on --ledger-bg: {ratio:.2f}:1"

green = parse_hex(tokens["--green-dark"])
for surface_name in ("--ledger-bg", "--paper-note"):
    surface = parse_hex(tokens[surface_name])
    ratio = contrast(green, surface)
    assert ratio >= 4.5, f"--green-dark on {surface_name}: {ratio:.2f}:1"

print("palette contract: warm newsprint tokens and surface mappings passed")
