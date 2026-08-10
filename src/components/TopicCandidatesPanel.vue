<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import {
  buildTopicReviewPayload,
  getTopicAdminErrorMessage,
  normalizeProposalsResponse,
} from '../services/topicTaxonomyAdmin'

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

const emit = defineEmits(['topic-approved'])

const proposals = ref([])
const loading = ref(false)
const loaded = ref(false)
const error = ref('')
const topicReviewSubmitting = ref(false)
const reviewDialogVisible = ref(false)
const detailDrawerVisible = ref(false)
const relationDiscoveryNotice = ref(false)
const selectedTopic = ref(null)
const detailTopic = ref(null)
const reviewDecision = ref('approve')
const reviewTargetCode = ref('')
const reviewNote = ref('')

const decisionOptions = [
  { label: '批准', value: 'approve' },
  { label: '拒绝', value: 'reject' },
  { label: '合并', value: 'merge' },
  { label: '废弃', value: 'deprecate' },
]

const topicStatusLabels = Object.freeze({
  proposed: '待提案确认',
  pending: '待审核',
  active: '已激活',
  rejected: '已拒绝',
  retired: '已退役',
  deprecated: '已废弃',
})

const reviewStatusLabels = Object.freeze({
  pending: '待审核',
  approved: '已批准',
  rejected: '已拒绝',
  retired: '已退役',
})

const targetCodeRequired = computed(() => reviewDecision.value === 'merge')

const targetCodeHint = computed(() => (
  targetCodeRequired.value
    ? '请输入已有规范主题的 topic_code，不是主题名称'
    : '可选填写替代主题的 topic_code'
))

const normalizeText = (value) => String(value ?? '').trim()

const formatStatus = (value, labels) => labels[value] || normalizeText(value) || '未知'

const statusTagType = (value) => {
  if (['active', 'approved'].includes(value)) return 'success'
  if (['rejected', 'retired', 'deprecated'].includes(value)) return 'danger'
  if (['pending', 'proposed'].includes(value)) return 'warning'
  return 'info'
}

const aliasesText = (aliases) => (
  Array.isArray(aliases) ? aliases.map(normalizeText).filter(Boolean).join('、') : normalizeText(aliases)
)

const loadProposals = async () => {
  loading.value = true
  error.value = ''

  try {
    const response = await props.api.listProposals()
    proposals.value = normalizeProposalsResponse(response.data)
    loaded.value = true
  } catch (requestError) {
    error.value = getTopicAdminErrorMessage(requestError)
  } finally {
    loading.value = false
  }
}

const resetReviewDialog = () => {
  selectedTopic.value = null
  reviewDecision.value = 'approve'
  reviewTargetCode.value = ''
  reviewNote.value = ''
}

const openReviewDialog = (topic, decision) => {
  selectedTopic.value = topic
  reviewDecision.value = decision
  reviewTargetCode.value = ''
  reviewNote.value = ''
  reviewDialogVisible.value = true
}

const closeReviewDialog = () => {
  if (topicReviewSubmitting.value) return
  reviewDialogVisible.value = false
}

const openDetailDrawer = (topic) => {
  detailTopic.value = topic
  detailDrawerVisible.value = true
}

const validateReviewForm = () => {
  const targetCode = normalizeText(reviewTargetCode.value)
  const note = normalizeText(reviewNote.value)

  if (targetCodeRequired.value && !targetCode) {
    ElMessage.warning('merge 操作必须填写已有规范主题的 topic_code')
    return null
  }
  if (targetCode.length > 128) {
    ElMessage.warning('target_topic_code 最多 128 个字符')
    return null
  }
  if (note.length > 1000) {
    ElMessage.warning('审核备注最多 1000 个字符')
    return null
  }

  return { targetCode, note }
}

const submitReview = async () => {
  if (topicReviewSubmitting.value || !selectedTopic.value) return

  const values = validateReviewForm()
  if (!values) return

  if (reviewDecision.value === 'merge') {
    try {
      await ElMessageBox.confirm(
        `将当前主题合并到指定 topic_code：${values.targetCode}，是否继续？`,
        '确认主题合并',
        {
          type: 'warning',
          confirmButtonText: '继续合并',
          cancelButtonText: '取消',
          closeOnClickModal: false,
        },
      )
    } catch {
      return
    }
  }

  topicReviewSubmitting.value = true
  try {
    await props.api.reviewTopic(
      selectedTopic.value.topic_id,
      buildTopicReviewPayload({
        decision: reviewDecision.value,
        targetTopicCode: values.targetCode,
        note: values.note,
      }),
    )
    ElMessage.success('主题审核成功')
    if (reviewDecision.value === 'approve') {
      relationDiscoveryNotice.value = true
      emit('topic-approved')
    }
    reviewDialogVisible.value = false
    await loadProposals()
  } catch (requestError) {
    ElMessage.error(getTopicAdminErrorMessage(requestError))
  } finally {
    topicReviewSubmitting.value = false
  }
}

watch(() => props.active, (active) => {
  if (active && !loaded.value && !loading.value) loadProposals()
}, { immediate: true })
</script>

