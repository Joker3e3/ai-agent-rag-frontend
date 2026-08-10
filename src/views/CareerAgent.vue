<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import MarkdownIt from 'markdown-it'
import TracePanel from '../components/TracePanel.vue'
import { formatDateTime } from '../utils/dateTime'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
const AGENT_BASE_URL = import.meta.env.VITE_AGENT_BASE_URL
const CANDIDATES_URL = `${API_BASE_URL}/candidates`
const CAREER_AGENT_URL = `${AGENT_BASE_URL}/career_agent/analyze`
const CAREER_CONFIRM_URL = `${AGENT_BASE_URL}/career_agent/confirm`
const CAREER_CANCEL_URL = `${AGENT_BASE_URL}/career_agent/cancel`
const CAREER_RUNS_BASE_URL = `${AGENT_BASE_URL}/career_agent/runs`
const md = new MarkdownIt()

const sessionId = ref('user_001')
const userId = ref('Joker3e')
const jobDescription = ref('')
const resumeText = ref('')
const report = ref('')
const matchScore = ref('')
const statusMessage = ref('')
const loading = ref(false)
const analyzeResponded = ref(false)
const error = ref('')
const workflowId = ref('')
const confirmationId = ref('')
const workflowStatus = ref('')
const workflowDuration = ref('')
const executionStatus = ref('')
const confirmation = ref(null)
const traceExpanded = ref(false)
const traceLoaded = ref(false)
const traceDirty = ref(false)
const traceLoading = ref(false)
const traceError = ref('')
const traceSteps = ref([])
const traceToolCalls = ref([])
const traceRaw = ref(null)
const traceLoadedWorkflowId = ref('')
const historyExpanded = ref(false)
const historyLoaded = ref(false)
const historyLoading = ref(false)
const historyItems = ref([])
const historyError = ref('')
const selectedHistoryWorkflowId = ref('')
const selectedHistoryRun = ref(null)
const confirming = ref(false)
const canceling = ref(false)
const confirmationStatus = ref('')
const confirmationMessage = ref('')
const confirmationWorkflowStatus = ref('')
const confirmationError = ref('')
const candidates = ref([])
const selectedCandidateId = ref('')
const resumes = ref([])
const selectedResumeId = ref('')
const loadingCandidates = ref(false)
const loadingResumes = ref(false)
const candidateError = ref('')
const resumeError = ref('')
let pollingTimer = null
let pollingRequestInFlight = false

const shouldShowConfirmation = computed(() => {
  return workflowStatus.value === 'waiting_human_confirmation' && workflowId.value && confirmationId.value
})

const shouldShowTrace = computed(() => {
  return Boolean(
    workflowId.value ||
    workflowStatus.value ||
    workflowDuration.value ||
    executionStatus.value ||
    traceSteps.value.length ||
    traceToolCalls.value.length,
  )
})

const renderedReport = computed(() => {
  return md.render(report.value || '')
})

const isHistoryMode = computed(() => Boolean(selectedHistoryWorkflowId.value))

const isSelectedCurrentWorkflow = computed(() => {
  return selectedHistoryRun.value?._isCurrentWorkflow && selectedHistoryWorkflowId.value === workflowId.value
})

const isSubmitDisabled = computed(() => {
  return Boolean(loading.value || isHistoryMode.value || loadingCandidates.value || loadingResumes.value)
})

const TRACE_STEP_KEYS = ['steps', 'workflow_steps', 'workflowSteps', 'nodes']
const TRACE_TOOL_CALL_KEYS = ['tool_calls', 'toolCalls', 'tool_call_records', 'toolCallRecords']

const traceCandidateSources = (data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return []
  }

  return [data, data.trace, data.workflow_trace, data.execution_trace, data.data].filter((source) => {
    return source && typeof source === 'object' && !Array.isArray(source)
  })
}

const firstTraceArray = (data, keys) => {
  if (Array.isArray(data) && keys === TRACE_STEP_KEYS) {
    return data
  }

  for (const source of traceCandidateSources(data)) {
    for (const key of keys) {
      if (Array.isArray(source[key])) {
        return source[key]
      }
    }
  }

  return []
}

const formatHistoryDate = (value) => {
  return formatDateTime(value)
}

const maskPhone = (phone) => {
  const normalizedPhone = String(phone || '').trim()

  if (normalizedPhone.length < 7) {
    return normalizedPhone || '暂无手机号'
  }

  return `${normalizedPhone.slice(0, 3)}****${normalizedPhone.slice(-4)}`
}

const formatCandidateOption = (candidate) => {
  if (candidate.display_label) {
    return candidate.display_label
  }

  return `${candidate.school || '未知学校'}｜${candidate.name || '未命名'}｜${maskPhone(candidate.phone)}`
}

const formatResumeDate = (value) => {
  return formatDateTime(value, '上传时间未知')
}

const formatResumeOption = (resume) => {
  if (resume.display_label) {
    return resume.display_label
  }

  const versionLabel = resume.is_latest ? '最新版本' : '历史版本'

  return `${versionLabel}｜${resume.file_name || resume.resume_id}｜${formatResumeDate(resume.created_at)}`
}

const pickDefaultResumeId = (resumeItems) => {
  const latestMarkedResume = resumeItems.find((resume) => resume.is_latest)

  if (latestMarkedResume?.resume_id) {
    return latestMarkedResume.resume_id
  }

  const latestCreatedResume = [...resumeItems].sort((left, right) => {
    return (Date.parse(right.created_at || '') || 0) - (Date.parse(left.created_at || '') || 0)
  })[0]

  return latestCreatedResume?.resume_id || ''
}

const parseHistorySummaryIds = (inputSummary) => {
  if (!inputSummary) {
    return {}
  }

  try {
    const summary = typeof inputSummary === 'string' ? JSON.parse(inputSummary) : inputSummary

    if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
      return {}
    }

    return {
      candidateId: summary.candidate_id || '',
      resumeId: summary.resume_id || '',
    }
  } catch {
    return {}
  }
}

