# P11 Topic Document Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backend-result-driven topic document discovery and cursor pagination to the existing chat flow without changing ordinary RAG retrieval or source rendering.

**Architecture:** Keep request construction, topic response normalization, page merging, and assistant source state contracts in `src/services/ragSources.js`. Keep orchestration in `RagChatView.vue`: initial requests append streamed text, pagination reuses the assistant and discards its stream text, and every page uses its own response request ID for `/sources_history`. Render topic results through a new `TopicDocumentMatchesPanel.vue`, mutually exclusive with `RagSourcesPanel.vue`.

**Tech Stack:** Vue 3 `<script setup>`, Axios, Fetch streaming, Element Plus, Node.js built-in `node:test`, Vite.

## Global Constraints

- The first `/chat_stream` request sends only `user_id` and `question`; the frontend does not identify topic intent.
- `topic_limit` and `topic_cursor` are sent only for topic pagination, with `topic_limit: 20` and the previous non-empty `next_cursor`.
- `topic_document_matches` is topic mode only when the field exists and contains an object; `null` and missing fields preserve ordinary RAG compatibility.
- HTTP 400/403/404/410/503 from source history is an error state and never a fallback to ordinary RAG.
- Topic documents never enter `sources`, `source_groups`, `summary_sources`, or `candidate_preview` rendering.
- Topic item order is the backend order; duplicate documents are removed only by non-empty `document_id`.
- Pagination reuses one assistant message, adds no user message, and never appends pagination stream text to the assistant answer.
- Existing unrelated working-tree changes remain untouched; no Git commit is created automatically.

---

### Task 1: Add failing service and markup tests for topic state and pagination

**Files:**
- Modify: `tests/ragSources.test.js`
- Modify: `tests/ragChatViewMarkup.test.js`
- Test contract: `src/services/ragSources.js`, `src/views/RagChatView.vue`, `src/components/TopicDocumentMatchesPanel.vue`

**Interfaces:**
- `buildChatStreamPayload(userId, question, options)` returns an initial or pagination request body.
- `isTopicDocumentMatchesResponse(data)` distinguishes an object topic page from `null` or missing legacy data.
- `normalizeTopicDocumentMatches(value)` returns the canonical topic page shape.
- `mergeTopicDocumentMatches(previous, next)` appends backend-ordered items and deduplicates by `document_id`.

- [x] **Step 1: Add failing request and response contract tests**

Append tests to `tests/ragSources.test.js` asserting:

```js
test('keeps the initial chat request free of topic pagination fields', () => {
  const buildChatStreamPayload = getHelper('buildChatStreamPayload')
  assert.deepStrictEqual(buildChatStreamPayload('user-a', 'topic question'), {
    user_id: 'user-a',
    question: 'topic question',
  })
})

test('builds a topic pagination request with the cursor fields', () => {
  const buildChatStreamPayload = getHelper('buildChatStreamPayload')
  assert.deepStrictEqual(buildChatStreamPayload('user-a', 'topic question', {
    topicLimit: 20,
    topicCursor: 'cursor-a',
  }), {
    user_id: 'user-a',
    question: 'topic question',
    topic_limit: 20,
    topic_cursor: 'cursor-a',
  })
})

test('treats an object topic page as topic mode but keeps null and missing legacy responses ordinary', () => {
  const isTopicDocumentMatchesResponse = getHelper('isTopicDocumentMatchesResponse')
  assert.equal(isTopicDocumentMatchesResponse({ topic_document_matches: { items: [] } }), true)
  assert.equal(isTopicDocumentMatchesResponse({ topic_document_matches: null }), false)
  assert.equal(isTopicDocumentMatchesResponse({ sources: [] }), false)
})

test('normalizes current and legacy topic page field names without throwing', () => {
  const normalizeTopicDocumentMatches = getHelper('normalizeTopicDocumentMatches')
  assert.deepStrictEqual(normalizeTopicDocumentMatches({
    query_term: 'database',
    topic: { topic_code: 'db', topic_label: 'Database' },
    items: [{ document_id: 'doc-a', topics: [{ topic_role: 'primary' }] }],
    has_more: true,
    next_cursor: 'cursor-a',
  }), {
    query_term: 'database',
    query: 'database',
    topic: { topic_code: 'db', topic_label: 'Database' },
    items: [{
      document_id: 'doc-a',
      topics: [{ topic_role: 'primary' }],
      matched_topics: [{ topic_role: 'primary' }],
    }],
    has_more: true,
    next_cursor: 'cursor-a',
  })
})
```

