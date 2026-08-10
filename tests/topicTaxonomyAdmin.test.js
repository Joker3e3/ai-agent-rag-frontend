import assert from 'node:assert/strict'
import test from 'node:test'

import {
  TOPIC_ADMIN_HEADER,
  TOPIC_ADMIN_ID,
  buildParentRollupPayload,
  buildTopicReviewPayload,
  createTopicTaxonomyApi,
  getTopicAdminErrorMessage,
  normalizeActiveTopicsResponse,
  normalizeProposalsResponse,
  normalizeRelationsResponse,
  normalizeRollupsResponse,
  normalizeTopicHistoryResponse,
} from '../src/services/topicTaxonomyAdmin.js'

const createFakeClient = () => {
  const calls = []
  return {
    calls,
    client: {
      get: async (...args) => {
        calls.push(['get', ...args])
        return { data: {} }
      },
      post: async (...args) => {
        calls.push(['post', ...args])
        return { data: {} }
      },
    },
  }
}

const expectedHeaders = { [TOPIC_ADMIN_HEADER]: TOPIC_ADMIN_ID }

test('topic taxonomy API sends the fixed admin header on every request', async () => {
  const { client, calls } = createFakeClient()
  const api = createTopicTaxonomyApi({ client, baseUrl: 'http://api.test' })

  await api.listProposals()
  await api.reviewTopic('topic-1', buildTopicReviewPayload({ decision: 'approve' }))
  await api.listRelations({ reviewStatus: 'proposed' })
  await api.discoverRelations({ taxonomyVersion: '20260810.1' })
  await api.reviewRelation('relation-1', 'reject')
  await api.executeParentRollup({ userId: 'user-1', taxonomyVersion: '20260810.1' })
  await api.listRollups({ userId: 'user-1' })
  await api.rollbackRollup('run-1')
  await api.listTopicHistory()
  await api.listActiveTopics()

  assert.equal(calls.length, 10)
  calls.forEach((call) => {
    const config = call[0] === 'get' ? call[2] : call[3]
    assert.deepStrictEqual(config.headers, expectedHeaders)
  })
})

test('topic taxonomy API builds the candidate and relation review requests', async () => {
  const { client, calls } = createFakeClient()
  const api = createTopicTaxonomyApi({ client, baseUrl: 'http://api.test' })

  await api.reviewTopic('topic-1', {
    decision: 'merge',
    target_topic_code: 'canonical.backend',
    note: 'duplicate candidate',
  })
  await api.reviewRelation('relation-1', 'retire')

  assert.deepStrictEqual(calls[0], [
    'post',
    'http://api.test/admin/topic-taxonomy/topics/topic-1/review',
    {
      decision: 'merge',
      target_topic_code: 'canonical.backend',
      note: 'duplicate candidate',
    },
    { headers: expectedHeaders },
  ])
  assert.deepStrictEqual(calls[1], [
    'post',
    'http://api.test/admin/topic-taxonomy/relations/relation-1/review',
    { decision: 'retire' },
    { headers: expectedHeaders },
  ])
})

test('topic taxonomy API omits taxonomy version from the default relation query', async () => {
  const { client, calls } = createFakeClient()
  const api = createTopicTaxonomyApi({ client, baseUrl: 'http://api.test' })

  await api.listRelations({ reviewStatus: 'proposed' })
  await api.discoverRelations({ taxonomyVersion: '20260810.1' })

  assert.deepStrictEqual(calls[0], [
    'get',
    'http://api.test/admin/topic-taxonomy/relations',
    { params: { review_status: 'proposed' }, headers: expectedHeaders },
  ])
  assert.deepStrictEqual(calls[1], [
    'post',
    'http://api.test/admin/topic-taxonomy/relations/discover',
    undefined,
    { params: { taxonomy_version: '20260810.1' }, headers: expectedHeaders },
  ])
})

test('topic taxonomy API builds a scoped Rollup body and omits empty document IDs', () => {
  assert.deepStrictEqual(
    buildParentRollupPayload({
      userId: ' user-1 ',
      taxonomyVersion: ' 20260810.1 ',
      documentIds: [],
    }),
    {
      user_id: 'user-1',
      taxonomy_version: '20260810.1',
    },
  )
  assert.deepStrictEqual(
    buildParentRollupPayload({
      userId: 'user-1',
      taxonomyVersion: '20260810.1',
      documentIds: [' doc-1 ', 'doc-1', 'doc-2'],
    }),
    {
      user_id: 'user-1',
      taxonomy_version: '20260810.1',
      document_ids: ['doc-1', 'doc-2'],
    },
  )
})

