export const TOPIC_ADMIN_ID = 'TEST_ADMIN_ID'
export const TOPIC_ADMIN_HEADER = 'X-Topic-Admin-ID'

const normalizeText = (value) => String(value ?? '').trim()

const withAdminHeaders = (config = {}) => ({
  ...config,
  headers: {
    ...(config.headers || {}),
    [TOPIC_ADMIN_HEADER]: TOPIC_ADMIN_ID,
  },
})

export const buildTopicReviewPayload = ({
  decision,
  targetTopicCode = '',
  note = '',
} = {}) => ({
  decision,
  target_topic_code: ['merge', 'deprecate'].includes(decision)
    ? normalizeText(targetTopicCode) || null
    : null,
  note: normalizeText(note) || null,
})

export const buildParentRollupPayload = ({
  userId,
  taxonomyVersion,
  documentIds = [],
} = {}) => {
  const payload = {
    user_id: normalizeText(userId),
    taxonomy_version: normalizeText(taxonomyVersion),
  }
  const normalizedIds = [...new Set(
    (Array.isArray(documentIds) ? documentIds : [])
      .map(normalizeText)
      .filter(Boolean),
  )]

  if (normalizedIds.length) {
    payload.document_ids = normalizedIds
  }

  return payload
}

export const normalizeProposalsResponse = (data) => (
  Array.isArray(data?.proposals) ? data.proposals : []
)

export const normalizeRelationsResponse = (data) => ({
  taxonomyVersion: normalizeText(data?.taxonomy_version),
  relations: Array.isArray(data?.relations) ? data.relations : [],
})

export const normalizeRollupsResponse = (data) => {
  const rollups = Array.isArray(data?.items)
    ? data.items
    : (Array.isArray(data?.rollups)
      ? data.rollups
      : (Array.isArray(data) ? data : []))
  const total = Number.isFinite(Number(data?.total)) ? Number(data.total) : rollups.length

  return { rollups, total }
}

const normalizeTopicListResponse = (data) => {
  const topics = Array.isArray(data?.items)
    ? data.items
    : (Array.isArray(data?.topics)
      ? data.topics
      : (Array.isArray(data) ? data : []))
  const total = Number.isFinite(Number(data?.total)) ? Number(data.total) : topics.length

  return {
    taxonomyVersion: normalizeText(data?.taxonomy_version),
    topics,
    total,
  }
}

export const normalizeTopicHistoryResponse = normalizeTopicListResponse
export const normalizeActiveTopicsResponse = normalizeTopicListResponse

const getErrorDetail = (error) => {
  const detail = error?.response?.data?.detail

  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim()
  }

  if (Array.isArray(detail)) {
    return detail
      .map(item => item?.msg || item?.message)
      .filter(Boolean)
      .join('；')
  }

  if (detail && typeof detail === 'object') {
    return String(detail.message || detail.error || '').trim()
  }

  return ''
}

export const getTopicAdminErrorMessage = (error) => {
  const status = error?.response?.status
  const detail = getErrorDetail(error)

  if (status === 403) return '当前身份无权限执行主题治理操作'
  if (status === 404) return detail ? `目标不存在：${detail}` : '目标主题、关系、版本或批次不存在'
  if (status === 422) return detail ? `请求校验失败：${detail}` : '请求参数或状态不合法，请检查后重试'
  if (status === 503) return '管理员主题治理服务暂不可用，请稍后重试'
  if (!error?.response) return '网络错误，请检查网络连接后重试'
  return detail || '管理员主题治理操作失败，请稍后重试'
}

export const createTopicTaxonomyApi = ({ client, baseUrl = '' }) => {
  const apiBaseUrl = String(baseUrl).replace(/\/$/, '')

  return {
    listProposals: ({ taxonomyVersion } = {}) => {
      const params = {}
      if (normalizeText(taxonomyVersion)) params.taxonomy_version = normalizeText(taxonomyVersion)

      return client.get(
        `${apiBaseUrl}/admin/topic-taxonomy/proposals`,
        withAdminHeaders({ params }),
      )
    },

    reviewTopic: (topicId, payload) => client.post(
      `${apiBaseUrl}/admin/topic-taxonomy/topics/${encodeURIComponent(topicId)}/review`,
      payload,
      withAdminHeaders(),
    ),

    listRelations: ({ reviewStatus } = {}) => {
      const params = {}
      if (normalizeText(reviewStatus)) params.review_status = normalizeText(reviewStatus)

      return client.get(
        `${apiBaseUrl}/admin/topic-taxonomy/relations`,
        withAdminHeaders({ params }),
      )
    },

    discoverRelations: ({ taxonomyVersion, topicId } = {}) => {
      const params = { taxonomy_version: normalizeText(taxonomyVersion) }
      if (normalizeText(topicId)) params.topic_id = normalizeText(topicId)

      return client.post(
        `${apiBaseUrl}/admin/topic-taxonomy/relations/discover`,
        undefined,
        withAdminHeaders({ params }),
      )
    },

    reviewRelation: (relationId, decision) => client.post(
      `${apiBaseUrl}/admin/topic-taxonomy/relations/${encodeURIComponent(relationId)}/review`,
      { decision },
      withAdminHeaders(),
    ),

    executeParentRollup: (payload) => client.post(
      `${apiBaseUrl}/admin/topic-taxonomy/rollups/parent`,
      buildParentRollupPayload(payload),
      withAdminHeaders(),
    ),

    listRollups: ({ userId, status, limit = 20, offset = 0 } = {}) => {
      const params = {
        user_id: normalizeText(userId),
        limit,
        offset,
      }
      if (normalizeText(status)) params.status = normalizeText(status)

      return client.get(
        `${apiBaseUrl}/admin/topic-taxonomy/rollups`,
        withAdminHeaders({ params }),
      )
    },

    listTopicHistory: ({ taxonomyVersion, status, reviewStatus, limit = 20, offset = 0 } = {}) => {
      const params = { limit, offset }
      if (normalizeText(taxonomyVersion)) params.taxonomy_version = normalizeText(taxonomyVersion)
      if (normalizeText(status)) params.status = normalizeText(status)
      if (normalizeText(reviewStatus)) params.review_status = normalizeText(reviewStatus)

      return client.get(
        `${apiBaseUrl}/admin/topic-taxonomy/topics/history`,
        withAdminHeaders({ params }),
      )
    },

    listActiveTopics: ({ taxonomyVersion, limit = 20, offset = 0 } = {}) => {
      const params = { limit, offset }
      if (normalizeText(taxonomyVersion)) params.taxonomy_version = normalizeText(taxonomyVersion)

      return client.get(
        `${apiBaseUrl}/admin/topic-taxonomy/topics/active`,
        withAdminHeaders({ params }),
      )
    },

    rollbackRollup: (runId) => client.post(
      `${apiBaseUrl}/admin/topic-taxonomy/rollups/${encodeURIComponent(runId)}/rollback`,
      undefined,
      withAdminHeaders(),
    ),
  }
}
