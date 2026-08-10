<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import {
  getTopicAdminErrorMessage,
  normalizeRollupsResponse,
} from '../services/topicTaxonomyAdmin'
import { formatDateTime } from '../utils/dateTime'

const props = defineProps({
  api: {
    type: Object,
    required: true,
  },
  active: {
    type: Boolean,
    default: false,
  },
  taxonomyVersion: {
    type: String,
    default: '',
  },
  userId: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:user-id'])

const documentIdsText = ref('')
const rollupSubmitting = ref(false)
const rollbackSubmitting = ref(false)
const rollupResult = ref(null)
const historyLoading = ref(false)
const historyLoaded = ref(false)
const historyError = ref('')
const historyItems = ref([])
const historyTotal = ref(0)
const historyStatus = ref('')
const historyPage = ref(1)
const historyPageSize = 20

const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '成功', value: 'succeeded' },
  { label: '运行中', value: 'running' },
  { label: '失败', value: 'failed' },
  { label: '已回滚', value: 'rolled_back' },
]

const normalizeText = (value) => String(value ?? '').trim()

const documentIds = computed(() => [...new Set(
  documentIdsText.value
    .split(/\r?\n/)
    .map(normalizeText)
    .filter(Boolean),
)])

const invalidDocumentIds = computed(() => documentIds.value.filter((value) => (
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
)))

const canExecuteRollup = computed(() => Boolean(
  normalizeText(props.userId) &&
  normalizeText(props.taxonomyVersion) &&
  documentIds.value.length <= 500 &&
  invalidDocumentIds.value.length === 0 &&
  !rollupSubmitting.value &&
  !rollbackSubmitting.value,
))

const statusTagType = (status) => {
  if (status === 'succeeded') return 'success'
  if (status === 'running') return 'warning'
  if (['failed', 'rolled_back'].includes(status)) return 'danger'
  return 'info'
}

const statusLabel = (status) => statusOptions.find(option => option.value === status)?.label || normalizeText(status) || '未知'

const updateUserId = (value) => emit('update:user-id', value)

const validateRollupForm = () => {
  if (!normalizeText(props.userId)) {
    ElMessage.warning('user_id 不能为空')
    return false
  }
  if (!normalizeText(props.taxonomyVersion)) {
    ElMessage.warning('未获取有效的当前激活 taxonomy 版本，无法执行 Rollup')
    return false
  }
  if (documentIds.value.length > 500) {
    ElMessage.warning('document_ids 最多填写 500 个')
    return false
  }
  if (invalidDocumentIds.value.length) {
    ElMessage.warning('存在无效 document UUID，请检查每行输入')
    return false
  }
  return true
}

const loadRollups = async () => {
  if (!normalizeText(props.userId)) {
    historyError.value = '请先填写 user_id'
    return
  }

  historyLoading.value = true
  historyError.value = ''
  try {
    const response = await props.api.listRollups({
      userId: props.userId,
      status: historyStatus.value,
      limit: historyPageSize,
      offset: (historyPage.value - 1) * historyPageSize,
    })
    const normalized = normalizeRollupsResponse(response.data)
    historyItems.value = normalized.rollups
    historyTotal.value = normalized.total
    historyLoaded.value = true
  } catch (requestError) {
    historyItems.value = []
    historyTotal.value = 0
    historyError.value = getTopicAdminErrorMessage(requestError)
  } finally {
    historyLoading.value = false
  }
}

const executeRollup = async () => {
  if (rollupSubmitting.value || rollbackSubmitting.value) return
  if (!validateRollupForm()) return

  rollupSubmitting.value = true
  try {
    const response = await props.api.executeParentRollup({
      userId: props.userId,
      taxonomyVersion: props.taxonomyVersion,
      documentIds: documentIds.value,
    })
    rollupResult.value = response.data
    if (response.data?.run_id) {
      ElMessage.success('parent rollup 执行成功')
    } else {
      ElMessage.error('后端未返回 run_id，无法安全执行回滚')
    }
    historyPage.value = 1
    await loadRollups()
  } catch (requestError) {
    ElMessage.error(getTopicAdminErrorMessage(requestError))
  } finally {
    rollupSubmitting.value = false
  }
}

