# dsh-billing-badge

English | [中文](README.zh.md)

[![npm](https://img.shields.io/npm/v/dsh-billing-badge)](https://www.npmjs.com/package/dsh-billing-badge)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Billing season and account balance for the DeepSeek Harness web GUI. A pill in the
composer's statistics row, immediately after the native **Cache hit** reading, that
opens a small panel with the full picture.

```
2288M tok · Cache hit 99.8% · ● Off-peak · 2h13m
```

![The pill in the composer statistics row and the panel it opens](https://raw.githubusercontent.com/devacc8/dsh-billing-badge/main/docs/preview.png)

## What it shows

| Where | What |
|---|---|
| The pill | a coloured dot (amber for peak, green for off-peak), the season, and the time until it flips |
| The panel (click) | billing season, next switch with the Beijing wall clock, current Beijing time, account balance with its currency, granted and topped-up split, and a refresh button |

The season rule is the published one: peak is Beijing time, Monday to Friday,
09:00-12:00 and 14:00-18:00. Everything else, including all of Saturday and Sunday,
is off-peak at half price.

## The balance

The numbers come from the official `GET /user/balance` endpoint, and the three of them
mean different things:

```
total_balance = granted_balance + topped_up_balance
```

- `total_balance`, shown as **Account balance**, is everything you can spend.
- `granted_balance`, shown as **Granted**, is credit DeepSeek gave you. The endpoint
  reports only the part that has not expired, so a lapsed grant disappears from this
  row on its own.
- `topped_up_balance`, shown as **Topped up**, is money you paid in.

When the two upper rows are equal there is no grant on the account. `is_available`
is a top-level field of the response and answers one question: is the balance enough
for API calls. The panel adds a warning row when the answer is no, and stays quiet
otherwise, because the flag is true for every funded account.

The currency is taken from the response, never assumed: an account reporting USD is
not labelled with a CNY sign.

## Why another one

Two community plugins cover parts of this, and both taught something:

- [dsh-price-phase](https://github.com/lijunyu726/dsh-price-phase) shows the season.
  Its countdown once pointed at Saturday 09:00 after Friday close, an event that does
  not happen, and it centres its badge on a hashed CSS class, which collides with the
  model chip when the model name is long. This plugin compares each candidate boundary
  with the instant before it and only counts a real state flip, and its chip is an
  ordinary flex child in the native statistics row.
- [dsh-usage-monitor](https://github.com/liyiersan/dsh-usage-monitor) shows the
  balance, but formats it as CNY whatever the API reports.

This plugin deliberately does **not** do cost or token accounting.

## Install

From npm:

```sh
dsh plugin --profile web add dsh-billing-badge
```

or straight from the repository:

```sh
dsh plugin --profile web add github:devacc8/dsh-billing-badge
```

then restart `dsh web`. The package declares `dsh.bundle.patch`, so the host half is
reconciled into the profile's bundle list automatically.

Working on the plugin itself, install the checkout by path instead:

```sh
dsh plugin --profile web add link:/absolute/path/to/dsh-billing-badge
```

## Security

A balance is a small surface, so it stays small:

- the API key is resolved in the host through the DSH credentials seam
  (`ctx.credentials.resolve('DEEPSEEK_API_KEY')`, environment fallback) and never
  reaches the browser;
- the single route requires the `x-dsh-billing-badge: 1` header and rejects a
  cross-origin `Origin`, so a cross-site page cannot reach it;
- nothing is written to disk, and no endpoint other than `api.deepseek.com` is
  contacted;
- a missing key, an HTTP error or a network failure all degrade to a state the panel
  renders, never to a throw.

## Development

The season logic lives in `lib/season.js` as a plain ESM module so it can be tested
directly. A browser bundle cannot import a sibling file (the loader resolves only
platform seeds, materialized packages and registered factories, and a self-subpath
`require` throws "missed the module table"), so `scripts/inline-season.mjs` copies the
module into `lib/client.js` between two markers with `export ` stripped, and
`test/client-sync.test.mjs` fails if the copy drifts.

```sh
npm test          # 30 tests: season rule, countdown invariant, host route, bundle
npm run sync      # re-inline season.js into the bundle
npm run check     # sync check plus a syntax check of both halves
```

The countdown has an invariant test rather than fixtures: every 13 minutes across nine
days, the reported target must be in the future, must change the season, and the
season must not change before it.

## Layout

```
lib/season.js    season rule, countdown, formatting (source of truth, tested)
lib/index.js     host half: the balance route
lib/client.js    browser half: the pill and its panel, with season.js inlined
cordis.patch.yml mounts the host half into the profile
scripts/         the inliner
test/            season, sync, host and bundle tests
```

GitHub Actions runs `npm test` and `npm run check` on Node 20 and 22.

MIT.
