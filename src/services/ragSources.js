export const RAG_REQUEST_ID_HEADER = 'X-RAG-Request-ID'

export const TOPIC_PAGE_LIMIT = 20

const EXACT_CONTENT_PREVIEW_LIMIT = 300

const SOURCE_SNAPSHOT_ERROR_MESSAGES = Object.freeze({
  400: '来源暂不可用：当前回答没有可用来源标识',
  403: '来源暂不可用：来源快照不属于当前用户',
  404: '来源暂不可用：来源快照不存在',
  410: '来源已过期，请重新提问',
  503: '来源服务暂不可用，请稍后重试',
})

const SOURCE_SNAPSHOT_MISMATCH_MESSAGE = '来源暂不可用：来源快照与当前回答不一致'

const EVIDENCE_STATUS_LABELS = Object.freeze({
  supported: '已找到证据',
  not_found: '无相关证据',
  insufficient: '证据不足',
  ambiguous: '证据存在歧义',
})

const normalizeText = (value) => {
  if (value === null || value === undefined) {
    return ''
  }

  return String(value).trim()
}

const isPlainObject = (value) => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
)

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const getChunkIdentity = (source) => {
  const chunkId = normalizeText(source?.chunk_id)
  if (chunkId) {
    return `chunk:${chunkId}`
  }

  const contentHash = normalizeText(source?.content_sha256)
  return contentHash ? `hash:${contentHash}` : ''
}

const sortChunks = (sources) => {
  return sources
    .map((source, originalIndex) => ({ source, originalIndex }))
    .sort((left, right) => {
      const leftEvidenceOrder = toFiniteNumber(left.source?.evidence_order)
      const rightEvidenceOrder = toFiniteNumber(right.source?.evidence_order)
      const leftValue = leftEvidenceOrder ?? toFiniteNumber(left.source?.chunk_index)
      const rightValue = rightEvidenceOrder ?? toFiniteNumber(right.source?.chunk_index)

      if (leftValue === null && rightValue === null) {
        return left.originalIndex - right.originalIndex
      }
      if (leftValue === null) {
        return 1
      }
      if (rightValue === null) {
        return -1
      }
      if (leftValue !== rightValue) {
        return leftValue - rightValue
      }

      return left.originalIndex - right.originalIndex
    })
    .map(({ source }) => source)
}

const deduplicateAndSortChunks = (sources) => {
  const seenIdentities = new Set()
  const retainedSources = []

  for (const source of sources) {
    const identity = getChunkIdentity(source)
    if (identity && seenIdentities.has(identity)) {
      continue
    }

    if (identity) {
      seenIdentities.add(identity)
    }
    retainedSources.push(source)
  }

  return sortChunks(retainedSources)
}

const getGroupDocumentId = (group, source) => {
  return normalizeText(source?.document_id) || normalizeText(group?.document_id)
}

/**
 * Normalize source groups without changing the original source objects.
 * @param {Array<Object>} sourceGroups
 * @param {Array<Object>} sources
 * @returns {Array<{key: string, document_id: string, filename: string, sources: Array<Object>}>}
 */
export const normalizeSourceGroups = (sourceGroups, sources) => {
  const candidateGroups = Array.isArray(sourceGroups) ? sourceGroups : []
  const usableGroups = candidateGroups.filter(group => (
    Array.isArray(group?.sources) && group.sources.length > 0
  ))
  const records = usableGroups.length
    ? usableGroups.flatMap((group, groupIndex) => group.sources.map((source, sourceIndex) => ({
      group,
      source,
      sourceIndex: `${groupIndex}:${sourceIndex}`,
    })))
    : (Array.isArray(sources) ? sources : []).map((source, sourceIndex) => ({
      group: null,
      source,
      sourceIndex: String(sourceIndex),
    }))
  const normalizedGroups = new Map()

  for (const record of records) {
    const documentId = getGroupDocumentId(record.group, record.source)
    const key = documentId ? `document:${documentId}` : `missing:${record.sourceIndex}`
    let normalizedGroup = normalizedGroups.get(key)

    if (!normalizedGroup) {
      normalizedGroup = {
        key,
        document_id: documentId,
        filename: normalizeText(record.group?.filename) || normalizeText(record.source?.filename),
        sources: [],
      }
      normalizedGroups.set(key, normalizedGroup)
    }

    if (!normalizedGroup.filename) {
      normalizedGroup.filename = normalizeText(record.source?.filename)
    }
    normalizedGroup.sources.push(record.source)
  }

  return Array.from(normalizedGroups.values()).map(group => ({
    ...group,
    sources: deduplicateAndSortChunks(group.sources),
  }))
}

