import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isPeak,
  nextFlip,
  formatCountdown,
  beijingClock,
  describePhase,
  BEIJING_OFFSET_MS,
} from '../lib/season.js'

/**
 * A wall-clock instant in Beijing time, as an absolute Date.
 * 2026-09-05 is a Saturday, 2026-09-07 a Monday, 2026-09-14 a Monday.
 */
const bj = (month, day, hh, mm = 0) =>
  new Date(Date.UTC(2026, month - 1, day, hh, mm) - BEIJING_OFFSET_MS)

const HOUR = 60 * 60 * 1000

// ---------- the season rule ----------

test('peak windows on a weekday', () => {
  assert.equal(isPeak(bj(9, 7, 8, 59)), false, 'Monday 08:59 is off-peak')
  assert.equal(isPeak(bj(9, 7, 9, 0)), true, 'Monday 09:00 opens the peak window')
  assert.equal(isPeak(bj(9, 7, 11, 59)), true)
  assert.equal(isPeak(bj(9, 7, 12, 0)), false, 'Monday 12:00 closes the morning window')
  assert.equal(isPeak(bj(9, 7, 13, 59)), false)
  assert.equal(isPeak(bj(9, 7, 14, 0)), true, 'Monday 14:00 opens the afternoon window')
  assert.equal(isPeak(bj(9, 7, 17, 59)), true)
  assert.equal(isPeak(bj(9, 7, 18, 0)), false, 'Monday 18:00 closes the day')
  assert.equal(isPeak(bj(9, 7, 23, 59)), false)
})

test('weekends are off-peak all day, including inside the window hours', () => {
  for (const [month, day, label] of [[9, 5, 'Saturday'], [9, 6, 'Sunday'], [9, 12, 'Saturday'], [9, 13, 'Sunday']]) {
    for (const hh of [9, 10, 11, 14, 15, 16, 17]) {
      assert.equal(isPeak(bj(month, day, hh, 30)), false, `${label} ${hh}:30 must be off-peak`)
    }
  }
})

// ---------- the countdown target ----------

test('Friday evening points at Monday 09:00, not Saturday 09:00', () => {
  const friday = bj(9, 11, 18, 30)
  const flip = nextFlip(friday)
  assert.notEqual(flip, null)
  const hours = (flip - friday.getTime()) / HOUR
  assert.equal(hours, 62.5, 'Fri 18:30 to Mon 09:00 is 62.5 hours')
  assert.equal(isPeak(new Date(flip)), true)
  assert.equal(isPeak(new Date(flip - 1)), false)
})

test('Saturday morning points at Monday 09:00 too', () => {
  const saturday = bj(9, 5, 10, 0)
  const flip = nextFlip(saturday)
  assert.equal((flip - saturday.getTime()) / HOUR, 47, 'Sat 10:00 to Mon 09:00 is 47 hours')
})

test('inside a peak window the target is that window closing', () => {
  const flip = nextFlip(bj(9, 7, 12, 30))
  assert.equal(flip, bj(9, 7, 14, 0).getTime(), 'lunch break ends at 14:00')
  assert.equal(isPeak(new Date(flip)), true)
  assert.equal(isPeak(new Date(flip - 1)), false)
})

test('one second before a boundary the target is that boundary', () => {
  const flip = nextFlip(new Date(bj(9, 7, 9, 0).getTime() - 1000))
  assert.equal(flip, bj(9, 7, 9, 0).getTime())
})

test('every returned target really flips the state, scanned across nine days', () => {
  const start = bj(9, 4, 0, 0) // Friday midnight Beijing
  const end = start.getTime() + 9 * 24 * HOUR
  let checked = 0
  for (let t = start.getTime(); t < end; t += 13 * 60 * 1000) {
    const at = new Date(t)
    const flip = nextFlip(at)
    assert.notEqual(flip, null, `no flip found from ${at.toISOString()}`)
    assert.ok(flip > t, `target must be in the future (${at.toISOString()})`)
    assert.notEqual(
      isPeak(new Date(flip)),
      isPeak(new Date(flip - 1)),
      `target ${new Date(flip).toISOString()} must change the state`,
    )
    assert.equal(
      isPeak(new Date(flip - 1)),
      isPeak(at),
      `state must stay constant from ${at.toISOString()} until the target`,
    )
    checked += 1
  }
  assert.ok(checked > 900, `expected a dense scan, got ${checked} samples`)
})

// ---------- formatting and description ----------

test('countdown formatting', () => {
  assert.equal(formatCountdown(2 * HOUR + 13 * 60 * 1000), '2h13m')
  assert.equal(formatCountdown(45 * 60 * 1000), '45m')
  assert.equal(formatCountdown(38 * 1000), '38s')
  assert.equal(formatCountdown(-5), '0s', 'never shows a negative time')
})

test('beijing clock reads the shifted wall time', () => {
  assert.deepEqual(beijingClock(bj(9, 7, 9, 5)), { weekday: 'Monday', clock: '09:05' })
  assert.deepEqual(beijingClock(bj(9, 5, 18, 0)), { weekday: 'Saturday', clock: '18:00' })
})

test('describePhase carries a consistent label, color and countdown', () => {
  const peak = describePhase(bj(9, 7, 10, 0))
  assert.equal(peak.peak, true)
  assert.equal(peak.label, 'Peak')
  assert.equal(peak.countdown, '2h00m')
  assert.equal(peak.color, '#D9A24A')
  const off = describePhase(bj(9, 12, 10, 0))
  assert.equal(off.peak, false)
  assert.equal(off.color, '#57C07C')
  assert.equal(off.countdown, '47h00m')
  assert.match(off.title, /Off-peak/)
})
