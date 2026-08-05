# RAG 知识库问答来源展示设计

## 目标

优化知识库问答页面的来源展示，使最终回答证据、文档摘要依据和候选文档明确分区，同时保证每个来源响应只绑定到发起该回答的 `request_id`。

## 范围与约束

- 只修改前端代码和前端测试，不修改后端代码、检索链路或 API 契约。
- `/sources_history` 请求体严格为 `{ user_id, request_id }`，不发送 `question`。
- `request_id` 必须来自当前 `/chat_stream` 响应头 `X-RAG-Request-ID`。
- 不重新检索，不调用其他接口补来源，不生成或缓存替代 request ID。
- `sources` 和 `source_groups` 不包含 `document_type`。
- 来源卡片只能展示文件名、`document_id`、文件格式和 `evidence_status`；不得根据文件名推断“通用文档”“个人简历”等业务类型。
- 保留工作区内与本需求无关的已有改动。

## 后端数据分区

### 最终 chunk 证据

`sources` 是最终用于回答的 chunk 证据列表。每个 chunk 保留后端返回的原始字段，包括 `document_id`、`filename`、`chunk_id`、`chunk_index`、`page`、`section`、`content`、`excerpt`、`content_sha256`、`rerank_score` 和 `evidence_order`。

`source_groups` 是后端按 `document_id` 组织的最终证据。前端优先使用它；当响应没有有效的 `source_groups` 时，才从 `sources` 做兼容性分组。两种输入都只能产生最终 chunk 来源，不得混入其他来源类别。

### 文档摘要依据

`summary_sources` 当前是扁平数组，每项包含 `source_kind`、`document_id`、`filename`、`file_hash`、`summary` 和 `excerpt`。前端以数组为主实现，单独显示为“文档摘要依据”。可以增加防御性兼容逻辑处理未来出现的文档组形态，但正常数据流不得依赖该形态，也不得把摘要依据转成普通 chunk 来源。

### 候选文档

`candidate_preview` 是文档发现候选预览，单独显示为“候选文档”。它不参与最终来源卡片、普通来源数量、chunk 去重或 evidence 状态判断。

## 数据流设计

1. 用户发送问题后，页面按当前实现调用 `POST /chat_stream`。
2. 在读取 `response.body` 之前，从响应头读取并清理 `X-RAG-Request-ID`，写入该 assistant 消息的 `request_id`。
3. 流读取结束后，使用当前 assistant 的 `request_id` 调用 `POST /sources_history`，请求体只包含：

   ```json
   {
     "user_id": "<USER_ID>",
     "request_id": "<RAG_REQUEST_ID>"
   }
   ```

4. 只有当响应中的 `request_id` 和 `context_request_id` 都与当前 assistant 的 `request_id` 相等时，才把响应数据写入该 assistant 消息；否则丢弃来源数组并显示关联不一致错误。
5. 来源请求和更新均使用发送时捕获的 assistant 索引，不能通过消息列表最后一项更新，从而保证两个并发回答的来源不会串用。

当前后端响应会返回与请求 ID 对应的 `request_id` 和 `context_request_id`。前端保留这两个字段的双重校验；如果任一字段缺失或不匹配，按来源快照过期/错配处理，不尝试猜测或补造 request ID。

## 归一化规则

来源归一化放在 `src/services/ragSources.js`，展示组件不直接承担后端兼容和去重算法。

### 文档分组

- 有效 `source_groups` 非空时，优先读取其中的组。
- 每个 `document_id` 最多生成一个文档组；重复组按原始出现顺序合并 chunks。
- 分组键使用 `document_id`，绝不使用 `filename`。同名但不同 `document_id` 的文档保持为不同组。
- 缺少 `document_id` 的 chunk 不得因为同名文件或同页而合并；使用带原始索引的合成组键并保留为独立文档卡片，卡片中将 `document_id` 显示为未提供，不推断业务类型。

### chunk 顺序

每个文档组内部按以下优先级排序：

1. 有效的 `evidence_order`；
2. 缺少 `evidence_order` 时使用 `chunk_index`；
3. 两者相同或都缺失时保持后端原始顺序。

排序过程不读取或比较文件名。

### chunk 去重

每个文档组内使用以下身份顺序：

1. `chunk_id` 存在时使用 `chunk_id`；
2. `chunk_id` 缺失且 `content_sha256` 存在时使用 `content_sha256`；
3. 两者都缺失时保留 chunk，不使用 `filename + page` 作为身份。

去重保留首次出现的后端对象，确保展示的字段和内容与响应一致。

### 摘要依据兼容

正常路径直接使用扁平 `summary_sources`。若防御性归一化遇到包含 `sources` 数组的未来形态，只能将组头字段补到摘要项或展开为摘要展示项，不能把它们并入普通 chunk 分组。

## 展示结构

新增独立来源展示组件 `src/components/RagSourcesPanel.vue`，由 `RagChatView.vue` 传入当前 assistant 消息。

### 加载和错误

