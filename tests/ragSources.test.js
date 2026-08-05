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
        summary_sources: [{
          source_kind: 'document_summary',
          document_id: 'document-1',
          filename: 'guide.pdf',
          summary: 'summary content',
          excerpt: 'summary excerpt',
        }],
        evidence_status: 'supported',
        candidate_preview: candidatePreview,
        trace: { selected: 'document-1' },
      },
      'rag-1',
    ),
    {
      context_request_id: 'rag-1',
      sources: [source],
      source_groups: sourceGroups,
      summary_sources: [{
        source_kind: 'document_summary',
        document_id: 'document-1',
        filename: 'guide.pdf',
        summary: 'summary content',
        excerpt: 'summary excerpt',
      }],
      evidence_status: 'supported',
      candidate_preview: candidatePreview,
      trace: { selected: 'document-1' },
      sourcesError: '',
    },
  )
})

test('normalizes source groups by document id with stable chunk order and identity deduplication', () => {
  const normalizeSourceGroups = getHelper('normalizeSourceGroups')

  const groups = normalizeSourceGroups([
    {
      document_id: 'doc-a',
      filename: 'same.pdf',
      sources: [
        { document_id: 'doc-a', filename: 'same.pdf', chunk_id: 'a-2', evidence_order: 2, content: 'a2' },
        { document_id: 'doc-a', filename: 'same.pdf', chunk_id: 'a-1', evidence_order: 1, content: 'a1' },
      ],
    },
    {
      document_id: 'doc-b',
      filename: 'same.pdf',
      sources: [
        { document_id: 'doc-b', filename: 'same.pdf', chunk_id: 'b-1', evidence_order: 1, content: 'b1' },
      ],
    },
  ], [
    { document_id: 'fallback', filename: 'fallback.pdf', chunk_id: 'fallback-1' },
  ])

  assert.deepStrictEqual(groups.map(group => group.document_id), ['doc-a', 'doc-b'])
  assert.deepStrictEqual(groups[0].sources.map(source => source.content), ['a1', 'a2'])
  assert.equal(groups[0].filename, 'same.pdf')
})

test('deduplicates chunks by chunk id, then content hash, without merging same-page chunks', () => {
  const normalizeSourceGroups = getHelper('normalizeSourceGroups')

  const groups = normalizeSourceGroups([], [
    { document_id: 'doc-a', filename: 'same.pdf', page: 2, chunk_id: 'chunk-1', evidence_order: 1, content: 'first' },
    { document_id: 'doc-a', filename: 'same.pdf', page: 2, chunk_id: 'chunk-1', evidence_order: 0, content: 'duplicate chunk' },
    { document_id: 'doc-a', filename: 'same.pdf', page: 2, content_sha256: 'hash-2', chunk_index: 2, content: 'second' },
    { document_id: 'doc-a', filename: 'same.pdf', page: 2, content_sha256: 'hash-2', chunk_index: 3, content: 'duplicate hash' },
    { document_id: 'doc-a', filename: 'same.pdf', page: 2, chunk_index: 4, content: 'third same page' },
  ])

  assert.deepStrictEqual(groups[0].sources.map(source => source.content), [
    'first',
    'second',
    'third same page',
  ])
})

test('keeps source items without document ids as separate synthetic groups', () => {
  const normalizeSourceGroups = getHelper('normalizeSourceGroups')

  const groups = normalizeSourceGroups([], [
    { filename: 'same.pdf', page: 1, content: 'one' },
    { filename: 'same.pdf', page: 1, content: 'two' },
  ])

  assert.equal(groups.length, 2)
  assert.notEqual(groups[0].key, groups[1].key)
})

test('falls back to flat sources only when source groups have no usable chunks', () => {
  const normalizeSourceGroups = getHelper('normalizeSourceGroups')

  const groups = normalizeSourceGroups(
    [{ document_id: 'empty-group', filename: 'empty.pdf', sources: [] }],
    [{ document_id: 'fallback-doc', filename: 'fallback.pdf', chunk_id: 'fallback-1' }],
  )

  assert.deepStrictEqual(groups.map(group => group.document_id), ['fallback-doc'])
})

test('gates ordinary sources by supported status and non-empty top-level sources', () => {
  const canShowFinalSources = getHelper('canShowFinalSources')

  assert.equal(canShowFinalSources('supported', [{ chunk_id: 'chunk-1' }]), true)
  assert.equal(canShowFinalSources('not_found', [{ chunk_id: 'chunk-1' }]), false)
  assert.equal(canShowFinalSources('supported', []), false)
  assert.equal(canShowFinalSources('insufficient', [{ chunk_id: 'chunk-1' }]), false)
})

test('maps evidence status and file extension without inferring business type', () => {
  const getEvidenceStatusLabel = getHelper('getEvidenceStatusLabel')
  const getFileFormatLabel = getHelper('getFileFormatLabel')

  assert.equal(getEvidenceStatusLabel('supported'), '已找到证据')
  assert.equal(getEvidenceStatusLabel('ambiguous'), '证据存在歧义')
  assert.equal(getFileFormatLabel('resume.final.PDF'), 'PDF')
  assert.equal(getFileFormatLabel('README'), '未知格式')
})

test('keeps flat summary sources separate and flattens a defensive grouped shape', () => {
  const normalizeSummarySources = getHelper('normalizeSummarySources')

  const summaries = normalizeSummarySources([
    { source_kind: 'document_summary', document_id: 'doc-a', filename: 'a.pdf', summary: 'A' },
    {
      document_id: 'doc-b',
      filename: 'b.pdf',
      sources: [{ source_kind: 'document_summary', summary: 'B' }],
    },
  ])

  assert.deepStrictEqual(summaries.map(item => item.summary), ['A', 'B'])
  assert.equal(summaries[1].document_id, 'doc-b')
  assert.equal(summaries[1].filename, 'b.pdf')
})

test('clears every source category when sources history fails', () => {
  const createSourcesHistoryErrorState = getHelper('createSourcesHistoryErrorState')

  assert.deepStrictEqual(
    createSourcesHistoryErrorState(410),
    {
      context_request_id: '',
      evidence_status: null,
      sources: [],
      source_groups: [],
      summary_sources: [],
      candidate_preview: [],
      trace: {},
      sourcesError: '来源已过期，请重新提问',
    },
  )
})
