import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const viewMarkup = await readFile(new URL('../src/views/RagChatView.vue', import.meta.url), 'utf8')
const panelMarkup = await readFile(
  new URL('../src/components/RagSourcesPanel.vue', import.meta.url),
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
    viewMarkup.indexOf('const sendMessage'),
  )
  assert.doesNotMatch(historyBlock, /question/)
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
