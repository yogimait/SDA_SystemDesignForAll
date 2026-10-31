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

- Entrance: `animate-fade-up` (8px rise + fade, 450ms, ease-out-expo) on the two hero columns; stagger via `animation-delay-1/2/3` (60ms steps). Error banners stay instant — clarity beats flourish.
- Hover: pills/cards brighten their border; chips and buttons shift <2px; dialogs keep the shared tw-animate-css fade/zoom. Hover/focus transitions cap at ~150–200ms; entrance ≤450ms. No springs, no parallax, no autoplaying loops.

## Landing: Stitch "Coffee Theme" implementation (2026-10-31)

The landing page implements the Stitch Coffee reference (`coffee-landing.html`) with the project's own Tailwind pipeline — no CDN runtime, no second token set:

- **Palette**: existing coffee tokens (`--background` #201D1A, `--card` #262320, `--popover` #2E2A27, `--border` #3A3631, `--primary` #D9A05B) plus one extra `--primary-hover` (#C78F4B) exposed as `bg-primary-hover`. Secondary copy uses `--muted-foreground`, faint labels `text-muted-foreground/70`.
- **Typography**: headings stay `font-heading` (Space Grotesk). Landing-only families load via `next/font` and CSS variables scoped to the page: `font-landing` (Inter), `font-landing-mono` (Space Mono), `font-hand` (Caveat annotation). App surfaces keep Geist.
- **Decorative**: `.coffee-dot-grid` / `.coffee-dot-grid-subtle` (token-based radial dots) for the hero window and CTA banner.
- **Structure**: flat sticky 64px header → hero (badge, 12-col split: copy + idea card left / static three-view window with Caveat callout right) → `#examples` "What you get" (3 pillars, each with a miniature) → `#how-it-works` (4-step dashed pipeline + one collapsed "Controls, keys and export" disclosure) → CTA banner (3 pillars) → footer.
- **Honesty/budget**: the "Join thousands…" social proof is replaced with factual copy; provider list says OpenRouter/Groq (no Gemini); preview miniatures are static illustrations marked `data-slot`, excluded from copy budgets; no dead interactive controls (the zoom cluster is decorative, view switches are real preview tabs).
- **Fold**: hero breakpoints keep the primary CTA above 800px at 1280×800 (`sm:text-5xl` head, `3xl:text-6xl` from 1440px, compact hero bottom padding).

## Components currently themed

- `components/landing/site-header.tsx` — flat sticky coffee bar (border + `bg-background/95` + backdrop blur), accent `sda/` wordmark, section nav from `md`, provider + 44px sign-in controls. Desktop ≥1024 scrolling (~120px, hysteresis 80) cross-fades the bar into the floating vertical dock (`components/nav/dock.tsx`; provider trigger only on landing/library; portal mains get a `body.dock-active` left offset from globals.css). Phones/tablets use the hamburger sheet (`components/nav/mobile-nav-sheet.tsx`).
- `components/landing/provider-dialog.tsx` — provider (from `GET /api/providers`) + per-provider session key + model (from the selected provider), privacy box, save-for-session (+ saved provider/model preference for signed-in users).
- `components/landing/idea-form.tsx` — coffee idea card: uppercase mono label + live `chars/8000` counter, contrast-safe field (border `muted-foreground/60`, `bg-background/80`), six example chips (44px), key note ("Use your own API key (OpenRouter, Groq)") and accent CTA in the bottom action bar. Pending-idea restore and AUTH_REQUIRED hand-off unchanged.
- `components/landing/capabilities.tsx` — "What you get" pillars (LLD/HLD/DSA) with tinted icon tiles and static miniature previews.
- `components/landing/how-it-works.tsx` — four-step pipeline + collapsed controls disclosure.
- `components/landing/sample-preview.tsx` — static three-view window (LLD/HLD/DSA preview tabs) with the Caveat annotation; sample fixtures only.

Sample preview fixtures are demo material only (root AGENTS.md: never the production pipeline).
