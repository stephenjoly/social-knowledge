---
name: Social Knowledge
description: Existing visual tokens for the dashboard, landing page, and documentation reader.
colors:
  primary: "#26322b"
  ink: "#18181b"
  ink-soft: "#3f3f46"
  green-ink: "#2f5d40"
  green-tint: "#e8f0ea"
  dashboard-canvas: "#fafafa"
  dashboard-surface: "#ffffff"
  dashboard-border: "#e4e4e7"
  dashboard-muted: "#71717a"
  paper: "#f7f4ee"
  paper-raised: "#fffdf9"
  paper-sunken: "#efeae0"
  paper-line: "#e3ddd1"
  marigold: "#f2b33d"
  docs-muted: "#64645e"
  docs-code-bg: "#1b221e"
  docs-code-ink: "#e7ece8"
  docs-dark-bg: "#141a16"
  docs-dark-raised: "#1b221e"
  docs-dark-sunken: "#222b25"
  docs-dark-line: "#344039"
  docs-dark-ink: "#eceae4"
  docs-dark-ink-soft: "#c9c6be"
  docs-dark-muted: "#aaa79e"
  docs-dark-accent: "#a7d3b5"
  docs-dark-active: "#25352b"
  docs-dark-code-bg: "#0e1210"
typography:
  dashboard-body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    lineHeight: 1.6
  dashboard-page-title:
    fontSize: "1.75rem"
    letterSpacing: "-0.8px"
  landing-body:
    fontFamily: '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "18px"
    lineHeight: 1.55
  docs-body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    lineHeight: 1.8
  docs-heading:
    fontSize: "22px"
    fontWeight: 650
    lineHeight: 1.35
    letterSpacing: "-0.02em"
  docs-lede:
    fontSize: "18px"
    lineHeight: 1.6
rounded:
  dashboard-control: "7px"
  dashboard-card: "10px"
  dashboard-dialog: "14px"
  docs-control: "8px"
  docs-search: "9px"
  docs-container: "12px"
  landing-button: "999px"
spacing:
  docs-page-inset: "32px"
  docs-column-gap: "56px"
  docs-paragraph-gap: "20px"
components:
  docs-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.paper-raised}"
    rounded: "{rounded.docs-control}"
    padding: "11px 16px"
  docs-primary-dark:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.primary}"
    rounded: "{rounded.docs-control}"
    padding: "11px 16px"
  docs-search:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.docs-search}"
    height: "42px"
    padding: "0 64px 0 40px"
---

# Design System: Social Knowledge

## Overview

This records the implemented system, not a redesign. Inter, forest primary actions,
dark ink, and the existing book mark connect the surfaces. The dashboard uses cool
neutral working surfaces; landing and documentation use warm paper. The documentation
reader adds a **docs-only dark theme**.

Sources: [dashboard tokens](web/design-tokens.css), [landing stylesheet](designs/landing/landing.css),
[docs stylesheet](docs-site/assets/docs.css), and [docs template](docs-site/template.mjs).
The [docs surface brief](.impeccable/surfaces/docs-site-template-mjs.md) holds its
reading concept and acceptance checks. This file captures observed decisions only.

## Colors

Forest is the primary action and brand color; green ink and tint identify links,
success, or selection in their existing contexts. Marigold accents the landing page
and serves as the dark documentation focus indicator. Dashboard status colors
remain defined in its token source; they are not replaced by the docs palette.

Paper, raised paper, sunken paper, and paper lines belong to landing/docs. Dashboard
canvas, surface, border, and muted colors remain separate. Prefixes in the frontmatter
name scope rather than introduce new CSS variables.

Only documentation switches to the `docs-dark-*` palette. Its action background uses
paper, action text uses forest, focus uses marigold, and code text retains `docs-code-ink`.
Light docs focus uses green ink. Theme overrides live in the docs stylesheet.

## Typography

Inter is self-hosted. Landing and docs enable `cv11` and `ss01`. Preserve each
surface's scale: dashboard roles come from its token file, landing body from its
stylesheet, and docs roles from the scoped frontmatter entries above.

Docs H1 uses `clamp(32px, 2.8vw, 40px)`, weight 700, line height 1.16, and tracking
−0.03em. At 900px and below it becomes 32px; the lede becomes 17px. Docs navigation
is 13px with 1.45 line height, becoming 14px in the mobile menu. Code uses the system
monospace stack. These reader sizes do not apply to dashboard or landing headings;
the landing hero uses its own `clamp(46px, 6vw, 92px)` scale.

## Layout

Docs use a sticky 76px header and a centered frame capped at 1440px: 216px sidebar,
up to 740px article, and 180px outline. At 1199px and below the outline disappears
and the frame becomes two columns. At 900px and below the header is 128px, search
occupies its second row, and navigation expands inline above the article. At 480px
and below article gutters become 24px. Code and tables scroll within the article.

These dimensions are documentation-specific. Landing uses a 1360px container and
fluid gutter (`clamp(20px, 4vw, 56px)`); dashboard layout remains governed by its
[v2 specification](docs/design/ui-v2-spec.md) and implementation.

## Elevation & Depth

Docs rely on tonal fills and hairlines; only search results/status use the docs
elevation shadow. Landing uses its own layered shadows for the illustrated stage
and controls. Dashboard defines four shadow roles: primary button, floating,
dialog, and toggle knob. Exact shadows and existing motion values are recorded in
[the extraction sidecar](.impeccable/design.json); they retain surface scope.

## Shapes

Docs use gently rounded controls, search fields, and code/blockquote containers.
Dashboard has its own radius scale from keycaps through dialogs and pills; the
frontmatter captures its recurring control/card/dialog roles. Landing buttons are
pills and its illustrated device/note shapes remain local to that surface.

## Components

- **Docs primary action:** forest fill with raised-paper text in light mode; paper
  fill with forest text in dark mode. Hover opacity is 0.88. Open app uses the same color
  treatment with its own 10px by 14px padding.
- **Docs search:** raised fill, hairline border, leading search icon, keyboard hint,
  and themed focus border. Results use a raised floating container and sunken
  hover/focus fill; loading, empty, and failure copy share the status region.
- **Docs navigation:** muted secondary ink at rest, sunken hover fill, green-tinted
  active row, and `aria-current`. The template supplies the mobile menu, page outline,
  previous/next links, theme control, and skip link.
- **Docs content:** inline code uses sunken fill; code blocks use the code palette.
  Blockquotes have a hairline border; guide links are separated rows, not cards.
- **Focus and motion:** docs keyboard focus has a 2px outline with 4px offset.
  Navigation, icon controls, and search results transition colors for 140ms and
  smooth scrolling runs only when reduced motion is not requested.

## Do's and Don'ts

- **Do** use the stylesheet and token source for the surface being changed.
- **Do** preserve the existing book mark, self-hosted Inter, and source attribution.
- **Do** keep screenshot provenance in [docs/screenshots/README.md](docs/screenshots/README.md);
  the reader reuses those synthetic captures unchanged.
- **Don't** apply the docs-only dark palette or reader typography to dashboard or landing.
- **Don't** treat surface-specific dimensions, radii, or motion as universal tokens.
