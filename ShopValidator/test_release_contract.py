#!/usr/bin/env python3
"""Release-artifact contract checks for the public build and deploy script."""

from __future__ import annotations

import mimetypes
from pathlib import Path

import build_site


ROOT = Path(__file__).resolve().parent


def main() -> None:
    build_site.main()
    failures: list[str] = []

    source_icon = ROOT / "icon.jpeg"
    built_icon = ROOT / "dist" / "icon.jpeg"
    if not built_icon.exists():
        failures.append("dist/icon.jpeg is missing")
    else:
        source_bytes = source_icon.read_bytes()
        built_bytes = built_icon.read_bytes()
        if built_bytes != source_bytes:
            failures.append("dist/icon.jpeg does not match the source bytes")
        if not built_bytes.startswith(b"\xff\xd8\xff"):
            failures.append("dist/icon.jpeg does not have a JPEG signature")
        if mimetypes.guess_type(built_icon.name)[0] != "image/jpeg":
            failures.append("dist/icon.jpeg is not served as image/jpeg by extension")

    if (ROOT / "dist" / "interview-chat.js").exists():
        failures.append("obsolete Yongge chat script leaked into dist")

    if failures:
        raise AssertionError("\n".join(failures))
    print("release contract: JPEG icon present and obsolete chat bundle excluded")


if __name__ == "__main__":
    main()