- 请求进行中显示“正在加载来源”。
- 400 显示当前回答没有可用来源标识。
- 403 显示来源快照不属于当前用户。
- 404 显示来源快照不存在。
- 410 显示来源已过期，请重新提问。
- 503 显示来源服务暂不可用，请稍后重试。
- 其他错误显示通用来源不可用信息。
- request ID 关联不一致时清空来源数据并显示关联不一致信息。

### 普通最终来源

普通来源只在 `evidence_status === "supported"` 且 `sources` 非空时展示。`source_groups` 归一化后使用 Element Plus `ElCollapse` / `ElCollapseItem`：

- 每个 `document_id` 一个折叠文档卡片。
- 卡片头部只显示一次 `filename`、`document_id`、文件格式 `ElTag` 和 evidence 状态 `ElTag`。
- 文件格式只从文件名扩展名得到，例如 `PDF`、`DOCX`、`TXT`；这不是业务 `document_type`。
- 卡片内部展示该文档的 chunks，使用 `ElDescriptions` 或紧凑信息布局展示 `chunk_id`、页码、section、chunk 序号和 rerank 分数等原始字段。
- 长文本默认折叠或省略，展开后显示后端返回的 `content`；不能重新拼接、改写或重新检索内容。

### 状态门控和空来源

- `not_found` 显示“无相关证据”，不显示普通来源卡片，也不显示历史来源。
- `insufficient` 和 `ambiguous` 显示对应 evidence 状态标签，但不显示普通来源卡片。
- `supported` 但 `sources` 为空时不显示普通来源卡片，并显示空来源提示。
- 候选文档仍遵循自己的独立区块规则，不被渲染成最终来源。

`not_found` 的“无相关证据”是来源区域的明确空状态，而不是仅通过隐藏普通卡片来表示；该状态下普通来源、旧来源快照内容都必须为空。

### 文档摘要依据

当 `summary_sources` 非空时，独立显示“文档摘要依据”区块。每条摘要项显示后端返回的文件名、`document_id`、文件格式、摘要和 excerpt；摘要区块不使用普通来源的 `source_groups`，也不参与普通来源的状态门控和 chunk 去重。

### 候选文档

当 `candidate_preview` 非空时，独立显示“候选文档”区块，并用 `ElTag` 标记候选状态。展示 `filename`、`document_id`、匹配类型、匹配原因等后端字段，不把候选项放入普通来源折叠卡片。

## 状态保存

扩展 `createAssistantMessage()` 和 `getSourcesHistoryState()`，保存：

- `evidence_status`
- `summary_sources`
- 已有的 `sources`、`source_groups`、`candidate_preview`、`context_request_id`、`trace`
- `sourcesLoading` 和 `sourcesError`

来源请求失败或响应关联校验失败时，同时清空 `sources`、`source_groups`、`summary_sources` 和 `candidate_preview`，避免同一个 assistant 保留旧快照；不自动重试，不使用问题文本触发来源查询。400、403、404、410、503 使用明确文案，其他 HTTP 错误和网络错误使用通用来源不可用文案。

## 测试设计

- `tests/ragSources.test.js`
  - 请求体只含 `user_id` 和 `request_id`。
  - 从 `X-RAG-Request-ID` 读取当前响应 ID。
  - 响应 ID 双重匹配，拒绝错配快照。
  - `source_groups` 优先于 `sources`。
  - `source_groups` 为空时从 `sources` 按 `document_id` 做兼容分组。
  - 相同 `document_id` 合并为一个文档组；同名不同 ID 保持分离。
  - 缺少 `document_id` 时按原始项生成独立合成组键，不因文件名或页码合并。
  - `evidence_order`、`chunk_index` 的稳定排序。
  - `chunk_id`、`content_sha256` 去重，且不按文件名和页码去重。
  - 扁平 `summary_sources` 与候选数据保持独立。
  - supported、not_found、insufficient、ambiguous 的展示门控数据。
  - 错配/过期响应和 HTTP/网络错误会清空四类来源数据并显示错误状态。
- `tests/ragChatViewMarkup.test.js`
  - 页面使用独立来源组件或对应的 Element Plus 折叠组件。
  - 普通文档使用 `ElCollapse` / `ElCollapseItem`，chunk 使用描述信息布局。
  - 模板包含摘要依据和候选文档独立区块。
  - 模板没有按 `sources` 直接生成文件卡片的旧逻辑。
  - `/sources_history` 调用使用已捕获的 request ID，不包含 `question`。
  - `X-RAG-Request-ID` 捕获结果被用于当前 assistant 的 `/sources_history` 请求。
- 执行 `npm test`、针对来源测试的聚焦测试、`npx eslint`、`npm run build` 和 `git diff --check`。

## 非目标

- 不修改 `/chat_stream` 请求体、流式解码、检索逻辑或 request ID 生成逻辑。
- 不新增后端接口，不修改 `/sources_history` 参数契约。
- 不展示或推断后端未返回的 `document_type`。
- 不把摘要依据、候选预览或历史快照合并进最终 chunk 证据。
