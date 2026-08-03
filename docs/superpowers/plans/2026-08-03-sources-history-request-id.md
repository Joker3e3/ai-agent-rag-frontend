# Sources History Request ID Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind each streamed assistant response to its `X-RAG-Request-ID` and use that message-scoped ID to read the matching `/sources_history` snapshot without sending `question`.

**Architecture:** Keep `fetch` streaming and the current post-stream automatic source loading in `RagChatView.vue`. Extract request-id parsing, assistant source state creation, request payload construction, snapshot matching, and status-message mapping into a small pure JavaScript service so the contract can be tested without mounting the Vue component. Each send captures a stable assistant array index, so concurrent sends update only their own message.

**Tech Stack:** Vue 3 `<script setup>`, Fetch API, Axios, Node.js built-in `node:test`, Vite.

## Global Constraints

- `chat_stream` remains a `fetch` POST stream and must read `X-RAG-Request-ID` before `response.body.getReader()`.
- `/sources_history` remains a POST and its JSON body is exactly `{ user_id, request_id }`; it must not contain `question`.
- `request_id` is stored on the corresponding assistant message; no global or generated fallback ID is allowed.
- A missing request header prevents `/sources_history` from being called and marks that assistant's sources unavailable.
- Statuses 400, 403, 404, 410, and 503 receive distinct user-facing source-unavailable messages with no question-based retry.
- A snapshot is current only when its `request_id` and `context_request_id` both match the assistant's request ID.
- Existing `sources` rendering and unrelated working-tree changes remain intact.

---

### Task 1: Add contract helpers and failing tests

