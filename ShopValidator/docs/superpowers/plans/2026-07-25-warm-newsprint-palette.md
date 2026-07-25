# Warm Newsprint Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cool gray Calm Audit colors with the approved warm old-newspaper palette without changing layout, typography, interaction, or business logic.

**Architecture:** Keep the existing semantic CSS token system and paper-ledger selector structure. Strengthen the palette contract first, then update the final `:root` token block and only the color declarations whose light/dark surface meaning changes.

**Tech Stack:** CSS custom properties, Python palette contract, Cloudflare Wrangler, Playwright browser E2E.

## Global Constraints

- Modify only color values and color mappings.
- Do not change layout, spacing, dimensions, typography, content, assets, routes, interactions, or business logic.
- Do not add a newspaper texture or new visual asset.
- Warm aged newsprint must replace the cool charcoal canvas.
- Light text may appear only on `--ledger-deep`.
- Normal text must meet WCAG AA against its final surface.

---

### Task 1: Lock The Warm Newsprint Contract

**Files:**
- Modify: `test_palette_contract.py`
- Test: `test_palette_contract.py`

**Interfaces:**
- Consumes: the final `:root` block and final effective `color` declarations in `styles.css`.
- Produces: exact token, contrast, and warm-canvas mapping assertions.

- [x] **Step 1: Update expected palette tokens**

Set the contract values to:

```python
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
"--error": "#8F3828",
"--green-dark": "#3E4A35",
"--ledger-bg": "#C4B38F",
"--ledger-deep": "#2B241C",
```

- [x] **Step 2: Replace dark-canvas mappings with surface-specific assertions**

Require dark ink for `.topbar`, `.hero-shortline`,
`.landing-section-heading h2`, `.judge-heading h2`, and
`.section-conclusion`. Continue to require paper-white text for the footer
barcode and other elements that sit on `--ledger-deep`.

- [x] **Step 3: Run the contract and observe failure**

Run:

```powershell
python test_palette_contract.py
```

Expected: FAIL because `styles.css` still contains the Calm Audit tokens and
dark-canvas text mappings.

---

### Task 2: Apply Warm Newsprint Colors

**Files:**
- Modify: `styles.css`
- Test: `test_palette_contract.py`

**Interfaces:**
- Consumes: the exact token values and selector expectations from Task 1.
- Produces: a warm-canvas newspaper palette with preserved geometry.

- [x] **Step 1: Replace final semantic tokens**

Apply the values from Task 1 in the final paper-ledger `:root` block. Use
`rgba(24, 19, 14, .74)` for `--muted`, `rgba(24, 19, 14, .70)` for
`--faint`, and accessible paper-white alpha tokens for dark clipping bands.

- [x] **Step 2: Remap warm-canvas text**

Set `.topbar`, `.hero-shortline`, `.landing-section-heading h2`,
`.judge-heading h2`, landing copy, ranking intro copy, and canvas labels to
dark `--ink` or its muted variants. Keep dark report bands, selected dark
buttons, and footer content on `--ledger-deep` with paper-white text; keep
`.section-conclusion` as dark ink on the warm canvas.

- [x] **Step 3: Remove the blue-gray visual emphasis**

Map existing information surfaces through `--paper-blue: #C6BFB1` and
selected surfaces through `--container-high: #CDBB96`. Do not alter selectors,
dimensions, or component order.

- [x] **Step 4: Run focused checks**

Run:

```powershell
python test_palette_contract.py
git diff --check
node --check app.js
node --check worker.mjs
```

Expected: all commands pass and the CSS diff contains only color changes.

---

### Task 3: Verify, Review, And Publish

**Files:**
- Modify: `docs/superpowers/specs/2026-07-25-warm-newsprint-palette-design.md`
- Modify: `docs/superpowers/plans/2026-07-25-warm-newsprint-palette.md`
- Test: `test_location_e2e.py`
- Test: `test_release_contract.py`

**Interfaces:**
- Consumes: the final warm newspaper CSS and contract.
- Produces: verified local preview and synchronized GitHub branch.

- [x] **Step 1: Run business and browser regression**

Run the existing Node test suite and:

```powershell
.\.wrangler\e2e-venv\Scripts\python.exe test_location_e2e.py
```

Expected: original interview, map, review, report, mobile, demo, ranking, and
number-semantics paths pass.

- [x] **Step 2: Rebuild the release artifact**

Stop Wrangler, then run:

```powershell
python test_release_contract.py
```

Expected: JPEG icon is present and the obsolete chat bundle is excluded.

- [x] **Step 3: Restart and inspect**

Restart:

```powershell
npx.cmd wrangler dev --port 8787
```

Capture the current page in the user's in-app browser and compare it beside the
supplied newspaper reference. Reject cool gray dominance, light text on warm
paper, or any geometry change.

- [x] **Step 4: Commit and push**

Commit the implementation and final documentation, push to
`user-fork/thermal-brutalism-reskin`, fetch it again, and verify local and
remote SHAs match.