const rollbackRollup = async (runId) => {
  if (rollbackSubmitting.value || rollupSubmitting.value) return

  rollbackSubmitting.value = true
  try {
    await props.api.rollbackRollup(runId)
    ElMessage.success('Rollup 批次回滚请求成功')
    await loadRollups()
  } catch (requestError) {
    ElMessage.error(getTopicAdminErrorMessage(requestError))
  } finally {
    rollbackSubmitting.value = false
  }
}

const handleStatusChange = () => {
  historyPage.value = 1
  loadRollups()
}

const handlePageChange = (page) => {
  historyPage.value = page
  loadRollups()
}

watch(() => props.active, (active) => {
  if (active && !historyLoaded.value) loadRollups()
}, { immediate: true })
</script>

<template>
  <section class="topic-panel" aria-label="Parent Rollup 与批次回滚">
    <div class="panel-heading">
      <div>
        <h2>Parent Rollup 与批次回滚</h2>
        <p>关系审核通过后执行；回滚只撤销指定批次产生的继承分配。</p>
      </div>
      <el-button
        plain
        :loading="historyLoading"
        :disabled="historyLoading || rollupSubmitting || rollbackSubmitting"
        @click="loadRollups"
      >
        刷新历史
      </el-button>
    </div>

    <div class="rollup-form-card">
      <el-form label-position="top">
        <el-form-item label="user_id" required>
          <el-input
            :model-value="userId"
            :disabled="rollupSubmitting || rollbackSubmitting"
            placeholder="请输入用户 ID"
            @update:model-value="updateUserId"
          />
        </el-form-item>
        <el-form-item label="taxonomy_version" required>
          <el-input :model-value="taxonomyVersion || '未获取'" disabled />
          <div class="field-hint">由父子关系列表响应自动填充，不允许前端猜测。</div>
        </el-form-item>
        <el-form-item label="document_ids（可选，每行一个 UUID）">
          <el-input
            v-model="documentIdsText"
            type="textarea"
            :rows="4"
            :disabled="rollupSubmitting || rollbackSubmitting"
            placeholder="不填写时处理用户范围内受影响文档"
          />
          <div class="field-hint">
            已输入 {{ documentIds.length }} 个；最多 500 个。
            <span v-if="invalidDocumentIds.length" class="field-error">存在无效 UUID</span>
          </div>
        </el-form-item>
      </el-form>
      <el-button
        type="primary"
        :loading="rollupSubmitting"
        :disabled="!canExecuteRollup"
        @click="executeRollup"
      >
        执行 parent rollup
      </el-button>
      <div v-if="!taxonomyVersion" class="version-warning">
        未获取有效的当前激活 taxonomy 版本，无法执行 Rollup。
      </div>
    </div>

    <el-descriptions v-if="rollupResult" title="最近一次 Rollup 结果" :column="3" border class="result-descriptions">
      <el-descriptions-item label="run_id">{{ rollupResult.run_id || '-' }}</el-descriptions-item>
      <el-descriptions-item label="状态">
        <el-tag :type="statusTagType(rollupResult.status)" effect="light">
          {{ statusLabel(rollupResult.status) }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="受影响文档数">
        {{ rollupResult.affected_document_count ?? '-' }}
      </el-descriptions-item>
    </el-descriptions>

    <div class="history-heading">
      <div>
        <h3>Rollup 历史批次</h3>
        <p>仅 succeeded 批次允许回滚；历史数据来自后端查询接口。</p>
      </div>
      <el-select v-model="historyStatus" class="status-select" @change="handleStatusChange">
        <el-option
          v-for="option in statusOptions"
          :key="option.value || 'all'"
          :label="option.label"
          :value="option.value"
        />
      </el-select>
    </div>

    <div v-if="historyError" class="panel-error">
      {{ historyError }}
      <el-button link type="primary" :disabled="historyLoading || rollupSubmitting || rollbackSubmitting" @click="loadRollups">
        重试
      </el-button>
    </div>

    <el-table
      v-loading="historyLoading"
      :data="historyItems"
      row-key="run_id"
      border
      stripe
      empty-text="暂无 Rollup 历史批次"
      class="topic-table"
    >
      <el-table-column prop="run_id" label="run_id" min-width="190" show-overflow-tooltip />
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" effect="light">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="taxonomy_version" label="taxonomy_version" min-width="150" />
      <el-table-column prop="affected_document_count" label="受影响文档数" width="120" />
      <el-table-column prop="created_assignment_count" label="创建分配" width="100" />
      <el-table-column prop="superseded_assignment_count" label="替代分配" width="100" />
      <el-table-column label="创建时间" min-width="170">
        <template #default="{ row }">{{ formatDateTime(row.created_at) || '-' }}</template>
      </el-table-column>
      <el-table-column label="完成时间" min-width="170">
        <template #default="{ row }">{{ formatDateTime(row.finished_at) || '-' }}</template>
      </el-table-column>
      <el-table-column prop="initiated_by" label="发起人" min-width="130" />
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-popconfirm
            v-if="row.status === 'succeeded'"
            width="380"
            title="本操作只撤销该批次产生的继承主题分配，不删除原始文档、候选主题、规范主题或已批准的父子关系。确定继续吗？"
            confirm-button-text="确认回滚"
            cancel-button-text="取消"
            :disabled="rollbackSubmitting || rollupSubmitting"
            @confirm="rollbackRollup(row.run_id)"
          >
            <template #reference>
              <el-button type="danger" size="small" :disabled="rollbackSubmitting || rollupSubmitting">
                回滚
              </el-button>
            </template>
          </el-popconfirm>
          <span v-else class="no-action">不可回滚</span>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-if="historyTotal > historyPageSize"
      background
      layout="prev, pager, next"
      :current-page="historyPage"
      :page-size="historyPageSize"
      :total="historyTotal"
      :disabled="historyLoading || rollupSubmitting || rollbackSubmitting"
      class="history-pagination"
      @current-change="handlePageChange"
    />
  </section>
</template>

<style scoped>
.topic-panel {
  min-width: 0;
}

.panel-heading,
.history-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.panel-heading h2,
.history-heading h3 {
  margin: 0;
  color: #1f2937;
}

.panel-heading h2 {
  font-size: 20px;
}

.history-heading h3 {
  font-size: 17px;
}

.panel-heading p,
.history-heading p {
  margin: 6px 0 0;
  color: #667085;
  font-size: 13px;
}

.rollup-form-card {
  margin-bottom: 16px;
  border: 1px solid #d0d5dd;
  border-radius: 10px;
  background: #fff;
  padding: 16px;
}

.rollup-form-card .el-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

.rollup-form-card .el-form-item:last-child {
  grid-column: 1 / -1;
}

.field-hint {
  margin-top: 5px;
  color: #667085;
  font-size: 12px;
  line-height: 1.4;
}

.field-error,
.version-warning {
  color: #b42318;
}

.version-warning {
  margin-top: 10px;
  font-size: 13px;
}

.result-descriptions {
  margin-bottom: 22px;
}

.status-select {
  width: 140px;
}

.panel-error {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  color: #b42318;
  line-height: 1.5;
}

.topic-table {
  width: 100%;
}

.no-action {
  color: #98a2b3;
  font-size: 12px;
}

.history-pagination {
  justify-content: flex-end;
  margin-top: 16px;
}

@media (max-width: 760px) {
  .panel-heading,
  .history-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .rollup-form-card .el-form {
    display: block;
  }

  .status-select {
    width: 100%;
  }
}
</style>
