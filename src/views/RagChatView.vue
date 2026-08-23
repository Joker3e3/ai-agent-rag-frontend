<script setup>
import { nextTick } from 'vue'
import { ref } from 'vue'
import { onMounted } from 'vue'

import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import DocumentTypeConfirmDialog from '../components/DocumentTypeConfirmDialog.vue'
import ExactContentMatchesPanel from '../components/ExactContentMatchesPanel.vue'
import ProfileMentionMatchesPanel from '../components/ProfileMentionMatchesPanel.vue'
import RagSourcesPanel from '../components/RagSourcesPanel.vue'
import TopicDocumentMatchesPanel from '../components/TopicDocumentMatchesPanel.vue'
import {
  TOPIC_PAGE_LIMIT,
  buildChatStreamPayload,
  buildSourcesHistoryPayload,
  canLoadMoreTopicDocuments,
  createAssistantMessage,
  createSourcesHistoryErrorState,
  getRequestIdFromResponse,
  getSourcesHistoryState,
  getSourcesHistoryErrorMessage,
  isTopicDocumentMatchesResponse,
  mergeTopicDocumentMatches,
  normalizeTopicDocumentMatches,
} from '../services/ragSources'
import {
  canShowResumeConfirmation,
  canShowResumeConversion,
  canUseResumeTypeReview,
  executeDocumentDelete,
  executeTypeDecision,
  getDocumentUploadErrorMessage,
  getDocumentWorkflowErrorMessage,
  getCandidateDraftMissingFields,
  getLocalizedDocumentMessage,
  getDocumentStatusLabel,
  getValidationFieldErrors,
  normalizeCandidateDraft,
  normalizeDocumentsResponse,
  resolveManualResumeConversionDecision,
  resolveResumeConfirmationDecision,
} from '../services/documentTypes'
import {
  createResetConfirmationMessage,
  getRagCommandFromResponse,
  parseResetResponse,
} from '../services/ragChatCommands'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
const USER_ID = 'Joker3e'

onMounted(() => { loadDocuments() })

let pollingTimer = null
let activeRequestCount = 0
let conversationGeneration = 0

// 用户输入框内容
const question = ref('')

// 聊天消息列表
const messages = ref([])

// 知识库文件
const documents = ref([])
const documentsError = ref('')
const documentsLoading = ref(false)

const typeReviewVisible = ref(false)
const typeReviewLoading = ref(false)
const typeReviewSubmitting = ref(false)
const typeReviewError = ref('')
const typeReviewFieldErrors = ref({})
const typeReviewDocument = ref(null)
const typeReviewReady = ref(false)
const typeReviewMode = ref('confirmation')
const selectedDocumentType = ref('')
const candidateDraft = ref(normalizeCandidateDraft())
const initialCandidateDraft = ref(normalizeCandidateDraft())
const candidateFieldLabels = {
  candidate_name: '候选人姓名',
  phone: '手机号',
  school: '学校',
}

const fileInput = ref(null)

// 是否正在加载
const loading = ref(false)
const chatBox = ref(null)

// 当前选中的文件
const selectedFile = ref(null)

// 上传状态
const uploading = ref(false)

const notifyDocumentStateChanged = () => {
  if (typeof window === 'undefined') return

  window.dispatchEvent(new CustomEvent('rag-documents-updated', {
    detail: { userId: USER_ID },
  }))
}

// 滚动函数
const scrollToBottom = async () => {
  await nextTick()

  if (chatBox.value) {
    chatBox.value.scrollTop = chatBox.value.scrollHeight
  }
}

const uploadFile = async () => {
  if (!selectedFile.value) {
    alert('请选择文件')
    return
  }
  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('user_id', USER_ID)
    formData.append('file', selectedFile.value)
    const response = await axios.post(`${API_BASE_URL}/upload`, formData)
    ElMessage.success(getLocalizedDocumentMessage(response.data?.message, '文件上传成功，正在处理中'))
    selectedFile.value = null
  } catch (error) {
    console.error(error)
    const errMsg = getDocumentUploadErrorMessage(error.response?.data?.detail)
    ElMessage.error(errMsg)
  }
  uploading.value = false
  if (fileInput.value) {
    fileInput.value.value = ''
  }
  await loadDocuments()
  startPollingDocuments()
}

