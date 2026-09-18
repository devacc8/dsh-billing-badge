# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-09-18

### Fixed

- The chip follows the statistics reading into the composer dock on DeepSeek Harness
  0.1.6, where the labelled statistics row was replaced by a row of pill buttons and the
  old anchor no longer existed. Both shapes are supported: the labelled row stays first
  in the resolution order, the dock row is the fallback.
- The panel no longer closes on every scroll or resize. The composer scrolls on its own
  while a turn renders, so a click could be dismissed a moment after it opened. The panel
  now follows the chip and closes only once the chip itself is out of sight.

### Added

- `README.zh.md`, a full Chinese README. The catalog card renders a per-language README
  and its language sniff classified the mixed-language file as Chinese only, which the
  card then printed. The main README is English again, with a language link.
- `screenshots.json`, the catalog convention for author-curated card screenshots, with
  the panel and the pill in its row. Both the catalog detail page and the market's
  storefront read it from this repository, so a screenshot no longer waits on a
  maintainer.

### Removed

- The panel note saying that prices are published in CNY per million tokens while the
  balance keeps the currency the API reports. The plugin shows no prices, so the sentence
  explained nothing, and on an account reporting USD it read as if the account's own
  numbers were CNY. The empty note no longer reserves its spacing.

## [0.1.1] - 2026-09-13

### Changed

- The install section now leads with the npm package,
  `dsh plugin --profile web add dsh-billing-badge`, with the repository install kept
  as the alternative. The package page renders this file, so the published copy and
  the repository now say the same thing.
- Added the npm version badge to the README.

## [0.1.0] - 2026-09-13

First public release.

### Added

- A pill in the composer statistics row, appended after the native cache-hit reading.
  It shows a season dot (amber for peak, green for off-peak), the season name, and the
  countdown to the next flip.
- A panel on click, styled with the native dialog tokens: billing season, next switch
  with the Beijing wall clock, current Beijing time, account balance with its currency,
  the granted and topped-up split, a warning row when the API reports the balance as
  insufficient for calls, and a refresh button.
- A read-only host route, `GET /plugins/billing-badge/balance`, which resolves the API
  key through the DSH credentials seam, caches a reading for 60 seconds, and dedupes
  concurrent reads. It requires the `x-dsh-billing-badge: 1` header and rejects a
  cross-origin `Origin`.
- The season rule as a tested module: peak is Beijing time, Monday to Friday,
  09:00-12:00 and 14:00-18:00, everything else including the whole weekend is off-peak
  at half price. The next switch is computed by comparing each candidate boundary with
  the instant before it, so only a real state flip counts.
- 30 tests covering the season rule, a countdown invariant across nine days, bundle
  and source sync, the host route and its guards, and the panel rows.

### Fixed

- `is_available` is a top-level field of the balance response, a sibling of
  `balance_infos`, not a member of the entry. Reading it from the entry made the flag
  false for every account. The regression test pins the documented location.

MIT.
