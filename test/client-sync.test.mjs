import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { seasonBlock } from '../scripts/inline-season.mjs'

/**
 * The browser bundle cannot import the season module at runtime, so the logic is
 * inlined by scripts/inline-season.mjs. This test is what keeps the copy honest:
 * a hand edit in either place fails here.
 */
const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const START = '// >>> billing-badge:season'
const END = '// <<< billing-badge:season'

test('the inlined season block matches lib/season.js', () => {
  const start = client.indexOf(START)
  const end = client.indexOf(END)
  assert.ok(start !== -1 && end > start, 'markers present in lib/client.js')
  // start reading on the line after the opening marker, which carries a note
  const firstLine = client.indexOf('\n', start) + 1
  const inlined = client
    .slice(firstLine, end)
    .replace(/^\s*$/gm, '')
    .trim()
  const expected = seasonBlock()
    .replace(/^\s*$/gm, '')
    .trim()
  assert.equal(inlined, expected, 'run node scripts/inline-season.mjs')
})

test('the bundle requires nothing but react', () => {
  const requires = [...client.matchAll(/require\(([^)]*)\)/g)].map((m) => m[1].trim())
  assert.deepEqual([...new Set(requires)], ['"react"'], 'a self-subpath require throws in the browser')
})

test('the bundle registers into the composer dock after the native stats strip', () => {
  assert.match(client, /"conversation\.composer\.dock"/)
  assert.match(client, /order:\s*10/, 'the native stats strip uses order 0, so 10 renders after it')
  assert.match(client, /id:\s*"billing-badge"/)
  assert.match(client, /data-composer-stats/, 'the chip attaches to the native statistics row')
})

test('the balance route is called with the plugin header', () => {
  assert.match(client, /x-dsh-billing-badge/)
  assert.match(client, /\/plugins\/billing-badge\/balance/)
})
