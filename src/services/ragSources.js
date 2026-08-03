export const RAG_REQUEST_ID_HEADER = 'X-RAG-Request-ID'

const SOURCE_SNAPSHOT_ERROR_MESSAGES = Object.freeze({
  400: '来源暂不可用：当前回答没有可用来源标识',
  403: '来源暂不可用：来源快照不属于当前用户',
  404: '来源暂不可用：来源快照不存在',
  410: '来源已过期，请重新提问',
  503: '来源服务暂不可用，请稍后重试',
})

const SOURCE_SNAPSHOT_MISMATCH_MESSAGE = '来源暂不可用：来源快照与当前回答不一致'

/**
 * @typedef {Object} AssistantMessage
 * @property {'assistant'} role
 * @property {string} content
 * @property {string} request_id
 * @property {string} context_request_id
 * @property {Array<Object>} sources
 * @property {Array<Object>} source_groups
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
  sources: [],
  source_groups: [],
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
      sources: [],
      source_groups: [],
      candidate_preview: [],
      trace: {},
      sourcesError: SOURCE_SNAPSHOT_MISMATCH_MESSAGE,
    }
  }

  return {
    context_request_id: data.context_request_id,
    sources: Array.isArray(data.sources) ? data.sources : [],
    source_groups: Array.isArray(data.source_groups) ? data.source_groups : [],
    candidate_preview: Array.isArray(data.candidate_preview) ? data.candidate_preview : [],
    trace: data.trace ?? {},
    sourcesError: '',
  }
}

export const getSourcesHistoryErrorMessage = (status) => {
  return SOURCE_SNAPSHOT_ERROR_MESSAGES[status] || '来源暂不可用，请稍后重试'
}