/** @param {Array<Object>} summarySources */
export const normalizeSummarySources = (summarySources) => {
  if (!Array.isArray(summarySources)) {
    return []
  }

  return summarySources.flatMap((summarySource) => {
    if (!summarySource || !Array.isArray(summarySource.sources)) {
      return summarySource ? [summarySource] : []
    }

    return summarySource.sources.map(source => ({
      ...source,
      document_id: source.document_id || summarySource.document_id,
      filename: source.filename || summarySource.filename,
    }))
  })
}

export const canShowFinalSources = (evidenceStatus, sources) => (
  evidenceStatus === 'supported' && Array.isArray(sources) && sources.length > 0
)

export const getEvidenceStatusLabel = (status) => {
  return EVIDENCE_STATUS_LABELS[status] || '未知状态'
}

export const getFileFormatLabel = (filename) => {
  const normalizedFilename = normalizeText(filename)
  const extensionIndex = normalizedFilename.lastIndexOf('.')

  if (extensionIndex <= 0 || extensionIndex === normalizedFilename.length - 1) {
    return '未知格式'
  }

  return normalizedFilename.slice(extensionIndex + 1).toUpperCase()
}

/**
 * Build the request sent to /chat_stream.
 * Topic fields are intentionally available only when a non-empty cursor is
 * supplied, so the initial request remains indistinguishable from ordinary
 * RAG at the request boundary.
 */
export const buildChatStreamPayload = (
  userId,
  question,
  { topicLimit, topicCursor } = {},
) => {
  const payload = {
    user_id: userId,
    question,
  }
  const normalizedCursor = normalizeText(topicCursor)

  if (!normalizedCursor) {
    return payload
  }

  const normalizedLimit = Number.isInteger(topicLimit) && topicLimit > 0
    ? topicLimit
    : TOPIC_PAGE_LIMIT

  return {
    ...payload,
    topic_limit: normalizedLimit,
    topic_cursor: normalizedCursor,
  }
}

export const isTopicDocumentMatchesResponse = (data) => (
  isPlainObject(data) &&
  Object.prototype.hasOwnProperty.call(data, 'topic_document_matches') &&
  isPlainObject(data.topic_document_matches)
)

const normalizeTopicItem = (item) => {
  if (!isPlainObject(item)) {
    return item
  }

  const matchedTopics = Array.isArray(item.matched_topics)
    ? item.matched_topics
    : Array.isArray(item.topics)
      ? item.topics
      : []

  return {
    ...item,
    matched_topics: matchedTopics,
    topics: Array.isArray(item.topics) ? item.topics : matchedTopics,
  }
}

const deduplicateStructuredItems = (items) => {
  const seenDocumentIds = new Set()

  return items.filter((item) => {
    const documentId = normalizeText(item?.document_id)
    if (!documentId) {
      return true
    }
    if (seenDocumentIds.has(documentId)) {
      return false
    }
    seenDocumentIds.add(documentId)
    return true
  })
}

/**
 * Normalize the P11 topic page while preserving backend item order.
 * The current backend uses query_term/topics; the frontend contract uses
 * query/matched_topics, so both names remain available to the panel.
 */
export const normalizeTopicDocumentMatches = (value) => {
  if (!isPlainObject(value)) {
    return null
  }

  const query = normalizeText(value.query || value.query_term)
  const queryTerm = normalizeText(value.query_term || query)
  const topic = isPlainObject(value.topic) ? { ...value.topic } : null
  const items = Array.isArray(value.items)
    ? deduplicateStructuredItems(value.items.map(normalizeTopicItem))
    : []
  const nextCursor = normalizeText(value.next_cursor)

  return {
    ...value,
    query,
    query_term: queryTerm,
    topic,
    items,
    has_more: value.has_more === true,
    next_cursor: nextCursor || null,
  }
}

const hasDirectExactEvidence = (item) => (
  isPlainObject(item) && [
    'page',
    'section',
    'chunk_index',
    'content_preview',
    'content',
    'content_truncated',
    'chunk_id',
  ].some(field => item[field] !== null && item[field] !== undefined)
)

