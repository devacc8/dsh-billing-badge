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

/** Record listeners so a test can drive the handlers the bundle registered. */
const withListeners = (target) => {
  target.listeners = {}
  target.addEventListener = (type, handler) => {
    target.listeners[type] = [...(target.listeners[type] ?? []), handler]
  }
  target.removeEventListener = (type, handler) => {
    target.listeners[type] = (target.listeners[type] ?? []).filter((entry) => entry !== handler)
  }
  return target
}

const makeElement = (tag) => withListeners({
  tagName: tag,
  className: '',
  title: '',
  textContent: '',
  children: [],
  style: {},
  dataset: {},
  attributes: {},
  queried: null,
  removed: false,
  classList: { toggle() {}, add() {}, remove() {} },
  setAttribute(key, value) { this.attributes[key] = String(value) },
  getAttribute(key) { return this.attributes[key] },
  append(...nodes) { this.children.push(...nodes) },
  appendChild(node) { this.children.push(node); return node },
  replaceChildren(...nodes) { this.children = nodes },
  remove() { this.removed = true },
  contains() { return false },
  querySelector(selector) {
    if (this.queried === null) this.queried = {}
    if (this.queried[selector] === undefined) this.queried[selector] = makeElement('query')
    return this.queried[selector]
  },
  getBoundingClientRect() { return { left: 10, top: 100, bottom: 120, right: 110, width: 100, height: 20 } },
  get offsetWidth() { return 300 },
  get offsetHeight() { return 200 },
})

const head = makeElement('head')
const body = makeElement('body')
const documentStub = withListeners({
  head,
  body,
  querySelector: () => null,
  createElement: (tag) => makeElement(tag),
})

const windowStub = withListeners({
  innerWidth: 1200,
  innerHeight: 900,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  setInterval: () => 1,
  clearInterval() {},
  requestAnimationFrame: (fn) => { fn(); return 1 },
  cancelAnimationFrame() {},
})

globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({ ok: true, currency: 'USD', total: 11.02, granted: 0, toppedUp: 11.02, isAvailable: true }),
})

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

/**
 * Load a fresh copy of the bundle against its own document. The bundle takes
 * `document` as a loader argument, so a second instance is the only honest way to
 * drive `statsRow()` against a page shape the module-level stub does not have.
 */
const loadWith = (doc) => {
  let exports = null
  const windowWithLoader = {
    ...windowStub,
    __ModuleLoader__: {
      load(definition) {
        exports = definition.factory((specifier) => {
          if (specifier === 'react') return reactStub
          throw new Error(`unexpected require: ${specifier}`)
        })
      },
    },
  }
  new Function('window', 'document', 'MutationObserver', code)(
    windowWithLoader,
    doc,
    globalThis.MutationObserver,
  )
  return exports
}

test('statsRow takes the labelled row the harness rendered up to 0.1.5', () => {
  const legacy = makeElement('div')
  const mod = loadWith({
    querySelector: (selector) => (selector.includes('data-composer-stats') ? legacy : null),
  })
  assert.equal(mod.__internal.statsRow(), legacy)
})

test('statsRow follows the cache-hit pill into the dock row on 0.1.6', () => {
  const pill = makeElement('button')
  pill.textContent = '215M tok · Cache hit 99.8%'
  const anchor = { children: [pill], contains: (node) => node === pill }
  const root = { children: [anchor], contains: (node) => node === pill }
  const dock = { children: [root], querySelectorAll: () => [pill] }
  const mod = loadWith({
    querySelector: (selector) => (selector.includes('composer.dock') ? dock : null),
  })
  assert.equal(
    mod.__internal.statsRow(),
    root,
    'the chip joins the row that holds the readings, not the dock itself',
  )
})

test('statsRow waits while the dock has no readings yet', () => {
  const dock = { children: [], querySelectorAll: () => [] }
  const mod = loadWith({
    querySelector: (selector) => (selector.includes('composer.dock') ? dock : null),
  })
  assert.equal(mod.__internal.statsRow(), null)
})

/** Mount a chip, open its panel, and hand back both. */
const openPanel = () => {
  const before = documentStub.body.children.length
  const row = makeElement('div')
  const teardown = loaded.__internal.mountChip(row)
  const chip = row.children[0]
  chip.listeners.click[0]()
  return { chip, panel: documentStub.body.children[before], teardown }
}

test('the panel opens on a click and carries no currency remark', () => {
  const { chip, panel, teardown } = openPanel()
  assert.equal(panel.className, 'dsh-billing-panel')
  assert.equal(panel.getAttribute('aria-label'), 'Billing and balance')
  assert.equal(panel.queried['.dsh-billing-note'].textContent, '', 'a funded account needs no note')
  assert.equal(chip.getAttribute('aria-expanded'), 'true')
  teardown()
  assert.equal(panel.removed, true, 'teardown removes the panel')
})

test('a scroll repositions the open panel instead of closing it', () => {
  const { chip, panel, teardown } = openPanel()
  windowStub.listeners.scroll[0]()
  assert.equal(panel.removed, false, 'a scroll during rendering no longer dismisses the panel')
  assert.equal(chip.getAttribute('aria-expanded'), 'true')
  teardown()
})

test('a scroll that carries the chip out of sight closes the panel', () => {
  const { chip, panel, teardown } = openPanel()
  chip.getBoundingClientRect = () => ({ left: 10, top: -60, bottom: -40, right: 110, width: 100, height: 20 })
  windowStub.listeners.scroll[0]()
  assert.equal(panel.removed, true, 'a panel pointing at nothing closes')
  assert.equal(chip.getAttribute('aria-expanded'), 'false')
  teardown()
})
