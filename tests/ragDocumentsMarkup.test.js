import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const ragChatMarkup = await readFile(new URL('../src/views/RagChatView.vue', import.meta.url), 'utf8')
const careerAgentMarkup = await readFile(new URL('../src/views/CareerAgent.vue', import.meta.url), 'utf8')
const dialogMarkup = await readFile(new URL('../src/components/DocumentTypeConfirmDialog.vue', import.meta.url), 'utf8')
const appMarkup = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8')

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
  assert.match(ragChatMarkup, /canShowResumeConversion\(doc\)/)
  assert.match(ragChatMarkup, /openTypeReview\(doc, 'conversion'\)/)
  assert.match(ragChatMarkup, /manual-resume-conversion/)
})

test('document mutations refresh CareerAgent state without a candidate delete call', () => {
  assert.match(ragChatMarkup, /rag-documents-updated/)
  assert.match(careerAgentMarkup, /rag-documents-updated/)
  assert.doesNotMatch(ragChatMarkup, /\/candidates\/[^`]+delete/)
})

test('document type confirmation uses a generic Element Plus dialog', () => {
  assert.match(dialogMarkup, /dialogTitle/)
  assert.match(dialogMarkup, /后端检测到当前文件为“简历”类型，请确认是否有误？/)
  assert.match(dialogMarkup, /<el-form/)
  assert.match(dialogMarkup, /<el-form-item/)
  assert.match(dialogMarkup, /<el-input/)
  assert.match(dialogMarkup, /<el-button-group/)
  assert.match(dialogMarkup, /简历信息确认/)
  assert.match(dialogMarkup, /不是简历/)
  assert.match(dialogMarkup, /manualResumeConversion/)
  assert.match(dialogMarkup, /取消/)
  assert.doesNotMatch(dialogMarkup, /简历信息无误/)
  assert.doesNotMatch(dialogMarkup, /简历信息有误/)
  assert.match(dialogMarkup, /confirm_resume/)
  assert.match(dialogMarkup, /reject_resume/)
  assert.ok(
    dialogMarkup.indexOf('后端检测到当前文件为“简历”类型，请确认是否有误？')
      < dialogMarkup.indexOf('class="document-type-confirm-dialog__form"'),
  )
})

test('manual type conversion selects a document type before showing resume fields', () => {
  assert.match(dialogMarkup, /selectedDocumentType/)
  assert.match(dialogMarkup, /update:selectedDocumentType/)
  assert.match(dialogMarkup, /<el-select/)
  assert.match(dialogMarkup, /label="简历" value="resume"/)
  assert.match(dialogMarkup, /v-if="ready && manualResumeConversion"/)
  assert.match(dialogMarkup, /manualResumeConversion \? '确认'/)
  assert.match(ragChatMarkup, /selectedDocumentType = ref\(''\)/)
  assert.match(ragChatMarkup, /@update:selected-document-type=/)
  assert.match(ragChatMarkup, /更改类型/)
})

test('document list uses Element Plus tags and horizontal actions', () => {
  assert.match(ragChatMarkup, /<el-tag/)
  assert.match(ragChatMarkup, /getDocumentStatusLabel\(doc\)/)
  assert.match(ragChatMarkup, /<el-button[^>]+type="danger"/)
  assert.match(ragChatMarkup, /<el-button[^>]+type="primary"/)
  assert.match(ragChatMarkup, /white-space: nowrap/)
})

test('document cards use stable dimensions and responsive overflow rules', () => {
  assert.match(ragChatMarkup, /grid-template-columns: minmax\(0, 1fr\) auto/)
  assert.match(ragChatMarkup, /min-height: 112px/)
  assert.match(ragChatMarkup, /max-width: 100%/)
  assert.match(ragChatMarkup, /@media \(max-width: 900px\)/)
  assert.match(appMarkup, /width: min\(1400px, calc\(100% - 40px\)\)/)
})

test('document and upload actions use accessible icon buttons', () => {
  assert.match(ragChatMarkup, /document-icon-button/)
  assert.match(ragChatMarkup, /aria-label="更改类型"/)
  assert.match(ragChatMarkup, /aria-label="删除"/)
  assert.match(ragChatMarkup, /aria-label="上传文件"/)
  assert.match(ragChatMarkup, /class="document-action-icon"/)
  assert.match(ragChatMarkup, /class="upload-controls"/)
  assert.doesNotMatch(ragChatMarkup, />\s*更改类型\s*</)
  assert.doesNotMatch(ragChatMarkup, />\s*删除\s*</)
})

test('compressed document names use the native full-name tooltip', () => {
  assert.match(ragChatMarkup, /:title="doc\.filename"/)
  assert.doesNotMatch(ragChatMarkup, /document-name-tooltip/)
  assert.doesNotMatch(ragChatMarkup, /left: calc\(100% \+ 8px\)/)
})

test('document action icons are compact and visually distinct', () => {
  assert.match(ragChatMarkup, /document-icon-button--edit/)
  assert.match(ragChatMarkup, /document-icon-button--delete/)
  assert.match(ragChatMarkup, /gap: 4px/)
  assert.match(ragChatMarkup, /\.document-actions \.el-button \+ \.el-button/)
  assert.match(ragChatMarkup, /margin-left: 0/)
  assert.match(ragChatMarkup, /background: #f04438/)
})

test('document operation feedback is presented in Chinese', () => {
  assert.match(ragChatMarkup, /getLocalizedDocumentMessage/)
  assert.match(ragChatMarkup, /getLocalizedDocumentMessage\(response\.data\?\.message/)
  assert.match(ragChatMarkup, /文件上传成功，正在处理中/)
  assert.match(ragChatMarkup, /修改成功/)
  assert.doesNotMatch(ragChatMarkup, /ElMessage\.success\(response\.data\?\.message/)
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
