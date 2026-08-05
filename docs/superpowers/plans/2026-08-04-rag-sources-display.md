# RAG Sources Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将知识库问答来源从按 chunk 平铺改为按 `document_id` 分组的 Element Plus 文档折叠卡片，并独立展示摘要依据和候选文档。

**Architecture:** 扩展 `src/services/ragSources.js`，集中处理响应状态、文档分组、chunk 稳定排序、去重、文件格式和状态标签；新增 `RagSourcesPanel.vue` 承担来源展示；`RagChatView.vue` 只负责保存当前 assistant 的来源状态、使用响应头 request ID 调用 `/sources_history`，不改聊天流或检索逻辑。

**Tech Stack:** Vue 3 `<script setup>`, Element Plus `ElCollapse`/`ElCollapseItem`/`ElDescriptions`/`ElTag`, Axios, Node.js built-in `node:test`, Vite.

## Global Constraints

- `/sources_history` 请求体严格为 `{ user_id, request_id }`，不发送 `question`。
- `request_id` 必须来自当前 `/chat_stream` 响应头 `X-RAG-Request-ID`。
- 只修改前端代码和测试，不修改后端代码、检索逻辑、`/chat_stream` 请求体、流式解码或 request ID 生成逻辑。
- `sources`/`source_groups` 不包含 `document_type`；只能展示文件名、`document_id`、文件格式和 `evidence_status`，不得按文件名推断业务类型。
- `source_groups` 非空时优先使用；相同 `document_id` 只生成一个文档组；同名不同 `document_id` 保持分离。
- chunk 排序使用 `evidence_order`，缺失时使用 `chunk_index`，两者都缺失时保持原始顺序；不按文件名排序。
- chunk 去重优先使用 `chunk_id`，否则使用 `content_sha256`；两个字段都缺失时保留，不能用 `filename + page` 去重。
- `summary_sources` 按当前扁平数组实现，独立显示为“文档摘要依据”；`candidate_preview` 独立显示为“候选文档”；二者不能进入普通 chunk 来源。
- 只有 `evidence_status === "supported"` 且顶层 `sources` 非空时展示普通来源卡片；`not_found` 显示“无相关证据”，不显示历史来源。
- 处理 loading、空来源、400、403、404、410、503、其他 HTTP/网络错误和响应 request ID 错配；失败或错配时清空 `sources`、`source_groups`、`summary_sources`、`candidate_preview`。
- 保留现有与本任务无关的 `.gitignore`、`CareerAgent.vue` 和文档类型确认计划改动；本任务不创建 Git commit。

---

### Task 1: Add failing source normalization and state tests

**Files:**
- Modify: `tests/ragSources.test.js`
- Test: `src/services/ragSources.js`

**Interfaces:**
- `normalizeSourceGroups(sourceGroups, sources)` returns `{ key, document_id, filename, sources }[]`.
- `normalizeSummarySources(summarySources)` returns a flat summary evidence array.
- `canShowFinalSources(evidenceStatus, sources)` returns a boolean.
- `createSourcesHistoryErrorState(status)` returns a cleared source state with `sourcesError`.

- [ ] **Step 1: Add a failing test for group priority, document identity, order, and deduplication**

Append this test to `tests/ragSources.test.js`:

