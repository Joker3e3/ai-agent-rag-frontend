<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import {
  buildTopicReviewPayload,
  getTopicAdminErrorMessage,
  normalizeActiveTopicsResponse,
  normalizeRelationsResponse,
  normalizeTopicHistoryResponse,
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
})

const activeView = ref('history')
const historyItems = ref([])
const historyTotal = ref(0)
const historyPage = ref(1)
const historyLoaded = ref(false)
const historyLoading = ref(false)
const historyError = ref('')
const historyTaxonomyVersion = ref('')
const historyStatus = ref('')
const historyReviewStatus = ref('')

const activeItems = ref([])
const activeTotal = ref(0)
const activePage = ref(1)
const activeLoaded = ref(false)
const activeLoading = ref(false)
const activeError = ref('')
const activeRelations = ref([])
const activeTopicsVersion = ref('')
const activeRelationsVersion = ref('')
const activeRelationVersionWarning = ref('')
const selectedActiveTopic = ref(null)
const relationDrawerVisible = ref(false)
const activeTopicReviewDialogVisible = ref(false)
const activeTopicSubmitting = ref(false)
const deprecateTargetCode = ref('')
const deprecateNote = ref('')

const pageSize = 20

const topicStatusOptions = [
  { label: '全部主题状态', value: '' },
  { label: '系统主题', value: 'system' },
  { label: '候选主题', value: 'proposed' },
  { label: '已激活', value: 'active' },
  { label: '已废弃', value: 'deprecated' },
]

const topicReviewStatusOptions = [
  { label: '全部审核状态', value: '' },
  { label: '待审核', value: 'pending' },
  { label: '已批准', value: 'approved' },
  { label: '已拒绝', value: 'rejected' },
  { label: '已合并', value: 'merged' },
]

const topicStatusLabels = Object.freeze({
  system: '系统主题',
  proposed: '候选主题',
  active: '已激活',
  deprecated: '已废弃',
})

const topicReviewStatusLabels = Object.freeze({
  pending: '待审核',
  approved: '已批准',
  rejected: '已拒绝',
  merged: '已合并',
})

const reviewDecisionLabels = Object.freeze({
  approve: '批准',
  reject: '拒绝',
  merge: '合并',
  deprecate: '废弃',
})

const normalizeText = (value) => String(value ?? '').trim()

const aliasesText = (aliases) => (
  Array.isArray(aliases)
    ? aliases.map(normalizeText).filter(Boolean).join('、')
    : normalizeText(aliases)
)

const formatStatus = (value, labels) => labels[value] || normalizeText(value) || '未知'

const statusTagType = (value) => {
  if (['active', 'approved'].includes(value)) return 'success'
  if (['deprecated', 'rejected', 'merged'].includes(value)) return 'danger'
  if (['proposed', 'pending'].includes(value)) return 'warning'
  return 'info'
}

const responseTaxonomyVersion = (normalized) => (
  normalized.taxonomyVersion || normalizeText(normalized.topics[0]?.taxonomy_version)
)

const activeRelationIndex = computed(() => {
  const index = new Map()

  const ensureEntry = (canonicalTopicId) => {
    const key = normalizeText(canonicalTopicId)
    if (!key) return null
    if (!index.has(key)) index.set(key, { parents: [], children: [] })
    return index.get(key)
  }

  activeRelations.value.forEach((relation) => {
    const parentId = normalizeText(relation.parent_canonical_topic_id)
    const childId = normalizeText(relation.child_canonical_topic_id)
    const parent = ensureEntry(parentId)
    const child = ensureEntry(childId)
    const relationId = normalizeText(relation.relation_id)

    if (parent && child) {
      child.parents.push({
        relation_id: relationId,
        canonical_topic_id: parentId,
        topic_code: normalizeText(relation.parent_topic_code),
        topic_label: normalizeText(relation.parent_topic_label) || parentId,
        review_status: relation.review_status,
      })
      parent.children.push({
        relation_id: relationId,
        canonical_topic_id: childId,
        topic_code: normalizeText(relation.child_topic_code),
        topic_label: normalizeText(relation.child_topic_label) || childId,
        review_status: relation.review_status,
      })
    }
  })

  return index
})