// 获取文件列表
const loadDocuments = async () => {
  documentsLoading.value = true
  documentsError.value = ''
  try {
    const response = await axios.get(`${API_BASE_URL}/documents`, { params: { user_id: USER_ID } })
    documents.value = normalizeDocumentsResponse(response.data)
  } catch (error) {
    console.error(error)
    documentsError.value = getLocalizedDocumentMessage(
      error.response?.data?.detail || error.message,
      '文档列表加载失败，请点击重试。',
    )
  } finally {
    documentsLoading.value = false
  }
}

// 删除文件
const deleteDocument = async (documentId) => {
  ElMessageBox.confirm('确定要删除这个文件吗？', '提示', {
    type: 'warning',
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    closeOnClickModal: false,
  }).then(async () => {
    try {
      await executeDocumentDelete({
        remove: axios.delete,
        apiBaseUrl: API_BASE_URL,
        userId: USER_ID,
        documentId,
        refreshDocuments: loadDocuments,
        notifyStateChanged: notifyDocumentStateChanged,
      })
      ElMessage.success('删除成功')
    } catch (error) {
      console.error(error)
      ElMessage.error('删除失败')
    }
  }).catch(() => {
    // 用户取消删除
  })
}

// 发送消息函数
const resetTypeReviewState = () => {
  typeReviewLoading.value = false
  typeReviewSubmitting.value = false
  typeReviewError.value = ''
  typeReviewFieldErrors.value = {}
  typeReviewDocument.value = null
  typeReviewReady.value = false
  typeReviewMode.value = 'confirmation'
  selectedDocumentType.value = ''
  candidateDraft.value = normalizeCandidateDraft()
  initialCandidateDraft.value = normalizeCandidateDraft()
}

const loadTypeReview = async (documentId) => {
  if (!documentId) {
    typeReviewError.value = '当前文档缺少标识，暂时无法确认简历类型'
    return
  }

  typeReviewLoading.value = true
  typeReviewError.value = ''
  typeReviewFieldErrors.value = {}

  try {
    const response = await axios.get(
      `${API_BASE_URL}/documents/${encodeURIComponent(documentId)}/type-review`,
      { params: { user_id: USER_ID } },
    )
    const review = response.data

    if (!canUseResumeTypeReview(review, typeReviewMode.value)) {
      typeReviewDocument.value = { ...typeReviewDocument.value, ...review }
      typeReviewReady.value = false
      typeReviewError.value = '该文档当前无需进行简历类型确认，请刷新文档列表。'
      return
    }

    typeReviewDocument.value = { ...typeReviewDocument.value, ...review }
    typeReviewReady.value = true
    const normalizedDraft = normalizeCandidateDraft(review.candidate_draft)
    candidateDraft.value = normalizedDraft
    initialCandidateDraft.value = { ...normalizedDraft }
  } catch (error) {
    console.error(error)
    typeReviewReady.value = false
    typeReviewError.value = getDocumentWorkflowErrorMessage(error.response?.status)
  } finally {
    typeReviewLoading.value = false
  }
}

const openTypeReview = async (document, mode = 'confirmation') => {
  const canOpen = mode === 'conversion'
    ? canShowResumeConversion(document)
    : canShowResumeConfirmation(document)
  if (!canOpen) return

  typeReviewDocument.value = document
  typeReviewMode.value = mode
  typeReviewReady.value = false
  typeReviewVisible.value = true
  typeReviewError.value = ''
  typeReviewFieldErrors.value = {}
  selectedDocumentType.value = ''
  candidateDraft.value = normalizeCandidateDraft()
  initialCandidateDraft.value = normalizeCandidateDraft()
  await loadTypeReview(document.document_id)
}

const retryTypeReview = () => {
  loadTypeReview(typeReviewDocument.value?.document_id)
}

