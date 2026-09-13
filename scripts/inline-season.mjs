/**
 * Inline lib/season.js into lib/client.js.
 *
 * A browser bundle cannot import a sibling file: the loader only resolves
 * platform seeds, materialized packages and registered factories, so a
 * `require('<own package>/<subpath>')` throws "missed the module table" in a real
 * browser (a mistake an earlier community plugin shipped). The logic therefore
 * lives in one testable ESM file and is copied into the bundle here, between two
 * markers, with `export ` stripped. `test/client-sync.test.mjs` fails when the
 * copy and the source diverge, so a stale bundle cannot pass the suite.
 *
 * Usage: node scripts/inline-season.mjs [--check]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const START = '\t\t// >>> billing-badge:season (generated from lib/season.js by scripts/inline-season.mjs) >>>'
const END = '\t\t// <<< billing-badge:season <<<'

/**
 * The inlined form of the season module: exports stripped, indented to sit
 * inside the bundle factory.
 *
 * @returns {string} The block body, without the markers.
 */
export function seasonBlock() {
  const source = readFileSync(join(root, 'lib/season.js'), 'utf8')
  return source
    .replace(/^export /gm, '')
    .replace(/^/gm, '\t\t')
    .trimEnd()
}

export function expectedClient() {
  const client = readFileSync(join(root, 'lib/client.js'), 'utf8')
  const start = client.indexOf(START)
  const end = client.indexOf(END)
  if (start === -1 || end === -1 || end < start) throw new Error('season markers not found in lib/client.js')
  return client.slice(0, start + START.length) + '\n' + seasonBlock() + '\n' + client.slice(end)
}

const check = process.argv.includes('--check')
const next = expectedClient()
const current = readFileSync(join(root, 'lib/client.js'), 'utf8')
if (next === current) {
  console.log(check ? 'client.js is in sync with season.js' : 'client.js already in sync')
} else if (check) {
  console.error('client.js is OUT OF SYNC with season.js: run node scripts/inline-season.mjs')
  process.exitCode = 1
} else {
  writeFileSync(join(root, 'lib/client.js'), next)
  console.log('inlined season.js into client.js')
}
