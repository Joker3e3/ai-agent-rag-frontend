import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const ragChatMarkup = await readFile(new URL('../src/views/RagChatView.vue', import.meta.url), 'utf8')
const careerAgentMarkup = await readFile(new URL('../src/views/CareerAgent.vue', import.meta.url), 'utf8')
const dialogMarkup = await readFile(new URL('../src/components/DocumentTypeConfirmDialog.vue', import.meta.url), 'utf8')

test('document view exposes type review and all three decisions', () => {
  assert.match(ragChatMarkup, /\/type-review/)
  assert.match(ragChatMarkup, /executeTypeDecision/)
  assert.match(ragChatMarkup, /typeReviewSubmitting/)
  assert.match(ragChatMarkup, /candidate_draft/)
  assert.match(ragChatMarkup, /deleteDocument\(doc\.document_id\)/)
  assert.doesNotMatch(ragChatMarkup, /deleteDocument\(doc\.file_hash\)/)
  assert.doesNotMatch(ragChatMarkup, /\/delete_document/)
  assert.match(ragChatMarkup, /DocumentTypeConfirmDialog/)
  assert.match(ragChatMarkup, /v-if="canShowResumeConfirmation\(doc\)"/)
})

test('document mutations refresh CareerAgent state without a candidate delete call', () => {
  assert.match(ragChatMarkup, /rag-documents-updated/)
  assert.match(careerAgentMarkup, /rag-documents-updated/)
  assert.doesNotMatch(ragChatMarkup, /\/candidates\/[^`]+delete/)
})

test('document type confirmation uses a generic Element Plus dialog', () => {
  assert.match(dialogMarkup, /title="待确认"/)
  assert.match(dialogMarkup, /后端检测到当前文件为“简历”类型，请确认是否有误？/)
  assert.match(dialogMarkup, /<el-form/)
  assert.match(dialogMarkup, /<el-form-item/)
  assert.match(dialogMarkup, /<el-input/)
  assert.match(dialogMarkup, /<el-button-group/)
  assert.match(dialogMarkup, /简历信息确认/)
  assert.match(dialogMarkup, /不是简历/)
  assert.match(dialogMarkup, /取消/)
  assert.doesNotMatch(dialogMarkup, /简历信息无误/)
  assert.doesNotMatch(dialogMarkup, /简历信息有误/)
  assert.match(dialogMarkup, /confirm_resume/)
  assert.match(dialogMarkup, /reject_resume/)
  assert.ok(
    dialogMarkup.indexOf('后端检测到当前文件为“简历”类型，请确认是否有误？')
      < dialogMarkup.indexOf('<el-form'),
  )
})

test('document list uses Element Plus tags and horizontal actions', () => {
  assert.match(ragChatMarkup, /<el-tag/)
  assert.match(ragChatMarkup, /<el-button[^>]+type="danger"/)
  assert.match(ragChatMarkup, /<el-button[^>]+type="primary"/)
  assert.match(ragChatMarkup, /white-space: nowrap/)
})

test('upload and polling do not auto-open type confirmation', () => {
  const uploadStart = ragChatMarkup.indexOf('const uploadFile')
  const listStart = ragChatMarkup.indexOf('// 获取文件列表')
  const pollingStart = ragChatMarkup.indexOf('const startPollingDocuments')
  const scriptEnd = ragChatMarkup.indexOf('</script>')
  const uploadMarkup = ragChatMarkup.slice(uploadStart, listStart)
  const pollingMarkup = ragChatMarkup.slice(pollingStart, scriptEnd)

  assert.doesNotMatch(uploadMarkup, /openTypeReview/)
  assert.doesNotMatch(pollingMarkup, /openTypeReview/)
})
