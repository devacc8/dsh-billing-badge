import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { apply, inject, name } from '../lib/index.js'

/**
 * Host half: one read-only route. The two guards are the interesting part, plus
 * the shape the chip consumes, including the currency the API reports (a balance
 * labelled with the wrong currency sign is worse than no number).
 */
const source = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')

const build = ({ credentials, fetchImpl, env } = {}) => {
  const routes = new Map()
  const ctx = {
    credentials,
    inject: (_deps, cb) => cb({
      effect: (fn) => { fn(); return () => {} },
      webServer: { register: (o) => routes.set(o.path, o.handler) },
    }),
  }
  const previousFetch = globalThis.fetch
  const previousKey = process.env.DEEPSEEK_API_KEY
  if (fetchImpl) globalThis.fetch = fetchImpl
  delete process.env.DEEPSEEK_API_KEY
  if (env) process.env.DEEPSEEK_API_KEY = env
  apply(ctx)
  const restore = () => {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = previousKey
  }
  return { routes, restore }
}

const call = (handler, { headers = {}, url = '/plugins/billing-badge/balance' } = {}) =>
  new Promise((resolve, reject) => {
    let out = null
    const res = { writeHead: (status) => { out = { status } }, end: (s) => resolve({ ...out, body: JSON.parse(s) }) }
    handler({ method: 'GET', url, headers }, res).catch(reject)
  })

const ok = (body) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(body),
})

test('module metadata', () => {
  assert.equal(name, 'billing-badge')
  assert.deepEqual(inject, ['webServer', 'credentials'])
})

test('rejects a request without the plugin header', async () => {
  const { routes, restore } = build({ credentials: { resolve: async () => ({ value: 'k' }) } })
  const res = await call(routes.get('/plugins/billing-badge/balance'))
  assert.equal(res.status, 403)
  assert.equal(res.body.state, 'forbidden')
  restore()
})

test('rejects a cross-origin request', async () => {
  const { routes, restore } = build({ credentials: { resolve: async () => ({ value: 'k' }) } })
  const res = await call(routes.get('/plugins/billing-badge/balance'), {
    headers: { 'x-dsh-billing-badge': '1', origin: 'https://evil.example', host: '127.0.0.1:3080' },
  })
  assert.equal(res.status, 403)
  restore()
})

test('accepts a same-origin request', async () => {
  const { routes, restore } = build({
    credentials: { resolve: async () => ({ value: 'k' }) },
    fetchImpl: async () => ok({ is_available: true, balance_infos: [{ currency: 'USD', total_balance: '1.91', granted_balance: '0', topped_up_balance: '1.91' }] }),
  })
  const res = await call(routes.get('/plugins/billing-badge/balance'), {
    headers: { 'x-dsh-billing-badge': '1', origin: 'http://127.0.0.1:3080', host: '127.0.0.1:3080' },
  })
  assert.equal(res.status, 200)
  assert.equal(res.body.ok, true)
  assert.equal(res.body.currency, 'USD')
  assert.equal(res.body.total, 1.91)
  assert.equal(res.body.toppedUp, 1.91)
  assert.equal(res.body.granted, 0)
  assert.equal(res.body.isAvailable, true)
  restore()
})

test('reads is_available from the top level, not from the balance entry', async () => {
  // The documented location is a sibling of balance_infos. A flag nested in the
  // entry is not a signal, and the top-level false must survive.
  const { routes, restore } = build({
    credentials: { resolve: async () => ({ value: 'k' }) },
    fetchImpl: async () => ok({
      is_available: false,
      balance_infos: [{ currency: 'USD', total_balance: '5.00', granted_balance: '0', topped_up_balance: '5.00', is_available: true }],
    }),
  })
  const res = await call(routes.get('/plugins/billing-badge/balance'), { headers: { 'x-dsh-billing-badge': '1' } })
  assert.equal(res.body.isAvailable, false)
  restore()
})

test('a response with no balance_infos entry degrades to a renderable state', async () => {
  const { routes, restore } = build({
    credentials: { resolve: async () => ({ value: 'k' }) },
    fetchImpl: async () => ok({ is_available: false, balance_infos: [] }),
  })
  const res = await call(routes.get('/plugins/billing-badge/balance'), { headers: { 'x-dsh-billing-badge': '1' } })
  assert.equal(res.body.ok, false)
  assert.equal(res.body.state, 'empty')
  restore()
})

test('reports a missing credential instead of throwing', async () => {
  const { routes, restore } = build({ credentials: { resolve: async () => undefined } })
  const res = await call(routes.get('/plugins/billing-badge/balance'), { headers: { 'x-dsh-billing-badge': '1' } })
  assert.equal(res.status, 200)
  assert.equal(res.body.ok, false)
  assert.equal(res.body.state, 'no-credential')
  restore()
})

test('falls back to the environment when the credential seam has nothing', async () => {
  let seen = null
  const { routes, restore } = build({
    credentials: { resolve: async () => { throw new Error('no store') } },
    env: 'from-env',
    fetchImpl: async (_url, init) => {
      seen = init.headers.authorization
      return ok({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: 7, granted_balance: 1, topped_up_balance: 6 }] })
    },
  })
  const res = await call(routes.get('/plugins/billing-badge/balance'), { headers: { 'x-dsh-billing-badge': '1' } })
  assert.equal(seen, 'Bearer from-env')
  assert.equal(res.body.currency, 'CNY')
  assert.equal(res.body.total, 7)
  restore()
})

test('an HTTP failure degrades to a state the chip can render', async () => {
  const { routes, restore } = build({
    credentials: { resolve: async () => ({ value: 'k' }) },
    fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'unauthorized' }),
  })
  const res = await call(routes.get('/plugins/billing-badge/balance'), { headers: { 'x-dsh-billing-badge': '1' } })
  assert.equal(res.body.ok, false)
  assert.equal(res.body.state, 'error')
  assert.match(res.body.error, /401/)
  restore()
})

test('the host half never writes to disk and never imports a filesystem module', () => {
  assert.doesNotMatch(source, /node:fs|writeFile|appendFile|mkdir/)
  assert.match(source, /api\.deepseek\.com\/user\/balance/, 'the only network destination')
})
