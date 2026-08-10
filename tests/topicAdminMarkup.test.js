import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const candidateMarkup = await readFile(
  new URL('../src/components/TopicCandidatesPanel.vue', import.meta.url),
  'utf8',
)
const relationMarkup = await readFile(
  new URL('../src/components/TopicRelationsPanel.vue', import.meta.url),
  'utf8',
)
const rollupMarkup = await readFile(
  new URL('../src/components/TopicRollupPanel.vue', import.meta.url),
  'utf8',
)
const topicListMarkup = await readFile(
  new URL('../src/components/TopicTopicsPanel.vue', import.meta.url),
  'utf8',
)
const viewMarkup = await readFile(
  new URL('../src/views/TopicAdminView.vue', import.meta.url),
  'utf8',
)
const routerMarkup = await readFile(new URL('../src/router/index.js', import.meta.url), 'utf8')
const appMarkup = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8')

test('candidate topic panel uses the required Element Plus review components', () => {
  assert.match(candidateMarkup, /<el-table\b/)
  assert.match(candidateMarkup, /<el-tag\b/)
  assert.match(candidateMarkup, /<el-dialog\b/)
  assert.match(candidateMarkup, /<el-drawer\b/)
  assert.match(candidateMarkup, /<el-descriptions\b/)
  assert.match(candidateMarkup, /<el-button\b/)
})

test('candidate topic panel renders separate topic and review statuses', () => {
  assert.match(candidateMarkup, /topic_label/)
  assert.match(candidateMarkup, /topic_code/)
  assert.match(candidateMarkup, /aliases/)
  assert.match(candidateMarkup, /confidence/)
  assert.match(candidateMarkup, /support_document_count/)
  assert.match(candidateMarkup, /status/)
  assert.match(candidateMarkup, /review_status/)
  assert.match(candidateMarkup, /proposal_source/)
  assert.match(candidateMarkup, /proposed|pending|active|rejected|retired|deprecated/)
})

test('candidate topic panel exposes all review decisions and bounded inputs', () => {
  assert.match(candidateMarkup, /approve/)
  assert.match(candidateMarkup, /reject/)
  assert.match(candidateMarkup, /merge/)
  assert.match(candidateMarkup, /deprecate/)
  assert.match(candidateMarkup, /maxlength="1000"/)
  assert.match(candidateMarkup, /maxlength="128"/)
  assert.match(candidateMarkup, /target_topic_code/)
  assert.match(candidateMarkup, /已有规范主题.*topic_code|topic_code.*不是主题名称/s)
})

test('candidate topic actions stay on one horizontal row', () => {
  assert.match(candidateMarkup, /label="操作" min-width="430"/)
  assert.match(candidateMarkup, /operation-actions/)
  assert.match(candidateMarkup, /white-space:\s*nowrap/)
})

test('topic admin panels localize visible English labels and status descriptions', () => {
  assert.match(candidateMarkup, /label="别名"/)
  assert.match(candidateMarkup, /label="主题状态"/)
  assert.match(topicListMarkup, /label="别名"/)
  assert.match(rollupMarkup, /label="状态"/)
  assert.match(rollupMarkup, /label="受影响文档数"/)
  assert.match(rollupMarkup, /label="创建时间"/)
  assert.match(rollupMarkup, /label="完成时间"/)
  assert.match(rollupMarkup, /label="发起人"/)
  assert.doesNotMatch(candidateMarkup, /label="Aliases"/)
  assert.doesNotMatch(rollupMarkup, /label="status"|label="affected_document_count"|label="affected 文档"|label="created_at"|label="finished_at"|label="initiated_by"/)
  assert.doesNotMatch(relationMarkup, /当前 active|active taxonomy/)
  assert.doesNotMatch(rollupMarkup, /active taxonomy/)
  assert.doesNotMatch(topicListMarkup, /当前 active|active taxonomy|active \+ approved/)
})

test('candidate topic panel refreshes after review and never assumes relations exist', () => {
  assert.match(candidateMarkup, /loadProposals/)
  assert.match(candidateMarkup, /topicReviewSubmitting/)
  assert.match(candidateMarkup, /:disabled="[^"]*topicReviewSubmitting/)
  assert.match(candidateMarkup, /关系发现处理中/)
  assert.match(candidateMarkup, /刷新/)
})

test('relation panel renders separate relation review states and filters', () => {
  assert.match(relationMarkup, /<el-table\b/)
  assert.match(relationMarkup, /<el-tag\b/)
  assert.match(relationMarkup, /<el-select\b/)
  assert.match(relationMarkup, /<el-button\b/)
  assert.match(relationMarkup, /parent_topic_label/)
  assert.match(relationMarkup, /child_topic_label/)
  assert.match(relationMarkup, /relation_id/)
  assert.match(relationMarkup, /review_status/)
  assert.match(relationMarkup, /source/)
  assert.match(relationMarkup, /proposed/)
  assert.match(relationMarkup, /approved/)
  assert.match(relationMarkup, /rejected/)
  assert.match(relationMarkup, /retired/)
  assert.doesNotMatch(relationMarkup, /taxonomy_version.*el-select/s)
})