const extractHistorySubjectIds = (run = {}) => {
  let candidateId = run.candidate_id || ''
  let resumeId = run.resume_id || ''

  if ((!candidateId || !resumeId) && run.input_summary) {
    const summaryIds = parseHistorySummaryIds(run.input_summary)
    candidateId = candidateId || summaryIds.candidateId || ''
    resumeId = resumeId || summaryIds.resumeId || ''
  }

  return { candidateId, resumeId }
}

const resetHistorySubject = () => {
  if (!isHistoryMode.value) {
    return
  }

  selectedCandidateId.value = ''
  resumes.value = []
  selectedResumeId.value = ''
  candidateError.value = ''
  resumeError.value = ''
  loadingCandidates.value = false
  loadingResumes.value = false
}

const historyStatusClass = (status) => {
  const normalizedStatus = String(status || '').toLowerCase()

  return `history-status-${normalizedStatus}`
}

const isQueuedStatus = (status) => {
  return String(status || '').toLowerCase() === 'queued'
}

const isRunningStatus = (status) => {
  return String(status || '').toLowerCase() === 'running'
}

const isWaitingStatus = (status) => {
  return String(status || '').toLowerCase() === 'waiting_human_confirmation'
}

const isCancellingStatus = (status) => {
  return String(status || '').toLowerCase() === 'cancelling'
}

const isCancelableStatus = (status) => {
  return isQueuedStatus(status) || isRunningStatus(status) || isWaitingStatus(status) || isCancellingStatus(status)
}

const shouldShowCancelAnalysis = computed(() => {
  return Boolean(
    workflowId.value &&
    isCancelableStatus(workflowStatus.value) &&
    (!isHistoryMode.value || isSelectedCurrentWorkflow.value),
  )
})

const shouldAutoLoadTraceStatus = (status) => {
  const normalizedStatus = String(status || '').toLowerCase()

  return (
    normalizedStatus === 'completed' ||
    normalizedStatus === 'complete' ||
    normalizedStatus === 'waiting_human_confirmation'
  )
}

const upsertHistoryItem = (nextItem) => {
  if (!nextItem?.workflow_id) {
    return
  }

  const existingIndex = historyItems.value.findIndex((item) => {
    return item.workflow_id === nextItem.workflow_id
  })

  if (existingIndex === -1) {
    historyItems.value = [nextItem, ...historyItems.value]
    return
  }

  historyItems.value = historyItems.value.map((item, index) => {
    if (index !== existingIndex) {
      return item
    }

    return {
      ...item,
      ...nextItem,
    }
  })
}

const mergeHistoryItems = (nextItems) => {
  const fetchedItems = Array.isArray(nextItems) ? nextItems : []
  const mergedFetchedItems = fetchedItems.map((fetchedItem) => {
    const currentItem = historyItems.value.find((item) => item.workflow_id === fetchedItem.workflow_id)

    return {
      ...currentItem,
      ...fetchedItem,
    }
  })
  const fetchedIds = new Set(fetchedItems.map((item) => item.workflow_id).filter(Boolean))
  const currentOnlyItems = historyItems.value.filter((item) => {
    return item.workflow_id && !fetchedIds.has(item.workflow_id)
  })

  historyItems.value = [...currentOnlyItems, ...mergedFetchedItems]
}

const resetTrace = () => {
  traceExpanded.value = false
  traceLoaded.value = false
  traceDirty.value = false
  traceLoading.value = false
  traceError.value = ''
  traceSteps.value = []
  traceToolCalls.value = []
  traceRaw.value = null
  traceLoadedWorkflowId.value = ''
}

const clearWorkflowViewState = () => {
  stopPolling()
  error.value = ''
  report.value = ''
  matchScore.value = ''
  statusMessage.value = ''
  workflowId.value = ''
  confirmationId.value = ''
  workflowStatus.value = ''
  workflowDuration.value = ''
  executionStatus.value = ''
  confirmation.value = null
  confirming.value = false
  canceling.value = false
  confirmationStatus.value = ''
  confirmationMessage.value = ''
  confirmationWorkflowStatus.value = ''
  confirmationError.value = ''
  loading.value = false
  analyzeResponded.value = false
  resetHistorySubject()
  resetTrace()
}

const stopPolling = () => {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
}

const resetConfirmation = () => {
  stopPolling()
  workflowId.value = ''
  confirmationId.value = ''
  workflowStatus.value = ''
  workflowDuration.value = ''
  executionStatus.value = ''
  confirmation.value = null
  matchScore.value = ''
  statusMessage.value = ''
  selectedHistoryWorkflowId.value = ''
  selectedHistoryRun.value = null
  resetTrace()
  confirming.value = false
  canceling.value = false
  confirmationStatus.value = ''
  confirmationMessage.value = ''
  confirmationWorkflowStatus.value = ''
  confirmationError.value = ''
  resetHistorySubject()
}

const updateHistoryItemStatus = (nextWorkflowId, nextStatus) => {
  if (!nextWorkflowId || !nextStatus) {
    return
  }

  if (selectedHistoryRun.value?.workflow_id === nextWorkflowId) {
    selectedHistoryRun.value = {
      ...selectedHistoryRun.value,
      status: nextStatus,
    }
  }

  historyItems.value = historyItems.value.map((item) => {
    if (item.workflow_id !== nextWorkflowId) {
      return item
    }

    return {
      ...item,
      status: nextStatus,
    }
  })
}

