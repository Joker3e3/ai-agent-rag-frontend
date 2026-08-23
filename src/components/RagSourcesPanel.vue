<script setup>
import { computed, ref } from 'vue'

import {
  canShowFinalSources,
  getEvidenceStatusLabel,
  getFileFormatLabel,
  normalizeSourceGroups,
  normalizeSummarySources,
} from '../services/ragSources'

const props = defineProps({
  message: {
    type: Object,
    required: true,
  },
})

const expandedGroups = ref([])

const finalGroups = computed(() => normalizeSourceGroups(
  props.message.source_groups,
  props.message.sources,
))

const summarySources = computed(() => normalizeSummarySources(props.message.summary_sources))

const evidenceStatusLabel = computed(() => getEvidenceStatusLabel(props.message.evidence_status))

const evidenceTagType = computed(() => {
  if (props.message.evidence_status === 'supported') return 'success'
  if (props.message.evidence_status === 'ambiguous') return 'danger'
  if (props.message.evidence_status === 'insufficient') return 'warning'
  return 'info'
})

const showFinalSources = computed(() => (
  canShowFinalSources(props.message.evidence_status, props.message.sources) &&
  finalGroups.value.length > 0
))

const hasSourcePanelContent = computed(() => (
  props.message.sourcesLoading ||
  props.message.sourcesError ||
  props.message.evidence_status ||
  props.message.context_request_id ||
  (Array.isArray(props.message.sources) && props.message.sources.length > 0) ||
  (Array.isArray(props.message.source_groups) && props.message.source_groups.length > 0) ||
  summarySources.value.length > 0 ||
  (Array.isArray(props.message.candidate_preview) && props.message.candidate_preview.length > 0)
))

const displayDocumentId = (documentId) => documentId || '未提供'

const getChunkRenderKey = (source, index) => (
  source?.chunk_id || source?.content_sha256 || `chunk-${index}`
)

const getCandidateFilename = (candidate) => (
  candidate?.filename || candidate?.saved_filename || '候选文档'
)
</script>