const submitTypeDecision = async (decision) => {
  if (
    typeReviewSubmitting.value ||
    !typeReviewReady.value ||
    (typeReviewMode.value === 'conversion' && selectedDocumentType.value !== 'resume') ||
    !canUseResumeTypeReview(typeReviewDocument.value, typeReviewMode.value)
  ) return

  const decisionRequest = typeReviewMode.value === 'conversion'
    ? resolveManualResumeConversionDecision(candidateDraft.value)
    : decision === 'confirm_resume'
      ? resolveResumeConfirmationDecision(initialCandidateDraft.value, candidateDraft.value)
      : { decision }

  if (decisionRequest.decision === 'confirm_resume_with_corrections') {
    const missingFields = getCandidateDraftMissingFields(decisionRequest.candidate)
    if (missingFields.length > 0) {
      typeReviewError.value = '请完整填写候选人姓名、手机号和学校后再提交'
      typeReviewFieldErrors.value = Object.fromEntries(
        missingFields.map(field => [field, `${candidateFieldLabels[field]}为必填项`]),
      )
      return
    }
  }

  typeReviewSubmitting.value = true
  typeReviewError.value = ''
  typeReviewFieldErrors.value = {}

  try {
    await executeTypeDecision({
      post: axios.post,
      apiBaseUrl: API_BASE_URL,
      userId: USER_ID,
      documentId: typeReviewDocument.value.document_id,
      ...decisionRequest,
      refreshDocuments: loadDocuments,
      notifyStateChanged: notifyDocumentStateChanged,
    })
    typeReviewVisible.value = false
    ElMessage.success('修改成功')
  } catch (error) {
    console.error(error)
    typeReviewError.value = getDocumentWorkflowErrorMessage(error.response?.status)
    if (error.response?.status === 422) {
      typeReviewFieldErrors.value = getValidationFieldErrors(error.response?.data?.detail)
    }
  } finally {
    typeReviewSubmitting.value = false
  }
}

const updateMessageAt = (messageIndex, patch) => {
  const currentMessage = messages.value[messageIndex]

  if (!currentMessage) {
    return
  }

  messages.value.splice(messageIndex, 1, {
    ...currentMessage,
    ...patch,
  })
}

