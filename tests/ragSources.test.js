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
  assert.equal(first.topic_document_matches, null)
  assert.equal(first.topic_original_question, '')
  assert.equal(first.topic_loading, false)
  assert.equal(first.topic_error, '')
  assert.equal(first.profile_mention_matches, null)
  assert.equal(first.exact_content_matches, null)
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
      topic_document_matches: null,
      profile_mention_matches: null,
      exact_content_matches: null,
      topic_original_question: '',
      topic_loading: false,
      topic_error: '',
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
      topic_document_matches: null,
      profile_mention_matches: null,
      exact_content_matches: null,
      topic_original_question: '',
      topic_loading: false,
      topic_error: '',
      sourcesHistoryError: '来源已过期，请重新提问',
      sourcesError: '来源已过期，请重新提问',
    },
  )
})

test('keeps the initial chat request free of topic pagination fields', () => {
  const buildChatStreamPayload = getHelper('buildChatStreamPayload')

  assert.deepStrictEqual(buildChatStreamPayload('user-a', 'topic question'), {
    user_id: 'user-a',
    question: 'topic question',
  })
})

test('builds a topic pagination request with the cursor fields', () => {
  const buildChatStreamPayload = getHelper('buildChatStreamPayload')

  assert.deepStrictEqual(buildChatStreamPayload('user-a', 'topic question', {
    topicLimit: 20,
    topicCursor: ' cursor-a ',
  }), {
    user_id: 'user-a',
    question: 'topic question',
    topic_limit: 20,
    topic_cursor: 'cursor-a',
  })
})

test('does not add topic pagination fields when the cursor is empty', () => {
  const buildChatStreamPayload = getHelper('buildChatStreamPayload')

  assert.deepStrictEqual(buildChatStreamPayload('user-a', 'topic question', {
    topicLimit: 20,
    topicCursor: '  ',
  }), {
    user_id: 'user-a',
    question: 'topic question',
  })
})

test('treats an object topic page as topic mode but keeps null and missing legacy responses ordinary', () => {
  const isTopicDocumentMatchesResponse = getHelper('isTopicDocumentMatchesResponse')

  assert.equal(isTopicDocumentMatchesResponse({ topic_document_matches: { items: [] } }), true)
  assert.equal(isTopicDocumentMatchesResponse({ topic_document_matches: null }), false)
  assert.equal(isTopicDocumentMatchesResponse({ sources: [] }), false)
})

test('preserves topic, profile mention, exact content, and ordinary source fields independently', () => {
  const getSourcesHistoryState = getHelper('getSourcesHistoryState')
  const state = getSourcesHistoryState({
    request_id: 'structured-1',
    context_request_id: 'structured-1',
    sources: [],
    topic_document_matches: {
      query_term: '数据库系统',
      topic: { topic_code: 'database_systems', topic_label: '数据库系统' },
      match_kind: 'formal',
      items: [{ document_id: 'doc-topic', filename: 'topic.pdf', topics: [] }],
      has_more: false,
      next_cursor: null,
    },
    profile_mention_matches: {
      query_term: '向量检索',
      topic: { topic_code: 'vector_retrieval', topic_label: '向量检索' },
      match_kind: 'mention',
      items: [{ document_id: 'doc-profile', filename: 'profile.pdf', topics: [] }],
      has_more: false,
      next_cursor: null,
    },
    exact_content_matches: {
      query_term: '精确短语',
      items: [{
        document_id: 'doc-exact',
        filename: 'exact.pdf',
        document_type: 'document',
        evidence: [{
          page: 3,
          section: '摘要',
          chunk_index: 4,
          content_preview: '精确短语上下文',
          content_truncated: true,
        }],
      }],
      has_more: false,
      next_cursor: null,
    },
  }, 'structured-1')

  assert.equal(state.topic_document_matches.items[0].document_id, 'doc-topic')
  assert.equal(state.profile_mention_matches.items[0].document_id, 'doc-profile')
  assert.equal(state.exact_content_matches.items[0].evidence[0].content_preview, '精确短语上下文')
  assert.deepStrictEqual(state.sources, [])
})

