<script setup>
import { nextTick } from 'vue'
import { ref } from 'vue'
import { onMounted } from 'vue'

import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import DocumentTypeConfirmDialog from '../components/DocumentTypeConfirmDialog.vue'
import {
  buildSourcesHistoryPayload,
  createAssistantMessage,
  getRequestIdFromResponse,
  getSourcesHistoryErrorMessage,
  getSourcesHistoryState,
} from '../services/ragSources'
import {
  canShowResumeConfirmation,
  canUseResumeTypeReview,
  executeDocumentDelete,
  executeTypeDecision,
  getDocumentWorkflowErrorMessage,
  getValidationFieldErrors,
  normalizeCandidateDraft,
  normalizeDocumentsResponse,
  resolveResumeConfirmationDecision,
} from '../services/documentTypes'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
const USER_ID = 'Joker3e'

onMounted(() => { loadDocuments() })

let pollingTimer = null
let activeRequestCount = 0

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
const candidateDraft = ref(normalizeCandidateDraft())
const initialCandidateDraft = ref(normalizeCandidateDraft())

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
    ElMessage.success(response.data?.message || '文档已接收，正在处理中')
    selectedFile.value = null
  } catch (error) {
    console.error(error)
    const errMsg = error.response?.data?.detail || '上传失败'
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
    documentsError.value = error.response?.data?.detail || error.message || '文档列表加载失败，请点击重试。'
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

    if (!canUseResumeTypeReview(review)) {
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

const openTypeReview = async (document) => {
  if (!canShowResumeConfirmation(document)) return

  typeReviewDocument.value = document
  typeReviewReady.value = false
  typeReviewVisible.value = true
  typeReviewError.value = ''
  typeReviewFieldErrors.value = {}
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
    !canUseResumeTypeReview(typeReviewDocument.value)
  ) return

  typeReviewSubmitting.value = true
  typeReviewError.value = ''
  typeReviewFieldErrors.value = {}

  try {
    const decisionRequest = decision === 'confirm_resume'
      ? resolveResumeConfirmationDecision(initialCandidateDraft.value, candidateDraft.value)
      : { decision }

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
    ElMessage.success('简历类型确认成功')
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

const loadSourcesHistory = async (assistantIndex, requestId) => {
  const requestPayload = buildSourcesHistoryPayload(USER_ID, requestId)

  if (!requestPayload) {
    updateMessageAt(assistantIndex, {
      sourcesError: getSourcesHistoryErrorMessage(400),
    })
    return
  }

  updateMessageAt(assistantIndex, {
    sourcesLoading: true,
    sourcesError: '',
  })

  try {
    const response = await axios.post(`${API_BASE_URL}/sources_history`, requestPayload)
    const sourceState = getSourcesHistoryState(response.data, requestId)

    updateMessageAt(assistantIndex, {
      ...sourceState,
      sourcesLoading: false,
    })
  } catch (error) {
    console.error('Failed to load sources history', error)
    updateMessageAt(assistantIndex, {
      sourcesLoading: false,
      sourcesError: getSourcesHistoryErrorMessage(error.response?.status),
    })
  }
}

const sendMessage = async () => {
  // 防止空输入
  if (!question.value.trim()) {
    return
  }

  // 先把用户消息加入聊天列表
  messages.value.push({
    role: 'user',
    content: question.value,
  })

  const requestData = {
    user_id: USER_ID,
    question: question.value,
  }
  // 清空输入框
  question.value = ''
  activeRequestCount += 1
  loading.value = true

  const aiMessage = createAssistantMessage()
  messages.value.push(aiMessage)
  const assistantIndex = messages.value.length - 1

  try {
    // 调用 FastAPI 后端
    const response = await fetch(`${API_BASE_URL}/chat_stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    })
    const requestId = getRequestIdFromResponse(response)
    updateMessageAt(assistantIndex, { request_id: requestId })

    if (!response.ok) {
      throw new Error(`chat_stream failed with status ${response.status}`)
    }

    if (!response.body) {
      throw new Error('chat_stream response body is unavailable')
    }

    // 获取流读取器
    const reader = response.body.getReader()

    // 文本解码器
    const decoder = new TextDecoder('utf-8')

    // 持续读取
    while (true) {
      // 读取流数据
      const { done, value } = await reader.read()

      // done=true 表示结束
      if (done) {
        break
      }

      // 解码二进制数据
      const chunk = decoder.decode(value)
      const currentMessage = messages.value[assistantIndex]

      // 追加到 AI 消息
      if (currentMessage) {
        updateMessageAt(assistantIndex, {
          content: currentMessage.content + chunk,
        })
      }
      await scrollToBottom()
    }
    await loadSourcesHistory(assistantIndex, requestId)
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
        <input ref="fileInput" type="file" @change="handleFileChange" />

        <button @click="uploadFile" :disabled="uploading">
          {{ uploading ? '上传中...' : '上传文件' }}
        </button>
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
            <div class="document-name">{{ doc.filename }}</div>
            <div class="document-status">
              <el-tag v-if="doc.status === 'processing'" type="warning" effect="light">
                处理中
              </el-tag>
              <el-tag
                v-else-if="doc.status === 'ready' && doc.suggested_document_type === 'resume' && doc.requires_confirmation"
                type="warning"
                effect="light"
              >
                待确认
              </el-tag>
              <el-tag v-else-if="doc.status === 'ready'" type="success" effect="light">
                已完成
              </el-tag>
              <el-tag v-else-if="doc.status === 'failed'" type="danger" effect="light">
                失败
              </el-tag>
            </div>
          </div>
          <div v-if="doc.error" class="document-error">{{ doc.error }}</div>
          <div class="document-actions">
            <el-button
              v-if="canShowResumeConfirmation(doc)"
              type="primary"
              :disabled="typeReviewSubmitting || (typeReviewLoading && typeReviewDocument?.document_id === doc.document_id)"
              @click="openTypeReview(doc)"
            >
              确认类型
            </el-button>
            <el-button type="danger" @click="deleteDocument(doc.document_id)">
              删除
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
      :ready="typeReviewReady && canUseResumeTypeReview(typeReviewDocument)"
      :error="typeReviewError"
      :field-errors="typeReviewFieldErrors"
      :suggested-document-type="typeReviewDocument?.suggested_document_type"
      :candidate-draft="candidateDraft"
      @update:candidate-draft="candidateDraft = $event"
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

          <!-- 来源 -->
          <div v-if="msg.sourcesError" class="sources-error">
            {{ msg.sourcesError }}
          </div>

          <div v-if="msg.sources && msg.sources.length" class="sources">
            <details v-for="(source, i) in msg.sources" :key="i" class="source-item">
              <summary class="source-filename" title="点击展开来源详情">
                {{ source.filename }}
              </summary>
              <div class="source-detail">
                <div>第 {{ source.page + 1 }} 页</div>
                <div class="source-content">{{ source.content }}</div>
              </div>
            </details>
          </div>

          <div
            v-else-if="msg.candidate_preview && msg.candidate_preview.length"
            class="candidate-preview"
          >
            <div class="candidate-preview-title">候选文档（未作为最终来源）</div>
            <div v-for="(candidate, i) in msg.candidate_preview" :key="i" class="candidate-item">
              <div>
                {{ candidate.filename || candidate.file_name || candidate.document_name || candidate.title || candidate.name || '候选文档' }}
              </div>
              <div v-if="candidate.content || candidate.preview" class="source-content">
                {{ candidate.content || candidate.preview }}
              </div>
            </div>
          </div>
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
}

/* 左侧知识库 */
.document-panel {
  width: 300px;
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
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.upload-box input {
  width: 100%;
}

/* 文件列表 */
.document-list {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
}

.document-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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
  flex: 1;
  min-width: 0;
}

.document-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 6px;
}

.document-status {
  display: flex;
  align-items: center;
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

.document-item {
  flex-wrap: wrap;
}

.document-error {
  flex-basis: 100%;
}

.document-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-left: auto;
}

.document-actions .el-button {
  white-space: nowrap;
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

/* 来源 */
.sources {
  margin-top: 10px;
}

.sources-error {
  margin-top: 10px;
  color: #b42318;
  font-size: 14px;
  line-height: 1.5;
}

.source-item {
  background: #f3f3f3;
  padding: 10px;
  border-radius: 8px;
  margin-top: 10px;
  font-size: 14px;
}

.source-filename {
  cursor: pointer;
  color: #1677ff;
  font-weight: 600;
  list-style: none;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.source-filename::-webkit-details-marker {
  display: none;
}

.source-filename::before {
  content: '▸';
  display: inline-block;
  margin-right: 6px;
  color: #667085;
  text-decoration: none;
}

.source-item[open] > .source-filename::before {
  content: '▾';
}

.source-filename:hover {
  color: #0958d9;
}

.source-detail {
  margin-top: 8px;
}

.source-content {
  margin-top: 5px;
  color: #666;
  line-height: 1.5;
}

.candidate-preview {
  margin-top: 10px;
}

.candidate-preview-title {
  color: #475467;
  font-size: 13px;
  font-weight: 700;
}

.candidate-item {
  margin-top: 8px;
  border: 1px dashed #d0d5dd;
  border-radius: 8px;
  background: #fcfcfd;
  padding: 10px;
  color: #344054;
  font-size: 14px;
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