const consumeChatStream = async (
  response,
  onChunk = null,
  requestGeneration = conversationGeneration,
) => {
  if (!response.body) {
    throw new Error('chat_stream response body is unavailable')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')

  while (true) {
    const { done, value } = await reader.read()

    if (requestGeneration !== conversationGeneration) {
      return false
    }

    if (done) {
      return true
    }

    const chunk = decoder.decode(value)
    if (typeof onChunk === 'function') {
      await onChunk(chunk)
    }
  }
}

const loadSourcesHistory = async (
  assistantIndex,
  requestId,
  requestGeneration = conversationGeneration,
) => {
  if (requestGeneration !== conversationGeneration) {
    return
  }

  const requestPayload = buildSourcesHistoryPayload(USER_ID, requestId)

  if (!requestPayload) {
    updateMessageAt(assistantIndex, {
      ...createSourcesHistoryErrorState(400),
      sourcesLoading: false,
    })
    return
  }

  updateMessageAt(assistantIndex, {
    sourcesLoading: true,
    sourcesError: '',
    context_request_id: '',
    evidence_status: null,
    sources: [],
    source_groups: [],
    summary_sources: [],
    candidate_preview: [],
    topic_document_matches: null,
    profile_mention_matches: null,
    exact_content_matches: null,
    topic_loading: false,
    topic_error: '',
    sourcesHistoryError: '',
    trace: {},
  })

  try {
    const response = await axios.post(`${API_BASE_URL}/sources_history`, requestPayload)

    if (requestGeneration !== conversationGeneration) {
      return
    }

    const sourceState = getSourcesHistoryState(response.data, requestId)

    updateMessageAt(assistantIndex, {
      ...sourceState,
      sourcesLoading: false,
      topic_original_question: messages.value[assistantIndex]?.topic_original_question || '',
    })
  } catch (error) {
    console.error('Failed to load sources history', error)
    updateMessageAt(assistantIndex, {
      ...createSourcesHistoryErrorState(error.response?.status),
      sourcesLoading: false,
      topic_original_question: messages.value[assistantIndex]?.topic_original_question || '',
    })
  }
}

const loadMoreTopicDocuments = async (assistantIndex) => {
  const currentMessage = messages.value[assistantIndex]
  const currentMatches = currentMessage?.topic_document_matches
  const requestGeneration = conversationGeneration

  if (!currentMessage || !canLoadMoreTopicDocuments(currentMatches, currentMessage.topic_loading)) {
    return
  }

  const originalQuestion = currentMessage.topic_original_question
  const topicCursor = currentMatches.next_cursor?.trim() || ''
  if (!originalQuestion || !topicCursor) {
    return
  }

  updateMessageAt(assistantIndex, {
    topic_loading: true,
    topic_error: '',
  })
  activeRequestCount += 1
  loading.value = true

  try {
    const requestData = buildChatStreamPayload(USER_ID, originalQuestion, {
      topicLimit: TOPIC_PAGE_LIMIT,
      topicCursor,
    })
    const response = await fetch(`${API_BASE_URL}/chat_stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    })

    const paginationRequestId = getRequestIdFromResponse(response)
    const ragCommand = getRagCommandFromResponse(response)
    if (ragCommand === 'reset') {
      try {
        await parseResetResponse(response)
      } catch (resetError) {
        console.error(resetError)
      }
      updateMessageAt(assistantIndex, {
        topic_loading: false,
        topic_error: '分页请求未返回主题结果，请重新提问',
      })
      return
    }

    if (requestGeneration !== conversationGeneration) {
      return
    }

    if (!response.ok) {
      const error = new Error(`chat_stream failed with status ${response.status}`)
      error.status = response.status
      throw error
    }

    await consumeChatStream(response, null, requestGeneration)

    if (requestGeneration !== conversationGeneration) {
      return
    }

    if (!paginationRequestId) {
      updateMessageAt(assistantIndex, {
        topic_loading: false,
        topic_error: getSourcesHistoryErrorMessage(400),
      })
      return
    }

    const requestPayload = buildSourcesHistoryPayload(USER_ID, paginationRequestId)
    const historyResponse = await axios.post(`${API_BASE_URL}/sources_history`, requestPayload)

    if (requestGeneration !== conversationGeneration) {
      return
    }

    const pageState = getSourcesHistoryState(historyResponse.data, paginationRequestId)
    if (pageState.sourcesError) {
      updateMessageAt(assistantIndex, {
        topic_loading: false,
        topic_error: pageState.sourcesError,
      })
      return
    }

    if (!isTopicDocumentMatchesResponse(historyResponse.data)) {
      updateMessageAt(assistantIndex, {
        topic_loading: false,
        topic_error: '主题分页结果暂不可用，已保留当前结果',
      })
      return
    }

    const nextMatches = normalizeTopicDocumentMatches(
      historyResponse.data.topic_document_matches,
    )
    const latestMessage = messages.value[assistantIndex]
    updateMessageAt(assistantIndex, {
      request_id: paginationRequestId,
      context_request_id: pageState.context_request_id,
      topic_document_matches: mergeTopicDocumentMatches(
        latestMessage?.topic_document_matches,
        nextMatches,
      ),
      topic_loading: false,
      topic_error: '',
      sources: [],
      source_groups: [],
      summary_sources: [],
      candidate_preview: [],
      evidence_status: null,
      sourcesError: '',
    })
  } catch (error) {
    console.error('Failed to load more topic documents', error)
    updateMessageAt(assistantIndex, {
      topic_loading: false,
      topic_error: getSourcesHistoryErrorMessage(error.response?.status || error.status),
    })
  } finally {
    activeRequestCount = Math.max(activeRequestCount - 1, 0)
    loading.value = activeRequestCount > 0
  }
}

const sendMessage = async () => {
  // 防止空输入
  if (!question.value.trim()) {
    return
  }

  // 先把用户消息加入聊天列表
  const originalQuestion = question.value
  messages.value.push({
    role: 'user',
    content: originalQuestion,
  })

  const requestData = buildChatStreamPayload(USER_ID, originalQuestion)
  // 清空输入框
  question.value = ''
  activeRequestCount += 1
  loading.value = true

  const aiMessage = {
    ...createAssistantMessage(),
    topic_original_question: originalQuestion,
  }
  messages.value.push(aiMessage)
  const assistantIndex = messages.value.length - 1
  const requestGeneration = conversationGeneration

  try {
    // 调用 FastAPI 后端
    const response = await fetch(`${API_BASE_URL}/chat_stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    })

    const ragCommand = getRagCommandFromResponse(response)
    if (ragCommand === 'reset') {
      try {
        await parseResetResponse(response)
        conversationGeneration += 1
        messages.value = [createResetConfirmationMessage()]
      } catch (resetError) {
        console.error(resetError)
        messages.value.push({
          role: 'assistant',
          content: '请求失败，请检查后端服务',
        })
      }
      return
    }

    if (requestGeneration !== conversationGeneration) {
      return
    }

    const requestId = getRequestIdFromResponse(response)
    updateMessageAt(assistantIndex, { request_id: requestId })

    if (!response.ok) {
      throw new Error(`chat_stream failed with status ${response.status}`)
    }

    await consumeChatStream(response, async (chunk) => {
      const currentMessage = messages.value[assistantIndex]

      // 追加到 AI 消息
      if (currentMessage) {
        updateMessageAt(assistantIndex, {
          content: currentMessage.content + chunk,
        })
      }
      await scrollToBottom()
    }, requestGeneration)

    if (requestGeneration !== conversationGeneration) {
      return
    }

    await loadSourcesHistory(assistantIndex, requestId, requestGeneration)
    // const response = await axios.post(`${API_BASE_URL}/ask`, requestData)

    // 把 AI 回复加入聊天列表
    // messages.value.push({
    //   role: 'assistant',
    //   content: response.data.content,
    // })
  } catch (error) {
    console.error(error)

    messages.value.push({
      role: 'assistant',
      content: '请求失败，请检查后端服务',
    })
  } finally {
    activeRequestCount = Math.max(activeRequestCount - 1, 0)
    loading.value = activeRequestCount > 0
  }
}

