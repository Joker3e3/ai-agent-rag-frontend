import assert from 'node:assert/strict'
import test from 'node:test'

const helpers = await import('../src/services/ragChatCommands.js').catch(() => null)

const getHelper = (name) => {
  assert.ok(helpers, 'ragChatCommands service is not available yet')
  assert.equal(typeof helpers[name], 'function', `${name} is not exported yet`)
  return helpers[name]
}

test('recognizes reset from X-RAG-Command with case-insensitive headers', () => {
  const getRagCommandFromResponse = getHelper('getRagCommandFromResponse')

  assert.equal(getRagCommandFromResponse({
    headers: { 'x-rag-command': ' RESET ' },
  }), 'reset')
  assert.equal(getRagCommandFromResponse({
    headers: {
      get: (name) => name === 'X-RAG-Command' ? ' Reset ' : null,
    },
  }), 'reset')
})

test('parses and validates the reset JSON response', async () => {
  const parseResetResponse = getHelper('parseResetResponse')

  const data = await parseResetResponse({
    ok: true,
    json: async () => ({ command: 'reset', context_reset: true }),
  })
  assert.deepStrictEqual(data, { command: 'reset', context_reset: true })

  await assert.rejects(
    parseResetResponse({
      ok: true,
      json: async () => ({ command: 'reset', context_reset: false }),
    }),
  )
})

test('creates a reset confirmation with no reusable source state', () => {
  const createResetConfirmationMessage = getHelper('createResetConfirmationMessage')
  const message = createResetConfirmationMessage()

  assert.equal(message.content, '上下文已清理，可以开始新的对话。')
  assert.equal(message.request_id, '')
  assert.equal(message.context_request_id, '')
  assert.deepStrictEqual(message.sources, [])
  assert.deepStrictEqual(message.source_groups, [])
  assert.deepStrictEqual(message.summary_sources, [])
  assert.deepStrictEqual(message.candidate_preview, [])
  assert.deepStrictEqual(message.trace, {})
  assert.equal(message.sourcesError, '')
})
