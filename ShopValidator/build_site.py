#!/usr/bin/env python3
"""Build the public-only Pages artifact for 店判.

The working directory includes research and analysis code.  This script copies
only assets that are intended to be publicly reachable into dist/.
"""

from __future__ import annotations

import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
PUBLIC_FILES = ("index.html", "ranking.html", "ranking.js", "styles.css", "fact-store.js", "decision-engine.js", "app.js", "icon.jpeg", "loading.mp4")
PUBLIC_DATA = ("corpus_analysis.json",)
PUBLIC_DIRS = ("assets",)


def main() -> None:
    # Wrangler can keep the dist directory open on Windows. Updating the
    # allowlisted public files in place keeps local preview builds reliable.
    (DIST / "data").mkdir(parents=True, exist_ok=True)

    for filename in PUBLIC_FILES:
        shutil.copy2(ROOT / filename, DIST / filename)
    # Cloudflare Static Assets gives `ranking.html` its own canonical redirect.
    # Publish an extensionless copy as the real `/ranking` resource so public
    # links never bounce between the HTML and slash variants.
    shutil.copy2(ROOT / "ranking.html", DIST / "ranking")
    for filename in PUBLIC_DATA:
        shutil.copy2(ROOT / "data" / filename, DIST / "data" / filename)
    for directory in PUBLIC_DIRS:
        shutil.copytree(ROOT / directory, DIST / directory, dirs_exist_ok=True)

    (DIST / "_headers").write_text(
        """/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(self), geolocation=(self)
  Cache-Control: no-cache, max-age=0, must-revalidate
""",
        encoding="utf-8",
    )
    print(f"Built public artifact: {DIST}")


if __name__ == "__main__":
    main()
