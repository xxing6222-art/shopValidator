# Warm Newsprint Palette Design

Date: 2026-07-25
Status: implemented and verified

## Goal

Replace the cool gray Calm Audit palette with a warmer old-newspaper palette
based on the supplied collage references. The product should feel printed,
collected, and editorial while remaining credible as a store-decision tool.

## Fixed Scope

Only colors and existing color mappings may change. Layout, typography,
spacing, shapes, borders, shadows, supplied assets, interactions, routes, and
business logic remain unchanged. No newspaper texture or new visual asset is
introduced in this pass.

## Visual Direction

- Use warm aged newsprint as the dominant page and canvas color.
- Use near-black brown ink instead of cool charcoal.
- Use dirty white, gray newsprint, and kraft paper for layered information.
- Keep a small number of dark clipping-like bands for emphasis.
- Remove the isolated blue-gray appearance from information cards.
- Reserve faded brick red for risk and dark olive for verified states.

## Palette

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#18130E` | Primary newspaper ink |
| `--paper` | `#E5D8BE` | Main aged newsprint |
| `--paper-warm` | `#DDCBA8` | Warm report and card paper |
| `--paper-soft` | `#F3EBDD` | Clean clipping and control paper |
| `--paper-note` | `#D2BC91` | Kraft note and label paper |
| `--paper-blue` | `#C6BFB1` | Gray newsprint information paper |
| `--white` | `#F8F1E3` | Highest-emphasis paper |
| `--container` | `#D8C9AC` | Nested warm paper container |
| `--container-high` | `#CDBB96` | Selected kraft container |
| `--thermal-gray` | `#877E6F` | Disabled and low-priority information |
| `--error` | `#8F3828` | Faded brick risk red |
| `--green-dark` | `#3E4A35` | Dark olive verified state |
| `--ledger-bg` | `#C4B38F` | Full-page old newspaper canvas |
| `--ledger-deep` | `#2B241C` | Dark clipping and conclusion bands |

Secondary ink on light paper uses alpha values that retain WCAG AA contrast.
Light ink is used only on `--ledger-deep`, never on the warm page canvas.

## Component Mapping

- Header, landing canvas, workspace canvas, and ranking canvas: warm newsprint
  with dark ink.
- Primary reading cards: aged newsprint or dirty white with dark ink.
- Information and alternate cards: gray newsprint or kraft paper with dark
  ink.
- Yongge proof, conclusions, selected report bands, and footer: dark clipping
  paper with dirty-white text.
- Buttons remain black-ink and paper inversions using their existing shapes.
- Map pins and errors use faded brick red; verified states use dark olive.

## Acceptance

- The first viewport no longer reads as a gray or charcoal application.
- Warm paper is visually dominant, with black ink providing hierarchy.
- No light text remains directly on the warm page canvas.
- Normal text meets WCAG AA against its actual surface.
- Existing desktop and mobile geometry and all business behavior remain
  unchanged.
- Browser E2E, release contract, and palette contract pass.