test('relation panel supports discovery and proposed-only relation review', () => {
  assert.match(relationMarkup, /discoverRelations/)
  assert.match(relationMarkup, /taxonomyVersion/)
  assert.match(relationMarkup, /run_id/)
  assert.match(relationMarkup, /仍需人工审核/)
  assert.match(relationMarkup, /approve/)
  assert.match(relationMarkup, /reject/)
  assert.match(relationMarkup, /retire/)
  assert.match(relationMarkup, /relationSubmitting/)
  assert.match(relationMarkup, /刷新/)
})

test('rollup panel renders scoped execution and history data', () => {
  assert.match(rollupMarkup, /<el-table\b/)
  assert.match(rollupMarkup, /<el-tag\b/)
  assert.match(rollupMarkup, /<el-descriptions\b/)
  assert.match(rollupMarkup, /<el-popconfirm\b/)
  assert.match(rollupMarkup, /<el-select\b/)
  assert.match(rollupMarkup, /<el-button\b/)
  assert.match(rollupMarkup, /userId/)
  assert.match(rollupMarkup, /taxonomyVersion/)
  assert.match(rollupMarkup, /document_ids/)
  assert.match(rollupMarkup, /run_id/)
  assert.match(rollupMarkup, /affected_document_count/)
  assert.match(rollupMarkup, /created_assignment_count/)
  assert.match(rollupMarkup, /superseded_assignment_count/)
  assert.match(rollupMarkup, /created_at/)
  assert.match(rollupMarkup, /finished_at/)
  assert.match(rollupMarkup, /initiated_by/)
})

test('rollup panel disables execution without a version and only rolls back succeeded rows', () => {
  assert.match(rollupMarkup, /canExecuteRollup/)
  assert.match(rollupMarkup, /taxonomyVersion.*无法执行 Rollup|无法执行 Rollup.*taxonomyVersion/s)
  assert.match(rollupMarkup, /status === 'succeeded'/)
  assert.match(rollupMarkup, /running/)
  assert.match(rollupMarkup, /failed/)
  assert.match(rollupMarkup, /rolled_back/)
  assert.match(rollupMarkup, /只撤销该批次.*不删除原始文档/s)
  assert.match(rollupMarkup, /limit/)
  assert.match(rollupMarkup, /offset/)
  assert.match(rollupMarkup, /刷新历史|loadRollups/)
})

test('topic list panel renders history and active topic lists separately', () => {
  assert.match(topicListMarkup, /<el-tabs\b/)
  assert.match(topicListMarkup, /审核历史/)
  assert.match(topicListMarkup, /已激活主题/)
  assert.match(topicListMarkup, /<el-table\b/)
  assert.match(topicListMarkup, /topic_label/)
  assert.match(topicListMarkup, /topic_code/)
  assert.match(topicListMarkup, /taxonomy_version/)
  assert.match(topicListMarkup, /status/)
  assert.match(topicListMarkup, /review_status/)
  assert.match(topicListMarkup, /last_review/)
  assert.match(topicListMarkup, /listTopicHistory/)
  assert.match(topicListMarkup, /listActiveTopics/)
  assert.match(topicListMarkup, /historyPage\.value = page/)
  assert.match(topicListMarkup, /activePage\.value = page/)
  assert.match(topicListMarkup, /父子关系/)
  assert.match(topicListMarkup, /查看关系/)
  assert.match(topicListMarkup, /<el-drawer\b/)
  assert.match(topicListMarkup, /parent_topic_label/)
  assert.match(topicListMarkup, /child_topic_label/)
  assert.match(topicListMarkup, /canonical_topic_id/)
  assert.match(topicListMarkup, /review_status === 'approved'/)
  assert.doesNotMatch(topicListMarkup, /<el-tree\b/)
})

test('topic list panel distinguishes direct document support and shows modification time', () => {
  assert.match(topicListMarkup, /prop="support_document_count" label="直接支持文档数"/)
  assert.match(topicListMarkup, /label="修改时间"/)
  assert.match(topicListMarkup, /formatDateTime\(row\.updated_at\)/)
})

test('topic admin route and navigation are independent from existing pages', () => {
  assert.match(routerMarkup, /path: '\/topic-admin'/)
  assert.match(routerMarkup, /TopicAdminView/)
  assert.match(appMarkup, /to="\/topic-admin"/)
  assert.match(appMarkup, /主题治理/)
  assert.match(routerMarkup, /path: '\/rag-chat'/)
  assert.match(routerMarkup, /path: '\/career-agent'/)
  assert.match(routerMarkup, /RagChatView/)
  assert.match(routerMarkup, /CareerAgent/)
})

test('topic admin view wires the governance panels and shared state', () => {
  assert.match(viewMarkup, /<el-tabs\b/)
  assert.match(viewMarkup, /候选主题/)
  assert.match(viewMarkup, /父子关系/)
  assert.match(viewMarkup, /Rollup/)
  assert.match(viewMarkup, /主题列表/)
  assert.match(viewMarkup, /TopicCandidatesPanel/)
  assert.match(viewMarkup, /TopicRelationsPanel/)
  assert.match(viewMarkup, /TopicRollupPanel/)
  assert.match(viewMarkup, /TopicTopicsPanel/)
  assert.match(viewMarkup, /taxonomyVersion/)
  assert.match(viewMarkup, /userId/)
  assert.match(viewMarkup, /taxonomy-version/)
  assert.match(viewMarkup, /update:user-id/)
})