const applyRunStatus = (data = {}) => {
  const nextStatus = data.status || ''
  const nextConfirmation = data.confirmation || null

  if (nextStatus && workflowStatus.value && nextStatus !== workflowStatus.value) {
    traceDirty.value = true
  }

  workflowId.value = data.workflow_id || workflowId.value
  workflowStatus.value = nextStatus
  executionStatus.value = nextStatus
  updateHistoryItemStatus(workflowId.value, nextStatus)
  matchScore.value = data.match_score ?? ''
  confirmation.value = nextConfirmation

  if (isHistoryMode.value && data.jd_text) {
    jobDescription.value = data.jd_text
  }

  if (nextStatus !== 'waiting_human_confirmation') {
    confirmationId.value = ''
    confirmationStatus.value = nextConfirmation?.status || ''
    confirmationMessage.value = nextConfirmation?.message || ''
    confirmationWorkflowStatus.value = ''
  }

  if (data.status === 'queued' || data.status === 'running') {
    loading.value = true
    statusMessage.value = '分析任务已提交，正在后台处理中。'
    return
  }

  if (data.status === 'cancelling') {
    loading.value = true
    statusMessage.value = '中止中...'
    return
  }

  if (data.status === 'cancelled') {
    stopPolling()
    loading.value = false
    canceling.value = false
    statusMessage.value = '已中止'
    return
  }

  if (data.status === 'waiting_human_confirmation') {
    stopPolling()
    loading.value = false
    canceling.value = false
    report.value = data.final_report || ''
    confirmationId.value = nextConfirmation?.confirmation_id || data.confirmation_id || ''
    confirmationStatus.value = nextConfirmation?.status || ''
    confirmationMessage.value = nextConfirmation?.message || ''
    statusMessage.value = '分析已完成，等待人工确认。'
    return
  }

  if (data.status === 'completed' || data.status === 'complete') {
    stopPolling()
    loading.value = false
    canceling.value = false
    statusMessage.value = '流程已完成。'
    report.value = data.final_report || report.value
    return
  }

  if (data.status === 'failed') {
    stopPolling()
    loading.value = false
    canceling.value = false
    error.value = data.error_message || '分析流程执行失败。'
    statusMessage.value = ''
  }
}

const fetchWorkflowStatus = async ({ force = false } = {}) => {
  if (!workflowId.value || (pollingRequestInFlight && !force)) {
    return
  }

  pollingRequestInFlight = true

  try {
    const response = await axios.get(`${CAREER_RUNS_BASE_URL}/${workflowId.value}`)
    const data = response.data || {}
    applyRunStatus(data)

    if (shouldAutoLoadTraceStatus(data.status || workflowStatus.value)) {
      await ensureTraceLoaded({ expand: true })
    }

    return data
  } catch (err) {
    console.error(err)
    stopPolling()
    loading.value = false
    error.value = err.response?.data?.detail || err.message || '查询分析任务状态失败，请稍后重试。'
    throw err
  } finally {
    pollingRequestInFlight = false
  }
}

const pollRunStatus = async () => {
  try {
    await fetchWorkflowStatus()
  } catch {
    // fetchWorkflowStatus already updates the page error state.
  }
}

const startPolling = () => {
  stopPolling()
  pollingTimer = setInterval(pollRunStatus, 2000)
}

const loadCandidates = async () => {
  candidateError.value = ''
  loadingCandidates.value = true
  selectedCandidateId.value = ''
  resumes.value = []
  selectedResumeId.value = ''
  resumeError.value = ''

  try {
    const response = await axios.get(CANDIDATES_URL, {
      params: userId.value ? { user_id: userId.value } : {},
    })
    const data = response.data || []
    candidates.value = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : []
  } catch (err) {
    console.error(err)
    candidates.value = []
    candidateError.value = err.response?.data?.detail || err.message || '候选人列表加载失败，请稍后重试。'
  } finally {
    loadingCandidates.value = false
  }
}

const loadResumes = async (candidateId) => {
  if (!candidateId) {
    return
  }

  const requestedCandidateId = candidateId
  resumeError.value = ''
  loadingResumes.value = true

  try {
    const response = await axios.get(`${CANDIDATES_URL}/${requestedCandidateId}/resumes`)
    const data = response.data || []
    const nextResumes = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : []

    if (selectedCandidateId.value !== requestedCandidateId) {
      return
    }

    resumes.value = nextResumes
    selectedResumeId.value = pickDefaultResumeId(nextResumes)

    if (!nextResumes.length) {
      resumeError.value = '该候选人暂无可用简历版本'
    }
  } catch (err) {
    console.error(err)

    if (selectedCandidateId.value === requestedCandidateId) {
      resumes.value = []
      selectedResumeId.value = ''
      resumeError.value = err.response?.data?.detail || err.message || '简历版本加载失败，请稍后重试。'
    }
  } finally {
    if (selectedCandidateId.value === requestedCandidateId) {
      loadingResumes.value = false
    }
  }
}

const selectCandidate = async () => {
  resumes.value = []
  selectedResumeId.value = ''
  resumeError.value = ''

  if (!selectedCandidateId.value) {
    return
  }

  await loadResumes(selectedCandidateId.value)
}

