import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const viewMarkup = await readFile(new URL('../src/views/RagChatView.vue', import.meta.url), 'utf8')
const panelMarkup = await readFile(
  new URL('../src/components/RagSourcesPanel.vue', import.meta.url),
  'utf8',
).catch(() => '')
const topicPanelMarkup = await readFile(
  new URL('../src/components/TopicDocumentMatchesPanel.vue', import.meta.url),
  'utf8',
).catch(() => '')
const profilePanelMarkup = await readFile(
  new URL('../src/components/ProfileMentionMatchesPanel.vue', import.meta.url),
  'utf8',
).catch(() => '')
const exactPanelMarkup = await readFile(
  new URL('../src/components/ExactContentMatchesPanel.vue', import.meta.url),
  'utf8',
).catch(() => '')

test('source panel uses grouped Element Plus components and separate evidence sections', () => {
  assert.match(panelMarkup, /<el-collapse\b/)
  assert.match(panelMarkup, /<el-collapse-item\b/)
  assert.match(panelMarkup, /<el-descriptions\b/)
  assert.match(panelMarkup, /<el-tag\b/)
  assert.match(panelMarkup, /summary_sources/)
  assert.match(panelMarkup, /candidate_preview/)
  assert.match(panelMarkup, /evidence_status/)
})

test('chat view delegates source rendering and keeps sources history request ID scoped', () => {
  assert.match(viewMarkup, /<RagSourcesPanel\b[^>]*:message="msg"/)
  assert.match(viewMarkup, /buildSourcesHistoryPayload\(USER_ID, requestId\)/)
  const historyBlock = viewMarkup.slice(
    viewMarkup.indexOf('const loadSourcesHistory'),
    viewMarkup.indexOf('const loadMoreTopicDocuments'),
  )
  assert.doesNotMatch(historyBlock, /buildSourcesHistoryPayload\([^)]*question/)
})

test('source panel does not use the old flat source card loop', () => {
  assert.doesNotMatch(viewMarkup, /v-for="\(source, i\) in msg\.sources"/)
  assert.doesNotMatch(panelMarkup, /filename \+ page/)
})

test('handles reset command before request id and source history loading', () => {
  assert.match(viewMarkup, /getRagCommandFromResponse\(response\)/)
  assert.match(viewMarkup, /parseResetResponse\(response\)/)

  const resetStart = viewMarkup.indexOf("if (ragCommand === 'reset')")
  const requestIdStart = viewMarkup.indexOf('const requestId = getRequestIdFromResponse')
  assert.ok(resetStart >= 0)
  assert.ok(requestIdStart > resetStart)

  const resetBlock = viewMarkup.slice(resetStart, requestIdStart)
  assert.doesNotMatch(resetBlock, /getRequestIdFromResponse/)
  assert.doesNotMatch(resetBlock, /loadSourcesHistory/)
  assert.match(resetBlock, /messages\.value = \[createResetConfirmationMessage\(\)\]/)

  assert.match(viewMarkup, /await loadSourcesHistory\(assistantIndex, requestId, requestGeneration\)/)

  const sourceHistoryStart = viewMarkup.indexOf('const loadSourcesHistory')
  const sourceHistoryEnd = viewMarkup.indexOf('const sendMessage')
  const sourceHistoryBlock = viewMarkup.slice(sourceHistoryStart, sourceHistoryEnd)
  assert.match(sourceHistoryBlock, /requestGeneration !== conversationGeneration/)
})

test('topic panel renders independent formal and mention metadata with guarded pagination', () => {
  assert.match(topicPanelMarkup, /matched_topics/)
  assert.match(topicPanelMarkup, /formal/)
  assert.match(topicPanelMarkup, /mention/)
  assert.match(topicPanelMarkup, /has_more/)
  assert.match(topicPanelMarkup, /next_cursor/)
  assert.match(topicPanelMarkup, /加载更多/)
  assert.match(topicPanelMarkup, /load-more/)
  assert.match(topicPanelMarkup, /document_id/)
  assert.doesNotMatch(topicPanelMarkup, /normalizeSourceGroups/)
})