```js
test('normalizes source groups by document id with stable chunk order and identity deduplication', () => {
  const normalizeSourceGroups = getHelper('normalizeSourceGroups')

  const groups = normalizeSourceGroups([
    {
      document_id: 'doc-a',
      filename: 'same.pdf',
      sources: [
        { document_id: 'doc-a', filename: 'same.pdf', chunk_id: 'a-2', evidence_order: 2, content: 'a2' },
        { document_id: 'doc-a', filename: 'same.pdf', chunk_id: 'a-1', evidence_order: 1, content: 'a1' },
      ],
    },
    {
      document_id: 'doc-b',
      filename: 'same.pdf',
      sources: [
        { document_id: 'doc-b', filename: 'same.pdf', chunk_id: 'b-1', evidence_order: 1, content: 'b1' },
      ],
    },
  ], [
    { document_id: 'fallback', filename: 'fallback.pdf', chunk_id: 'fallback-1' },
  ])

  assert.deepStrictEqual(groups.map(group => group.document_id), ['doc-a', 'doc-b'])
  assert.deepStrictEqual(groups[0].sources.map(source => source.content), ['a1', 'a2'])
  assert.equal(groups[0].filename, 'same.pdf')
})

test('deduplicates chunks by chunk id, then content hash, without merging same-page chunks', () => {
  const normalizeSourceGroups = getHelper('normalizeSourceGroups')

  const groups = normalizeSourceGroups([], [
    { document_id: 'doc-a', filename: 'same.pdf', page: 2, chunk_id: 'chunk-1', evidence_order: 1, content: 'first' },
    { document_id: 'doc-a', filename: 'same.pdf', page: 2, chunk_id: 'chunk-1', evidence_order: 0, content: 'duplicate chunk' },
    { document_id: 'doc-a', filename: 'same.pdf', page: 2, content_sha256: 'hash-2', chunk_index: 2, content: 'second' },
    { document_id: 'doc-a', filename: 'same.pdf', page: 2, content_sha256: 'hash-2', chunk_index: 3, content: 'duplicate hash' },
    { document_id: 'doc-a', filename: 'same.pdf', page: 2, chunk_index: 4, content: 'third same page' },
  ])

  assert.deepStrictEqual(groups[0].sources.map(source => source.content), [
    'first',
    'second',
    'third same page',
  ])
})

test('keeps source items without document ids as separate synthetic groups', () => {
  const normalizeSourceGroups = getHelper('normalizeSourceGroups')

  const groups = normalizeSourceGroups([], [
    { filename: 'same.pdf', page: 1, content: 'one' },
    { filename: 'same.pdf', page: 1, content: 'two' },
  ])

  assert.equal(groups.length, 2)
  assert.notEqual(groups[0].key, groups[1].key)
})

test('falls back to flat sources only when source groups have no usable chunks', () => {
  const normalizeSourceGroups = getHelper('normalizeSourceGroups')

  const groups = normalizeSourceGroups(
    [{ document_id: 'empty-group', filename: 'empty.pdf', sources: [] }],
    [{ document_id: 'fallback-doc', filename: 'fallback.pdf', chunk_id: 'fallback-1' }],
  )

  assert.deepStrictEqual(groups.map(group => group.document_id), ['fallback-doc'])
})
```

- [ ] **Step 2: Add failing tests for source visibility, summary normalization, and error clearing**

Append these tests:

```js
test('gates ordinary sources by supported status and non-empty top-level sources', () => {
  const canShowFinalSources = getHelper('canShowFinalSources')

  assert.equal(canShowFinalSources('supported', [{ chunk_id: 'chunk-1' }]), true)
  assert.equal(canShowFinalSources('not_found', [{ chunk_id: 'chunk-1' }]), false)
  assert.equal(canShowFinalSources('supported', []), false)
  assert.equal(canShowFinalSources('insufficient', [{ chunk_id: 'chunk-1' }]), false)
})

test('maps evidence status and file extension without inferring business type', () => {
  const getEvidenceStatusLabel = getHelper('getEvidenceStatusLabel')
  const getFileFormatLabel = getHelper('getFileFormatLabel')

  assert.equal(getEvidenceStatusLabel('supported'), '已找到证据')
  assert.equal(getEvidenceStatusLabel('ambiguous'), '证据存在歧义')
  assert.equal(getFileFormatLabel('resume.final.PDF'), 'PDF')
  assert.equal(getFileFormatLabel('README'), '未知格式')
})

test('keeps flat summary sources separate and flattens a defensive grouped shape', () => {
  const normalizeSummarySources = getHelper('normalizeSummarySources')

  const summaries = normalizeSummarySources([
    { source_kind: 'document_summary', document_id: 'doc-a', filename: 'a.pdf', summary: 'A' },
    {
      document_id: 'doc-b',
      filename: 'b.pdf',
      sources: [{ source_kind: 'document_summary', summary: 'B' }],
    },
  ])

  assert.deepStrictEqual(summaries.map(item => item.summary), ['A', 'B'])
  assert.equal(summaries[1].document_id, 'doc-b')
  assert.equal(summaries[1].filename, 'b.pdf')
})

test('clears every source category when sources history fails', () => {
  const createSourcesHistoryErrorState = getHelper('createSourcesHistoryErrorState')

  assert.deepStrictEqual(
    createSourcesHistoryErrorState(410),
    {
      context_request_id: '',
      evidence_status: null,
      sources: [],
      source_groups: [],
      summary_sources: [],
      candidate_preview: [],
      trace: {},
      sourcesError: '来源已过期，请重新提问',
    },
  )
})
```