const relationDetailsFor = (topic) => (
  activeRelationIndex.value.get(normalizeText(topic?.canonical_topic_id)) || {
    parents: [],
    children: [],
  }
)

const relationSummaryFor = (topic) => {
  const details = relationDetailsFor(topic)
  return `父：${details.parents.length} · 子：${details.children.length}`
}

const formatReviewDecision = (decision) => reviewDecisionLabels[decision] || normalizeText(decision)

const lastReviewText = (review) => {
  if (!review) return '-'
  const decision = formatReviewDecision(normalizeText(review.decision))
  const reviewer = normalizeText(review.reviewer_id)
  if (decision && reviewer) return `${decision} · ${reviewer}`
  return decision || reviewer || '-'
}

const loadHistory = async ({ resetPage = false } = {}) => {
  if (resetPage) historyPage.value = 1
  historyLoading.value = true
  historyError.value = ''

  try {
    const response = await props.api.listTopicHistory({
      taxonomyVersion: historyTaxonomyVersion.value,
      status: historyStatus.value,
      reviewStatus: historyReviewStatus.value,
      limit: pageSize,
      offset: (historyPage.value - 1) * pageSize,
    })
    const normalized = normalizeTopicHistoryResponse(response.data)
    historyItems.value = normalized.topics
    historyTotal.value = normalized.total
    historyLoaded.value = true
  } catch (requestError) {
    historyError.value = getTopicAdminErrorMessage(requestError)
  } finally {
    historyLoading.value = false
  }
}

const loadActiveTopics = async ({ resetPage = false } = {}) => {
  if (resetPage) activePage.value = 1
  activeLoading.value = true
  activeError.value = ''
  activeRelationVersionWarning.value = ''
  activeRelations.value = []

  try {
    const [topicResponse, relationResponse] = await Promise.all([
      props.api.listActiveTopics({
        limit: pageSize,
        offset: (activePage.value - 1) * pageSize,
      }),
      props.api.listRelations({ reviewStatus: 'approved' }),
    ])
    const normalizedTopics = normalizeActiveTopicsResponse(topicResponse.data)
    const normalizedRelations = normalizeRelationsResponse(relationResponse.data)
    const topicVersion = responseTaxonomyVersion(normalizedTopics)
    const relationVersion = normalizeText(relationResponse.data?.taxonomy_version)

    activeItems.value = normalizedTopics.topics
    activeTotal.value = normalizedTopics.total
    activeTopicsVersion.value = topicVersion
    activeRelationsVersion.value = relationVersion

    if (topicVersion && relationVersion && topicVersion !== relationVersion) {
      activeRelationVersionWarning.value = (
        `主题版本 ${topicVersion} 与关系版本 ${relationVersion} 不一致，暂不合并父子关系。`
      )
    } else {
      const approvedRelations = normalizedRelations.relations.filter(
        (relation) => relation.review_status === 'approved',
      )
      activeRelations.value = approvedRelations
    }
    activeLoaded.value = true
  } catch (requestError) {
    activeItems.value = []
    activeTotal.value = 0
    activeTopicsVersion.value = ''
    activeRelationsVersion.value = ''
    activeError.value = getTopicAdminErrorMessage(requestError)
  } finally {
    activeLoading.value = false
  }
}

const resetActiveTopicReviewDialog = () => {
  selectedActiveTopic.value = null
  deprecateTargetCode.value = ''
  deprecateNote.value = ''
}

const openDeprecateDialog = (topic) => {
  selectedActiveTopic.value = topic
  deprecateTargetCode.value = ''
  deprecateNote.value = ''
  activeTopicReviewDialogVisible.value = true
}

const validateDeprecationForm = () => {
  const targetCode = normalizeText(deprecateTargetCode.value)
  const note = normalizeText(deprecateNote.value)

  if (targetCode.length > 128) {
    ElMessage.warning('替代主题 topic_code 最多 128 个字符')
    return null
  }
  if (note.length > 1000) {
    ElMessage.warning('审核备注最多 1000 个字符')
    return null
  }

  return { targetCode, note }
}

