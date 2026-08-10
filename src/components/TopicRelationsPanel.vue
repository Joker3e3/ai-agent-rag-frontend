<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import {
  getTopicAdminErrorMessage,
  normalizeRelationsResponse,
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

const emit = defineEmits(['taxonomy-version'])

const relations = ref([])
const loading = ref(false)
const loaded = ref(false)
const error = ref('')
const reviewStatus = ref('proposed')
const taxonomyVersion = ref('')
const relationSubmitting = ref(false)
const discoverySubmitting = ref(false)
const discoveryResult = ref(null)
const detailDrawerVisible = ref(false)
const detailRelation = ref(null)

const statusOptions = [
  { label: '待审核', value: 'proposed' },
  { label: '已批准', value: 'approved' },
  { label: '已拒绝', value: 'rejected' },
  { label: '已退役', value: 'retired' },
  { label: '全部', value: '' },
]

const statusLabels = Object.freeze({
  proposed: '待审核',
  approved: '已批准',
  rejected: '已拒绝',
  retired: '已退役',
})

const normalizeText = (value) => String(value ?? '').trim()

const statusTagType = (status) => {
  if (status === 'approved') return 'success'
  if (['rejected', 'retired'].includes(status)) return 'danger'
  if (status === 'proposed') return 'warning'
  return 'info'
}

const formatStatus = (status) => statusLabels[status] || normalizeText(status) || '未知'

const readDiscoveryValue = (result, keys) => {
  for (const key of keys) {
    if (result?.[key] !== undefined && result?.[key] !== null) return result[key]
  }
  return '-'
}

const loadRelations = async () => {
  loading.value = true
  error.value = ''
  taxonomyVersion.value = ''
  emit('taxonomy-version', '')

  try {
    const response = await props.api.listRelations({ reviewStatus: reviewStatus.value })
    const normalized = normalizeRelationsResponse(response.data)
    relations.value = normalized.relations
    taxonomyVersion.value = normalized.taxonomyVersion
    emit('taxonomy-version', normalized.taxonomyVersion)
    loaded.value = true
  } catch (requestError) {
    relations.value = []
    error.value = getTopicAdminErrorMessage(requestError)
  } finally {
    loading.value = false
  }
}

const discoverRelations = async () => {
  if (discoverySubmitting.value || relationSubmitting.value) return
  if (!taxonomyVersion.value) {
    ElMessage.warning('未获取有效的当前激活 taxonomy 版本，暂时无法触发关系发现')
    return
  }

  discoverySubmitting.value = true
  try {
    const response = await props.api.discoverRelations({ taxonomyVersion: taxonomyVersion.value })
    discoveryResult.value = response.data
    ElMessage.success('关系发现完成，已生成 proposed 关系')
    await loadRelations()
  } catch (requestError) {
    ElMessage.error(getTopicAdminErrorMessage(requestError))
  } finally {
    discoverySubmitting.value = false
  }
}

const reviewRelation = async (relation, decision) => {
  if (relationSubmitting.value || discoverySubmitting.value) return

  relationSubmitting.value = true
  try {
    await props.api.reviewRelation(relation.relation_id, decision)
    ElMessage.success(decision === 'approve' ? '关系审核已通过，请继续执行 parent rollup' : '关系审核成功')
    await loadRelations()
  } catch (requestError) {
    ElMessage.error(getTopicAdminErrorMessage(requestError))
  } finally {
    relationSubmitting.value = false
  }
}

const openDetailDrawer = (relation) => {
  detailRelation.value = relation
  detailDrawerVisible.value = true
}

watch(() => props.active, (active) => {
  if (active && !loaded.value && !loading.value) loadRelations()
}, { immediate: true })
</script>

<template>
  <section class="topic-panel" aria-label="父子主题关系审核">
    <div class="panel-heading relation-heading">
      <div>
        <h2>父子主题关系审核</h2>
        <p>关系审核通过后仍需执行 parent rollup，不能自动完成文档继承分配。</p>
      </div>
      <div class="relation-toolbar">
        <el-select v-model="reviewStatus" class="status-select" @change="loadRelations">
          <el-option
            v-for="option in statusOptions"
            :key="option.value || 'all'"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
        <el-button
          plain
          :loading="loading"
          :disabled="loading || relationSubmitting || discoverySubmitting"
          @click="loadRelations"
        >
          刷新
        </el-button>
      </div>
    </div>

    <div class="relation-controls">
      <div class="version-note">
        当前激活 taxonomy 版本：
        <el-tag v-if="taxonomyVersion" type="success" effect="light">{{ taxonomyVersion }}</el-tag>
        <el-tag v-else type="warning" effect="light">未获取</el-tag>
      </div>
      <el-button
        type="primary"
        :loading="discoverySubmitting"
        :disabled="!taxonomyVersion || discoverySubmitting || relationSubmitting"
        @click="discoverRelations"
      >
        触发关系发现
      </el-button>
    </div>

    <el-alert
      v-if="!taxonomyVersion && loaded"
      type="warning"
      :closable="false"
      title="后端未返回有效的当前激活 taxonomy 版本，暂时无法触发关系发现或 parent rollup。"
      class="panel-alert"
    />

    <div v-if="error" class="panel-error">
      {{ error }}
      <el-button link type="primary" :disabled="loading || relationSubmitting || discoverySubmitting" @click="loadRelations">
        重试
      </el-button>
    </div>

    <el-alert
      v-if="discoveryResult"
      type="info"
      :closable="false"
      class="panel-alert"
    >
      <template #title>
        关系发现已完成，本次只生成 proposed 关系，仍需人工审核。
      </template>
      <div class="result-summary">
        <span>run_id：{{ discoveryResult.run_id || '-' }}</span>
        <span>状态：{{ discoveryResult.status || '-' }}</span>
        <span>active 主题：{{ readDiscoveryValue(discoveryResult, ['active_topic_count', 'active_topic_total']) }}</span>
        <span>proposed 关系：{{ readDiscoveryValue(discoveryResult, ['proposed_relation_count', 'proposed_relation_total']) }}</span>
        <span>歧义：{{ readDiscoveryValue(discoveryResult, ['ambiguity_count', 'ambiguous_count']) }}</span>
        <span>模型版本：{{ discoveryResult.model_version || '-' }}</span>
      </div>
    </el-alert>

    <el-table
      v-loading="loading"
      :data="relations"
      row-key="relation_id"
      border
      stripe
      empty-text="暂无父子主题关系"
      class="topic-table"
    >
      <el-table-column prop="parent_topic_label" label="父主题" min-width="180" show-overflow-tooltip />
      <el-table-column prop="child_topic_label" label="子主题" min-width="180" show-overflow-tooltip />
      <el-table-column prop="relation_id" label="relation_id" min-width="190" show-overflow-tooltip />
      <el-table-column label="审核状态" width="120">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.review_status)" effect="light">
            {{ formatStatus(row.review_status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="source" label="来源" width="110" />
      <el-table-column label="操作" min-width="250" fixed="right">
        <template #default="{ row }">
          <el-button size="small" :disabled="relationSubmitting || discoverySubmitting" @click="openDetailDrawer(row)">
            详情
          </el-button>
          <template v-if="row.review_status === 'proposed'">
            <el-button
              size="small"
              type="success"
              :disabled="relationSubmitting || discoverySubmitting"
              @click="reviewRelation(row, 'approve')"
            >
              批准
            </el-button>
            <el-button
              size="small"
              type="danger"
              :disabled="relationSubmitting || discoverySubmitting"
              @click="reviewRelation(row, 'reject')"
            >
              拒绝
            </el-button>
            <el-button
              size="small"
              type="warning"
              :disabled="relationSubmitting || discoverySubmitting"
              @click="reviewRelation(row, 'retire')"
            >
              退役
            </el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>

    <el-drawer v-model="detailDrawerVisible" title="父子关系详情" size="460px">
      <el-descriptions v-if="detailRelation" :column="1" border>
        <el-descriptions-item label="relation_id">{{ detailRelation.relation_id || '-' }}</el-descriptions-item>
        <el-descriptions-item label="parent_topic_code">{{ detailRelation.parent_topic_code || '-' }}</el-descriptions-item>
        <el-descriptions-item label="parent_topic_label">{{ detailRelation.parent_topic_label || '-' }}</el-descriptions-item>
        <el-descriptions-item label="child_topic_code">{{ detailRelation.child_topic_code || '-' }}</el-descriptions-item>
        <el-descriptions-item label="child_topic_label">{{ detailRelation.child_topic_label || '-' }}</el-descriptions-item>
        <el-descriptions-item label="review_status">{{ formatStatus(detailRelation.review_status) }}</el-descriptions-item>
        <el-descriptions-item label="source">{{ detailRelation.source || '-' }}</el-descriptions-item>
        <el-descriptions-item label="reviewer_id">{{ detailRelation.reviewer_id || '-' }}</el-descriptions-item>
        <el-descriptions-item label="change_run_id">{{ detailRelation.change_run_id || '-' }}</el-descriptions-item>
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

.relation-toolbar,
.relation-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.status-select {
  width: 140px;
}

.relation-controls {
  justify-content: space-between;
  margin-bottom: 14px;
  padding: 12px;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  background: #f8fafc;
}

.version-note {
  color: #475467;
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

.result-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-top: 8px;
  color: #475467;
  font-size: 12px;
}

.topic-table {
  width: 100%;
}

@media (max-width: 760px) {
  .panel-heading,
  .relation-controls {
    align-items: stretch;
    flex-direction: column;
  }

  .relation-toolbar {
    width: 100%;
  }

  .status-select {
    flex: 1;
  }
}
</style>