- [x] **Step 2: Add failing page merge tests**

Append tests asserting an empty topic page remains a topic page and that merge preserves order, removes only duplicate IDs, and keeps same-name different-ID documents:

```js
test('merges topic pages by document id while preserving backend order', () => {
  const mergeTopicDocumentMatches = getHelper('mergeTopicDocumentMatches')
  const merged = mergeTopicDocumentMatches(
    { query: 'db', topic: null, items: [
      { document_id: 'doc-a', filename: 'same.pdf' },
      { document_id: 'doc-b', filename: 'same.pdf' },
    ], has_more: true, next_cursor: 'cursor-b' },
    { query: 'db', topic: null, items: [
      { document_id: 'doc-b', filename: 'same.pdf' },
      { document_id: 'doc-c', filename: 'same.pdf' },
    ], has_more: false, next_cursor: null },
  )
  assert.deepStrictEqual(merged.items.map(item => item.document_id), ['doc-a', 'doc-b', 'doc-c'])
  assert.equal(merged.has_more, false)
  assert.equal(merged.next_cursor, null)
})

test('keeps an empty topic page distinct from ordinary RAG state', () => {
  const getSourcesHistoryState = getHelper('getSourcesHistoryState')
  const state = getSourcesHistoryState({
    request_id: 'rag-topic',
    context_request_id: 'rag-topic',
    topic_document_matches: {
      query: 'missing topic', topic: null, items: [], has_more: false, next_cursor: null,
    },
  }, 'rag-topic')
  assert.deepStrictEqual(state.topic_document_matches.items, [])
  assert.equal(state.sources.length, 0)
})
```

- [x] **Step 3: Add failing markup contract tests**

Read `TopicDocumentMatchesPanel.vue` with a missing-file fallback and add assertions for `matched_topics`, `formal`, `mention`, `has_more`, `next_cursor`, the Chinese “加载更多” label, and an emitted load-more event. Add assertions that `RagChatView.vue` renders the topic panel only when `topic_document_matches` exists, renders `RagSourcesPanel` only when it does not, calls `getRequestIdFromResponse` in pagination flow, and does not append pagination response chunks.

- [x] **Step 4: Run focused tests and verify the expected red failure**

Run: `node --test tests/ragSources.test.js tests/ragChatViewMarkup.test.js`

Expected: existing tests pass and the new tests fail because the topic helpers, topic component, and pagination integration do not yet exist.

### Task 2: Implement topic response normalization and assistant state helpers

**Files:**
- Modify: `src/services/ragSources.js`
- Modify: `tests/ragSources.test.js`

**Interfaces:**
- `buildChatStreamPayload(userId, question, { topicLimit, topicCursor } = {})` omits pagination fields unless supplied and includes the supplied cursor unchanged after trimming.
- `isTopicDocumentMatchesResponse(data)` returns true only for an own `topic_document_matches` field containing a non-array object.
- `normalizeTopicDocumentMatches(value)` supports `query`/`query_term` and `matched_topics`/`topics`, preserving item order.
- `mergeTopicDocumentMatches(previous, next)` returns one canonical page with stable prior-then-next order and ID-based deduplication.
- `createAssistantMessage()` and all source error/mismatch states include `topic_document_matches: null`, `topic_original_question`, `topic_loading`, `topic_error`.

- [x] **Step 1: Implement request payload and topic mode predicates**

Add a `buildChatStreamPayload` helper that starts with `{ user_id, question }` and only adds `topic_limit` and a non-empty trimmed `topic_cursor` when the options object contains them. Add `isTopicDocumentMatchesResponse` with an own-property check so an old response with no field is ordinary.

