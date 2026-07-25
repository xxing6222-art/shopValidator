# Calm Audit Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the muddy brown paper-ledger palette with the approved calm audit palette without changing layout, typography, geometry, content, or behavior.

**Architecture:** Keep the existing two-layer CSS structure intact. Change only the final paper-ledger semantic color tokens and the color declarations for text that sits directly on dark ledger surfaces. Add a standalone palette contract test that makes the exact token values and dark-surface mappings executable.

**Tech Stack:** CSS custom properties, Python 3 contract test, existing Playwright E2E, Cloudflare Wrangler.

## Global Constraints

- Only color values may change in product CSS.
- Do not change layout, spacing, dimensions, responsive breakpoints, typography, borders, clip paths, rotations, shadows, textures, markup, routes, controls, or business logic.
- Use `#3B403C` for `--ledger-bg` and `#262B28` for `--ledger-deep`.
- Use `#F1EEE4` for warm paper, `#D6E1E2` for evidence paper, `#A33A2C` for risk, and `#315B4A` for verified states.
- Dark-surface text must use paper tokens; dark ink must not sit directly on ledger surfaces.
- The old active browns `#5c3d2e` and `#422b21` must disappear from `styles.css`.

---

### Task 1: Lock And Apply The Semantic Palette

**Files:**
- Create: `test_palette_contract.py`
- Modify: `styles.css`

**Interfaces:**
- Consumes: the final paper-ledger `:root` custom properties in `styles.css`.
- Produces: an exact semantic color-token contract and readable text mappings for dark ledger surfaces.

- [x] **Step 1: Write the failing palette contract**

Create `test_palette_contract.py`:

```python
#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
CSS = (ROOT / "styles.css").read_text(encoding="utf-8")

EXPECTED = {
    "--ink": "#171A18",
    "--paper": "#F1EEE4",
    "--paper-warm": "#F1EEE4",
    "--paper-soft": "#FBFAF6",
    "--paper-note": "#DADBD5",
    "--paper-blue": "#D6E1E2",
    "--white": "#FDFCF8",
    "--container": "#E3E0D7",
    "--container-high": "#D6E1E2",
    "--thermal-gray": "#8A8F89",
    "--error": "#A33A2C",
    "--line": "#171A18",
    "--green-dark": "#315B4A",
    "--ledger-bg": "#3B403C",
    "--ledger-deep": "#262B28",
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

required_mappings = (
    ".topbar",
    ".hero-shortline",
    ".landing-section-heading h2",
    ".judge-heading h2",
)
for selector in required_mappings:
    blocks = re.findall(re.escape(selector) + r"\s*\{(.*?)\}", CSS, re.S)
    assert blocks, f"missing selector {selector}"
    assert any(
        "color: var(--paper-soft)" in block
        or "color: var(--paper-note)" in block
        for block in blocks
    ), f"{selector} is not mapped to readable dark-surface text"

print("palette contract: calm audit tokens and dark-surface mappings passed")
```

- [x] **Step 2: Run the contract and observe the current palette failure**

Run:

```powershell
python test_palette_contract.py
```

Expected: FAIL because `--ink` is still `#060504` and the brown ledger tokens are still active.

- [x] **Step 3: Replace only semantic colors**

In the final paper-ledger `:root` block in `styles.css`, set:

```css
--ink: #171A18;
--paper: #F1EEE4;
--paper-warm: #F1EEE4;
--paper-soft: #FBFAF6;
--paper-note: #DADBD5;
--paper-blue: #D6E1E2;
--white: #FDFCF8;
--container: #E3E0D7;
--container-high: #D6E1E2;
--thermal-gray: #8A8F89;
--muted: rgba(23, 26, 24, .64);
--faint: rgba(23, 26, 24, .45);
--error: #A33A2C;
--line: #171A18;
--line-soft: rgba(23, 26, 24, .27);
--paper-dim: rgba(241, 238, 228, .76);
--paper-faint: rgba(251, 250, 246, .56);
--paper-line: rgba(251, 250, 246, .28);
--green-dark: #315B4A;
--ledger-bg: #3B403C;
--ledger-deep: #262B28;
--ledger-shadow: rgba(10, 14, 12, .30);
```

Map only elements that sit directly on dark surfaces:

```css
.topbar { color: var(--paper-soft); }
.hero-shortline { color: var(--paper-soft) !important; }
.landing-section-heading h2 { color: var(--paper-soft); }
.judge-heading h2 { color: var(--paper-soft); }
.topbar .brand-logo {
  border-color: var(--paper-soft);
}
```

Replace hard-coded old light and dark RGBA color channels with the equivalent
new paper and ink channels only where they express semantic text, border, or
surface colors. Preserve every alpha value and every non-color property.

- [x] **Step 4: Run the palette contract**

Run:

```powershell
python test_palette_contract.py
```

Expected: `palette contract: calm audit tokens and dark-surface mappings passed`

- [x] **Step 5: Verify the diff contains color-only CSS changes**

Run:

```powershell
git diff --word-diff=porcelain -- styles.css
git diff --check
```

Expected: `styles.css` changes contain only color tokens or color declarations; no geometry, typography, structure, or behavior changes.

- [x] **Step 6: Commit the palette implementation**

```powershell
git add styles.css test_palette_contract.py
git commit -m "style: apply calm audit color palette"
```

### Task 2: Verify Product Integrity And Publish

**Files:**
- Modify only if a failed test exposes a palette-specific defect: `styles.css`
- Verify: `test_palette_contract.py`
- Verify: `test_location_e2e.py`
- Verify: `test_release_contract.py`

**Interfaces:**
- Consumes: the implemented palette and unchanged application behavior.
- Produces: a verified local preview and an updated `thermal-brutalism-reskin` branch.

- [x] **Step 1: Run focused and full automated checks**

Run:

```powershell
python test_palette_contract.py
node --check app.js
node --check worker.mjs
node --check ranking.js
node test_worker_exports.mjs
node test_worker.mjs
node test_site_report.mjs
.\.wrangler\e2e-venv\Scripts\python.exe test_location_e2e.py
```

Expected: all commands pass.

- [x] **Step 2: Stop Wrangler briefly and verify the release artifact**

Run `python test_release_contract.py` only after stopping the local Wrangler
process that locks `dist` on Windows.

Expected: `release contract: JPEG icon present and obsolete chat bundle excluded`

- [x] **Step 3: Restart the real Worker preview**

Run:

```powershell
npx.cmd wrangler dev --port 8787
```

Expected: Wrangler starts without runtime export errors and
`http://127.0.0.1:8787/` returns HTTP 200.

- [x] **Step 4: Inspect the five key states**

Check desktop and mobile home, interview, review, result, and ranking states.
Reject the implementation if any dark ink remains directly on the charcoal
canvas, if risk/positive colors are used decoratively, or if any geometry
changes.

- [x] **Step 5: Run final repository checks**

```powershell
git diff --check
git status --short --branch
```

Expected: no uncommitted palette changes; pre-existing unrelated untracked
design-reference folders remain untouched.

- [x] **Step 6: Push and verify the remote branch**

```powershell
git push user-fork HEAD:thermal-brutalism-reskin
git ls-remote user-fork refs/heads/thermal-brutalism-reskin
git rev-parse HEAD
```

Expected: local and remote SHAs match.
