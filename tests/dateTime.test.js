import assert from 'node:assert/strict'
import test from 'node:test'

import { formatDateTime } from '../src/utils/dateTime.js'

test('formats ISO timestamps as YYYY-MM-DD HH:mm:ss in the app timezone', () => {
  assert.equal(
    formatDateTime('2026-08-10T21:35:09.035497+08:00'),
    '2026-08-10 21:35:09',
  )
})

test('preserves invalid timestamps and supports a missing-value fallback', () => {
  assert.equal(formatDateTime('not-a-date'), 'not-a-date')
  assert.equal(formatDateTime('', '时间未知'), '时间未知')
})
