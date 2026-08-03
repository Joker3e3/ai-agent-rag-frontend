import assert from 'node:assert/strict'
import test from 'node:test'

const helpers = await import('../src/services/ragSources.js').catch(() => null)

const getHelper = (name) => {
  assert.ok(helpers, 'ragSources service is not available yet')
  assert.equal(typeof helpers[name], 'function', `${name} is not exported yet`)
  return helpers[name]
}

test('reads a trimmed X-RAG-Request-ID response header', () => {
  const getRequestIdFromResponse = getHelper('getRequestIdFromResponse')
  const response = {
    headers: {
      get: (name) => {
        assert.equal(name, 'X-RAG-Request-ID')
        return '  rag-1  '
      },
    },
  }

  assert.equal(getRequestIdFromResponse(response), 'rag-1')
})

test('builds a sources history payload without question', () => {
  const buildSourcesHistoryPayload = getHelper('buildSourcesHistoryPayload')

  assert.deepStrictEqual(buildSourcesHistoryPayload('test-user', 'rag-1'), {
    user_id: 'test-user',
    request_id: 'rag-1',
  })
})

test('does not build a payload for a missing request id', () => {
  const buildSourcesHistoryPayload = getHelper('buildSourcesHistoryPayload')

  assert.equal(buildSourcesHistoryPayload('test-user', ''), null)
})

test('requires both response ids to match the assistant id', () => {
  const isCurrentSourcesSnapshot = getHelper('isCurrentSourcesSnapshot')

  assert.equal(
    isCurrentSourcesSnapshot({ request_id: 'rag-1', context_request_id: 'rag-1' }, 'rag-1'),
    true,
  )
  assert.equal(
    isCurrentSourcesSnapshot({ request_id: 'rag-1', context_request_id: 'rag-2' }, 'rag-1'),
    false,
  )
  assert.equal(
    isCurrentSourcesSnapshot({ request_id: 'rag-2', context_request_id: 'rag-2' }, 'rag-1'),
    false,
  )
})

test('maps source snapshot statuses without retry semantics', () => {
  const getSourcesHistoryErrorMessage = getHelper('getSourcesHistoryErrorMessage')

  assert.match(getSourcesHistoryErrorMessage(400), /没有可用来源标识/)
  assert.match(getSourcesHistoryErrorMessage(403), /不属于当前用户/)
  assert.match(getSourcesHistoryErrorMessage(404), /不存在/)
  assert.match(getSourcesHistoryErrorMessage(410), /来源已过期，请重新提问/)
  assert.match(getSourcesHistoryErrorMessage(503), /稍后重试/)
})

test('creates independent assistant source state', () => {
  const createAssistantMessage = getHelper('createAssistantMessage')
  const first = createAssistantMessage()
  const second = createAssistantMessage()

  assert.notStrictEqual(first, second)
  assert.equal(first.request_id, '')
  assert.deepStrictEqual(first.sources, [])
  assert.deepStrictEqual(first.source_groups, [])
  assert.deepStrictEqual(first.candidate_preview, [])
  assert.equal(first.context_request_id, '')
})

test('keeps source fields and separates candidate data from final sources', () => {
  const getSourcesHistoryState = getHelper('getSourcesHistoryState')
  const source = {
    filename: 'guide.pdf',
    page: 2,
    content: 'matched content',
    chunk_id: 'chunk-1',
    document_id: 'document-1',
    rerank_score: 0.91,
  }
  const sourceGroups = [{ document_id: 'document-1', sources: [source] }]
  const candidatePreview = [{ filename: 'candidate.pdf' }]

  assert.deepStrictEqual(
    getSourcesHistoryState(
      {
        request_id: 'rag-1',
        context_request_id: 'rag-1',
        sources: [source],
        source_groups: sourceGroups,
        candidate_preview: candidatePreview,
        trace: { selected: 'document-1' },
      },
      'rag-1',
    ),
    {
      context_request_id: 'rag-1',
      sources: [source],
      source_groups: sourceGroups,
      candidate_preview: candidatePreview,
      trace: { selected: 'document-1' },
      sourcesError: '',
    },
  )
})