test('prefers exact content previews and truncates legacy content fallback to 300 characters', () => {
  const getExactContentPreview = getHelper('getExactContentPreview')
  const legacyContent = '甲'.repeat(301)

  assert.equal(
    getExactContentPreview({ content_preview: '后端预览', content: '旧正文' }),
    '后端预览',
  )
  assert.equal(
    getExactContentPreview({ content: legacyContent }),
    `${'甲'.repeat(300)}...`,
  )
  assert.equal(getExactContentPreview({ content: '' }), '')
})

test('prefers backend exact match counts and falls back to the item array length', () => {
  const getExactContentMatchCounts = getHelper('getExactContentMatchCounts')

  assert.deepStrictEqual(
    getExactContentMatchCounts({
      items: [{}, {}],
      matched_chunk_count: 7,
      displayed_evidence_count: 5,
      omitted_evidence_count: 2,
    }),
    {
      matched_chunk_count: 7,
      displayed_evidence_count: 5,
      omitted_evidence_count: 2,
    },
  )
  assert.deepStrictEqual(
    getExactContentMatchCounts({ items: [{}, {}] }),
    {
      matched_chunk_count: 2,
      displayed_evidence_count: 2,
      omitted_evidence_count: 2,
    },
  )
  assert.deepStrictEqual(
    getExactContentMatchCounts({ items: [] }),
    {
      matched_chunk_count: 0,
      displayed_evidence_count: 0,
      omitted_evidence_count: 0,
    },
  )
})

test('keeps an ordinary empty snapshot distinct when all structured results are null', () => {
  const getSourcesHistoryState = getHelper('getSourcesHistoryState')

  const state = getSourcesHistoryState({
    request_id: 'ordinary-empty',
    context_request_id: 'ordinary-empty',
    sources: [],
    source_groups: [],
    topic_document_matches: null,
    profile_mention_matches: null,
    exact_content_matches: null,
  }, 'ordinary-empty')

  assert.equal(state.topic_document_matches, null)
  assert.equal(state.profile_mention_matches, null)
  assert.equal(state.exact_content_matches, null)
  assert.deepStrictEqual(state.sources, [])
  assert.deepStrictEqual(state.source_groups, [])
})

test('deduplicates structured document pages by document_id and keeps same-name documents', () => {
  const normalizeTopicDocumentMatches = getHelper('normalizeTopicDocumentMatches')
  const normalizeExactContentMatches = getHelper('normalizeExactContentMatches')

  const normalized = normalizeTopicDocumentMatches({
    items: [
      { document_id: 'doc-a', filename: 'same.pdf' },
      { document_id: 'doc-a', filename: 'same.pdf' },
      { document_id: 'doc-b', filename: 'same.pdf' },
    ],
  })

  assert.deepStrictEqual(normalized.items.map(item => item.document_id), ['doc-a', 'doc-b'])

  const exactNormalized = normalizeExactContentMatches({
    items: [
      { document_id: 'doc-a', filename: 'same.pdf', evidence: [{ page: 1 }] },
      { document_id: 'doc-a', filename: 'same.pdf', evidence: [{ page: 2 }] },
      { document_id: 'doc-b', filename: 'same.pdf', evidence: [{ page: 3 }] },
    ],
  })

  assert.deepStrictEqual(exactNormalized.items.map(item => item.document_id), ['doc-a', 'doc-b'])
  assert.deepStrictEqual(
    exactNormalized.items[0].evidence.map(evidence => evidence.page),
    [1, 2],
  )

  const directExact = normalizeExactContentMatches({
    items: [{
      document_id: 'doc-direct',
      filename: 'direct.pdf',
      page: 7,
      section: '正文',
      chunk_index: 2,
      content_preview: 'direct match',
      content_truncated: false,
    }],
  })

  assert.equal(directExact.items[0].content_preview, 'direct match')
})

test('keeps an exact document with empty evidence for the panel empty state', () => {
  const normalizeExactContentMatches = getHelper('normalizeExactContentMatches')

  const normalized = normalizeExactContentMatches({
    items: [{
      document_id: 'doc-empty',
      filename: 'empty.pdf',
      evidence: [],
    }],
  })

  assert.equal(normalized.items.length, 1)
  assert.equal(normalized.items[0].document_id, 'doc-empty')
  assert.deepStrictEqual(normalized.items[0].evidence, [])
})

