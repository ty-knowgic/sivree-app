# Sivree — working notes for Claude

The app was named Sivry until 2026-10-20 (旧名 Sivry). Persisted identifiers keep the old `sivry` prefix on purpose (localStorage keys, the Drive file `sivry-settings.json`); `npm run check:brand` flags any other leftover.

Personal news app that shows only **primary sources** (governments, companies, research bodies, NPOs). Read `PRODUCT.md` (principles) and `BACKLOG.md` (decisions, market view) before proposing features.
Live: https://ty-knowgic.github.io/sivree-app/ (GitHub Pages; "Publish Sivree" workflow runs on push and every ~3 h).

## Layout
- `src/` Express + TypeScript server and shared logic (profile matching, pipeline, robots, vectors). `src/browser/main.ts` is the in-browser API used by the static site (bundled to `static-api.js`).
- `public/` static UI (`app.js`, `i18n.js`, `sync.js`, `legal.html`, `locales/*.json`). `site/` is the gitignored build output.
- `scripts/` checks and tests. `.github/workflows/publish.yml` runs them in CI.

## Before every commit (all must pass)
`npx tsc --noEmit` · `npm run check:locales` · `npm run check:i18n-keys` · `npm run check:source-names` · `npm run check:brand` · `npm run test:xss` · `npm run test:sync` · `npm run test:visit` · `npm run test:onboarding` · `npm run test:hashtags` · `npm run test:refresh` · `npm run test:feeds` · `npm run test:saved` · `npm run build:site`

## Conventions that bite
- **i18n**: the Japanese text is the key. Every new UI string needs an entry in all 12 other `public/locales/*.json` (`check:locales` fails otherwise). New source names **and labels** go in `locales/sources.json`; `check:i18n-keys` fails if code uses a Japanese string that isn't in the dictionaries, `check:source-names` fails for untranslated feed names/labels. Anything generated into data (hashtags, labels) must be translated at render time.
- **Python edits**: use files, not stdin heredocs with non-ASCII (macOS python 3.9 mangles long lines): write the script to the scratchpad and run it with `exec(compile(open(f, encoding='utf-8').read(), f, 'exec'))`. No `sed -i` (macOS BSD sed).
- jsdom tests: `const`/`let` in `app.js` are invisible to `window.eval`; expose what a test needs via `window.__t` (append `window.__t = {...}` / `window.__ready = i18nReady` to the evaluated source; `await window.i18nReady` is a no-op).
- Static build is cached 10 min by GitHub Pages: asset URLs carry `?v=<sha>`.
- CSP is a meta tag in `public/index.html`: any new external host must be added deliberately and justified in the privacy page.

## Decisions already made (don't reopen without being asked)
- User settings live **only on the client**. No server-side user data, no accounts, **no email digest**. Cross-device = copy/paste, or optional Google Drive appDataFolder sync (needs `CLIENT_ID` in `public/sync.js`).
- Audience and pricing (2026-10-20): professionals whose work depends on primary sources (consultants, licensed professionals, think-tank researchers). Personal non-business use, educational institutions and charities free; business/organizational use (companies, firms, public research organizations) paid annually per organization, free during beta. Entitlement = signed license key checked on the device, **not** accounts. Details in `PRODUCT.md` / `BACKLOG.md`. Code license: PolyForm Noncommercial 1.0.0 (`LICENSE`). Embedding model pinned to `embeddinggemma:300m` (Gemma terms read; only outputs ship). Per-source terms: `SOURCE_TERMS.md`; the 15 B1 sources (commercial use restricted) show **headline + link only** (`titleOnly` on the feed; no description, summary or image); ask permission later based on usage/feedback; press-release wires still to be asked. Trademark: preliminary search clean, nothing filed.
- Saved articles and citations (2026-10-20): a saved article is a **snapshot in the profile** (`savedItems`: original headline, source name, URL, dates, user note; no description/summary/image, so it is safe for `titleOnly` sources and survives the 30-day archive). Settings reset keeps it; settings paste and sync conflicts **merge** it (`SivreeSaved.mergeSavedItems`), never overwrite. Citations use the source's original headline and the **publisher region's** calendar date (`REGION_TIMEZONE` in `public/saved.js`); the user's notes appear only in CSV and RIS. All profile writes in `app.js` go through the serialized `updateProfile`.
- Logo (2026-10-20): the bracket-and-dot mark plus a capitalized **SIVREE**; the header text stays "Sivree" in the DOM and is capitalized with CSS, and every sentence/UI string keeps "Sivree". Brand colour #5b5bd6 (provisional). Details, asset list and how to regenerate the PNGs: `BRAND.md`.
- No human reviewers or experts for QA — do review/QA myself and say what I couldn't verify.
- Primary sources only: no media feeds, no SNS. Honest crawler identity `SivreeBot`; obey robots.txt; don't work around 403s.
- Never reset the user's saved profile in tests; don't leave local servers running (the user tests on GitHub).
- **Ask before `git push`** (and before anything outward-facing: labels, issues, publishing).

## Working style / token budget
- Be concise; lead with the result. Don't re-derive settled facts; don't narrate options not pursued.
- Keep one session on one theme. At a natural milestone (a pushed + verified change), suggest `/compact` or a fresh session rather than letting context grow. Re-read files instead of relying on stale memory.
- Prefer targeted reads (offset/limit, grep) over whole-file reads of `public/app.js` (~1800 lines) and `src/newsPipeline.ts`.
- Spawn subagents only when the user asks.
- Save durable lessons to memory; don't repeat what the repo already records.

## gstack (installed at `~/.claude/skills`, not in this repo)
Use these deliberately, one per task, not all at once:
- `/qa` or `/browse` — real-browser check of the live site (dark mode, iPhone width, CSP console errors, first-run flow).
- `/review` — review the diff before a risky push. `/cso` — security audit (CSP, sync, supply chain).
- `/design-review` — visual polish. `/plan-eng-review` — before a big feature. `/office-hours` — product/market questions.
- `/ship`, `/land-and-deploy` — only if the user asks; this repo deploys by pushing `main`.