const submitActiveTopicDeprecation = async () => {
  if (activeTopicSubmitting.value || !selectedActiveTopic.value) return

  const values = validateDeprecationForm()
  if (!values) return

  try {
    await ElMessageBox.confirm(
      `将主题“${selectedActiveTopic.value.topic_label || selectedActiveTopic.value.topic_code}”标记为已废弃，是否继续？`,
      '确认废弃主题',
      {
        type: 'warning',
        confirmButtonText: '确认废弃',
        cancelButtonText: '取消',
        closeOnClickModal: false,
      },
    )
  } catch {
    return
  }

  activeTopicSubmitting.value = true
  try {
    await props.api.reviewTopic(
      selectedActiveTopic.value.topic_id,
      buildTopicReviewPayload({
        decision: 'deprecate',
        targetTopicCode: values.targetCode,
        note: values.note,
      }),
    )
    ElMessage.success('主题已废弃')
    activeTopicReviewDialogVisible.value = false
    await loadActiveTopics({ resetPage: true })
    if (historyLoaded.value) await loadHistory({ resetPage: true })
  } catch (requestError) {
    ElMessage.error(getTopicAdminErrorMessage(requestError))
  } finally {
    activeTopicSubmitting.value = false
  }
}

const handleViewChange = (view) => {
  if (view === 'history' && !historyLoaded.value && !historyLoading.value) loadHistory()
  if (view === 'active' && !activeLoaded.value && !activeLoading.value) loadActiveTopics()
}

const handleHistoryFilterChange = () => loadHistory({ resetPage: true })
const handleHistoryPageChange = (page) => {
  historyPage.value = page
  loadHistory()
}

const handleActivePageChange = (page) => {
  activePage.value = page
  loadActiveTopics()
}

const openRelationDrawer = (topic) => {
  selectedActiveTopic.value = topic
  relationDrawerVisible.value = true
}

watch(() => props.active, (active) => {
  if (active && !historyLoaded.value && !historyLoading.value) loadHistory()
}, { immediate: true })
</script>

