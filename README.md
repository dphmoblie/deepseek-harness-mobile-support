# DeepSeek Harness — mobile support

> **This repository is a stopgap and is meant to be archived.**
> It exists only until the official DeepSeek Harness web frontend ships its own
> mobile layout. On that day this repository is archived, the Android app drops
> the submodule, and every rule below is deleted rather than migrated.

An Android/WebView adaptation layer for the official DeepSeek Harness web
frontend. The official bundle is **never modified**: the build copies it
verbatim, verifies it byte for byte, and adds exactly one stylesheet
(`dsh-android.css`) plus a `viewport-fit=cover` viewport.

[English](README.md) · [简体中文](README.zh-CN.md)

## Why this exists

The official frontend is built for a desktop three-column shell. On a phone
(360–412px) that shell has measurable problems. Numbers below are measured in a
360×800 mobile viewport, not estimated.

| Defect | Before | After |
| --- | --- | --- |
| Sidebar expanded on a narrow screen squeezes the transcript | 16px | 256px |
| Composer card width (sidebar collapsed) | 208px | 240px |
| Input font size — under 16px the WebView zooms on focus and never returns | 14px | 16px |
| Tap target for icon controls | 24–28px | 44px |

## What the stylesheet does

**Restores overrides that silently did nothing.** The layer already asked for
44px targets and 16px inputs, but through *element* selectors (specificity
0,0,1). The official bundle styles its controls through CSS-Modules hash
*classes* (0,1,0), which always win — so none of those rules ever applied on a
real device. They now carry `!important`.

**Grows tap targets without touching layout.** The official UI packs icon
controls at 16–28px on a fixed `height`. A 44px `min-height` would beat that and
burst the dense rows, so the hit area grows through a centered `::after` while
the layout box keeps the official metrics. Neither official stylesheet declares
a single `::after`, so nothing is overwritten.

**Turns the sidebar into an overlay drawer.** Below the app's own 1024px
breakpoint the sidebar auto-collapses to a 56px rail, but reopening it makes a
280px *grid track* that squeezes the transcript to 16px. The drawer floats the
column over the transcript instead. The 56px rail is deliberately kept: it
carries the only control that reopens the sidebar.

**Reclaims narrow-screen gutters.** The composer clearance and the 680px desktop
content floor are tuned for desktop reading comfort; on a 360px screen they
spend 64px on margins.

**Drops pointer-only affordances.** The transcript and column drag handles need
a pointer-precise drag. On a touch screen they cannot be aimed and only misfire.

**Keeps the root's height chain intact.** The official shell frame is
`height: 100%`. An `auto` root (the layer briefly used one) collapses the frame
to its content and leaves dead space below the transcript — measured on rc.2 at
a 360px viewport. The root stays a definite height; the safe-area padding lives
on `body`, whose border-box sizing already subtracts it.

**Stacks the settings panel.** The official settings panel is a two-column flex
row: a fixed 188px nav beside the content column. On a 360–412px viewport the
content keeps about 100px and Chinese copy wraps one glyph per line. Narrow
screens stack it — the nav becomes a horizontally scrollable tab strip and the
content takes the full width.

Safe-area insets, `100dvh` sizing, keyboard-safe dialog heights, momentum
scrolling for code blocks and wide tables, and reduced-motion handling are also
covered.

## Constraints this layer holds to

- **The official bundle is never patched.** Only `index.html` gains a marker
  meta, the `viewport-fit=cover` viewport, and one `<link>`.
- **No JavaScript.** CSS only, so there is no scrim-tap to close the drawer —
  closing stays with the rail's toggle.
- **`!important` never escapes a narrow-viewport guard.** Every forced
  declaration sits inside `max-width: 720px`, `pointer: coarse`, or
  `prefers-reduced-motion`. Desktop and tablet keep the official metrics
  exactly. A test walks brace depth to enforce this.
- **Graceful degradation.** The drawer needs `:has()` (Chrome 105+). Where it is
  missing the block drops and the sidebar stays a track — today's behaviour,
  never worse.
- **Selectors are stable contracts only.** The frame carries no stable class
  name (CSS Modules hashes it), so it is matched structurally through
  `[data-shell-overlay]` and `[data-rightbar-col]`. Hashed class names are never
  referenced.
- **Every contract is guarded.** All anchors this layer depends on (the `data-*`
  attributes, CSS variables, and class names above) are declared in
  `scripts/anchor-contract.mjs`. The build fails when the official frontend
  loses a static anchor, and `scripts/check-runtime-anchors.mjs` does the same
  for the runtime plugin tree. A silently dead rule is therefore impossible:
  an upgrade either keeps the anchors or stops the build with the affected
  rules named.

## Build

Node.js 24.14.0 and pnpm 11.19.0:

```text
pnpm install
pnpm test
pnpm build
```

The official frontend comes from `@deepseek-ai/dsh-web-frontend@0.1.5-rc.2`.
The build validates every resource path in the official `index.html` — rejecting
external entrypoints and directory traversal — before copying the package
distribution into `dist/`. It also verifies the static anchors (see above).

Before shipping a runtime image, check the plugin tree that will serve the
frontend:

```text
node scripts/check-runtime-anchors.mjs <runtime-node-modules>
```

`pnpm test` asserts that every official file survives byte for byte, that the
entrypoint is unchanged, that exactly one file is added, that the rules above
are present and correctly scoped, and that both anchor guards fail loudly when
an anchor disappears.

The Android application consumes this repository as a pinned Git submodule.
Generated `dist/` output and dependencies are not committed.

## License

MIT — see [LICENSE](LICENSE). The official frontend package it adapts is
redistributed under its own terms.
