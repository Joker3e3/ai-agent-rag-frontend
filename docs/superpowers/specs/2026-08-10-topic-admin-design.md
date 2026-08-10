# P05 管理员主题治理页面设计

## 1. 目标

在现有 Vue 前端中新增独立的管理员主题治理页面，用于当前 MVP 的：

- 候选主题审核；
- 父子主题关系查询、发现和审核；
- parent rollup 执行；
- rollup 历史批次查询与回滚。

本轮不修改后端项目、数据库或后端 API 契约，也不修改普通聊天、来源展示、上传、删除和检索逻辑。Career Agent 不改业务请求流程，仅复用共享时间格式化工具显示统一时间。

## 2. 明确不纳入范围

- taxonomy 版本列表；
- taxonomy 版本激活；
- taxonomy 版本回滚；
- 为指定文档生成候选主题；
- 管理员权限探测和页面隐藏；
- 直接访问数据库或内部 ORM；
- 展示完整文档正文、chunks 或文档主题分配明细；
- 将候选主题、未审核关系或 candidate preview 计入正式主题统计。

## 3. API 约束

所有管理员请求统一携带：

```http
X-Topic-Admin-ID: TEST_ADMIN_ID
```

`TEST_ADMIN_ID` 仅作为当前前端 MVP 的固定测试请求头值，不代表生产权限方案。

纳入前端的接口：

```text
GET  /admin/topic-taxonomy/proposals
POST /admin/topic-taxonomy/topics/{topic_id}/review
GET  /admin/topic-taxonomy/relations
POST /admin/topic-taxonomy/relations/discover
POST /admin/topic-taxonomy/relations/{relation_id}/review
POST /admin/topic-taxonomy/rollups/parent
GET  /admin/topic-taxonomy/rollups
POST /admin/topic-taxonomy/rollups/{run_id}/rollback
GET  /admin/topic-taxonomy/topics/history
GET  /admin/topic-taxonomy/topics/active
```

后端计划新增的 `GET /admin/topic-taxonomy/rollups` 是本轮前端联调依赖；前端不实现其后端部分。

## 4. 页面与模块结构

新增独立路由：

```text
/topic-admin
```

新增模块：

```text
src/views/TopicAdminView.vue
src/components/TopicCandidatesPanel.vue
src/components/TopicRelationsPanel.vue
src/components/TopicRollupPanel.vue
src/components/TopicTopicsPanel.vue
src/services/topicTaxonomyAdmin.js
```

`TopicAdminView.vue` 负责 Tab 切换和跨 Tab 状态：

- `taxonomy_version`：由关系列表响应填充；
- `user_id`：默认使用当前应用用户标识，允许在 Rollup 页面修改；
- 当前 Tab 和首次加载状态。

四个功能区域分别负责候选主题、父子关系、Rollup 工作流，以及主题审核历史/已激活主题列表。管理员 API 调用集中在 `topicTaxonomyAdmin.js`，不迁移现有页面的 Axios 调用。

页面按 Tab 懒加载：首次进入某个 Tab 时请求该 Tab 所需列表，避免首次打开页面同时请求所有接口。已激活主题列表以 `topic_id` 为行主键，使用已批准关系的 `canonical_topic_id` 做关联，并在 Drawer 中显示直接父子关系，不构建层级树。

## 5. 候选主题审核

### 查询

调用 `GET /admin/topic-taxonomy/proposals`，本轮不传 `taxonomy_version`。读取响应中的 `proposals` 数组。

表格展示：

- `topic_label`；
- `topic_code`；
- `aliases`；
- `confidence`；
- `support_document_count`；
- `status`；
- `review_status`；
- `proposal_source`。

`status` 和 `review_status` 分开显示。主题生命周期状态按后端字段使用 `system`、`proposed`、`active`、`deprecated`；审核状态使用 `pending`、`approved`、`rejected`、`merged`。不显示正式主题统计。

### 审核

调用 `POST /admin/topic-taxonomy/topics/{topic_id}/review`，请求体为：

```json
{
  "decision": "approve|reject|merge|deprecate",
  "target_topic_code": null,
  "note": null
}
```

- `note` 最长 1000 字符；
- `target_topic_code` 先 trim，最长 128 字符；
- `merge` 必须填写已有规范主题的 `topic_code`，不是主题名称；
- `deprecate` 可选填写替代主题的 `topic_code`；
- 非适用场景发送 `target_topic_code: null`；
- merge 提交前二次确认；
- 请求期间禁用候选主题审核按钮；
- 成功后刷新候选主题列表；
- approve 成功后显示“关系发现处理中，请刷新父子关系列表确认”，不假定关系已生成。

## 6. 父子关系审核

### 查询

调用 `GET /admin/topic-taxonomy/relations`：

- 不传 `taxonomy_version`；
- 默认传 `review_status=proposed`；
- 支持全部、`proposed`、`approved`、`rejected`、`retired` 等状态筛选；
- 保存响应中的 `taxonomy_version`；
- 成功后展示 `parent_topic_label`、`child_topic_label`、`relation_id`、`review_status` 和 `source`。

### 关系发现

调用 `POST /admin/topic-taxonomy/relations/discover`：

- 必须传关系响应中的 `taxonomy_version`；
- 本轮不提供 `topic_id` 输入，执行当前版本的完整关系发现；
- 缺少版本时禁用按钮并提示；
- 成功后展示 `run_id`、执行状态、比较主题数量、proposed 关系数量、歧义数量和模型版本；
- 成功后刷新关系列表；
- 明确提示本次只生成 `proposed` 关系，仍需人工审核。

