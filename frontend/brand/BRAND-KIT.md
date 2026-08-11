# RAGSuite Brand Kit — for the Dashboard

Everything an AI coding agent (or a developer) needs to restyle the **RAGSuite** product
dashboard to brand. *The Sovereign Enterprise AI Platform — an innovation by NITSAN.*

**Start here:** open **`AGENTS.md`** (repo root) — it's the contract. Point your AI agent at it first.

## What's inside

```
├── AGENTS.md                  ← primary AI-agent-ready spec (read this first)
├── brand/BRAND-KIT.md         ← you are here
├── tokens/
│   ├── design-tokens.json     ← machine-readable tokens (W3C draft format)
│   ├── tokens.css             ← :root CSS custom properties — imported by src/global.css
│   ├── tailwind-preset.js     ← optional Tailwind theme preset
│   └── components.css         ← reference CSS for core dashboard components
├── brand/
│   ├── master-brand-guide.md
│   ├── website-style-guide.md
│   └── voice-and-principles.md
└── assets/logo/               ← production logo files (SVG + PNG)
```

## How to use it

1. Read `AGENTS.md` — treat every token value as locked.
2. Theme implementation lives in `src/theme/` (`brand-tokens.ts`, `colors.ts`, etc.).
3. Import path for web CSS: `tokens/tokens.css` (wired via `src/global.css`).
4. Run the AGENTS.md §8 pre-flight checklist before shipping screens.

*Version 1.0.0 · 2026-06-14.*
