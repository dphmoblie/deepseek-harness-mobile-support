# DeepSeek Harness mobile support

This repository contains the Android/WebView adaptation layer for the official
DeepSeek Harness web frontend. It keeps the upstream frontend entrypoint and
assets intact, and adds a small, audited stylesheet for safe areas, touch
targets, dynamic viewport sizing, keyboard-safe dialogs, and narrow screens.

## Build

Use Node.js 24.14.0 and pnpm 11.19.0:

```text
pnpm install
pnpm test
pnpm build
```

The official frontend is supplied by
`@deepseek-ai/dsh-web-frontend@0.1.5-alpha.1`. The build validates resource
paths before copying the package distribution into `dist/`.

The Android application consumes this repository as a pinned Git submodule.
Generated `dist/` output and dependencies are intentionally not committed.