- [ ] **Step 3: Extend the existing state test with the confirmed response fields**

Add `evidence_status: 'supported'` and a flat `summary_sources` fixture to the existing `getSourcesHistoryState` test, then assert both fields are returned unchanged. Keep the existing assertions for `request_id`, `context_request_id`, `sources`, `source_groups`, and `candidate_preview`.

- [ ] **Step 4: Run the focused tests and verify the expected red failure**

Run: `node --test tests/ragSources.test.js`

Expected: FAIL with helper export assertions for `normalizeSourceGroups`, `canShowFinalSources`, `normalizeSummarySources`, or `createSourcesHistoryErrorState`; existing request ID tests may still pass.

### Task 2: Implement source normalization and source state helpers

**Files:**
- Modify: `src/services/ragSources.js`
- Test: `tests/ragSources.test.js`

**Interfaces:**
- `normalizeSourceGroups(sourceGroups, sources)` prefers usable `source_groups`, otherwise groups flat `sources` by `document_id`; missing IDs create unique groups.
- `normalizeSummarySources(summarySources)` preserves flat items and defensively flattens nested `sources` with group-level `document_id`/`filename` fallback.
- `canShowFinalSources(evidenceStatus, sources)` is true only for `supported` and a non-empty top-level `sources` array.
- `getEvidenceStatusLabel(status)` maps supported/not_found/insufficient/ambiguous to stable Chinese labels.
- `getFileFormatLabel(filename)` returns an uppercase extension or `未知格式` without inferring business document type.
- `createSourcesHistoryErrorState(status)` clears all source categories and maps the status to the existing source error message.

- [ ] **Step 1: Extend assistant state and response state preservation**

Add `evidence_status: null` and `summary_sources: []` to `createAssistantMessage()`. Extend `getSourcesHistoryState()` to return `evidence_status` and `summary_sources` on valid responses. On request ID mismatch, return `evidence_status: null`, empty `sources`, `source_groups`, `summary_sources`, `candidate_preview`, and `trace`, plus the mismatch error.

- [ ] **Step 2: Implement `normalizeSourceGroups()` with source group priority**

Use an internal ordered `Map` keyed by `document:${document_id}` for non-empty IDs. If `source_groups` contains no group with a non-empty `sources` array, build groups from flat `sources`. For missing IDs, use `missing:${sourceIndex}` so same filename/page entries remain separate. Preserve the first group’s `filename` and the original source objects.

- [ ] **Step 3: Implement chunk deduplication before sorting**

For each document group, iterate original chunks once and keep the first occurrence of `chunk_id`; when absent, keep the first occurrence of `content_sha256`; when both are absent, keep every chunk. Prefix identity keys with `chunk:` or `hash:` so the two identity namespaces cannot collide. Do not read filename or page for identity.

- [ ] **Step 4: Implement stable chunk ordering**

Sort the retained chunks by the numeric `evidence_order` when present; otherwise by numeric `chunk_index`; otherwise keep original index order. Use original index as a final tie-breaker. Never compare filenames.

- [ ] **Step 5: Implement status, format, summary, and error helpers**

