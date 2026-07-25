#!/usr/bin/env python3
"""Contract checks for the selected paper-note accents."""

from pathlib import Path
import re
import struct


ROOT = Path(__file__).resolve().parent
CSS = (ROOT / "styles.css").read_text(encoding="utf-8")
HTML = (ROOT / "index.html").read_text(encoding="utf-8")
APP = (ROOT / "app.js").read_text(encoding="utf-8")

ASSETS = {
    "torn-cream-paper.png": b"\x89PNG\r\n\x1a\n",
    "grey-masking-tape.png": b"\x89PNG\r\n\x1a\n",
    "offwhite-paper-texture.webp": b"RIFF",
}

for filename, signature in ASSETS.items():
    path = ROOT / "assets" / "paper" / filename
    assert path.is_file(), f"missing paper asset: {path}"
    assert path.read_bytes().startswith(signature), f"invalid asset signature: {path}"

for filename in ("torn-cream-paper.png", "grey-masking-tape.png"):
    path = ROOT / "assets" / "paper" / filename
    with path.open("rb") as stream:
        stream.read(25)
        color_type = struct.unpack(">B", stream.read(1))[0]
    assert color_type == 6, f"{filename} must be RGBA for transparent edges"

assert 'class="hero-title-note"' in HTML
assert 'class="result-fact-evidence taped-evidence-note"' in HTML
assert 'class="result-fact-evidence taped-evidence-note"' in APP

for asset_url in (
    "/assets/paper/torn-cream-paper.png",
    "/assets/paper/grey-masking-tape.png",
    "/assets/paper/offwhite-paper-texture.webp",
):
    assert asset_url in CSS, f"paper asset is not mapped in CSS: {asset_url}"

angles = [
    abs(float(value))
    for value in re.findall(
        r"(?:hero-title-note|taped-evidence-note)[\s\S]{0,800}?rotate\((-?[\d.]+)deg\)",
        CSS,
    )
]
assert angles, "paper-note rotation rules are missing"
assert max(angles) <= 1.5, f"paper-note rotation exceeds 1.5deg: {max(angles)}"

print("paper-note contract: assets, mappings, and rotation limits passed")
