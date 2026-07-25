# Calm Audit Palette Design

Date: 2026-07-25
Status: implemented and verified

## Goal

Recolor the existing Thermal Brutalism / paper-ledger interface so it feels
calm, credible, and decision-focused rather than muddy or nostalgic. The
product should read as an evidence-based restaurant audit tool: warm enough
for an owner-operator, but restrained enough for financial and operational
judgment.

## Fixed Scope

Only color values may change.

The following must remain unchanged:

- layout, spacing, dimensions, responsive breakpoints, and scroll behavior
- typography, font sizes, font weights, and text content
- borders, clip paths, paper-cut shapes, rotations, shadows, and texture
- component structure, routes, controls, states, and business logic
- supplied image assets and their treatment

## Current Problems

1. The brown ledger surface dominates the viewport and makes the product feel
   like coffee packaging rather than a serious operating decision tool.
2. Black brand and heading text appears directly on the dark brown surface in
   several places, reducing contrast and visual authority.
3. Cream paper, taupe notes, and brown background sit too close in temperature,
   making long reports visually flat.
4. The pale blue card is isolated from the rest of the system instead of acting
   as a repeatable information color.
5. Error red exists, but positive and evidence states do not have explicit,
   restrained semantic colors.

## Selected Direction

### Calm Audit

Use a neutral charcoal work surface, warm receipt paper, cool mist-blue
information paper, restrained cinnabar risk red, and dark mineral green for
verified or positive signals.

This direction is preferred because it:

- supports the product promise: think clearly before spending money
- preserves the physical paper-ledger metaphor
- increases contrast without becoming harsh black-and-white brutalism
- gives reports a clearer evidence hierarchy
- avoids promotional restaurant colors that could imply optimism or certainty

## Palette

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#171A18` | Primary ink on light paper |
| `--paper` | `#F1EEE4` | Main warm receipt paper |
| `--paper-warm` | `#F1EEE4` | Primary cards and reports |
| `--paper-soft` | `#FBFAF6` | Highest-emphasis paper and controls |
| `--paper-note` | `#DADBD5` | Neutral note paper |
| `--paper-blue` | `#D6E1E2` | Evidence and secondary information |
| `--white` | `#FDFCF8` | Clean control and detail surface |
| `--container` | `#E3E0D7` | Nested light container |
| `--container-high` | `#D6E1E2` | Selected information container |
| `--thermal-gray` | `#8A8F89` | Disabled and low-priority data |
| `--muted` | `rgba(23, 26, 24, .68)` | Secondary text on paper |
| `--faint` | `rgba(23, 26, 24, .64)` | Tertiary text on paper |
| `--line` | `#171A18` | Primary structural line |
| `--line-soft` | `rgba(23, 26, 24, .27)` | Secondary line |
| `--error` | `#A33A2C` | Risk, invalid, and stop states |
| `--green-dark` | `#315B4A` | Verified, viable, and positive states |
| `--paper-dim` | `rgba(241, 238, 228, .76)` | Secondary text on dark surfaces |
| `--paper-faint` | `rgba(251, 250, 246, .62)` | Tertiary text on dark surfaces |
| `--paper-line` | `rgba(251, 250, 246, .28)` | Lines on dark surfaces |
| `--ledger-bg` | `#3B403C` | Main charcoal work surface |
| `--ledger-deep` | `#262B28` | Inverted and conclusion bands |
| `--ledger-shadow` | `rgba(10, 14, 12, .30)` | Existing paper depth |

Dark-surface text uses `--paper-soft`, `--paper-note`, `--paper-dim`, and
`--paper-faint`. Black ink must not be placed directly on `--ledger-bg` or
`--ledger-deep`.

## Semantic Rules

- Warm paper is the default reading surface.
- Mist blue marks evidence, comparison, selection, or secondary priority.
- Neutral gray marks supporting information and disabled states.
- Cinnabar appears only for errors, risk, stop, and destructive actions.
- Mineral green appears only for verified, viable, or positive signals.
- Primary actions remain high-contrast ink on paper; hover states invert.
- No gradients, saturated accent blocks, or decorative color are introduced.

## Component Mapping

- Header and dark canvas: charcoal background with paper-white brand text.
- Hero and section copy on the canvas: light neutral text with clear hierarchy.
- Paper cards and reports: warm paper with dark ink.
- Alternate and evidence cards: mist blue with dark ink.
- Conclusion bands and inverted panels: deep charcoal with warm paper text.
- Inputs and buttons: existing shapes retained; only surfaces, text, borders,
  focus, hover, and disabled colors are remapped.
- Map pin and error states: cinnabar.
- Confirmed location and positive evidence: mineral green.

## Accessibility And Acceptance

- Normal text must target WCAG AA contrast against its actual surface.
- Large display text must remain clearly legible in every inverted state.
- No dark ink may remain on the charcoal canvas unless it sits on a light paper
  label or card.
- Desktop and mobile home, interview, review, result, and ranking views must
  retain their current geometry and have no overflow changes.
- Automated business and interaction tests must remain unchanged and pass.
- A color scan must confirm that the old dominant browns `#5c3d2e` and
  `#422b21` are no longer active palette values.