<template>
  <div v-if="hasSourcePanelContent" class="rag-sources-panel">
    <div v-if="message.sourcesLoading" class="sources-loading">
      正在加载来源...
    </div>

    <div v-else-if="message.sourcesError" class="sources-error">
      {{ message.sourcesError }}
    </div>

    <template v-else>
      <div v-if="message.evidence_status === 'not_found'" class="sources-empty">
        <el-tag type="info" effect="light">无相关证据</el-tag>
        <span>当前回答没有可展示的相关证据。</span>
      </div>

      <div
        v-else-if="message.evidence_status === 'insufficient' || message.evidence_status === 'ambiguous'"
        class="sources-status"
      >
        <el-tag :type="evidenceTagType" effect="light">{{ evidenceStatusLabel }}</el-tag>
      </div>

      <div v-else-if="message.evidence_status === 'supported' && !showFinalSources" class="sources-empty">
        <el-tag type="info" effect="light">暂无来源</el-tag>
        <span>当前回答暂无可展示的来源片段。</span>
      </div>

      <div v-else-if="!message.sources?.length" class="sources-empty">
        <el-tag type="info" effect="light">暂无来源</el-tag>
        <span>当前回答暂无可展示的来源片段。</span>
      </div>

      <section v-if="showFinalSources" class="sources-section" aria-label="最终来源">
        <div class="sources-section-title">
          <span>最终来源</span>
          <el-tag :type="evidenceTagType" effect="light">{{ evidenceStatusLabel }}</el-tag>
        </div>

        <el-collapse v-model="expandedGroups" class="source-groups">
          <el-collapse-item
            v-for="group in finalGroups"
            :key="group.key"
            :name="group.key"
            class="source-group"
          >
            <template #title>
              <div class="source-group-title">
                <div class="source-group-heading">
                  <span class="source-filename">{{ group.filename || '未命名文档' }}</span>
                  <el-tag type="info" effect="plain">{{ getFileFormatLabel(group.filename) }}</el-tag>
                  <el-tag :type="evidenceTagType" effect="light">{{ evidenceStatusLabel }}</el-tag>
                </div>
                <div class="source-document-id">
                  document_id: {{ displayDocumentId(group.document_id) }}
                </div>
              </div>
            </template>

            <div class="source-chunks">
              <div
                v-for="(source, index) in group.sources"
                :key="getChunkRenderKey(source, index)"
                class="source-chunk"
              >
                <el-descriptions :column="2" border size="small" class="source-descriptions">
                  <el-descriptions-item label="chunk_id">
                    {{ source.chunk_id || '未提供' }}
                  </el-descriptions-item>
                  <el-descriptions-item label="chunk_index">
                    {{ source.chunk_index ?? '未提供' }}
                  </el-descriptions-item>
                  <el-descriptions-item label="evidence_order">
                    {{ source.evidence_order ?? '未提供' }}
                  </el-descriptions-item>
                  <el-descriptions-item label="page">
                    {{ source.page ?? '未提供' }}
                  </el-descriptions-item>
                  <el-descriptions-item label="section">
                    {{ source.section || '未提供' }}
                  </el-descriptions-item>
                  <el-descriptions-item label="rerank_score">
                    {{ source.rerank_score ?? '未提供' }}
                  </el-descriptions-item>
                </el-descriptions>

                <details v-if="source.content || source.excerpt" class="source-content-details">
                  <summary>{{ source.excerpt || '展开来源内容' }}</summary>
                  <div class="source-content">{{ source.content || source.excerpt }}</div>
                </details>
              </div>
            </div>
          </el-collapse-item>
        </el-collapse>
      </section>

      <section v-if="summarySources.length" class="summary-sources-section" aria-label="文档摘要依据">
        <div class="sources-section-title">
          <span>文档摘要依据</span>
          <el-tag type="info" effect="light">摘要</el-tag>
        </div>
        <div
          v-for="(summarySource, index) in summarySources"
          :key="`${summarySource.document_id || 'summary'}-${index}`"
          class="summary-source-item"
        >
          <div class="summary-source-heading">
            <span class="source-filename">{{ summarySource.filename || '未命名文档' }}</span>
            <el-tag type="info" effect="plain">{{ getFileFormatLabel(summarySource.filename) }}</el-tag>
          </div>
          <div class="source-document-id">
            document_id: {{ displayDocumentId(summarySource.document_id) }}
          </div>
          <details v-if="summarySource.summary || summarySource.excerpt" class="source-content-details">
            <summary>{{ summarySource.excerpt || '展开摘要依据' }}</summary>
            <div class="source-content">{{ summarySource.summary || summarySource.excerpt }}</div>
          </details>
        </div>
      </section>

      <section
        v-if="message.candidate_preview && message.candidate_preview.length"
        class="candidate-preview-section"
        aria-label="候选文档"
      >
        <div class="sources-section-title">
          <span>候选文档</span>
          <el-tag type="warning" effect="light">候选</el-tag>
        </div>
        <div
          v-for="(candidate, index) in message.candidate_preview"
          :key="`${candidate.document_id || candidate.file_hash || 'candidate'}-${index}`"
          class="candidate-item"
        >
          <div class="candidate-heading">
            <span class="source-filename">{{ getCandidateFilename(candidate) }}</span>
            <el-tag type="warning" effect="plain">候选文档</el-tag>
          </div>
          <div class="source-document-id">
            document_id: {{ displayDocumentId(candidate.document_id) }}
          </div>
          <div class="candidate-detail">匹配类型：{{ candidate.match_kind || '未提供' }}</div>
          <div class="candidate-detail">匹配原因：{{ candidate.matching_reason || '未提供' }}</div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.rag-sources-panel {
  margin-top: 10px;
  color: #344054;
  font-size: 14px;
  line-height: 1.5;
}

.sources-loading,
.sources-error,
.sources-empty,
.sources-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #f8fafc;
}

.sources-error {
  color: #b42318;
  background: #fff5f5;
}

.sources-section,
.summary-sources-section,
.candidate-preview-section {
  margin-top: 10px;
}

.sources-section-title,
.source-group-heading,
.summary-source-heading,
.candidate-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.sources-section-title {
  justify-content: space-between;
  margin-bottom: 8px;
  font-weight: 700;
}

.source-group-title {
  min-width: 0;
  padding-right: 12px;
}

.source-group-heading,
.summary-source-heading,
.candidate-heading {
  flex-wrap: wrap;
}

.source-filename {
  min-width: 0;
  overflow: hidden;
  color: #1677ff;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-document-id {
  margin-top: 3px;
  overflow-wrap: anywhere;
  color: #667085;
  font-size: 12px;
}

.source-chunks {
  display: grid;
  gap: 10px;
}

.source-chunk,
.summary-source-item,
.candidate-item {
  padding: 10px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #fcfcfd;
}

.source-descriptions {
  margin-bottom: 8px;
}

.source-content-details {
  border-top: 1px dashed #d0d5dd;
  padding-top: 8px;
}

.source-content-details summary {
  cursor: pointer;
  color: #475467;
  font-weight: 600;
}

.source-content {
  margin-top: 8px;
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: #475467;
}

.summary-source-item,
.candidate-item {
  margin-top: 8px;
}

.candidate-item {
  border-style: dashed;
}

.candidate-detail {
  margin-top: 4px;
  overflow-wrap: anywhere;
  color: #475467;
}
</style>
