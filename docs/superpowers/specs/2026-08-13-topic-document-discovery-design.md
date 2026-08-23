# P11 主题反查前端设计

## 目标

在现有 `/chat_stream` 和 `/sources_history` 链路上支持后端结果驱动的主题反查、主题文档分页和独立展示，同时保持普通 RAG 请求与来源展示语义不变。

## 设计

首次请求不做前端意图识别，统一发送 `{ user_id, question }`。流式响应结束后读取 `X-RAG-Request-ID`，仅使用该 ID 请求 `/sources_history`。当响应包含非空对象 `topic_document_matches` 时，assistant 进入主题结果模式；字段为 `null` 或旧响应缺失时，继续使用普通 RAG 结果。主题对象即使 `topic` 或 `items` 为空，也必须保留并交给主题组件展示。来源接口的 HTTP 错误按来源错误处理，不能把错误响应降级为普通 RAG。

主题状态保存在当前 assistant 消息中：主题页对象、原始问题、下一游标、是否还有下一页、加载状态和主题错误。主题结果只传给 `TopicDocumentMatchesPanel.vue`；普通结果只传给 `RagSourcesPanel.vue`。两者通过模板条件互斥，避免主题结果触发普通来源卡片。

“加载更多”复用当前 assistant，不新增用户消息，也不追加分页流返回文本。分页请求使用保存的原始问题、固定 `topic_limit: 20` 和上一页 `next_cursor`；每次读取本次新响应的 `X-RAG-Request-ID`，再用该新 ID 请求 `/sources_history`。下一页按 `document_id` 去重，保留后端返回顺序；相同文件名但不同 ID 不去重。`has_more` 为假隐藏按钮；为真但游标为空时显示禁用按钮；请求期间禁用按钮并阻止重复请求。

## 兼容与字段归一化

`ragSources.js` 负责判断主题响应、归一化 `query/query_term`、`matched_topics/topics` 两种字段形态，并维护普通来源状态和主题分页合并。主题组件展示后端的正式归属（`formal`）或正文提及（`mention`）语义，以及每个文档的 `matched_topics`，不按文件名排序或推断主题关系。

## 测试口径

服务层测试覆盖首次请求体、分页请求体、主题响应判定、旧字段兼容、空主题、游标为空、`has_more` 状态和按 `document_id` 合并去重。组件标记测试覆盖主题/普通组件互斥、正式/提及字段、加载更多按钮、分页使用新 request ID 且不追加回答文本，以及普通 RAG 请求回归。