const resolveHistorySubject = async (run = {}) => {
  const { candidateId, resumeId } = extractHistorySubjectIds(run)
  const subjectUserId = run.user_id || userId.value
  const requestWorkflowId = run.workflow_id || workflowId.value

  resetHistorySubject()
  selectedCandidateId.value = candidateId
  selectedResumeId.value = resumeId

  if (!candidateId || !resumeId) {
    candidateError.value = '本次历史记录未关联候选人或简历版本'
    return
  }

  loadingCandidates.value = true
  loadingResumes.value = true

  try {
    const response = await axios.get(CANDIDATES_URL, {
      params: subjectUserId ? { user_id: subjectUserId } : {},
    })
    const data = response.data || []
    const candidateItems = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : []

    if (requestWorkflowId && selectedHistoryWorkflowId.value !== requestWorkflowId) {
      return
    }

    const historyCandidate = candidateItems.find((candidate) => candidate.candidate_id === candidateId) || null
    candidates.value = historyCandidate
      ? candidateItems
      : [
        {
          candidate_id: candidateId,
          display_label: `候选人信息未找到，candidate_id: ${candidateId}`,
        },
        ...candidateItems,
      ]
    selectedCandidateId.value = candidateId

    if (!historyCandidate) {
      candidateError.value = `候选人信息未找到，candidate_id: ${candidateId}`
    }
  } catch (err) {
    console.error(err)

    if (!requestWorkflowId || selectedHistoryWorkflowId.value === requestWorkflowId) {
      candidateError.value = err.response?.data?.detail || err.message || '候选人信息加载失败，请稍后重试。'
    }
  } finally {
    if (!requestWorkflowId || selectedHistoryWorkflowId.value === requestWorkflowId) {
      loadingCandidates.value = false
    }
  }

  if (requestWorkflowId && selectedHistoryWorkflowId.value !== requestWorkflowId) {
    return
  }

  loadingResumes.value = true

  try {
    const response = await axios.get(`${CANDIDATES_URL}/${candidateId}/resumes`)
    const data = response.data || []
    const resumeItems = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : []

    if (requestWorkflowId && selectedHistoryWorkflowId.value !== requestWorkflowId) {
      return
    }

    const historyResume = resumeItems.find((resume) => resume.resume_id === resumeId) || null
    resumes.value = historyResume
      ? resumeItems
      : [
        {
          resume_id: resumeId,
          candidate_id: candidateId,
          display_label: `简历版本未找到，resume_id: ${resumeId}`,
        },
        ...resumeItems,
      ]
    selectedResumeId.value = resumeId

    if (!historyResume) {
      resumeError.value = `简历版本未找到，resume_id: ${resumeId}`
    }
  } catch (err) {
    console.error(err)

    if (!requestWorkflowId || selectedHistoryWorkflowId.value === requestWorkflowId) {
      resumeError.value = err.response?.data?.detail || err.message || '简历版本信息加载失败，请稍后重试。'
    }
  } finally {
    if (!requestWorkflowId || selectedHistoryWorkflowId.value === requestWorkflowId) {
      loadingResumes.value = false
    }
  }
}

const loadHistory = async () => {
  historyError.value = ''
  historyLoading.value = true

  try {
    const response = await axios.get(CAREER_RUNS_BASE_URL, {
      params: { user_id: userId.value },
    })
    const data = response.data || {}
    mergeHistoryItems(Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [])
    historyLoaded.value = true
  } catch (err) {
    console.error(err)
    historyError.value = err.response?.data?.detail || err.message || '历史记录加载失败，请稍后重试。'
  } finally {
    historyLoading.value = false
  }
}

const toggleHistory = async () => {
  historyExpanded.value = !historyExpanded.value

  if (historyExpanded.value && !historyLoaded.value && !historyLoading.value) {
    await loadHistory()
  }
}

const resetWorkflowForHistory = (item) => {
  stopPolling()
  resetHistorySubject()
  error.value = ''
  report.value = ''
  matchScore.value = ''
  statusMessage.value = '正在加载历史分析记录。'
  confirmation.value = null
  confirmationId.value = ''
  confirmationStatus.value = ''
  confirmationMessage.value = ''
  confirmationWorkflowStatus.value = ''
  confirmationError.value = ''
  workflowId.value = item.workflow_id || ''
  workflowStatus.value = item.status || ''
  executionStatus.value = item.status || ''
  jobDescription.value = item.jd_text || ''
  traceExpanded.value = false
  traceLoaded.value = false
  traceDirty.value = true
  traceLoading.value = false
  traceError.value = ''
  traceSteps.value = []
  traceToolCalls.value = []
  traceRaw.value = null
  traceLoadedWorkflowId.value = ''
}

const exitHistoryMode = () => {
  resetHistorySubject()
  selectedHistoryWorkflowId.value = ''
  selectedHistoryRun.value = null
  jobDescription.value = ''
  clearWorkflowViewState()
  loadCandidates()
}

const selectHistoryItem = async (item) => {
  if (!item?.workflow_id) {
    return
  }

  if (item.workflow_id === selectedHistoryWorkflowId.value) {
    exitHistoryMode()
    return
  }

  selectedHistoryWorkflowId.value = item.workflow_id
  selectedHistoryRun.value = item
  resetWorkflowForHistory(item)

  try {
    const runDetail = (await fetchWorkflowStatus({ force: true })) ?? {}
    const resolvedRun = { ...item, ...runDetail }
    selectedHistoryRun.value = {
      ...selectedHistoryRun.value,
      ...runDetail,
    }
    await resolveHistorySubject(resolvedRun)

    if (!isQueuedStatus(item.status)) {
      await ensureTraceLoaded({ expand: true })
    }

    if (isCancelableStatus(workflowStatus.value)) {
      startPolling()
    }
  } catch {
    // fetchWorkflowStatus already updates the page error state.
  }
}

