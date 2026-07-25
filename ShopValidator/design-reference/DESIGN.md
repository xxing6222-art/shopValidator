---
name: Thermal Brutalism
colors:
  surface: '#fafaf5'
  surface-dim: '#dadad5'
  surface-bright: '#fafaf5'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f4ef'
  surface-container: '#eeeee9'
  surface-container-high: '#e8e8e3'
  surface-container-highest: '#e3e3de'
  on-surface: '#1a1c19'
  on-surface-variant: '#444844'
  inverse-surface: '#2f312e'
  inverse-on-surface: '#f1f1ec'
  outline: '#757873'
  outline-variant: '#c5c7c2'
  surface-tint: '#5c5f5b'
  primary: '#010201'
  on-primary: '#ffffff'
  primary-container: '#1a1d1a'
  on-primary-container: '#838581'
  inverse-primary: '#c5c7c2'
  secondary: '#5d5f5f'
  on-secondary: '#ffffff'
  secondary-container: '#dfe0e0'
  on-secondary-container: '#616363'
  tertiary: '#030101'
  on-tertiary: '#ffffff'
  tertiary-container: '#211b1b'
  on-tertiary-container: '#8c8282'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e1e3de'
  primary-fixed-dim: '#c5c7c2'
  on-primary-fixed: '#191c19'
  on-primary-fixed-variant: '#454744'
  secondary-fixed: '#e2e2e2'
  secondary-fixed-dim: '#c6c6c7'
  on-secondary-fixed: '#1a1c1c'
  on-secondary-fixed-variant: '#454747'
  tertiary-fixed: '#ece0df'
  tertiary-fixed-dim: '#cfc4c3'
  on-tertiary-fixed: '#201a1a'
  on-tertiary-fixed-variant: '#4d4545'
  background: '#fafaf5'
  on-background: '#1a1c19'
  surface-variant: '#e3e3de'
  ink-black: '#1A1D1A'
  paper-white: '#F5F5F0'
  thermal-gray: '#D1D1CB'
typography:
  headline-lg:
    fontFamily: Space Mono
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.04em
  headline-md:
    fontFamily: Space Mono
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  body-lg:
    fontFamily: JetBrains Mono
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.5'
  body-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '700'
    lineHeight: '1'
  mono-data:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.1em
spacing:
  unit: 4px
  gutter: 16px
  margin-mobile: 20px
  margin-desktop: 40px
  container-max-width: 800px
---

## Brand & Style

This design system adopts a **"Thermal Brutalist"** aesthetic, inspired by the utilitarian beauty of physical receipts, packing slips, and logistics documentation. The brand personality is raw, transparent, and intentionally unrefined, favoring functional clarity over decorative excess. It evokes a sense of "proof of transaction" and "immediate data."

The style combines **Minimalism** with **Brutalism**. It utilizes high-contrast monochrome layouts, "low-fidelity" textures (such as crumpled paper overlays), and technical markers like barcodes and timestamps to create a tactile, physical presence in a digital space. The goal is to make the user feel as though they are interacting with a tangible object that has been printed and processed.

## Colors

The palette is strictly limited to a high-contrast, black-and-white scheme to mimic thermal printing.

- **Primary (Ink Black):** Used for all typography, icons, and structural borders. It represents the "burned" ink on a page.
- **Neutral (Paper White):** A slightly warm, off-white hex that serves as the primary canvas, providing a more organic, paper-like feel than pure digital white.
- **Secondary (Pure White):** Reserved for interactive "inverted" states or highlight areas that sit on top of the paper texture.

Avoid gradients or vibrant hues. Any "color" should be treated as a functional highlight, though the default state is entirely achromatic.

## Typography

Typography is the core of this design system. We use **Monospace** fonts exclusively to reinforce the "receipt" aesthetic, ensuring every character occupies the same horizontal space, which aids in creating perfectly aligned columns of data.

- **Headlines:** Use **Space Mono** for a slightly more geometric and "designed" technical look. Use heavy weights and tight tracking for a high-impact, editorial feel.
- **Body & Data:** Use **JetBrains Mono** for maximum legibility. Its clear distinctions between similar characters (O vs 0) emphasize the technical nature of the content.
- **Stylistic Rules:** Use `text-transform: uppercase` for labels and headers to mimic the limited character sets of older thermal printers.

## Layout & Spacing

The layout philosophy follows a **Fixed-Width Column** model. Just as a physical receipt has a defined width regardless of the content length, this design system performs best when constrained to a central "strip" on the screen.

- **The Strip:** On desktop, content should be centered in a narrow container (max 800px) to simulate a paper roll. 
- **Tabular Alignment:** Rely on a strict grid where labels are left-aligned and values are right-aligned on the same line, connected by whitespace or "dot leaders."
- **Dashed Dividers:** Use `border-style: dashed` or repeated hyphen characters `----------------` to separate sections.
- **Breakpoints:** On mobile, margins shrink to 20px, but the "receipt strip" behavior remains the primary layout driver.

## Elevation & Depth

This system rejects traditional box shadows. Depth is communicated through **Tonal Layers** and **Physical Texture** rather than light and shadow.

- **Surface Tiers:** Use thin (1px) solid black borders to define containers.
- **Texture Overlay:** A global "crumpled paper" or "fine grain" noise texture should be applied to the background layer to provide tactile depth.
- **Inversion:** To make an element "pop" or appear active, invert the colors (Black background with White text). This simulates a "selected" or "stamped" area of the paper.
- **Scanning Effects:** Use subtle vertical "banding" or scanlines to simulate the imperfections of low-cost printing.

## Shapes

The shape language is strictly **Sharp (0px)**. Thermal paper is cut, not molded. 

- **Hard Edges:** All buttons, input fields, and cards must have square corners. 
- **Jagged Edges:** For a more expressive "torn" look, use a CSS mask or SVG path to create a zig-zag "tear-off" edge at the top or bottom of the main content container.
- **Barcodes:** Use functional or decorative 1D barcodes as separators or branding elements. They should be generated dynamically or used as static SVG assets.

## Components

- **Buttons:** Large, rectangular blocks. Default state is a 1px or 2px black border with black text. Hover/Active state is a full black fill with white (paper-white) text.
- **Dashed Dividers:** Horizontal rules must be dashed (`border-top: 1px dashed #1A1D1A`). Never use solid lines for internal section breaks.
- **Data Rows:** A custom component consisting of a `Label` (left), a `Value` (right), and optionally a `Dashed Line` connecting them.
- **Inputs:** Simple underlined fields (`border-bottom` only) with monospace placeholder text.
- **Chips/Tags:** Small rectangular boxes with a solid 1px border. No rounded corners.
- **Barcodes:** Every "page" or major section should conclude with a barcode and a timestamp to ground the UI in the receipt metaphor.
- **Status Indicators:** Use text-based symbols like `[ OK ]`, `[ !! ]`, or `[ -- ]` instead of rounded colorful icons.
