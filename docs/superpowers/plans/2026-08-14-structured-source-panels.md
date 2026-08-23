# Structured Source Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复主题反查、画像提及反查和正文精确反查的来源展示，并保持普通 RAG 来源逻辑与分页契约不变。

**Architecture:** 在 `ragSources.js` 统一保存和归一化三个结构化结果字段；在聊天视图按主题、画像提及、正文精确、普通来源的优先级分流；三个结构化结果分别由独立面板展示，普通来源继续交给 `RagSourcesPanel.vue`。所有结果均来自当前 `/sources_history` 响应，不新增检索请求。

**Tech Stack:** Vue 3 `<script setup>`, Element Plus, Axios, Node.js built-in `node:test`, Vite.

## Global Constraints

- `/sources_history` 请求体保持 `{ user_id, request_id }`，request ID 来自对应 `/chat_stream` 响应头 `X-RAG-Request-ID`。
- 首次 `/chat_stream` 请求和普通 RAG 请求不携带主题分页字段；主题分页继续使用原始问题、`topic_limit` 和非空 `topic_cursor`。
- `topic_document_matches`、`profile_mention_matches`、`exact_content_matches` 只有在字段值为对象时进入对应展示模式；字段为 `null` 或缺失时兼容普通 RAG。
- 三个结构化结果不得进入 `sources`、`source_groups`、`summary_sources` 或 `candidate_preview` 的普通来源展示。
- 结构化对象即使 `items` 为空也必须展示对应面板空状态；普通 sources 只有在三个结构化结果均为空时才作为兜底。
- 主题分页复用同一 assistant，不新增用户消息、不追加分页回答文本，并按 `document_id` 去重。
- 只修改前端代码和测试，不修改后端文件；保留已有无关工作区改动，不自动提交。

---

### Task 1: Add failing structured-result state and markup tests

**Files:**
- Modify: `tests/ragSources.test.js`
- Modify: `tests/ragChatViewMarkup.test.js`

- [x] **Step 1: Add response-state tests for all three structured fields**
- [x] **Step 2: Add normalization and document-id deduplication tests**
- [x] **Step 3: Add panel priority, empty-state, ordinary fallback, and field-display markup tests**
- [x] **Step 4: Run focused tests and verify the expected red failures**

### Task 2: Extend source state and normalization helpers

**Files:**
- Modify: `src/services/ragSources.js`
- Modify: `tests/ragSources.test.js`

- [x] **Step 1: Add assistant defaults and valid/error/mismatch state fields**
- [x] **Step 2: Normalize topic/profile pages and deduplicate by `document_id`**
- [x] **Step 3: Normalize exact content pages and preserve evidence metadata**
- [x] **Step 4: Run focused service tests and verify green**

### Task 3: Implement independent structured-result panels

**Files:**
- Modify: `src/components/TopicDocumentMatchesPanel.vue`
- Create: `src/components/ProfileMentionMatchesPanel.vue`
- Create: `src/components/ExactContentMatchesPanel.vue`
- Modify: `src/components/RagSourcesPanel.vue`

- [x] **Step 1: Update formal topic title and empty state**
- [x] **Step 2: Add the profile mention panel with the explicit non-equivalence note**
- [x] **Step 3: Add the exact content panel with page/section/chunk and preview fields**
- [x] **Step 4: Make ordinary sources show their empty state only after a valid sources snapshot**
- [x] **Step 5: Run component markup tests and verify green**

### Task 4: Integrate result-priority branching and preserve pagination

**Files:**
- Modify: `src/views/RagChatView.vue`
- Modify: `tests/ragChatViewMarkup.test.js`

- [x] **Step 1: Save all structured fields from `/sources_history` into the assistant message**
- [x] **Step 2: Render topic, profile, exact, then ordinary panels in priority order**
- [x] **Step 3: Keep pagination scoped to topic results and the current page request ID**
- [x] **Step 4: Run focused integration tests and inspect the protected request body**

### Task 5: Full verification

- [x] **Step 1: Run `npm test`**
- [x] **Step 2: Run targeted ESLint without auto-fix**
- [x] **Step 3: Run `npm run build`**
- [x] **Step 4: Run `git diff --check` and confirm no backend files changed**