const analyzeCareer = async () => {
  if (isHistoryMode.value) {
    return
  }

  error.value = ''

  if (!jobDescription.value.trim()) {
    error.value = '请输入岗位 JD'
    ElMessage.error(error.value)
    return
  }

  if (!selectedCandidateId.value) {
    error.value = '请选择候选人'
    ElMessage.error(error.value)
    return
  }

  if (!selectedResumeId.value) {
    error.value = resumes.value.length ? '请选择简历版本' : '该候选人暂无可用简历版本'
    ElMessage.error(error.value)
    return
  }

  report.value = ''
  analyzeResponded.value = false
  resetConfirmation()
  loading.value = true

  try {
    const response = await axios.post(CAREER_AGENT_URL, {
      session_id: sessionId.value,
      user_id: userId.value,
      job_description: jobDescription.value,
      resume_text: resumeText.value,
      candidate_id: selectedCandidateId.value,
      resume_id: selectedResumeId.value,
    })

    analyzeResponded.value = true

    const data = response.data || {}
    workflowId.value = data.workflow_id || ''
    workflowStatus.value = data.workflow_status || data.status || 'queued'
    executionStatus.value = workflowStatus.value
    statusMessage.value = data.message || '分析任务已提交，正在后台处理中。'
    loading.value = true

    if (workflowId.value) {
      const nextHistoryItem = {
        workflow_id: workflowId.value,
        status: workflowStatus.value,
        jd_text: data.jd_text || jobDescription.value,
        input_summary: data.jd_text || jobDescription.value,
        created_at: data.created_at || new Date().toISOString(),
        _isCurrentWorkflow: true,
      }

      upsertHistoryItem(nextHistoryItem)
      selectedHistoryWorkflowId.value = workflowId.value
      selectedHistoryRun.value = nextHistoryItem
      startPolling()
    } else {
      loading.value = false
      error.value = '分析任务提交失败：后端未返回 workflow_id。'
    }
  } catch (err) {
    console.error(err)
    error.value = err.response?.data?.detail || err.message || '分析失败，请检查后端服务。'
    loading.value = false
  }
}

const cancelWorkflow = async () => {
  if (!shouldShowCancelAnalysis.value || canceling.value || isCancellingStatus(workflowStatus.value)) {
    return
  }

  const confirmed = window.confirm('确认中止当前分析任务吗？中止后当前任务将不再继续执行。')

  if (!confirmed) {
    return
  }

  error.value = ''
  canceling.value = true

  try {
    const response = await axios.post(`${CAREER_CANCEL_URL}/${workflowId.value}`)
    const data = response.data || {}

    if (data.status) {
      applyRunStatus(data)
    } else {
      await fetchWorkflowStatus({ force: true })
    }

    if (isCancelableStatus(data.status || workflowStatus.value)) {
      startPolling()
    }
  } catch (err) {
    console.error(err)
    error.value = err.response?.data?.detail || err.message || '中止分析请求失败，请稍后重试。'
  } finally {
    canceling.value = false
  }
}

const confirmCareer = async (action) => {
  if (confirming.value || !workflowId.value || !confirmationId.value) {
    return
  }

  confirmationError.value = ''
  confirming.value = true

  try {
    await axios.post(CAREER_CONFIRM_URL, {
      workflow_id: workflowId.value,
      confirmation_id: confirmationId.value,
      action,
    })

    statusMessage.value = '确认已提交，正在刷新流程状态。'
    traceDirty.value = true
    await fetchWorkflowStatus({ force: true })

    if (isCancelableStatus(workflowStatus.value)) {
      startPolling()
    }

    if (traceExpanded.value) {
      await loadTrace()
    }
  } catch (err) {
    console.error(err)
    confirmationError.value = err.response?.data?.detail || err.message || '确认请求失败，请检查后端服务。'
  } finally {
    confirming.value = false
  }
}

const loadTrace = async () => {
  if (
    !workflowId.value ||
    traceLoading.value ||
    (traceLoaded.value && traceLoadedWorkflowId.value === workflowId.value && !traceDirty.value)
  ) {
    return
  }

  traceError.value = ''
  traceLoading.value = true

  try {
    const response = await axios.get(`${CAREER_RUNS_BASE_URL}/${workflowId.value}/trace`)
    const data = response.data || {}
    traceRaw.value = data
    traceSteps.value = firstTraceArray(data, TRACE_STEP_KEYS)
    traceToolCalls.value = firstTraceArray(data, TRACE_TOOL_CALL_KEYS)
    traceLoaded.value = true
    traceLoadedWorkflowId.value = workflowId.value
    traceDirty.value = false
  } catch (err) {
    console.error(err)
    traceError.value = err.response?.data?.detail || err.message || '执行链路加载失败，请稍后重试。'
  } finally {
    traceLoading.value = false
  }
}

const ensureTraceLoaded = async ({ expand = false } = {}) => {
  if (!workflowId.value) {
    return
  }

  if (expand) {
    traceExpanded.value = true
  }

  await loadTrace()
}

const toggleTrace = async () => {
  traceExpanded.value = !traceExpanded.value

  if (
    traceExpanded.value &&
    workflowId.value &&
    (!traceLoaded.value || traceDirty.value) &&
    !traceLoading.value
  ) {
    await loadTrace()
  }
}

const handleDocumentsUpdated = (event) => {
  const updatedUserId = event?.detail?.userId
  if (updatedUserId && updatedUserId !== userId.value) return

  loadCandidates()
}

onMounted(() => {
  loadCandidates()
  window.addEventListener('rag-documents-updated', handleDocumentsUpdated)
})

onUnmounted(() => {
  stopPolling()
  window.removeEventListener('rag-documents-updated', handleDocumentsUpdated)
})
</script>