Map statuses to `已找到证据`、`无相关证据`、`证据不足`、`证据存在歧义` and an `未知状态` fallback. Extract the final filename extension with `split('.')`, uppercase it, and return `未知格式` for missing extensions. Flatten only nested summary items while copying group-level `document_id` and `filename` when absent. Return the exact cleared error state required by Task 1.

- [ ] **Step 6: Run the focused tests and verify green**

Run: `node --test tests/ragSources.test.js`

Expected: PASS for request ID, payload, state, grouping, ordering, deduplication, status gating, summary separation, and error clearing tests.

### Task 3: Add failing markup tests for the standalone source panel

**Files:**
- Modify: `tests/ragChatViewMarkup.test.js`
- Test: `src/components/RagSourcesPanel.vue`

**Interfaces:**
- `RagSourcesPanel.vue` accepts a required `message` prop containing the assistant source state.
- The panel reads source helpers from `src/services/ragSources.js` and does not issue HTTP requests.

- [ ] **Step 1: Read both the panel and page markup in the test**

Add `panelMarkup` from `../src/components/RagSourcesPanel.vue` with `await readFile(...).catch(() => '')` so the red test fails through its markup assertions when the component is not yet created; keep `viewMarkup` from `RagChatView.vue`.

- [ ] **Step 2: Add failing Element Plus and source separation assertions**

Add these tests:

```js
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
```

- [ ] **Step 3: Run the focused markup tests and verify the expected red failure**

Run: `node --test tests/ragChatViewMarkup.test.js`

Expected: FAIL because `src/components/RagSourcesPanel.vue` does not exist and `RagChatView.vue` still contains the old flat source cards.

### Task 4: Implement the standalone Element Plus source panel

**Files:**
- Create: `src/components/RagSourcesPanel.vue`
- Test: `tests/ragChatViewMarkup.test.js`

**Interfaces:**
- Props: `{ message: Object }`.
- Computed data: normalized final document groups, flat summary evidence, and status/format labels.
- No Axios/fetch calls and no changes to the answer text.

- [ ] **Step 1: Create the component contract and computed normalized data**

Import `computed` from Vue and `canShowFinalSources`, `getEvidenceStatusLabel`, `getFileFormatLabel`, `normalizeSourceGroups`, and `normalizeSummarySources` from `ragSources.js`. Define a required `message` prop. Compute final groups from `message.source_groups` and `message.sources`, and summaries from `message.summary_sources`.

- [ ] **Step 2: Render loading, errors, and evidence status states**

Render `message.sourcesLoading` as “正在加载来源”. Render `message.sourcesError` as the error state. Render `not_found` as “无相关证据”; render `insufficient` and `ambiguous` with their `ElTag` status and no ordinary cards; render supported with empty `sources` as “暂无可展示的来源”.

- [ ] **Step 3: Render one document card per normalized group**

Use `<el-collapse>` with `<el-collapse-item v-for="group in finalGroups" :key="group.key" :name="group.key">`. In the title slot, render exactly once per card: `group.filename`, `group.document_id || '未提供'`, `getFileFormatLabel(group.filename)`, and the evidence status tag. Do not render or infer `document_type`.

- [ ] **Step 4: Render chunks with compact metadata and folded content**

For each group’s chunks, use `<el-descriptions>` to show `chunk_id`, `chunk_index`, `evidence_order`, `page`, `section`, and `rerank_score`. Wrap `source.content` in a native `<details>` block, use `source.excerpt` as the summary when available, and show the exact `source.content` when expanded.

- [ ] **Step 5: Render summary and candidate sections independently**

Render `summarySources` under “文档摘要依据” with filename, document ID, file format, summary, and excerpt. Render `message.candidate_preview` under “候选文档” with warning `ElTag`, filename, document ID, `match_kind`, and `matching_reason`. These blocks must render independently of ordinary final source cards and must not share the final group loop.

- [ ] **Step 6: Add scoped styles and run markup tests**

Add compact styles for the collapse title, metadata, tags, folded text, empty states, and candidate/summary sections. Run: `node --test tests/ragChatViewMarkup.test.js`

