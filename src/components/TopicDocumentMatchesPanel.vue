<script setup>
import { computed } from 'vue'

const props = defineProps({
  matches: {
    type: Object,
    required: true,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  error: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['load-more'])

const items = computed(() => (
  Array.isArray(props.matches?.items) ? props.matches.items : []
))

const query = computed(() => props.matches?.query || props.matches?.query_term || '未提供')

const topicLabel = computed(() => (
  props.matches?.topic?.topic_label || props.matches?.topic?.topic_code || '未识别主题'
))

const matchKind = computed(() => props.matches?.match_kind || 'formal')

const matchKindLabel = computed(() => (
  matchKind.value === 'mention' ? '正文提及' : '正式归属'
))

const canLoadMore = computed(() => (
  props.matches?.has_more === true &&
  typeof props.matches?.next_cursor === 'string' &&
  props.matches.next_cursor.trim().length > 0
))

const getMatchedTopics = (item) => {
  if (Array.isArray(item?.matched_topics)) return item.matched_topics
  if (Array.isArray(item?.topics)) return item.topics
  return []
}

const getDocumentKey = (item, index) => (
  `${item?.document_id || 'missing-document'}-${index}`
)

const handleLoadMore = () => {
  if (props.loading || !canLoadMore.value) return
  emit('load-more')
}
</script>

<template>
  <section class="topic-document-matches-panel" aria-label="主题匹配文档">
    <div class="topic-panel-header">
      <div>
        <div class="topic-panel-title">主题匹配文档</div>
        <div class="topic-panel-query">问题：{{ query }}</div>
      </div>
      <el-tag :type="matchKind === 'mention' ? 'warning' : 'success'" effect="light">
        {{ matchKindLabel }}
      </el-tag>
    </div>

    <div class="topic-panel-topic">
      <span class="topic-panel-label">主题</span>
      <span>{{ topicLabel }}</span>
      <span v-if="matches.topic?.topic_code" class="topic-panel-code">
        {{ matches.topic.topic_code }}
      </span>
    </div>

    <div v-if="error" class="topic-panel-error">{{ error }}</div>

    <div v-if="items.length" class="topic-document-list">
      <article
        v-for="(item, index) in items"
        :key="getDocumentKey(item, index)"
        class="topic-document-item"
      >
        <div class="topic-document-heading">
          <span class="topic-document-filename">{{ item.filename || '未命名文档' }}</span>
          <el-tag type="info" effect="plain">{{ item.document_type || 'document' }}</el-tag>
        </div>
        <div class="topic-document-id">
          document_id: {{ item.document_id || '未提供' }}
        </div>

        <div v-if="getMatchedTopics(item).length" class="topic-assignment-list">
          <div class="topic-assignment-title">匹配主题</div>
          <div
            v-for="(matchedTopic, topicIndex) in getMatchedTopics(item)"
            :key="`${matchedTopic.topic_code || 'topic'}-${topicIndex}`"
            class="topic-assignment"
          >
            <span>{{ matchedTopic.topic_label || matchedTopic.topic_code || '未命名主题' }}</span>
            <el-tag size="small" :type="matchedTopic.topic_role === 'mention_only' ? 'warning' : 'success'">
              {{ matchedTopic.topic_role || '未提供角色' }}
            </el-tag>
            <el-tag size="small" type="info" effect="plain">
              {{ matchedTopic.assignment_kind || '未提供来源' }}
            </el-tag>
          </div>
        </div>
      </article>
    </div>

    <div v-else class="topic-panel-empty">
      未找到归属于该主题的文档
    </div>

    <div v-if="matches.has_more === true" class="topic-panel-footer">
      <el-button
        type="primary"
        :loading="loading"
        :disabled="loading || !canLoadMore"
        @click="handleLoadMore"
      >
        {{ loading ? '加载中...' : '加载更多' }}
      </el-button>
      <span v-if="!canLoadMore && !loading" class="topic-panel-cursor-warning">
        暂无有效分页游标
      </span>
    </div>
  </section>
</template>

<style scoped>
.topic-document-matches-panel {
  margin-top: 10px;
  color: #344054;
  font-size: 14px;
  line-height: 1.5;
}

.topic-panel-header,
.topic-document-heading,
.topic-assignment,
.topic-panel-footer {
  display: flex;
  align-items: center;
  gap: 8px;
}

.topic-panel-header {
  justify-content: space-between;
  margin-bottom: 8px;
}

.topic-panel-title {
  font-weight: 700;
}

.topic-panel-query,
.topic-document-id,
.topic-panel-code,
.topic-panel-cursor-warning {
  color: #667085;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.topic-panel-topic,
.topic-panel-empty,
.topic-panel-error {
  padding: 10px 12px;
  border-radius: 8px;
  background: #f8fafc;
}

.topic-panel-topic {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.topic-panel-label,
.topic-assignment-title {
  font-weight: 600;
}

.topic-panel-error {
  margin-bottom: 8px;
  color: #b42318;
  background: #fff5f5;
}

.topic-document-list {
  display: grid;
  gap: 8px;
}

.topic-document-item {
  padding: 10px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #fcfcfd;
}

.topic-document-heading {
  flex-wrap: wrap;
}

.topic-document-filename {
  min-width: 0;
  overflow: hidden;
  color: #1677ff;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topic-assignment-list {
  display: grid;
  gap: 5px;
  margin-top: 8px;
}

.topic-assignment {
  flex-wrap: wrap;
  padding: 6px 8px;
  border-radius: 6px;
  background: #f2f4f7;
}

.topic-panel-footer {
  flex-wrap: wrap;
  margin-top: 10px;
}
</style>