### 审核

调用 `POST /admin/topic-taxonomy/relations/{relation_id}/review`，请求体为：

```json
{
  "decision": "approve|reject|retire"
}
```

只对 `review_status=proposed` 的关系显示审核操作。审核成功后刷新关系列表；approve 不自动执行 Rollup，只提示继续执行 parent rollup。

## 7. Rollup 与历史批次

### 执行 parent rollup

调用 `POST /admin/topic-taxonomy/rollups/parent`：

```json
{
  "user_id": "<CURRENT_USER_ID>",
  "taxonomy_version": "<RELATION_RESPONSE_VERSION>"
}
```

规则：

- `user_id` 默认当前应用用户标识，允许修改；
- `taxonomy_version` 自动使用关系响应值；
- 版本为空时禁用提交并提示；
- `document_ids` 使用多行输入，每行一个 UUID；
- trim、去重，最多 500 个；
- 未填写时省略 `document_ids` 字段；
- 成功后保存后端返回的 `run_id`、`status` 和 `affected_document_count`；
- 成功后刷新 Rollup 历史列表；
- 不通过前端逻辑补造成功状态。

### 查询历史批次

调用后端新增的 `GET /admin/topic-taxonomy/rollups`：

- `user_id` 必填，默认当前 Rollup 表单中的用户 ID；
- 本轮不提供 taxonomy 版本筛选；
- `status` 默认全部，必要时支持状态筛选；
- `limit` 默认 20；
- `offset` 由分页组件管理；
- 展示 `run_id`、`status`、`taxonomy_version`、`affected_document_count`、`created_assignment_count`、`superseded_assignment_count`、`created_at`、`finished_at` 和 `initiated_by`；
- 不展示文档正文或 chunks。

### 回滚

调用 `POST /admin/topic-taxonomy/rollups/{run_id}/rollback`，`run_id` 直接取历史表格行数据。

- 只有 `status=succeeded` 显示回滚按钮；
- `running`、`failed`、`rolled_back` 只展示状态；
- 使用 `el-popconfirm` 二次确认；
- 确认文案明确说明只撤销该批次继承分配，不删除原始文档、候选主题、规范主题或已批准关系；
- 成功后以接口响应为准刷新历史列表；
- 不在前端自行把状态改为 `rolled_back`。

## 8. 错误和并发处理

管理员 API 统一映射：

- `403`：当前身份没有主题管理员权限；
- `404`：目标主题、关系、版本或批次不存在；
- `422`：请求参数、UUID、状态转换或版本状态不合法；
- `503`：管理员功能或相关后端服务暂不可用。

错误消息展示后端校验详情，不能把失败改写成成功。列表失败时保留空状态和重试按钮；写操作失败后清理对应 loading 状态但不伪造列表变化。

所有发起请求的按钮在对应请求期间禁用。成功后刷新对应列表。页面刷新后重置临时操作状态，只通过后端接口恢复可恢复的数据。

## 9. Element Plus 组件

页面使用：

- `el-table`：候选主题、关系、Rollup 历史；
- `el-tag`：主题状态、审核状态和批次状态；
- `el-descriptions`：详情和最近 Rollup 结果；
- `el-dialog`：主题审核；
- `el-drawer`：主题或关系详情；
- `el-popconfirm`：Rollup 批次回滚；
- `el-select`：关系状态和批次状态筛选；
- `el-button`：查询、刷新、审核、发现、Rollup 和回滚。

## 10. 测试范围

沿用项目现有 Node 原生测试和源码标记测试风格，至少覆盖：

1. 所有管理员请求带固定 `X-Topic-Admin-ID`；
2. 候选主题响应正确映射到列表；
3. 主题 approve/reject/merge/deprecate 请求体；
4. merge/deprecate 的 `target_topic_code` 校验与 trim；
5. 关系发现只传正确的 `taxonomy_version`；
6. 关系 approve/reject/retire 请求体；
7. Rollup 请求体和 `run_id` 保存；
8. 历史批次查询参数、分页和状态筛选；
9. rollback 使用历史行的正确 `run_id`；
10. 403、404、422、503 中文提示；
11. 重复点击不会发送重复请求；
12. proposed 不进入正式主题统计；
13. 页面刷新不保留过期操作状态；
14. 现有聊天、来源展示和 Career Agent 标记测试继续通过。

## 11. 后端依赖与限制

本轮前端依赖后端新增：

```http
GET /admin/topic-taxonomy/rollups
```

如果该接口尚未部署，前端可以完成静态构建和 mocked/unit 测试，但无法完成真实 Rollup 历史联调。前端不通过数据库或其他内部接口绕过该依赖。

## 12. 最终实现补充

- Rollup 历史适配后端的 `{ items, total, limit, offset }` 响应，并按 `status=succeeded` 控制回滚入口。
- 已激活主题与审核历史使用后端新增读取接口；已激活列表仅展示 `active + approved` 主题。
- 已激活主题追加 `父子关系` 列，使用 Drawer 展示直接父主题和直接子主题；不递归推导层级。
- 页面可见的 `aliases`、批次字段、时间字段和 active 状态说明统一使用中文；时间统一显示为 `YYYY-MM-DD HH:mm:ss`。
- 当前候选主题状态映射仍有一项前端一致性优化待单独处理：将显示映射严格收敛到后端真实主题/审核状态枚举。
- 最终验证：`npm test` 76/76 通过，针对性 ESLint 通过，`npm run build` 通过，`git diff --check` 通过。