Expected: PASS for the Element Plus component contract, independent sections, and removal of the old flat source card loop.

### Task 5: Integrate source state and panel without changing chat behavior

**Files:**
- Modify: `src/views/RagChatView.vue`
- Test: `tests/ragChatViewMarkup.test.js`, `tests/ragSources.test.js`

**Interfaces:**
- `loadSourcesHistory(assistantIndex, requestId)` continues to receive the request ID captured from `X-RAG-Request-ID`.
- `RagChatView.vue` passes each assistant message to `<RagSourcesPanel :message="msg" />`.
- Error patches use `createSourcesHistoryErrorState(status)` and never send `question` to `/sources_history`.

- [ ] **Step 1: Add the panel import and replace the old source template**

Import `RagSourcesPanel` and replace the existing `sourcesError`, flat `msg.sources`, and `candidate_preview` blocks with one `<RagSourcesPanel v-if="msg.role === 'assistant'" :message="msg" />`. Leave the answer text markup and input controls unchanged.

- [ ] **Step 2: Use the shared cleared error state in `loadSourcesHistory()`**

Import `createSourcesHistoryErrorState`. In the Axios catch branch, update the captured assistant index with `{ ...createSourcesHistoryErrorState(error.response?.status), sourcesLoading: false }`. Keep the existing payload creation, response state validation, and captured `requestId`; do not add a question or another API call.

- [ ] **Step 3: Ensure loading and successful responses carry all source fields**

Keep the loading patch scoped to the captured assistant. Apply `getSourcesHistoryState(response.data, requestId)` on success so `evidence_status`, `summary_sources`, `source_groups`, `candidate_preview`, and `context_request_id` reach the panel. Do not alter `/chat_stream` request data, header capture, reader loop, or `activeRequestCount` behavior.

- [ ] **Step 4: Run focused tests and inspect the protected diff**

Run: `node --test tests/ragSources.test.js tests/ragChatViewMarkup.test.js`

Then inspect: `git diff -- src/views/RagChatView.vue src/services/ragSources.js`.

Expected: the diff changes only source state/rendering and imports; the `chat_stream` request body, response header capture, stream reader, and request ID propagation remain intact.

### Task 6: Final verification against the acceptance matrix

**Files:**
- Inspect: `src/services/ragSources.js`, `src/components/RagSourcesPanel.vue`, `src/views/RagChatView.vue`, `tests/ragSources.test.js`, `tests/ragChatViewMarkup.test.js`

- [ ] **Step 1: Run all tests**

Run: `npm test`

Expected: Node test runner exits with code 0 and reports no failed tests.

- [ ] **Step 2: Run targeted ESLint without auto-fix**

Run: `npx eslint src/services/ragSources.js src/components/RagSourcesPanel.vue src/views/RagChatView.vue tests/ragSources.test.js tests/ragChatViewMarkup.test.js`

Expected: ESLint exits with code 0. Do not use the repository’s `--fix` lint scripts because verification must not rewrite unrelated files.

- [ ] **Step 3: Build the frontend**

Run: `npm run build`

Expected: Vite exits with code 0 and produces the existing `dist` output without backend changes.

- [ ] **Step 4: Run whitespace and protected-contract checks**

Run: `git diff --check -- src/services/ragSources.js src/components/RagSourcesPanel.vue src/views/RagChatView.vue tests/ragSources.test.js tests/ragChatViewMarkup.test.js`

Run: `rg -n "sources_history|requestPayload|question|X-RAG-Request-ID|RagSourcesPanel" src/views/RagChatView.vue src/services/ragSources.js tests`

Expected: no whitespace errors; `/sources_history` request code contains only `user_id` and `request_id`; `question` remains limited to `/chat_stream` input; no backend files are changed.

- [ ] **Step 5: Report completion without committing**

Report the changed frontend files, test/build outputs, and preserved unrelated working-tree changes. Do not stage or commit unless the user separately requests it.