test('normalizes current and legacy topic page field names without changing item order', () => {
  const normalizeTopicDocumentMatches = getHelper('normalizeTopicDocumentMatches')

  const normalized = normalizeTopicDocumentMatches({
    query_term: 'database',
    topic: { topic_code: 'db', topic_label: 'Database' },
    items: [
      { document_id: 'doc-a', topics: [{ topic_role: 'primary' }] },
      { document_id: 'doc-b', matched_topics: [{ topic_role: 'secondary' }] },
    ],
    has_more: true,
    next_cursor: 'cursor-a',
  })

  assert.equal(normalized.query, 'database')
  assert.equal(normalized.query_term, 'database')
  assert.deepStrictEqual(normalized.topic, { topic_code: 'db', topic_label: 'Database' })
  assert.deepStrictEqual(normalized.items.map(item => item.document_id), ['doc-a', 'doc-b'])
  assert.deepStrictEqual(normalized.items[0].matched_topics, [{ topic_role: 'primary' }])
  assert.deepStrictEqual(normalized.items[1].matched_topics, [{ topic_role: 'secondary' }])
  assert.equal(normalized.has_more, true)
  assert.equal(normalized.next_cursor, 'cursor-a')
})

test('merges topic pages by document id while preserving backend order', () => {
  const mergeTopicDocumentMatches = getHelper('mergeTopicDocumentMatches')

  const merged = mergeTopicDocumentMatches(
    {
      query: 'db',
      topic: null,
      items: [
        { document_id: 'doc-a', filename: 'same.pdf' },
        { document_id: 'doc-b', filename: 'same.pdf' },
      ],
      has_more: true,
      next_cursor: 'cursor-b',
    },
    {
      query: 'db',
      topic: null,
      items: [
        { document_id: 'doc-b', filename: 'same.pdf' },
        { document_id: 'doc-c', filename: 'same.pdf' },
      ],
      has_more: false,
      next_cursor: null,
    },
  )

  assert.deepStrictEqual(merged.items.map(item => item.document_id), ['doc-a', 'doc-b', 'doc-c'])
  assert.equal(merged.has_more, false)
  assert.equal(merged.next_cursor, null)
})

test('keeps a topic page with no topic or items distinct from ordinary RAG state', () => {
  const getSourcesHistoryState = getHelper('getSourcesHistoryState')

  const state = getSourcesHistoryState({
    request_id: 'rag-topic',
    context_request_id: 'rag-topic',
    topic_document_matches: {
      query: 'missing topic',
      topic: null,
      items: [],
      has_more: false,
      next_cursor: null,
    },
  }, 'rag-topic')

  assert.ok(state.topic_document_matches)
  assert.deepStrictEqual(state.topic_document_matches.items, [])
  assert.deepStrictEqual(state.sources, [])
  assert.deepStrictEqual(state.source_groups, [])
})

test('allows loading more only for a non-empty cursor and a non-loading topic page', () => {
  const canLoadMoreTopicDocuments = getHelper('canLoadMoreTopicDocuments')

  assert.equal(canLoadMoreTopicDocuments({ has_more: true, next_cursor: 'cursor-a' }, false), true)
  assert.equal(canLoadMoreTopicDocuments({ has_more: false, next_cursor: 'cursor-a' }, false), false)
  assert.equal(canLoadMoreTopicDocuments({ has_more: true, next_cursor: '' }, false), false)
  assert.equal(canLoadMoreTopicDocuments({ has_more: true, next_cursor: 'cursor-a' }, true), false)
})

test('marks source history HTTP failures separately from ordinary RAG state', () => {
  const createSourcesHistoryErrorState = getHelper('createSourcesHistoryErrorState')

  const errorState = createSourcesHistoryErrorState(404)

  assert.equal(errorState.sourcesHistoryError, '来源暂不可用：来源快照不存在')
  assert.equal(errorState.topic_document_matches, null)
  assert.deepStrictEqual(errorState.sources, [])
})