const getExactItemEvidence = (item) => {
  if (!isPlainObject(item)) {
    return []
  }

  if (Array.isArray(item.evidence) && item.evidence.length > 0) {
    return item.evidence
  }

  return hasDirectExactEvidence(item) ? [item] : []
}

const normalizeExactItem = (item) => {
  if (!isPlainObject(item)) {
    return item
  }

  return {
    ...item,
    evidence: Array.isArray(item.evidence) ? item.evidence : [],
  }
}

const mergeExactItemsByDocumentId = (items) => {
  const groups = []
  const groupsByDocumentId = new Map()

  for (const item of items) {
    const documentId = normalizeText(item?.document_id)
    if (!documentId || !isPlainObject(item)) {
      groups.push(item)
      continue
    }

    const evidence = getExactItemEvidence(item)
    let group = groupsByDocumentId.get(documentId)

    if (!group) {
      group = {
        ...item,
        evidence: [...evidence],
      }
      groupsByDocumentId.set(documentId, group)
      groups.push(group)
      continue
    }

    group.evidence.push(...evidence)
  }

  return groups
}

export const getExactContentPreview = (evidence) => {
  const preview = evidence?.content_preview
  if (typeof preview === 'string' && preview.trim()) {
    return preview
  }

  const content = evidence?.content
  if (typeof content !== 'string' || !content) {
    return ''
  }

  return `${Array.from(content).slice(0, EXACT_CONTENT_PREVIEW_LIMIT).join('')}...`
}

const normalizeCount = (value) => {
  const count = toFiniteNumber(value)
  return count !== null && count >= 0 ? Math.trunc(count) : null
}

export const getExactContentMatchCounts = (value) => {
  const items = Array.isArray(value?.items) ? value.items : []
  const fallbackCount = items.length

  return {
    matched_chunk_count: normalizeCount(value?.matched_chunk_count) ?? fallbackCount,
    displayed_evidence_count: normalizeCount(value?.displayed_evidence_count) ?? fallbackCount,
    omitted_evidence_count: normalizeCount(value?.omitted_evidence_count) ?? fallbackCount,
  }
}

export const normalizeExactContentMatches = (value) => {
  if (!isPlainObject(value)) {
    return null
  }

  const query = normalizeText(value.query || value.query_term)
  const queryTerm = normalizeText(value.query_term || query)
  const items = Array.isArray(value.items)
    ? mergeExactItemsByDocumentId(value.items.map(normalizeExactItem))
    : []

  return {
    ...value,
    query,
    query_term: queryTerm,
    items,
    has_more: value.has_more === true,
    next_cursor: normalizeText(value.next_cursor) || null,
  }
}

const normalizeStructuredPage = (data, field, normalizer) => (
  isPlainObject(data) && isPlainObject(data[field])
    ? normalizer(data[field])
    : null
)

/**
 * Merge topic pages in server order. Document identity is document_id only;
 * filenames are deliberately not part of the deduplication key.
 */
export const mergeTopicDocumentMatches = (previous, next) => {
  const previousPage = normalizeTopicDocumentMatches(previous) || {
    query: '',
    query_term: '',
    topic: null,
    items: [],
    has_more: false,
    next_cursor: null,
  }
  const nextPage = normalizeTopicDocumentMatches(next) || {
    query: '',
    query_term: '',
    topic: null,
    items: [],
    has_more: false,
    next_cursor: null,
  }
  const seenDocumentIds = new Set()
  const items = []

  for (const item of [...previousPage.items, ...nextPage.items]) {
    const documentId = normalizeText(item?.document_id)
    if (documentId) {
      if (seenDocumentIds.has(documentId)) {
        continue
      }
      seenDocumentIds.add(documentId)
    }
    items.push(item)
  }

  return {
    ...previousPage,
    ...nextPage,
    query: nextPage.query || previousPage.query,
    query_term: nextPage.query_term || previousPage.query_term || nextPage.query,
    topic: nextPage.topic || previousPage.topic || null,
    items,
    has_more: nextPage.has_more,
    next_cursor: nextPage.next_cursor,
  }
}

export const canLoadMoreTopicDocuments = (matches, loading = false) => (
  !loading &&
  isPlainObject(matches) &&
  matches.has_more === true &&
  Boolean(normalizeText(matches.next_cursor))
)