test('topic taxonomy API builds history pagination parameters and rollback path', async () => {
  const { client, calls } = createFakeClient()
  const api = createTopicTaxonomyApi({ client, baseUrl: 'http://api.test' })

  await api.listRollups({ userId: 'user-1', status: 'succeeded', limit: 20, offset: 40 })
  await api.rollbackRollup('run-1')

  assert.deepStrictEqual(calls[0], [
    'get',
    'http://api.test/admin/topic-taxonomy/rollups',
    {
      params: { user_id: 'user-1', status: 'succeeded', limit: 20, offset: 40 },
      headers: expectedHeaders,
    },
  ])
  assert.deepStrictEqual(calls[1], [
    'post',
    'http://api.test/admin/topic-taxonomy/rollups/run-1/rollback',
    undefined,
    { headers: expectedHeaders },
  ])
})

test('topic taxonomy API builds topic history and active topic requests', async () => {
  const { client, calls } = createFakeClient()
  const api = createTopicTaxonomyApi({ client, baseUrl: 'http://api.test' })

  await api.listTopicHistory({
    taxonomyVersion: ' 20260810.1 ',
    status: 'active',
    reviewStatus: ' approved ',
    limit: 20,
    offset: 40,
  })
  await api.listActiveTopics({ taxonomyVersion: ' 20260810.1 ', limit: 20, offset: 20 })

  assert.deepStrictEqual(calls[0], [
    'get',
    'http://api.test/admin/topic-taxonomy/topics/history',
    {
      params: {
        taxonomy_version: '20260810.1',
        status: 'active',
        review_status: 'approved',
        limit: 20,
        offset: 40,
      },
      headers: expectedHeaders,
    },
  ])
  assert.deepStrictEqual(calls[1], [
    'get',
    'http://api.test/admin/topic-taxonomy/topics/active',
    {
      params: { taxonomy_version: '20260810.1', limit: 20, offset: 20 },
      headers: expectedHeaders,
    },
  ])
})

test('topic review payload trims optional values and enforces decision-specific targets', () => {
  assert.deepStrictEqual(
    buildTopicReviewPayload({
      decision: 'approve',
      targetTopicCode: ' should-be-null ',
      note: '  approved  ',
    }),
    { decision: 'approve', target_topic_code: null, note: 'approved' },
  )
  assert.deepStrictEqual(
    buildTopicReviewPayload({
      decision: 'deprecate',
      targetTopicCode: ' canonical.backend ',
      note: '',
    }),
    { decision: 'deprecate', target_topic_code: 'canonical.backend', note: null },
  )
})

test('topic taxonomy API normalizes list response envelopes without inventing states', () => {
  assert.deepStrictEqual(normalizeProposalsResponse({ proposals: [{ topic_id: 'topic-1' }] }), [{ topic_id: 'topic-1' }])
  assert.deepStrictEqual(
    normalizeRelationsResponse({ taxonomy_version: '20260810.1', relations: [{ relation_id: 'relation-1' }] }),
    { taxonomyVersion: '20260810.1', relations: [{ relation_id: 'relation-1' }] },
  )
  assert.deepStrictEqual(
    normalizeRollupsResponse({ rollups: [{ run_id: 'run-1', status: 'succeeded' }], total: 1 }),
    { rollups: [{ run_id: 'run-1', status: 'succeeded' }], total: 1 },
  )
  assert.deepStrictEqual(
    normalizeRollupsResponse({ items: [{ run_id: 'run-2', status: 'succeeded' }], total: 1 }),
    { rollups: [{ run_id: 'run-2', status: 'succeeded' }], total: 1 },
  )
  assert.deepStrictEqual(
    normalizeTopicHistoryResponse({
      taxonomy_version: '20260810.1',
      items: [{ topic_id: 'topic-1', status: 'active', review_status: 'approved' }],
      total: 1,
    }),
    {
      taxonomyVersion: '20260810.1',
      topics: [{ topic_id: 'topic-1', status: 'active', review_status: 'approved' }],
      total: 1,
    },
  )
  assert.deepStrictEqual(
    normalizeActiveTopicsResponse({
      taxonomy_version: '20260810.1',
      items: [{ topic_id: 'topic-2', status: 'active', review_status: 'approved' }],
      total: 1,
    }),
    {
      taxonomyVersion: '20260810.1',
      topics: [{ topic_id: 'topic-2', status: 'active', review_status: 'approved' }],
      total: 1,
    },
  )
})

test('topic taxonomy API maps administrator error statuses to Chinese messages', () => {
  assert.match(getTopicAdminErrorMessage({ response: { status: 403 } }), /无权限/)
  assert.match(getTopicAdminErrorMessage({ response: { status: 404 } }), /不存在/)
  assert.match(getTopicAdminErrorMessage({ response: { status: 422, data: { detail: 'invalid state' } } }), /invalid state/)
  assert.match(getTopicAdminErrorMessage({ response: { status: 503 } }), /暂不可用/)
  assert.match(getTopicAdminErrorMessage({ request: {} }), /网络错误/)
})