test('structured panels expose distinct labels and empty states', () => {
  assert.match(topicPanelMarkup, /主题匹配文档/)
  assert.match(topicPanelMarkup, /aria-label="主题匹配文档"/)
  assert.match(topicPanelMarkup, /未找到归属于该主题的文档/)
  assert.match(topicPanelMarkup, /filename/)
  assert.match(topicPanelMarkup, /document_id/)
  assert.match(topicPanelMarkup, /document_type/)
  assert.match(topicPanelMarkup, /topic_role/)
  assert.match(topicPanelMarkup, /assignment_kind/)
  assert.match(profilePanelMarkup, /画像提及文档/)
  assert.match(profilePanelMarkup, /aria-label="画像提及文档"/)
  assert.match(profilePanelMarkup, /画像提及不等同于正文出现/)
  assert.match(profilePanelMarkup, /未找到画像提及该主题的文档/)
  assert.match(profilePanelMarkup, /filename/)
  assert.match(profilePanelMarkup, /document_id/)
  assert.match(profilePanelMarkup, /document_type/)
  assert.match(profilePanelMarkup, /topic_role/)
  assert.match(profilePanelMarkup, /assignment_kind/)
  assert.match(exactPanelMarkup, /正文匹配文档/)
  assert.match(exactPanelMarkup, /aria-label="正文匹配文档"/)
  assert.match(exactPanelMarkup, /未找到正文精确匹配/)
  assert.match(exactPanelMarkup, /filename/)
  assert.match(exactPanelMarkup, /document_id/)
  assert.match(exactPanelMarkup, /page/)
  assert.match(exactPanelMarkup, /section/)
  assert.match(exactPanelMarkup, /chunk_index/)
  assert.match(exactPanelMarkup, /content_preview/)
  assert.match(exactPanelMarkup, /content_truncated/)
  assert.match(exactPanelMarkup, /Array\.isArray\(item\?\.evidence\)/)
})

test('exact content panel groups documents, collapses evidence, and shows backend statistics', () => {
  assert.match(exactPanelMarkup, /documentGroups/)
  assert.match(exactPanelMarkup, /matched_chunk_count/)
  assert.match(exactPanelMarkup, /displayed_evidence_count/)
  assert.match(exactPanelMarkup, /omitted_evidence_count/)
  assert.match(exactPanelMarkup, /<details\b/)
  assert.doesNotMatch(exactPanelMarkup, /<details\b[^>]*\bopen\b/)
  assert.match(exactPanelMarkup, /证据片段已截断/)
  assert.match(exactPanelMarkup, /暂无证据片段/)
  assert.match(exactPanelMarkup, /getExactContentPreview/)
  assert.doesNotMatch(exactPanelMarkup, /evidence\.content\s*\|\|/)
})

test('structured result priority keeps ordinary empty state as the final fallback', () => {
  assert.match(viewMarkup, /topic_document_matches !== null/)
  assert.match(viewMarkup, /profile_mention_matches !== null/)
  assert.match(viewMarkup, /exact_content_matches !== null/)
  assert.match(panelMarkup, /!message\.sources\?\.length/)
  assert.match(viewMarkup, /TopicDocumentMatchesPanel/)
  assert.match(viewMarkup, /ProfileMentionMatchesPanel/)
  assert.match(viewMarkup, /ExactContentMatchesPanel/)
})

test('structured fields stay separate from ordinary source fields in view state', () => {
  assert.match(viewMarkup, /topic_document_matches:/)
  assert.match(viewMarkup, /profile_mention_matches:/)
  assert.match(viewMarkup, /exact_content_matches:/)
  assert.match(viewMarkup, /sources: \[\]/)
  assert.match(viewMarkup, /source_groups: \[\]/)
})

test('chat view keeps topic and ordinary source panels mutually exclusive', () => {
  assert.match(viewMarkup, /TopicDocumentMatchesPanel/)
  assert.match(viewMarkup, /topic_document_matches !== null/)
  assert.match(viewMarkup, /topic_document_matches !== undefined/)
  assert.match(viewMarkup, /ProfileMentionMatchesPanel/)
  assert.match(viewMarkup, /ExactContentMatchesPanel/)
  assert.match(viewMarkup, /loadMoreTopicDocuments/)
  assert.match(viewMarkup, /buildChatStreamPayload\(USER_ID, originalQuestion\)/)
  assert.match(viewMarkup, /topicLimit: TOPIC_PAGE_LIMIT/)
  assert.match(viewMarkup, /topicCursor/)
  assert.match(viewMarkup, /sourcesHistoryError/)
  assert.match(viewMarkup, /!msg\.sourcesHistoryError/)
})

test('pagination uses a fresh response request ID and does not append stream text', () => {
  assert.match(viewMarkup, /const paginationRequestId = getRequestIdFromResponse\(response\)/)
  assert.match(viewMarkup, /await consumeChatStream\(response/)
  const paginationStart = viewMarkup.indexOf('const loadMoreTopicDocuments')
  const paginationEnd = viewMarkup.indexOf('const sendMessage')
  const paginationBlock = viewMarkup.slice(paginationStart, paginationEnd)
  assert.doesNotMatch(paginationBlock, /currentMessage\.content \+ chunk/)
  assert.match(paginationBlock, /buildSourcesHistoryPayload\(USER_ID, paginationRequestId\)/)
})

test('normal RAG chat payload remains free of topic pagination fields', () => {
  const requestStart = viewMarkup.indexOf('const requestData = buildChatStreamPayload')
  const requestEnd = viewMarkup.indexOf('question.value =', requestStart)
  const initialRequestBlock = viewMarkup.slice(requestStart, requestEnd)

  assert.match(initialRequestBlock, /buildChatStreamPayload\(USER_ID, originalQuestion\)/)
  assert.doesNotMatch(initialRequestBlock, /topic_limit/)
  assert.doesNotMatch(initialRequestBlock, /topic_cursor/)
})
