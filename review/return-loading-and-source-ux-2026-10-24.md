# Revisit loading and source settings UX

Implemented locally; publication pending approval.

## Observations

- User reports more than seven seconds on an iPhone 14 over 5G+ after returning after 15+ minutes. The exact device trace is unavailable; a specific Safari cause is not established.
- Restoring article data from IndexedDB still required downloading or revalidating the HTML, scripts, styles and translations before startup. First-time data also waits for the complete public generation.
- The current public generation has 3,409 articles. Grouping those articles using the published sparse similarity data took approximately 490 ms in the local Node environment. The optimized implementation took approximately 5 ms and produced an identical full result (3,110 groups).
- Source names were not associated with the switch. Workflow buttons added sources immediately without preview, could be disabled with no clear explanation, and rerendered settings after use. Source search covered only additional sources. The total-source denominator omitted unselected additions.

## Changes

- Precache the versioned app shell with a service worker, including locale dictionaries. Installation occurs after the initial render. Returning navigation uses the cached shell; worker updates prepare a complete new version in the background. Keep the previous version for open tabs. Do not intercept news data, API/profile requests, external origins, or other pages.
- Cache public locale dictionaries locally by asset version. Failed cache access falls back to the existing fetch path.
- Use the sparse similarity graph to find candidate story groups. Preserve original group order, complete-member checks, date constraints, missing-vector behavior and eight-item limit.
- Associate source names with their controls and provide 44 × 44 px switch inputs. Keep external links separate.
- Preview each workflow's actual source labels and regions, then explicitly add its unselected sources. Explain zero available sources and provide a route to change scope. Preserve search, disclosure state and focus during additions and group toggles.
- Search the complete source catalog. Restore disclosure states after clearing a search. Count every available source in the overall denominator. Improve contrast of explanatory text and counts.
- Preserve the pinned browsing generation: resume checks do not replace visible cards.

## Validation

- All repository-required type, translation, brand, source-name, security, sync, onboarding, news, feed, saved-item, tier, migration and build checks passed. The tsx CLI's restricted IPC endpoint was avoided locally by running the same TypeScript scripts with `node --import tsx`; no sandbox relaxation was used.
- Added service-worker lifecycle tests: offline returning shell, exact asset versions, previous-version assets, failed update, bounded shell caches, and exclusion of article data and settings. Added dictionary-cache offline/version tests.
- Added grouping equivalence across 25 deterministically shuffled orders.
- Added source UX tests using actual application event handlers: label taps, draft cancellation, saving/reopening, previews, additive selection, individual removal/counts, group toggles, whole-catalog search, empty results, disclosure restoration, and scope changes/unavailable sources.
- Existing resume test now simulates 16 minutes away and checks that the current list remains unchanged.
- Desktop Chrome at iPhone-like 390 × 844 viewport: source-name tap, keyboard Space, save, source preview and additive selection verified. Checkbox hit box measured 44 × 44 px. Page content and scroll width both 375 px (desktop scrollbar accounts for the remaining viewport width).
- With all test-server HTTP responses delayed seven seconds, a warmed app shell and article snapshot displayed the list in approximately 160 ms (DOM timestamp after rendering); a prior normal warmed run was approximately 358 ms. These are desktop test results, not iPhone measurements or a mobile performance guarantee.

## Limits and release check

- First visit, unsupported/unavailable service workers, private/ephemeral storage, or eviction of both caches still requires network loading. No claim is made that the first download is instant.
- After publication, verify the deployed worker's precache entries all return successfully and the live build has the new version. The next iPhone acceptance check should record time to readable cards after 15+ minutes, with both returning-tab and reopened-page cases. No iPhone settings reset is required.