- [x] **Step 2: Implement canonical topic page normalization**

Normalize missing arrays to `[]`, missing `topic` to `null`, `query_term` to `query`, and legacy item `topics` to `matched_topics` without sorting or mutating the backend order. Preserve other response/item fields for display compatibility.

- [x] **Step 3: Implement ID-based page merge**

Append items in input order. Track non-empty `document_id` values in a `Set`; skip later items with an existing ID, but retain items without IDs as separate entries. Carry forward the first page query/topic when the next page omits them, and use the next page’s `has_more`/`next_cursor`.

- [x] **Step 4: Extend source history and assistant state**

Add `topic_document_matches` to `createAssistantMessage`, `getSourcesHistoryState`, request-ID mismatch state, and `createSourcesHistoryErrorState`. Valid responses normalize the topic object only when `isTopicDocumentMatchesResponse` is true; `null` and missing fields become `null`. Add the original-question/loading/error fields with safe defaults.

- [x] **Step 5: Run service tests and verify green**

Run: `node --test tests/ragSources.test.js`

Expected: all service tests pass, including the existing ordinary-source state tests and the new topic request/normalization/merge tests.

### Task 3: Add and implement the independent topic document panel

**Files:**
- Create: `src/components/TopicDocumentMatchesPanel.vue`
- Modify: `tests/ragChatViewMarkup.test.js`

**Interfaces:**
- Props: `{ matches: Object, loading: Boolean, error: String }`.
- Emits: `load-more` only when the button is clicked while `has_more` is true, the cursor is non-empty, and loading is false.
- No HTTP calls, sorting, document-name deduplication, or ordinary source rendering.

- [x] **Step 1: Implement the component state and button guard**

Render the query and topic label/code from `matches`, use `matches.match_kind` to label `formal` as “正式归属” and `mention` as “正文提及”, and compute `canLoadMore` from `matches.has_more === true` and a non-empty `matches.next_cursor`. Disable the button when `loading` or `canLoadMore` is false; keep it visible whenever `has_more` is true, including an empty-cursor page.

- [x] **Step 2: Render documents in backend order with independent topic metadata**

Loop over `matches.items` using a key based on `document_id` plus the original index. Show `filename`, `document_id`, `document_type`, and each `matched_topics` entry with `topic_code`, `topic_label`, `topic_role`, and `assignment_kind`. Use tags or text labels for `formal` and `mention`; do not create ordinary chunk/source cards.

- [x] **Step 3: Render empty, loading, and error states**

Always render the panel for a topic object. Show a topic-specific empty message when `items` is empty, preserve the topic label when present, and show `error` without hiding previously loaded items. Render the loading button state and do not prompt the user to type “加载更多”.

- [x] **Step 4: Run markup tests and verify green**

Run: `node --test tests/ragChatViewMarkup.test.js`

Expected: the topic panel markup tests pass; integration assertions may remain red until Task 4 wires the view.

### Task 4: Integrate result branching and cursor pagination in the chat view

**Files:**
- Modify: `src/views/RagChatView.vue`
- Modify: `tests/ragChatViewMarkup.test.js`
- Modify: `src/services/ragSources.js` only if a narrowly scoped state helper is needed by the integration

**Interfaces:**
- Initial `sendMessage()` calls `buildChatStreamPayload(USER_ID, originalQuestion)` and keeps the existing streaming append behavior.
- `loadMoreTopicDocuments(assistantIndex)` reuses the assistant, sends the saved original question with `{ topicLimit: 20, topicCursor }`, captures the new request ID, discards stream chunks, and merges only a topic response.
- `loadSourcesHistory()` uses the request ID from the current page and never sends a question to `/sources_history`.

- [x] **Step 1: Add topic panel import and mutually exclusive template branches**

Import `TopicDocumentMatchesPanel` and render:

```vue
<RagSourcesPanel
  v-if="msg.role === 'assistant' && !msg.topic_document_matches"
  :message="msg"
/>
<TopicDocumentMatchesPanel
  v-else-if="msg.role === 'assistant' && msg.topic_document_matches"
  :matches="msg.topic_document_matches"
  :loading="msg.topic_loading"
  :error="msg.topic_error"
  @load-more="loadMoreTopicDocuments(index)"
/>
```