<template>
  <section class="topic-panel" aria-label="候选主题审核">
    <div class="panel-heading">
      <div>
        <h2>候选主题审核</h2>
        <p>仅展示待治理候选，不计入正式主题统计。</p>
      </div>
      <el-button
        type="primary"
        plain
        :loading="loading"
        :disabled="loading || topicReviewSubmitting"
        @click="loadProposals"
      >
        刷新
      </el-button>
    </div>

    <el-alert
      v-if="relationDiscoveryNotice"
      type="info"
      :closable="false"
      title="关系发现处理中，请刷新父子关系列表确认结果。"
      class="panel-alert"
    />

    <div v-if="error" class="panel-error">
      {{ error }}
      <el-button link type="primary" :disabled="loading || topicReviewSubmitting" @click="loadProposals">
        重试
      </el-button>
    </div>

    <el-table
      v-loading="loading"
      :data="proposals"
      row-key="topic_id"
      border
      stripe
      empty-text="暂无候选主题"
      class="topic-table"
    >
      <el-table-column prop="topic_label" label="主题标签" min-width="180" show-overflow-tooltip />
      <el-table-column prop="topic_code" label="主题编码" min-width="180" show-overflow-tooltip />
      <el-table-column label="别名" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">{{ aliasesText(row.aliases) || '-' }}</template>
      </el-table-column>
      <el-table-column prop="confidence" label="置信度" width="100" />
      <el-table-column prop="support_document_count" label="支持文档" width="100" />
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
            {{ formatStatus(row.review_status, reviewStatusLabels) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="proposal_source" label="来源" width="110" />
      <el-table-column label="操作" min-width="430" fixed="right">
        <template #default="{ row }">
          <div class="operation-actions">
            <el-button size="small" :disabled="topicReviewSubmitting" @click="openDetailDrawer(row)">
              详情
            </el-button>
            <template v-if="row.review_status === 'pending'">
              <el-button
                size="small"
                type="success"
                :disabled="topicReviewSubmitting"
                @click="openReviewDialog(row, 'approve')"
              >
                批准
              </el-button>
              <el-button
                size="small"
                type="danger"
                :disabled="topicReviewSubmitting"
                @click="openReviewDialog(row, 'reject')"
              >
                拒绝
              </el-button>
              <el-button
                size="small"
                type="warning"
                :disabled="topicReviewSubmitting"
                @click="openReviewDialog(row, 'merge')"
              >
                合并
              </el-button>
              <el-button
                size="small"
                type="info"
                :disabled="topicReviewSubmitting"
                @click="openReviewDialog(row, 'deprecate')"
              >
                废弃
              </el-button>
            </template>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="reviewDialogVisible"
      title="审核候选主题"
      width="560px"
      :close-on-click-modal="false"
      :show-close="!topicReviewSubmitting"
      @closed="resetReviewDialog"
    >
      <el-form label-position="top">
        <el-form-item label="主题">
          <el-input :model-value="selectedTopic?.topic_label || ''" disabled />
        </el-form-item>
        <el-form-item label="审核决定">
          <el-select v-model="reviewDecision" :disabled="topicReviewSubmitting" class="full-width">
            <el-option
              v-for="option in decisionOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item
          v-if="['merge', 'deprecate'].includes(reviewDecision)"
          label="目标规范 topic_code"
          :required="targetCodeRequired"
        >
          <el-input
            v-model="reviewTargetCode"
            maxlength="128"
            show-word-limit
            :disabled="topicReviewSubmitting"
            :placeholder="targetCodeHint"
          />
          <div class="field-hint">{{ targetCodeHint }}</div>
        </el-form-item>
        <el-form-item label="审核备注">
          <el-input
            v-model="reviewNote"
            type="textarea"
            :rows="4"
            maxlength="1000"
            show-word-limit
            :disabled="topicReviewSubmitting"
            placeholder="可填写审核理由，便于审计"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="topicReviewSubmitting" @click="closeReviewDialog">取消</el-button>
        <el-button type="primary" :loading="topicReviewSubmitting" :disabled="topicReviewSubmitting" @click="submitReview">
          提交审核
        </el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailDrawerVisible" title="候选主题详情" size="460px">
      <el-descriptions v-if="detailTopic" :column="1" border>
        <el-descriptions-item label="topic_id">{{ detailTopic.topic_id || '-' }}</el-descriptions-item>
        <el-descriptions-item label="topic_code">{{ detailTopic.topic_code || '-' }}</el-descriptions-item>
        <el-descriptions-item label="topic_label">{{ detailTopic.topic_label || '-' }}</el-descriptions-item>
        <el-descriptions-item label="别名">{{ aliasesText(detailTopic.aliases) || '-' }}</el-descriptions-item>
        <el-descriptions-item label="proposal_source">{{ detailTopic.proposal_source || '-' }}</el-descriptions-item>
        <el-descriptions-item label="canonical_topic_id">{{ detailTopic.canonical_topic_id || '-' }}</el-descriptions-item>
        <el-descriptions-item label="主题状态">{{ formatStatus(detailTopic.status, topicStatusLabels) }}</el-descriptions-item>
        <el-descriptions-item label="审核状态">{{ formatStatus(detailTopic.review_status, reviewStatusLabels) }}</el-descriptions-item>
      </el-descriptions>
    </el-drawer>
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

.panel-heading p {
  margin: 6px 0 0;
  color: #667085;
  font-size: 13px;
}

.panel-alert {
  margin-bottom: 14px;
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

.operation-actions {
  display: inline-flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 6px;
  white-space: nowrap;
}

.operation-actions :deep(.el-button) {
  margin-left: 0;
}

.full-width {
  width: 100%;
}

.field-hint {
  margin-top: 5px;
  color: #667085;
  font-size: 12px;
  line-height: 1.4;
}

@media (max-width: 760px) {
  .panel-heading {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
