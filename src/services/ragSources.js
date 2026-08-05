export const RAG_REQUEST_ID_HEADER = 'X-RAG-Request-ID'

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
  trace: {},
  sourcesError: getSourcesHistoryErrorMessage(status),
})