This keeps topic documents out of ordinary source rendering while allowing a topic object with empty items to remain visible.

- [x] **Step 2: Preserve the initial question and use the ordinary initial payload**

Capture `const originalQuestion = question.value` before clearing input, assign it to the assistant’s `topic_original_question`, and call `buildChatStreamPayload(USER_ID, originalQuestion)` without topic options. Do not add topic fields based on text or response assumptions.

- [x] **Step 3: Refactor stream consumption into append/discard behavior**

Keep the current reset handling and request-ID capture. Use a small local stream reader helper or equivalent branch so initial requests append chunks to the assistant content, while pagination reads to completion without changing that content. A pagination response must use its own `getRequestIdFromResponse(response)` result.

- [x] **Step 4: Implement pagination request and source-history merge**

Guard on conversation generation, `topic_loading`, `topic_document_matches`, `topic_has_more`/`has_more`, and a non-empty cursor. Set `topic_loading` before fetching; increment/decrement the existing active request counter. Fetch `/chat_stream` with the saved original question, `topic_limit: 20`, and the previous cursor. After the stream, call `/sources_history` with the newly captured request ID. If the page is an object, merge it into the existing topic object and update the latest request ID; if it is missing/null, keep the topic panel and set a topic error instead of falling back to ordinary sources.

- [x] **Step 5: Handle source HTTP errors without ordinary fallback**

Initial `/sources_history` errors use the existing cleared source error state. Pagination `/sources_history` errors keep prior topic items, set `topic_error`, clear `topic_loading`, and do not append an assistant error message or show ordinary source cards. Preserve status-specific 400/403/404/410/503 messages through the existing error mapper.

- [x] **Step 6: Run focused tests and inspect the protected request diff**

Run: `node --test tests/ragSources.test.js tests/ragChatViewMarkup.test.js`

Inspect: `git diff -- src/views/RagChatView.vue src/services/ragSources.js src/components/TopicDocumentMatchesPanel.vue`.

Expected: initial request construction has no topic fields, pagination uses the saved question and current-page request ID, topic and ordinary panels are mutually exclusive, and pagination does not append stream text.

### Task 5: Full verification and acceptance checklist

**Files:**
- Inspect: `src/services/ragSources.js`, `src/components/TopicDocumentMatchesPanel.vue`, `src/views/RagChatView.vue`, `tests/ragSources.test.js`, `tests/ragChatViewMarkup.test.js`

- [x] **Step 1: Run all tests**

Run: `npm test`

Expected: Node exits with code 0 and reports zero failures.

- [x] **Step 2: Run lint without auto-fix**

Run: `npx eslint src/services/ragSources.js src/components/TopicDocumentMatchesPanel.vue src/views/RagChatView.vue tests/ragSources.test.js tests/ragChatViewMarkup.test.js`

Expected: exit code 0. Do not use repository `--fix` scripts during verification.

- [x] **Step 3: Build the frontend**

Run: `npm run build`

Expected: Vite exits with code 0.

- [x] **Step 4: Run contract and whitespace checks**

Run:

```powershell
git diff --check -- src/services/ragSources.js src/components/TopicDocumentMatchesPanel.vue src/views/RagChatView.vue tests/ragSources.test.js tests/ragChatViewMarkup.test.js
rg -n "chat_stream|sources_history|topic_limit|topic_cursor|X-RAG-Request-ID|TopicDocumentMatchesPanel|RagSourcesPanel" src/views/RagChatView.vue src/services/ragSources.js src/components/TopicDocumentMatchesPanel.vue
```

Confirm ordinary requests omit pagination fields, source history payload remains `{ user_id, request_id }`, and unrelated `.gitignore`/document-plan changes remain present.

- [x] **Step 5: Report the execution handoff**

Report the changed files, test/lint/build results, topic acceptance coverage, and the preserved unrelated working-tree changes. Do not stage or commit automatically.
