# Design System

Theme: **"Coffee"** — slightly dark warm charcoal, minimalist, accessible. Defined via Stitch (2026-10-23, user-provided direction: "slightly dark shade like grey or coffee, minimalist, clear what is happening, accessible").

## Stitch references (re-generate/edit anytime)

- Stitch project: `projects/4701967166422589636` (title "SDA Frontend Theme")
- Design system asset: `assets/16d57281596d40f4b8d031ea3afa8e15` (authored from an uploaded DESIGN.md = the token list below)
- Screens (HTML downloadable via `download_file` by file name):
  - Landing: `projects/4701967166422589636/files/f43e32478d1a49079b2ab7ec5cda99ff`
  - Provider setup dialog: `projects/4701967166422589636/files/1aa1eef543fa4c76b66bfee3e92c103e`
- All future screens must pin `designSystem: assets/16d57281596d40f4b8d031ea3afa8e15`.

## Tokens (app/globals.css — single dark theme, deliberate)

| Token | Value (oklch) | Hex intent | Use |
| --- | --- | --- | --- |
| background | 0.19 0.008 60 | #201D1A | page |
| card | 0.225 | #262320 | cards |
| popover | 0.25 | #2E2A27 | dialogs/menus |
| foreground (text) | 0.93 | #F2EFE9 | primary text |
| muted-foreground | 0.70 | #B8B2AA | secondary text |
| primary + ring | 0.78 0.09 74 | #D9A05B copper | interactive accent, focus |
| primary-foreground | 0.19 0.02 60 | #201409 | text on accent |
| destructive / success / warning | 0.66/0.76/0.79 | #E27868 / #8FBF9F / #D9B36A | status (dot + shape + label, never color alone) |
| data | 0.72 0.07 255 | #7FA8D9 | diagram blue (F3/F4 only) |
| border / input | 0.32 | #3A3631 | hairlines |

- **Single dark theme on purpose** (user decision): no prefers-color-scheme switching — the coffee look is the brand; one theme keeps AA contrast auditable. The `dark:` variant remains available if a light theme ever returns.
- Radius: 8px standard (0.5rem), textiles: chips use smallest radius.
- Fonts: body = Geist (Inter-equivalent role), **headlines = Space Grotesk** (`--font-heading`, set in root layout), identifiers/chips/statuses = Geist Mono (Space Mono role in Stitch output).

## Accessibility rules baked into components

- Labels above every input; helper text tied via `aria-describedby`/ids.
- Visible 2px copper focus ring on all interactive elements (`focus-visible:ring-ring`).
- Status/explicit-copy principle: loading ("Creating session…"), first-run banner, error banners (`role="alert"`) with user-facing message + raw detail in mono.
- Dialog a11y (focus trap, Esc, overlay click) comes from the shared base-UI `Dialog` component — never hand-roll dialogs.
- Reduced-motion: global kill switch in globals.css.

## Motion vocabulary (kept quiet, 2026-10-23)

Minimalist = motion is punctuation, not decoration. Everything is disarmed by the `prefers-reduced-motion` kill switch.

- Entrance: `animate-fade-up` (8px rise + fade, 450ms, ease-out-expo) on hero, idea card, capabilities; stagger via `animation-delay-1/2/3` (60ms steps). Error banners stay instant — clarity beats flourish.
- Hover: cards lift 1 step (-4px) with a slightly brighter border; example chips lift 1px; primary buttons lift 1px on hover and press down on click (`active:translate-y-0`).
- Dialogs: built-in tw-animate-css fade/zoom on the shared Dialog component — do not add more.
- Hover/focus transitions cap at ~150–200ms; entrance ≤450ms. No springs, no parallax, no autoplaying loops.

## Components currently themed

- `components/landing/site-header.tsx` — sticky slim nav, mono wordmark `sda/`.
- `components/landing/provider-dialog.tsx` — provider (fixed OpenRouter) + key + model, privacy box, save-for-session.
- `components/landing/idea-form.tsx` — textarea card, example chips (mono), start button states, error banner, BYOK helper line.
- `components/landing/capabilities.tsx` — three text-led cards + labelled static sample preview.

Sample preview fixtures are demo material only (root AGENTS.md: never the production pipeline).