**Files:**
- Create: `src/services/ragSources.js`
- Create: `tests/ragSources.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces `createAssistantMessage()` with `request_id`, `context_request_id`, `sources`, `source_groups`, `candidate_preview`, `trace`, and source loading/error state.
- Produces `getRequestIdFromResponse(response)`, `buildSourcesHistoryPayload(userId, requestId)`, `isCurrentSourcesSnapshot(data, assistantRequestId)`, and `getSourcesHistoryErrorMessage(status)`.

- [ ] **Step 1: Add the Node test command and write failing tests**

  Add `"test": "node --test"` to `package.json`, then create tests asserting:

  ```js
  test('builds a sources history payload without question', () => {
    assert.deepStrictEqual(buildSourcesHistoryPayload('test-user', 'rag-1'), {
      user_id: 'test-user',
      request_id: 'rag-1',
    })
  })

  test('does not build a payload for a missing request id', () => {
    assert.equal(buildSourcesHistoryPayload('test-user', ''), null)
  })

  test('requires both response ids to match the assistant id', () => {
    assert.equal(isCurrentSourcesSnapshot({ request_id: 'rag-1', context_request_id: 'rag-1' }, 'rag-1'), true)
    assert.equal(isCurrentSourcesSnapshot({ request_id: 'rag-1', context_request_id: 'rag-2' }, 'rag-1'), false)
    assert.equal(isCurrentSourcesSnapshot({ request_id: 'rag-2', context_request_id: 'rag-2' }, 'rag-1'), false)
  })

  test('maps source snapshot statuses without retry semantics', () => {
    assert.match(getSourcesHistoryErrorMessage(400), /没有可用来源标识/)
    assert.match(getSourcesHistoryErrorMessage(403), /不属于当前用户/)
    assert.match(getSourcesHistoryErrorMessage(404), /不存在/)
    assert.match(getSourcesHistoryErrorMessage(410), /来源已过期，请重新提问/)
    assert.match(getSourcesHistoryErrorMessage(503), /稍后重试/)
  })

  test('creates independent assistant source state', () => {
    const first = createAssistantMessage()
    const second = createAssistantMessage()

    assert.notStrictEqual(first, second)
    assert.equal(first.request_id, '')
    assert.deepStrictEqual(first.sources, [])
    assert.deepStrictEqual(first.source_groups, [])
    assert.deepStrictEqual(first.candidate_preview, [])
    assert.equal(first.context_request_id, '')
  })
  ```

- [ ] **Step 2: Run the focused test and confirm the expected red failure**

  Run `npm test -- --test-name-pattern="sources history|source snapshot|source snapshot statuses"`.

  Expected result: FAIL because `src/services/ragSources.js` does not yet export the contract helpers.

### Task 2: Implement the source contract helpers

**Files:**
- Modify: `src/services/ragSources.js`
- Test: `tests/ragSources.test.js`

**Interfaces:**
- `getRequestIdFromResponse(response)` returns a trimmed header value or `''`.
- `buildSourcesHistoryPayload(userId, requestId)` returns `{ user_id, request_id }` or `null` for a missing ID.
- `isCurrentSourcesSnapshot(data, assistantRequestId)` returns `true` only when both response IDs equal the assistant ID.

- [ ] **Step 1: Implement the minimal helpers and assistant state factory**

  Define `RAG_REQUEST_ID_HEADER = 'X-RAG-Request-ID'` and export the helpers. Keep response source arrays as the original objects so fields such as `filename`, `page`, `content`, `chunk_id`, `document_id`, and `rerank_score` are not discarded.

- [ ] **Step 2: Run the focused tests and confirm green**

  Run `npm test -- --test-name-pattern="sources history|source snapshot|source snapshot statuses"`.

  Expected result: all focused tests pass with zero failures.

### Task 3: Bind streaming responses to assistant messages

**Files:**
- Modify: `src/views/RagChatView.vue`
- Test: `tests/ragSources.test.js`

**Interfaces:**
- `sendMessage` creates one assistant state object per request and captures its stable message index.
- The response header is read before obtaining the body reader; all stream chunks update that captured assistant only.

- [ ] **Step 1: Implement the minimal component integration**

  Import the helpers, replace the inline assistant object with `createAssistantMessage()`, read `const requestId = getRequestIdFromResponse(response)` immediately after `fetch` returns, and splice `{ ...current, request_id: requestId }` into the captured assistant index before `getReader()`.

  Update chunks at the captured index rather than using `messages.value[messages.value.length - 1]`. If the request ID is empty, set the assistant source error and skip `/sources_history` after the stream. Do not generate or cache a replacement ID.

- [ ] **Step 2: Run focused tests and build**

  Run `npm test -- --test-name-pattern="independent assistant|sources history|source snapshot"` and `npm run build`.

  Expected result: tests pass and Vite exits with code 0.

### Task 4: Load and render only the matching source snapshot

**Files:**
- Modify: `src/views/RagChatView.vue`
- Test: `tests/ragSources.test.js`

**Interfaces:**
- The post-stream call uses `axios.post(`${API_BASE_URL}/sources_history`, { user_id: USER_ID, request_id: assistant.request_id })`.
- Successful data stores `sources`, `source_groups`, `candidate_preview`, `context_request_id`, and `trace` on that assistant; groups are not appended to `sources`.

- [ ] **Step 1: Implement source loading and status handling**

  Call `/sources_history` only after a non-empty assistant request ID exists. On 200, require `request_id === context_request_id === assistant.request_id` before applying source data. Map 400/403/404/410/503 through `getSourcesHistoryErrorMessage`; all other failures use a generic source-unavailable message. Never retry and never send the original question.

  Keep the current `sources` card loop unchanged for normal sources. Add only an inline unavailable message and, when `sources` is empty but `candidate_preview` is non-empty, a separately labelled candidate-document block; never merge candidates or source groups into `sources`.

- [ ] **Step 2: Run the full test suite and build**

  Run `npm test` and `npm run build`.

  Expected result: all tests pass and the production build exits with code 0.

### Task 5: Static contract audit and final verification

**Files:**
- Inspect: `src/views/RagChatView.vue`, `src/services/ragSources.js`, `tests/ragSources.test.js`

- [ ] **Step 1: Search for forbidden request patterns**

  Run `rg -n "sources_history|request_id|question" src tests` and verify no `/sources_history` call uses `question`, no generated request ID exists, and no module-level mutable request ID is used.

- [ ] **Step 2: Run lint without auto-fixing user files**

  Run `npx eslint src/services/ragSources.js tests/ragSources.test.js src/views/RagChatView.vue`.

  Expected result: exit code 0; if the repository's existing lint setup reports unrelated baseline issues, report them separately and do not run the auto-fix script.

- [ ] **Step 3: Inspect the final diff and working-tree scope**

  Run `git diff -- src/views/RagChatView.vue src/services/ragSources.js tests/ragSources.test.js package.json docs/superpowers/plans/2026-08-03-sources-history-request-id.md` and `git status --short`.

  Verify only the intended files were added or modified by this task; existing `.gitignore` and `src/views/CareerAgent.vue` changes must remain untouched.
