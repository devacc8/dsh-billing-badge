import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describePhase } from '../lib/season.js'

/**
 * Loads the shipped bundle the way the browser does (through the ModuleLoader
 * contract) and drives the chip against a tiny DOM stub. The bundle may only
 * require react, and it must register into the composer dock after the native
 * statistics strip.
 */
const code = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

const makeElement = (tag) => ({
  tagName: tag,
  className: '',
  title: '',
  textContent: '',
  children: [],
  style: {},
  dataset: {},
  attributes: {},
  removed: false,
  setAttribute(key, value) { this.attributes[key] = String(value) },
  getAttribute(key) { return this.attributes[key] },
  append(...nodes) { this.children.push(...nodes) },
  appendChild(node) { this.children.push(node); return node },
  replaceChildren(...nodes) { this.children = nodes },
  remove() { this.removed = true },
  addEventListener() {},
  removeEventListener() {},
  contains() { return false },
  querySelector() { return null },
  getBoundingClientRect() { return { left: 10, top: 100, bottom: 120, right: 110, width: 100, height: 20 } },
  get offsetWidth() { return 300 },
  get offsetHeight() { return 200 },
})

const head = makeElement('head')
const body = makeElement('body')
const documentStub = {
  head,
  body,
  querySelector: () => null,
  createElement: (tag) => makeElement(tag),
  addEventListener() {},
  removeEventListener() {},
}

const windowStub = {
  innerWidth: 1200,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  setInterval: () => 1,
  clearInterval() {},
  requestAnimationFrame: (fn) => { fn(); return 1 },
  cancelAnimationFrame() {},
  addEventListener() {},
  removeEventListener() {},
}

let loaded = null
let loadedId = null
const reactStub = {
  useEffect() {},
  useRef: (value) => ({ current: value }),
  useState: (value) => [value, () => {}],
  createElement: () => null,
}
windowStub.__ModuleLoader__ = {
  load(definition) {
    loadedId = definition.id
    loaded = definition.factory((specifier) => {
      if (specifier === 'react') return reactStub
      throw new Error(`unexpected require: ${specifier}`)
    })
  },
}

globalThis.window = windowStub
globalThis.document = documentStub
globalThis.MutationObserver = class { observe() {} disconnect() {} }
new Function('window', 'document', 'MutationObserver', code)(windowStub, documentStub, globalThis.MutationObserver)

test('the bundle loads through the ModuleLoader contract', () => {
  assert.equal(loadedId, 'dsh-billing-badge')
  assert.equal(typeof loaded.apply, 'function')
  assert.deepEqual(loaded.inject, ['slots'], 'inject is a service list, not a function')
})

test('apply registers into the composer dock with order 10', () => {
  const registered = []
  const ctx = {
    slots: {
      inject: (slot, cb) => { assert.equal(slot, 'conversation.composer.dock'); cb() },
      register: (spec) => { registered.push(spec) },
    },
  }
  loaded.apply(ctx)
  assert.equal(registered.length, 1)
  assert.equal(registered[0].name, 'conversation.composer.dock')
  assert.equal(registered[0].id, 'billing-badge')
  assert.equal(registered[0].order, 10, 'the native stats strip is order 0, so 10 lands after it')
})

test('mountChip appends one native-looking pill and removes it on teardown', () => {
  const row = makeElement('div')
  const teardown = loaded.__internal.mountChip(row)
  assert.equal(row.children.length, 1)
  const chip = row.children[0]
  assert.equal(chip.className, 'dsh-billing-badge')
  assert.equal(chip.getAttribute('aria-haspopup'), 'dialog')

  const phase = describePhase(new Date())
  const [dot, label] = chip.children
  assert.equal(label.textContent, phase.compact)
  assert.equal(dot.style.background, phase.color)
  assert.match(chip.title, /Beijing time/)

  teardown()
  assert.equal(chip.removed, true)
  assert.equal(documentStub.head.children.length, 1, 'the stylesheet is injected once')
})

test('the panel lists the balance split and stays quiet when calls are allowed', () => {
  const rows = loaded.__internal.panelBody({
    ok: true, currency: 'USD', total: 21.09, granted: 0, toppedUp: 21.09, isAvailable: true,
  })
  const keys = rows.map(([key]) => key)
  assert.deepEqual(keys.slice(0, 3), ['Billing season', 'Next switch', 'Beijing time'])
  assert.deepEqual(keys.slice(3), ['Account balance', 'Granted', 'Topped up'])
  assert.equal(rows[3][1], '$21.09 USD')
  assert.equal(rows[4][1], '$0')
})

test('the panel warns only when the API reports the balance as insufficient', () => {
  const rows = loaded.__internal.panelBody({
    ok: true, currency: 'USD', total: 1, granted: 0, toppedUp: 1, isAvailable: false,
  })
  assert.deepEqual(rows.at(-1), ['API calls', 'insufficient balance', 'warn'])
})

test('a degraded reading still fills the balance slot', () => {
  const missing = loaded.__internal.panelBody({ ok: false, state: 'no-credential' })
  assert.deepEqual(missing.at(-1), ['Account balance', 'no API key configured'])
  const failed = loaded.__internal.panelBody({ ok: false, state: 'error', error: 'HTTP 401' })
  assert.deepEqual(failed.at(-1), ['Account balance', 'unavailable'])
})