<template>
  <div class="career-shell">
    <aside class="history-sidebar" :class="{ 'history-expanded': historyExpanded }">
      <button class="history-toggle" type="button" @click="toggleHistory">
        <span>历史记录</span>
        <strong>{{ historyExpanded ? '收起' : '展开' }}</strong>
      </button>

      <div v-if="historyExpanded" class="history-content">
        <div v-if="historyLoading" class="history-empty">正在加载历史记录...</div>
        <div v-else-if="historyError" class="history-error">{{ historyError }}</div>
        <div v-else-if="historyLoaded && !historyItems.length" class="history-empty">暂无历史分析记录</div>
        <div v-else class="history-list">
          <button v-for="item in historyItems" :key="item.workflow_id" class="history-item"
            :class="{ 'history-item-active': item.workflow_id === selectedHistoryWorkflowId }" type="button"
            @click="selectHistoryItem(item)">
            <span class="history-summary">{{ item.jd_text || '无摘要' }}</span>
            <span class="history-meta">
              <span class="history-status" :class="historyStatusClass(item.status)">{{ item.status }}</span>
              <time>{{ formatHistoryDate(item.created_at) }}</time>
            </span>
          </button>
        </div>
      </div>
    </aside>

    <div class="career-page">
      <section class="career-hero">
        <div>
          <p class="career-kicker">AI Career Analysis Agent</p>
          <h1>CareerAgent</h1>
          <p class="career-subtitle">输入岗位 JD 与简历文本，生成匹配度、证据链与行动建议。</p>
        </div>
        <div class="hero-badge">V3.2 Observability</div>
      </section>

      <section class="career-form">
        <div class="career-inline-grid">
          <div class="career-field">
            <label for="session-id">session_id</label>
            <input id="session-id" v-model="sessionId" type="text" :readonly="isHistoryMode" />
          </div>

          <div class="career-field">
            <label for="user-id">user_id</label>
            <input id="user-id" v-model="userId" type="text" :readonly="isHistoryMode" />
          </div>
        </div>

        <div class="candidate-selector">
          <div class="career-field">
            <label>候选人 <span class="required-mark">*</span></label>
            <div v-if="loadingCandidates" class="selector-hint">正在加载候选人...</div>
            <template v-else>
              <div v-if="candidateError && !candidates.length" class="selector-error">{{ candidateError }}</div>
              <div v-else-if="!candidates.length" class="selector-hint">暂无候选人，请先上传符合命名规范的简历。</div>
              <select v-else v-model="selectedCandidateId" class="select-control" :disabled="isHistoryMode || loading"
                @change="selectCandidate">
                <option value="" disabled>请选择候选人</option>
                <option v-for="candidate in candidates" :key="candidate.candidate_id" :value="candidate.candidate_id">
                  {{ formatCandidateOption(candidate) }}
                </option>
              </select>
              <div v-if="candidateError && candidates.length" class="selector-error">{{ candidateError }}</div>
            </template>
          </div>

          <div v-if="selectedCandidateId" class="career-field">
            <label>简历版本 <span class="required-mark">*</span></label>
            <div v-if="loadingResumes" class="selector-hint">正在加载简历版本...</div>
            <template v-else>
              <div v-if="resumeError && !resumes.length" class="selector-error">{{ resumeError }}</div>
              <select v-else v-model="selectedResumeId" class="select-control" :disabled="isHistoryMode || loading">
                <option value="" disabled>请选择简历版本</option>
                <option v-for="resume in resumes" :key="resume.resume_id" :value="resume.resume_id">
                  {{ formatResumeOption(resume) }}
                </option>
              </select>
              <div v-if="resumeError && resumes.length" class="selector-error">{{ resumeError }}</div>
            </template>
          </div>
        </div>

        <div class="career-grid">
          <div class="career-field">
            <label for="job-description">岗位 JD</label>
            <textarea id="job-description" v-model="jobDescription" placeholder="请输入岗位 JD 文本"
              :readonly="isHistoryMode"></textarea>
          </div>

          <div class="career-field">
            <label for="resume-text">简历文本</label>
            <textarea id="resume-text" v-model="resumeText" placeholder="请输入简历文本" :readonly="isHistoryMode"></textarea>
          </div>
        </div>

        <div class="career-actions">
          <button v-if="shouldShowCancelAnalysis" class="career-cancel"
            :disabled="canceling || isCancellingStatus(workflowStatus)" @click="cancelWorkflow">
            {{ canceling || isCancellingStatus(workflowStatus) ? '中止中...' : '中止分析' }}
          </button>
          <button class="career-submit" :disabled="isSubmitDisabled" @click="analyzeCareer">
            {{ isCancellingStatus(workflowStatus) ? '中止中...' : isHistoryMode ? '历史记录查看中' : loading ? '分析中...' : '开始分析'
            }}
          </button>
        </div>

        <div v-if="isHistoryMode" class="history-mode-hint">
          当前正在查看历史分析记录，再次点击该记录可退出历史查看模式。
        </div>

        <div v-if="error" class="career-error">{{ error }}</div>
      </section>

      <section class="career-report">
        <div class="career-report-header">
          <div>
            <p class="section-kicker">Analysis Report</p>
            <h2>分析报告</h2>
          </div>
          <div v-if="workflowId" class="workflow-chip">
            <span>workflow_id</span>
            <strong>{{ workflowId }}</strong>
          </div>
        </div>

        <div v-if="statusMessage" class="career-status">
          <span>{{ workflowStatus || 'submitted' }}</span>
          {{ statusMessage }}
        </div>
        <div v-if="matchScore !== ''" class="match-score">
          <span>Match Score</span>
          <strong>{{ matchScore }}</strong>
        </div>
        <div v-if="loading && !analyzeResponded && !report" class="career-empty">正在提交分析任务...</div>
        <div v-else-if="report" class="career-report-content" v-html="renderedReport"></div>
        <div v-if="!loading && !report && !statusMessage && !error" class="career-empty">报告将在分析完成后显示在这里。</div>

        <div v-if="shouldShowConfirmation" class="career-confirm-panel">
          <div>
            <div class="career-confirm-title">Human-in-the-loop 确认</div>
            <div class="career-confirm-desc">请确认是否采用当前分析结果，或返回修改。</div>
          </div>
          <div class="career-confirm-actions">
            <button class="career-confirm-button" :disabled="confirming" @click="confirmCareer('approve')">
              {{ confirming ? '提交中...' : '确认使用' }}
            </button>
            <button class="career-confirm-button career-confirm-secondary" :disabled="confirming"
              @click="confirmCareer('revise')">
              需要修改
            </button>
            <button class="career-confirm-button career-confirm-danger" :disabled="confirming"
              @click="confirmCareer('reject')">
              暂不使用
            </button>
          </div>
          <div v-if="confirmationError" class="career-confirm-error">{{ confirmationError }}</div>
        </div>

        <div v-if="confirmationStatus || confirmationMessage || confirmationWorkflowStatus"
          class="career-confirm-result">
          <div v-if="confirmationStatus">
            <span>confirmation_status:</span> {{ confirmationStatus }}
          </div>
          <div v-if="confirmationMessage">
            <span>confirmation_message:</span> {{ confirmationMessage }}
          </div>
          <div v-if="confirmationWorkflowStatus">
            <span>workflow_status:</span> {{ confirmationWorkflowStatus }}
          </div>
        </div>

        <TracePanel v-if="shouldShowTrace" :workflow-id="workflowId" :workflow-status="workflowStatus"
          :execution-status="executionStatus" :duration="workflowDuration" :steps="traceSteps"
          :tool-calls="traceToolCalls" :raw-trace="traceRaw" :expanded="traceExpanded" :loaded="traceLoaded"
          :loading="traceLoading" :error="traceError" @toggle="toggleTrace" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.career-shell {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.history-sidebar {
  position: sticky;
  top: 20px;
  flex: 0 0 112px;
  min-height: 52px;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
  overflow: hidden;
  transition: flex-basis 0.2s ease;
}

.history-sidebar.history-expanded {
  flex-basis: 320px;
}

.history-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 52px;
  border: none;
  background: #fff;
  color: #101828;
  cursor: pointer;
  font-size: 14px;
  font-weight: 800;
  padding: 0 14px;
}