const handleFileChange = (event) => {
  selectedFile.value = event.target.files[0]
}

const hasProcessingDocument = () => {
  return documents.value.some(doc => doc.status === 'processing')
}

const startPollingDocuments = () => {
  if (pollingTimer) {
    return
  }

  pollingTimer = setInterval(async () => {
    await loadDocuments()

    if (!hasProcessingDocument()) {
      clearInterval(pollingTimer)
      pollingTimer = null
    }
  }, 2000)
}
</script>

<template>
  <div class="main-layout">
    <!-- 左侧知识库 -->
    <div class="document-panel">
      <div class="document-header">
        <h2>知识库</h2>
      </div>

      <!-- 上传区域 -->
      <div class="upload-box">
        <div class="upload-controls">
          <input ref="fileInput" type="file" @change="handleFileChange" />
          <el-button
            class="upload-icon-button"
            type="primary"
            :loading="uploading"
            :disabled="uploading"
            title="上传文件"
            aria-label="上传文件"
            @click="uploadFile"
          >
            <svg class="document-action-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3v12m0-12 4 4m-4-4-4 4M5 21h14" />
            </svg>
          </el-button>
        </div>
      </div>

      <!-- 文件列表 -->
      <div v-if="documentsError" class="documents-error">
        {{ documentsError }}
        <el-button link type="primary" size="small" @click="loadDocuments">重试</el-button>
      </div>
      <div v-if="documentsLoading" class="documents-loading">正在加载文档列表...</div>
      <div class="document-list">
        <div v-for="doc in documents" :key="doc.document_id || doc.file_hash" class="document-item">
          <div class="document-left">
            <div class="document-name" :title="doc.filename" tabindex="0">{{ doc.filename }}</div>
            <div class="document-status">
              <el-tag v-if="doc.status === 'processing'" type="warning" effect="light">
                处理中
              </el-tag>
              <el-tag v-else-if="doc.status === 'failed'" type="danger" effect="light">
                处理失败
              </el-tag>
              <el-tag v-else-if="doc.requires_confirmation === true" type="warning" effect="light">
                待确认
              </el-tag>
              <el-tag v-else :type="doc.document_type === 'resume' ? 'success' : 'info'" effect="light">
                {{ getDocumentStatusLabel(doc) }}
              </el-tag>
            </div>
          </div>
          <div v-if="doc.error" class="document-error">
            {{ getLocalizedDocumentMessage(doc.error, '文档处理失败，请稍后重试') }}
          </div>
          <div class="document-actions">
            <el-button
              v-if="canShowResumeConfirmation(doc)"
              type="primary"
              :disabled="typeReviewSubmitting || (typeReviewLoading && typeReviewDocument?.document_id === doc.document_id)"
              @click="openTypeReview(doc)"
            >
              确认类型
            </el-button>
            <el-button
              v-else-if="canShowResumeConversion(doc)"
              class="document-icon-button document-icon-button--edit"
              type="primary"
              :disabled="typeReviewSubmitting || (typeReviewLoading && typeReviewDocument?.document_id === doc.document_id)"
              title="更改类型"
              aria-label="更改类型"
              @click="openTypeReview(doc, 'conversion')"
            >
              <svg class="document-action-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m4 16-.8 4.8L8 20l11.5-11.5-4-4L4 16Zm9.5-10.5 4 4M6 20l-2 .3.3-2" />
              </svg>
            </el-button>
            <el-button
              class="document-icon-button document-icon-button--delete"
              type="danger"
              title="删除"
              aria-label="删除"
              @click="deleteDocument(doc.document_id)"
            >
              <svg class="document-action-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 7h14m-9 0V4h4v3m-6 4v6m4-6v6M7 7l1 13h8l1-13" />
              </svg>
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 聊天区域 -->
    <DocumentTypeConfirmDialog
      v-model="typeReviewVisible"
      :loading="typeReviewLoading"
      :submitting="typeReviewSubmitting"
      :ready="typeReviewReady && canUseResumeTypeReview(typeReviewDocument, typeReviewMode)"
      :error="typeReviewError"
      :field-errors="typeReviewFieldErrors"
      :suggested-document-type="typeReviewDocument?.suggested_document_type"
      :manual-resume-conversion="typeReviewMode === 'conversion'"
      :selected-document-type="selectedDocumentType"
      :candidate-draft="candidateDraft"
      @update:candidate-draft="candidateDraft = $event"
      @update:selected-document-type="selectedDocumentType = $event"
      @retry="retryTypeReview"
      @submit="submitTypeDecision"
      @closed="resetTypeReviewState"
    />

    <div class="chat-wrapper">
      <!-- 聊天框 -->
      <div ref="chatBox" class="chat-box">
        <!-- 循环渲染消息 -->
        <div v-for="(msg, index) in messages" :key="index" class="message">
          <!-- 用户消息 -->
          <div v-if="msg.role === 'user'" class="user-row">
            <div class="user-message">{{ msg.content }}</div>
          </div>

          <!-- AI 消息 -->
          <div v-else class="ai-row">
            <div class="ai-message">{{ msg.content }}</div>
          </div>

          <div
            v-if="msg.role === 'assistant' && msg.sourcesHistoryError"
            class="sources-history-error"
          >
            {{ msg.sourcesHistoryError }}
          </div>
          <TopicDocumentMatchesPanel
            v-else-if="msg.role === 'assistant' && msg.topic_document_matches !== null && msg.topic_document_matches !== undefined"
            :matches="msg.topic_document_matches"
            :loading="msg.topic_loading"
            :error="msg.topic_error"
            @load-more="loadMoreTopicDocuments(index)"
          />
          <ProfileMentionMatchesPanel
            v-else-if="msg.role === 'assistant' && msg.profile_mention_matches !== null && msg.profile_mention_matches !== undefined"
            :matches="msg.profile_mention_matches"
          />
          <ExactContentMatchesPanel
            v-else-if="msg.role === 'assistant' && msg.exact_content_matches !== null && msg.exact_content_matches !== undefined"
            :matches="msg.exact_content_matches"
          />
          <RagSourcesPanel
            v-else-if="msg.role === 'assistant' && !msg.sourcesHistoryError"
            :message="msg"
          />
        </div>
      </div>

      <!-- 输入区域 -->
      <div class="input-box">
        <input v-model="question" placeholder="请输入问题" @keyup.enter="sendMessage" />

        <button @click="sendMessage" :disabled="loading">
          {{ loading ? '思考中...' : '发送' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.main-layout {
  display: flex;
  gap: 20px;
  height: calc(90vh - 56px);
  min-width: 0;
}

.sources-history-error {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  color: #b42318;
  background: #fff5f5;
}

/* 左侧知识库 */
.document-panel {
  flex: 0 1 360px;
  width: 360px;
  min-width: 0;
  background: white;
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.document-header {
  margin-bottom: 20px;
}

.document-header h2 {
  margin: 0;
}

/* 上传区域 */
.upload-box {
  margin-bottom: 20px;
}

.upload-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.upload-controls input {
  flex: 1;
  min-width: 0;
  width: 100%;
}

.upload-icon-button {
  flex: 0 0 40px;
  width: 40px;
  min-width: 40px;
  height: 40px;
  padding: 0;
}

/* 文件列表 */
.document-list {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.document-item {
  display: grid;
  grid-template-areas:
    "content actions"
    "error error";
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 112px;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  background: #f7f8fa;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;
  transition: all 0.2s;
}

.document-item:hover {
  background: #f0f2f5;
  border-color: #d9d9d9;
}

.document-left {
  grid-area: content;
  min-width: 0;
  max-width: 100%;
}

.document-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 6px;
}

.document-name:focus {
  outline: 2px solid #409eff;
  outline-offset: 2px;
}

.document-status {
  display: flex;
  align-items: center;
  min-width: 0;
}

.document-status .el-tag {
  white-space: nowrap;
}

.documents-error,
.document-error {
  color: #cf1322;
  font-size: 12px;
}

.documents-error {
  margin: 0 0 12px;
}

.documents-loading {
  margin: 0 0 12px;
  color: #909399;
  font-size: 12px;
}

.documents-error button {
  margin-left: 6px;
  border: none;
  background: transparent;
  color: #409eff;
  cursor: pointer;
}

.document-error {
  grid-area: error;
  min-width: 0;
  overflow-wrap: anywhere;
}

.document-actions {
  grid-area: actions;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
  min-width: 0;
}

.document-actions .el-button {
  min-width: 88px;
  white-space: nowrap;
}

.document-actions .el-button + .el-button {
  margin-left: 0;
}

.document-actions .document-icon-button {
  flex: 0 0 36px;
  width: 36px;
  min-width: 36px;
  height: 36px;
  padding: 0;
}

.document-actions .document-icon-button--edit {
  background: #1677ff;
  border-color: #1677ff;
  color: #fff;
}

.document-actions .document-icon-button--delete {
  background: #f04438;
  border-color: #f04438;
  color: #fff;
}

.document-action-icon {
  display: block;
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

@media (max-width: 900px) {
  .main-layout {
    flex-direction: column;
    height: auto;
  }

  .document-panel {
    flex: 0 0 auto;
    width: 100%;
    max-height: 440px;
  }

  .document-list {
    max-height: 300px;
  }

  .document-item {
    grid-template-areas:
      "content"
      "actions"
      "error";
    grid-template-columns: minmax(0, 1fr);
    min-height: 132px;
  }

  .document-actions {
    justify-content: flex-start;
  }

  .chat-wrapper {
    min-height: 420px;
  }
}

/* 聊天区域 */
.chat-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* 聊天框 */
.chat-box {
  flex: 1;
  background: white;
  border-radius: 16px;
  padding: 20px;
  overflow-y: auto;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

/* 单条消息 */
.message {
  margin-bottom: 20px;
}

/* 用户消息 */
.user-row {
  display: flex;
  justify-content: flex-end;
}

.user-message {
  max-width: 70%;
  background: #1677ff;
  color: white;
  padding: 14px 18px;
  border-radius: 16px;
  line-height: 1.6;
  white-space: pre-wrap;
}

/* AI 消息 */
.ai-row {
  display: flex;
  justify-content: flex-start;
}

.ai-message {
  max-width: 70%;
  background: #f5f5f5;
  color: #333;
  padding: 14px 18px;
  border-radius: 16px;
  line-height: 1.6;
  white-space: pre-wrap;
}

/* 输入区域 */
.input-box {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

input {
  flex: 1;
  height: 40px;
  padding: 0 10px;
  font-size: 16px;
  border: 1px solid #ddd;
  border-radius: 10px;
}

/* 按钮 */
button {
  width: 100px;
  border: none;
  border-radius: 10px;
  background: #1677ff;
  color: white;
  cursor: pointer;
}
</style>