/**
 * @typedef {Object} AssistantMessage
 * @property {'assistant'} role
 * @property {string} content
 * @property {string} request_id
 * @property {string} context_request_id
 * @property {string|null} evidence_status
 * @property {Array<Object>} sources
 * @property {Array<Object>} source_groups
 * @property {Array<Object>} summary_sources
 * @property {Array<Object>} candidate_preview
 * @property {Object|null} topic_document_matches
 * @property {Object|null} profile_mention_matches
 * @property {Object|null} exact_content_matches
 * @property {string} topic_original_question
 * @property {boolean} topic_loading
 * @property {string} topic_error
 * @property {string} sourcesHistoryError
 * @property {Object} trace
 * @property {boolean} sourcesLoading
 * @property {string} sourcesError
 */

/** @returns {AssistantMessage} */
export const createAssistantMessage = () => ({
  role: 'assistant',
  content: '',
  request_id: '',
  context_request_id: '',
  evidence_status: null,
  sources: [],
  source_groups: [],
  summary_sources: [],
  candidate_preview: [],
  topic_document_matches: null,
  profile_mention_matches: null,
  exact_content_matches: null,
  topic_original_question: '',
  topic_loading: false,
  topic_error: '',
  sourcesHistoryError: '',
  trace: {},
  sourcesLoading: false,
  sourcesError: '',
})

export const getRequestIdFromResponse = (response) => {
  const requestId = response?.headers?.get?.(RAG_REQUEST_ID_HEADER)

  return typeof requestId === 'string' ? requestId.trim() : ''
}

export const buildSourcesHistoryPayload = (userId, requestId) => {
  const normalizedRequestId = typeof requestId === 'string' ? requestId.trim() : ''

  if (!normalizedRequestId) {
    return null
  }

  return {
    user_id: userId,
    request_id: normalizedRequestId,
  }
}

export const isCurrentSourcesSnapshot = (data, assistantRequestId) => {
  const normalizedRequestId = typeof assistantRequestId === 'string' ? assistantRequestId.trim() : ''

  return Boolean(
    normalizedRequestId &&
      data?.request_id === normalizedRequestId &&
      data?.context_request_id === normalizedRequestId,
  )
}

export const getSourcesHistoryState = (data, assistantRequestId) => {
  if (!isCurrentSourcesSnapshot(data, assistantRequestId)) {
    return {
      context_request_id: '',
      evidence_status: null,
      sources: [],
      source_groups: [],
      summary_sources: [],
      candidate_preview: [],
      topic_document_matches: null,
      profile_mention_matches: null,
      exact_content_matches: null,
      topic_original_question: '',
      topic_loading: false,
      topic_error: '',
      sourcesHistoryError: SOURCE_SNAPSHOT_MISMATCH_MESSAGE,
      trace: {},
      sourcesError: SOURCE_SNAPSHOT_MISMATCH_MESSAGE,
    }
  }

  return {
    context_request_id: data.context_request_id,
    evidence_status: data.evidence_status ?? null,
    sources: Array.isArray(data.sources) ? data.sources : [],
    source_groups: Array.isArray(data.source_groups) ? data.source_groups : [],
    summary_sources: Array.isArray(data.summary_sources) ? data.summary_sources : [],
    candidate_preview: Array.isArray(data.candidate_preview) ? data.candidate_preview : [],
    topic_document_matches: isTopicDocumentMatchesResponse(data)
      ? normalizeTopicDocumentMatches(data.topic_document_matches)
      : null,
    profile_mention_matches: normalizeStructuredPage(
      data,
      'profile_mention_matches',
      normalizeTopicDocumentMatches,
    ),
    exact_content_matches: normalizeStructuredPage(
      data,
      'exact_content_matches',
      normalizeExactContentMatches,
    ),
    topic_original_question: '',
    topic_loading: false,
    topic_error: '',
    trace: data.trace ?? {},
    sourcesError: '',
  }
}

export const getSourcesHistoryErrorMessage = (status) => {
  return SOURCE_SNAPSHOT_ERROR_MESSAGES[status] || '来源暂不可用，请稍后重试'
}

export const createSourcesHistoryErrorState = (status) => ({
  context_request_id: '',
  evidence_status: null,
  sources: [],
  source_groups: [],
  summary_sources: [],
  candidate_preview: [],
  topic_document_matches: null,
  profile_mention_matches: null,
  exact_content_matches: null,
  topic_original_question: '',
  topic_loading: false,
  topic_error: '',
  sourcesHistoryError: getSourcesHistoryErrorMessage(status),
  trace: {},
  sourcesError: getSourcesHistoryErrorMessage(status),
})