.history-toggle strong {
  color: #175cd3;
  font-size: 12px;
}

.history-content {
  border-top: 1px solid #eef0f4;
  padding: 12px;
}

.history-list {
  display: grid;
  gap: 10px;
  max-height: calc(90vh - 120px);
  overflow-y: auto;
  padding-right: 2px;
}

.history-item {
  width: 100%;
  border: 1px solid #eef0f4;
  border-radius: 12px;
  background: #f9fafb;
  color: #101828;
  cursor: pointer;
  padding: 12px;
  text-align: left;
  transition: border-color 0.2s, background 0.2s;
}

.history-item:hover,
.history-item-active {
  border-color: #1677ff;
  background: #eff6ff;
}

.history-summary {
  display: -webkit-box;
  overflow: hidden;
  color: #1f2937;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.history-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
  color: #667085;
  font-size: 12px;
}

.history-status {
  overflow: hidden;
  border-radius: 999px;
  background: #eef2ff;
  color: #3730a3;
  font-weight: 800;
  padding: 3px 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-status-queued {
  background: #f2f4f7;
  color: #475467;
}

.history-status-running {
  background: #eff8ff;
  color: #175cd3;
}

.history-status-cancelling {
  background: #fff7ed;
  color: #c2410c;
}

.history-status-cancelled {
  background: #f2f4f7;
  color: #475467;
}

.history-status-waiting_human_confirmation {
  background: #fffaeb;
  color: #b54708;
}

.history-status-completed {
  background: #ecfdf3;
  color: #027a48;
}

.history-status-failed {
  background: #fef3f2;
  color: #b42318;
}

.history-empty,
.history-error {
  color: #667085;
  font-size: 13px;
  line-height: 1.5;
}

.history-error {
  color: #b42318;
}

.career-page {
  flex: 1;
  min-width: 0;
  min-height: calc(90vh - 68px);
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.career-hero,
.career-form,
.career-report {
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
}

.career-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 22px 24px;
}

.career-kicker,
.section-kicker {
  margin: 0 0 6px;
  color: #175cd3;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.career-hero h1,
.career-report-header h2 {
  margin: 0;
  color: #101828;
  font-size: 26px;
  line-height: 1.25;
}

.career-subtitle {
  margin: 8px 0 0;
  color: #667085;
  font-size: 15px;
  line-height: 1.6;
}

.hero-badge {
  flex-shrink: 0;
  border: 1px solid #d0d5dd;
  border-radius: 999px;
  background: #f9fafb;
  color: #344054;
  font-size: 13px;
  font-weight: 700;
  padding: 8px 12px;
}

.career-form,
.career-report {
  padding: 20px;
}

.career-inline-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.career-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.career-field label {
  color: #344054;
  font-size: 14px;
  font-weight: 700;
}

.career-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-top: 16px;
}

.candidate-selector {
  display: grid;
  gap: 14px;
  margin-top: 16px;
}

.required-mark {
  color: #cf1322;
}

.selector-hint,
.selector-error {
  border: 1px solid #e4e7ec;
  border-radius: 10px;
  background: #f9fafb;
  color: #667085;
  font-size: 13px;
  line-height: 1.5;
  padding: 10px 12px;
}

.selector-error {
  border-color: #ffccc7;
  background: #fff1f0;
  color: #cf1322;
}

.select-control {
  width: 100%;
  height: 40px;
  border: 1px solid #d0d5dd;
  border-radius: 10px;
  background: #fff;
  color: #101828;
  font-size: 15px;
  line-height: 1.5;
  outline: none;
  padding: 0 12px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.select-control:focus {
  border-color: #1677ff;
  box-shadow: 0 0 0 3px rgba(22, 119, 255, 0.12);
}

.select-control:disabled {
  background: #f2f4f7;
  color: #98a2b3;
  cursor: not-allowed;
}

.career-field>input,
.career-field textarea {
  width: 100%;
  border: 1px solid #d0d5dd;
  border-radius: 10px;
  color: #101828;
  font-size: 15px;
  line-height: 1.5;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.career-field>input {
  height: 40px;
  padding: 0 12px;
}

.career-field textarea {
  min-height: 240px;
  padding: 12px;
  resize: vertical;
  font-family: Arial, sans-serif;
}

.career-field>input:focus,
.career-field textarea:focus {
  border-color: #1677ff;
  box-shadow: 0 0 0 3px rgba(22, 119, 255, 0.12);
}

.career-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}

.career-cancel {
  min-width: 96px;
  height: 40px;
  border: 1px solid #fca5a5;
  border-radius: 10px;
  background: #fff1f2;
  color: #b42318;
  cursor: pointer;
  font-weight: 700;
  transition: background 0.2s, transform 0.2s;
}

.career-cancel:hover:not(:disabled) {
  background: #ffe4e6;
}

.career-cancel:active:not(:disabled) {
  transform: translateY(1px);
}

.career-cancel:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.career-submit {
  min-width: 120px;
  height: 40px;
  border: none;
  border-radius: 10px;
  background: #1677ff;
  color: #fff;
  cursor: pointer;
  font-weight: 700;
  transition: background 0.2s, transform 0.2s;
}

.career-submit:hover:not(:disabled) {
  background: #0958d9;
}

.career-submit:active:not(:disabled) {
  transform: translateY(1px);
}

.career-submit:disabled {
  background: #a0cfff;
  cursor: not-allowed;
}

.history-mode-hint {
  margin-top: 12px;
  border: 1px solid #dbeafe;
  border-radius: 10px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 13px;
  line-height: 1.5;
  padding: 10px 12px;
}

.career-error {
  margin-top: 14px;
  border: 1px solid #ffccc7;
  border-radius: 10px;
  background: #fff1f0;
  color: #cf1322;
  line-height: 1.5;
  padding: 12px;
}

.career-report {
  flex: 1;
  min-height: 220px;
}

.career-report-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.workflow-chip {
  max-width: 420px;
  border: 1px solid #e4e7ec;
  border-radius: 10px;
  background: #f9fafb;
  padding: 8px 10px;
}

.workflow-chip span {
  display: block;
  color: #667085;
  font-size: 12px;
  font-weight: 700;
}

.workflow-chip strong {
  display: block;
  margin-top: 3px;
  overflow: hidden;
  color: #344054;
  font-family: Consolas, Monaco, 'Courier New', monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.career-report-content {
  color: #303133;
  line-height: 1.7;
}

.career-report-content :deep(h1),
.career-report-content :deep(h2),
.career-report-content :deep(h3),
.career-report-content :deep(h4),
.career-report-content :deep(h5),
.career-report-content :deep(h6) {
  margin: 18px 0 10px;
  color: #1f2937;
  line-height: 1.35;
}

.career-report-content :deep(h1) {
  font-size: 26px;
}

.career-report-content :deep(h2) {
  font-size: 22px;
}

.career-report-content :deep(h3) {
  font-size: 18px;
}

.career-report-content :deep(p) {
  margin: 0 0 12px;
}

.career-report-content :deep(ul),
.career-report-content :deep(ol) {
  margin: 0 0 12px;
  padding-left: 24px;
}

.career-report-content :deep(li) {
  margin: 4px 0;
}

.career-report-content :deep(code) {
  border-radius: 4px;
  background: #f5f7fa;
  font-family: Consolas, Monaco, 'Courier New', monospace;
  font-size: 0.92em;
  padding: 2px 5px;
}

.career-report-content :deep(pre) {
  margin: 12px 0;
  overflow-x: auto;
  border-radius: 8px;
  background: #f5f7fa;
  padding: 14px;
}

.career-report-content :deep(pre code) {
  display: block;
  background: transparent;
  line-height: 1.6;
  padding: 0;
}

.career-empty {
  color: #667085;
  line-height: 1.7;
}

.career-status {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  border: 1px solid #dbeafe;
  border-radius: 10px;
  background: #eff6ff;
  color: #1d4ed8;
  line-height: 1.5;
  padding: 12px;
}

.career-status span {
  flex-shrink: 0;
  border-radius: 999px;
  background: #dbeafe;
  color: #1e40af;
  font-size: 12px;
  font-weight: 800;
  padding: 3px 8px;
}

.match-score {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  border: 1px solid #dcfce7;
  border-radius: 10px;
  background: #f0fdf4;
  color: #166534;
  padding: 10px 12px;
}

.match-score span {
  color: #15803d;
  font-size: 12px;
  font-weight: 800;
}

.match-score strong {
  font-size: 20px;
}

.career-confirm-panel,
.career-confirm-result {
  margin-top: 18px;
  border: 1px solid #e4e7ec;
  border-radius: 12px;
  background: #f9fafb;
  padding: 14px;
}

.career-confirm-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.career-confirm-title {
  color: #101828;
  font-size: 15px;
  font-weight: 800;
}

.career-confirm-desc {
  margin-top: 4px;
  color: #667085;
  font-size: 13px;
}

.career-confirm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.career-confirm-button {
  min-width: 96px;
  height: 36px;
  border: none;
  border-radius: 9px;
  background: #1677ff;
  color: #fff;
  cursor: pointer;
  font-weight: 700;
}

.career-confirm-secondary {
  background: #d48806;
}

.career-confirm-danger {
  background: #f56c6c;
}

.career-confirm-button:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.career-confirm-error {
  width: 100%;
  margin-top: 10px;
  color: #cf1322;
  line-height: 1.5;
}

.career-confirm-result {
  display: grid;
  gap: 8px;
  color: #303133;
  line-height: 1.5;
}

.career-confirm-result span {
  font-weight: 700;
}

@media (max-width: 900px) {
  .career-shell {
    flex-direction: column;
  }

  .history-sidebar,
  .history-sidebar.history-expanded {
    position: static;
    flex-basis: auto;
    width: 100%;
  }

  .career-hero,
  .career-report-header,
  .career-confirm-panel {
    align-items: stretch;
    flex-direction: column;
  }

  .career-grid,
  .career-inline-grid {
    grid-template-columns: 1fr;
  }

  .workflow-chip {
    max-width: none;
  }
}
</style>
