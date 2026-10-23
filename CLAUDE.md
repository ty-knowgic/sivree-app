# Sivree — working notes for Claude

The app was named Sivry until 2026-10-20 (旧名 Sivry). Persisted identifiers keep the old `sivry` prefix on purpose (localStorage keys, the Drive file `sivry-settings.json`); `npm run check:brand` flags any other leftover.

Personal news app that shows only **primary sources** (governments, companies, research bodies, NPOs). Read `PRODUCT.md` (principles) and `BACKLOG.md` (decisions, market view) before proposing features.
Live: https://sivree.com/ (GitHub Pages with the custom domain since 2026-10-23; www redirects to it, and the old https://ty-knowgic.github.io/sivree-app/ redirects too. "Publish Sivree" workflow runs on push and every ~3 h). DNS is at Porkbun: leave the Workspace mail records (MX, SPF, google-site-verification, google._domainkey, _dmarc) alone.

## Layout
- `src/` Express + TypeScript server and shared logic (profile matching, pipeline, robots, vectors). `src/browser/main.ts` is the in-browser API used by the static site (bundled to `static-api.js`).
- `public/` static UI (`app.js`, `i18n.js`, `sync.js`, `legal.html`, `locales/*.json`). `site/` is the gitignored build output.
- `scripts/` checks and tests. `.github/workflows/publish.yml` runs them in CI.

## Before every commit (all must pass)
`npx tsc --noEmit` · `npm run check:locales` · `npm run check:i18n-keys` · `npm run check:source-names` · `npm run check:brand` · `npm run test:xss` · `npm run test:sync` · `npm run test:visit` · `npm run test:onboarding` · `npm run test:hashtags` · `npm run test:refresh` · `npm run test:feeds` · `npm run test:saved` · `npm run test:tiers` · `npm run test:migrate` · `npm run build:site`

## Conventions that bite
- **i18n**: the Japanese text is the key. Every new UI string needs an entry in all 12 other `public/locales/*.json` (`check:locales` fails otherwise). New source names **and labels** go in `locales/sources.json`; `check:i18n-keys` fails if code uses a Japanese string that isn't in the dictionaries, `check:source-names` fails for untranslated feed names/labels. Anything generated into data (hashtags, labels) must be translated at render time.
- **Python edits**: use files, not stdin heredocs with non-ASCII (macOS python 3.9 mangles long lines): write the script to the scratchpad and run it with `exec(compile(open(f, encoding='utf-8').read(), f, 'exec'))`. No `sed -i` (macOS BSD sed).
- jsdom tests: `const`/`let` in `app.js` are invisible to `window.eval`; expose what a test needs via `window.__t` (append `window.__t = {...}` / `window.__ready = i18nReady` to the evaluated source; `await window.i18nReady` is a no-op).
- Static build is cached 10 min by GitHub Pages: asset URLs carry `?v=<sha>`.
- **Feeds** live in `src/feeds/` (`officialFeeds` is re-exported from `src/newsPipeline.ts`). An official feed needs `level` (`international`/`national`/`regional`/`local`); regional/local also need `area` (ISO 3166-2), local needs `city`. The feeds that existed on 2026-10-20 (99 entries, 94 distinct URLs; Cision Canada removed 2026-10-21 when its feed disappeared, so 93) are frozen in `scripts/frozen-default-feeds.json` (feed URL → id): don't change their `feedUrl` (it changes the id and drops users' on/off choices), and any feed added later must carry `since: 'YYYY-MM-DD'` (it then stays off by default). A feed in a `pack` must have `terms: 'A'`; `terms: 'B1'` requires `titleOnly`. `test:feeds` and `test:tiers` enforce this. Professional sources (2026-10-23, 42 feeds, all candidates) are in `src/feeds/professional.ts`; the two packs (`legal`, `finance`; name and blurb are UI strings in every locale) are in `src/feeds/packs.ts` and appear grouped inside Settings → 候補 labelled 「正式版では有償（ベータ中は無料）」. `test:feeds` pins each pack's sources and the international/regional level lists — changing them needs the user's OK.
- **Candidates**: a feed that is not `defaultOn` (`src/sourceTier.ts`) is a candidate: hidden unless its id is in `profile.extraSources` (`candidate: true` in `listSources()`). Turning a candidate off removes it from `extraSources` **and** adds it to `excludedSources`, so a migration redone after an old cached page saved the profile can't bring it back. `migrateProfile` (`src/profile.ts`, run by every `loadProfile`/`saveProfile`, so paste and Drive sync are covered) moves the old always-on Waterloo/Ontario sources into `extraSources`; their ids are fixed in `LEGACY_DEFAULT_CANDIDATES`. `test:migrate` checks that nobody's visible articles change.
- CSP is a meta tag in `public/index.html`: any new external host must be added deliberately and justified in the privacy page.

## Decisions already made (don't reopen without being asked)
- User settings live **only on the client**. No server-side user data, no accounts, **no email digest**. Cross-device = copy/paste, or optional Google Drive appDataFolder sync (needs `CLIENT_ID` in `public/sync.js`).
- Audience and pricing (2026-10-20): professionals whose work depends on primary sources (consultants, licensed professionals, think-tank researchers). Personal non-business use, educational institutions and charities free; business/organizational use (companies, firms, public research organizations) paid annually per organization, free during beta. Entitlement = signed license key checked on the device, **not** accounts. Details in `PRODUCT.md` / `BACKLOG.md`. Code license: PolyForm Noncommercial 1.0.0 (`LICENSE`). Embedding model pinned to `embeddinggemma:300m` (Gemma terms read; only outputs ship). Per-source terms: `SOURCE_TERMS.md`; the B1 sources (commercial use restricted; 15 on 2026-10-20, 9 more professional ones on 2026-10-23) show **headline + link only** (`titleOnly` on the feed; no description, summary or image); ask permission later based on usage/feedback; press-release wires still to be asked. Trademark: preliminary search clean, nothing filed.
- Saved articles and citations (2026-10-20): a saved article is a **snapshot in the profile** (`savedItems`: original headline, source name, URL, dates, user note; no description/summary/image, so it is safe for `titleOnly` sources and survives the 30-day archive). Settings reset keeps it; settings paste **merges** it (`SivreeSaved.mergeSavedItems`), never overwrites. Citations use the source's original headline and the **publisher region's** calendar date (`REGION_TIMEZONE` in `public/saved.js`); the user's notes appear only in CSV and RIS. All profile writes in `app.js` go through the serialized `updateProfile`.
- Logo (2026-10-20): the bracket-and-dot mark plus a capitalized **SIVREE**; the header text stays "Sivree" in the DOM and is capitalized with CSS, and every sentence/UI string keeps "Sivree". Brand colour #5b5bd6 (provisional). Details, asset list and how to regenerate the PNGs: `BRAND.md`.
- Drive sync (2026-10-21, `public/sync.js`): Google's token model gives a token only through a popup opened **synchronously inside a tap** (iPhone blocks it after any `await`), and offers no silent renewal. So GIS is preloaded when sync is on, the token (~1 h) is kept in localStorage. When it expires, a header sync button and a load toast appear, and Save/paste in settings call `SivreeSync.prepare()` so the popup opens in that tap; no popup without a tap. When both devices changed, there is no dialog: a 3-way merge against the last-synced copy (`sivree:sync-base`) runs per field. List fields merge per element, so deletions propagate. A device without a base takes Drive's settings and keeps both devices' saved and hidden items. `test:sync` models the iPhone popup rule.
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