<template>
  <section class="topic-panel">
    <div class="panel-heading">
      <div>
        <h2>主题列表</h2>
          <p>审核历史保留服务端状态；已激活主题只展示已激活且已批准的主题。</p>
      </div>
    </div>

    <el-tabs v-model="activeView" type="card" @tab-change="handleViewChange">
      <el-tab-pane label="审核历史" name="history">
        <div class="filter-row">
          <el-input
            v-model="historyTaxonomyVersion"
            clearable
            placeholder="可选 taxonomy_version"
            class="version-input"
            :disabled="historyLoading"
            @keyup.enter="handleHistoryFilterChange"
          />
          <el-select
            v-model="historyStatus"
            class="status-select"
            :disabled="historyLoading"
            @change="handleHistoryFilterChange"
          >
            <el-option
              v-for="option in topicStatusOptions"
              :key="option.value || 'all-status'"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <el-select
            v-model="historyReviewStatus"
            class="status-select"
            :disabled="historyLoading"
            @change="handleHistoryFilterChange"
          >
            <el-option
              v-for="option in topicReviewStatusOptions"
              :key="option.value || 'all-review-status'"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <el-button :loading="historyLoading" :disabled="historyLoading" @click="loadHistory({ resetPage: true })">
            刷新历史
          </el-button>
        </div>

        <div v-if="historyError" class="panel-error">
          {{ historyError }}
          <el-button link type="primary" :disabled="historyLoading" @click="loadHistory()">重试</el-button>
        </div>

        <el-table
          v-loading="historyLoading"
          :data="historyItems"
          row-key="topic_id"
          border
          stripe
          empty-text="暂无主题审核历史"
          class="topic-table"
        >
          <el-table-column prop="topic_label" label="主题标签" min-width="180" show-overflow-tooltip />
          <el-table-column prop="topic_code" label="topic_code" min-width="180" show-overflow-tooltip />
          <el-table-column label="别名" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">{{ aliasesText(row.aliases) || '-' }}</template>
          </el-table-column>
          <el-table-column prop="taxonomy_version" label="taxonomy_version" min-width="150" />
          <el-table-column label="主题状态" width="120">
            <template #default="{ row }">
              <el-tag :type="statusTagType(row.status)" effect="light">
                {{ formatStatus(row.status, topicStatusLabels) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="审核状态" width="120">
            <template #default="{ row }">
              <el-tag :type="statusTagType(row.review_status)" effect="light">
                {{ formatStatus(row.review_status, topicReviewStatusLabels) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="support_document_count" label="支持文档数" width="110" />
          <el-table-column label="最近审核" min-width="150" show-overflow-tooltip>
            <template #default="{ row }">{{ lastReviewText(row.last_review) }}</template>
          </el-table-column>
          <el-table-column label="修改时间" min-width="170">
            <template #default="{ row }">{{ formatDateTime(row.updated_at) || '-' }}</template>
          </el-table-column>
        </el-table>

        <el-pagination
          v-if="historyTotal > pageSize"
          background
          layout="total, prev, pager, next"
          :page-size="pageSize"
          :total="historyTotal"
          :current-page="historyPage"
          @current-change="handleHistoryPageChange"
        />
      </el-tab-pane>

      <el-tab-pane label="已激活主题" name="active">
        <div class="active-toolbar">
          <p>以下列表来自后端当前激活的 taxonomy 版本，仅包含已激活且已批准的主题。</p>
          <el-button
            :loading="activeLoading"
            :disabled="activeLoading || activeTopicSubmitting"
            @click="loadActiveTopics({ resetPage: true })"
          >
            刷新已激活主题
          </el-button>
        </div>

        <el-alert
          v-if="activeRelationVersionWarning"
          type="warning"
          :closable="false"
          :title="activeRelationVersionWarning"
          class="relation-version-warning"
        />

        <div v-if="activeError" class="panel-error">
          {{ activeError }}
          <el-button
            link
            type="primary"
            :disabled="activeLoading || activeTopicSubmitting"
            @click="loadActiveTopics()"
          >重试</el-button>
        </div>

        <el-table
          v-loading="activeLoading"
          :data="activeItems"
          row-key="topic_id"
          border
          stripe
          empty-text="暂无已激活主题"
          class="topic-table"
        >
          <el-table-column prop="topic_label" label="主题标签" min-width="180" show-overflow-tooltip />
          <el-table-column prop="topic_code" label="topic_code" min-width="180" show-overflow-tooltip />
          <el-table-column label="别名" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">{{ aliasesText(row.aliases) || '-' }}</template>
          </el-table-column>
          <el-table-column prop="taxonomy_version" label="taxonomy_version" min-width="150" />
          <el-table-column label="主题状态" width="120">
            <template #default="{ row }">
              <el-tag type="success" effect="light">
                {{ formatStatus(row.status, topicStatusLabels) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="审核状态" width="120">
            <template #default="{ row }">
              <el-tag type="success" effect="light">
                {{ formatStatus(row.review_status, topicReviewStatusLabels) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="support_document_count" label="直接支持文档数" width="130" />
          <el-table-column label="父子关系" min-width="150">
            <template #default="{ row }">
              <div class="relation-summary">
                <span>{{ relationSummaryFor(row) }}</span>
                <el-button link type="primary" size="small" @click="openRelationDrawer(row)">
                  查看关系
                </el-button>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="90" fixed="right">
            <template #default="{ row }">
              <el-button
                type="danger"
                size="small"
                :disabled="activeLoading || activeTopicSubmitting"
                @click="openDeprecateDialog(row)"
              >
                废弃
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-drawer v-model="relationDrawerVisible" title="父子关系详情" size="500px">
          <template v-if="selectedActiveTopic">
            <el-descriptions :column="1" border>
              <el-descriptions-item label="主题标签">
                {{ selectedActiveTopic.topic_label || '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="topic_code">
                {{ selectedActiveTopic.topic_code || '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="canonical_topic_id">
                {{ selectedActiveTopic.canonical_topic_id || '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="taxonomy_version">
                {{ selectedActiveTopic.taxonomy_version || activeTopicsVersion || '-' }}
              </el-descriptions-item>
            </el-descriptions>

            <div class="relation-group">
              <h3>直接父主题</h3>
              <el-empty
                v-if="relationDetailsFor(selectedActiveTopic).parents.length === 0"
                description="暂无直接父主题"
                :image-size="60"
              />
              <div v-else class="relation-items">
                <div
                  v-for="parent in relationDetailsFor(selectedActiveTopic).parents"
                  :key="`${parent.relation_id}-${parent.canonical_topic_id}`"
                  class="relation-item"
                >
                  <div>
                    <strong>{{ parent.topic_label }}</strong>
                    <span>{{ parent.topic_code || parent.canonical_topic_id }}</span>
                  </div>
                  <el-tag type="success" effect="light">{{ parent.review_status }}</el-tag>
                </div>
              </div>
            </div>

            <div class="relation-group">
              <h3>直接子主题</h3>
              <el-empty
                v-if="relationDetailsFor(selectedActiveTopic).children.length === 0"
                description="暂无直接子主题"
                :image-size="60"
              />
              <div v-else class="relation-items">
                <div
                  v-for="child in relationDetailsFor(selectedActiveTopic).children"
                  :key="`${child.relation_id}-${child.canonical_topic_id}`"
                  class="relation-item"
                >
                  <div>
                    <strong>{{ child.topic_label }}</strong>
                    <span>{{ child.topic_code || child.canonical_topic_id }}</span>
                  </div>
                  <el-tag type="success" effect="light">{{ child.review_status }}</el-tag>
                </div>
              </div>
            </div>
          </template>
        </el-drawer>

        <el-dialog
          v-model="activeTopicReviewDialogVisible"
          title="废弃已激活主题"
          width="560px"
          :close-on-click-modal="false"
          :show-close="!activeTopicSubmitting"
          @closed="resetActiveTopicReviewDialog"
        >
          <el-form label-position="top">
            <el-form-item label="主题">
              <el-input :model-value="selectedActiveTopic?.topic_label || ''" disabled />
            </el-form-item>
            <el-form-item label="替代主题 topic_code（可选）">
              <el-input
                v-model="deprecateTargetCode"
                maxlength="128"
                show-word-limit
                :disabled="activeTopicSubmitting"
                placeholder="请输入替代主题的规范 topic_code"
              />
            </el-form-item>
            <el-form-item label="审核备注">
              <el-input
                v-model="deprecateNote"
                type="textarea"
                :rows="4"
                maxlength="1000"
                show-word-limit
                :disabled="activeTopicSubmitting"
                placeholder="可填写废弃理由，便于审计"
              />
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button :disabled="activeTopicSubmitting" @click="activeTopicReviewDialogVisible = false">
              取消
            </el-button>
            <el-button
              type="danger"
              :loading="activeTopicSubmitting"
              :disabled="activeTopicSubmitting"
              @click="submitActiveTopicDeprecation"
            >
              确认废弃
            </el-button>
          </template>
        </el-dialog>

        <el-pagination
          v-if="activeTotal > pageSize"
          background
          layout="total, prev, pager, next"
          :page-size="pageSize"
          :total="activeTotal"
          :current-page="activePage"
          @current-change="handleActivePageChange"
        />
      </el-tab-pane>
    </el-tabs>
  </section>
</template>

<style scoped>
.topic-panel {
  min-width: 0;
}

.panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.panel-heading h2 {
  margin: 0;
  color: #1f2937;
  font-size: 20px;
}

.panel-heading p,
.active-toolbar p {
  margin: 6px 0 0;
  color: #667085;
  font-size: 13px;
}

.filter-row,
.active-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}

.active-toolbar {
  justify-content: space-between;
}

.relation-version-warning {
  margin-bottom: 14px;
}

.relation-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.relation-group {
  margin-top: 22px;
}

.relation-group h3 {
  margin: 0 0 10px;
  color: #344054;
  font-size: 15px;
}

.relation-items {
  display: grid;
  gap: 8px;
}

.relation-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  padding: 10px 12px;
}

.relation-item div {
  min-width: 0;
}

.relation-item strong,
.relation-item span {
  display: block;
}

.relation-item span {
  margin-top: 3px;
  color: #667085;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.version-input {
  max-width: 230px;
}

.status-select {
  width: 170px;
}

.panel-error {
  margin-bottom: 14px;
  color: #b42318;
}

.topic-table {
  width: 100%;
}

.el-pagination {
  justify-content: flex-end;
  margin-top: 16px;
}

@media (max-width: 760px) {
  .version-input,
  .status-select {
    width: 100%;
    max-width: none;
  }

  .active-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
