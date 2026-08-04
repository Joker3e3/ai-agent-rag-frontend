export const normalizeDocumentsResponse = (data) => {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.items)) return data.items
  return []
}

export const getLocalizedDocumentMessage = (message, fallback) => {
  const text = String(message || '').trim()
  if (!text || /^[\x00-\x7F]+$/.test(text)) return fallback
  return text
}

export const canShowResumeConfirmation = (document) => (
  document?.status === 'ready' &&
  document?.suggested_document_type === 'resume' &&
  document?.requires_confirmation === true
)

export const canShowResumeConversion = (document) => (
  document?.status === 'ready' &&
  document?.document_type === 'document' &&
  document?.requires_confirmation !== true
)

export const canUseResumeTypeReview = (review, mode = 'confirmation') => {
  if (mode === 'conversion') {
    return (
      review?.document_type === 'document' &&
      review?.requires_confirmation !== true
    )
  }

  return (
    review?.suggested_document_type === 'resume' &&
    review?.classification_status === 'pending_confirmation' &&
    review?.requires_confirmation === true
  )
}

export const getDocumentTypeLabel = (document) => {
  if (document?.requires_confirmation === true) return '待确认'
  return document?.document_type === 'resume' ? '简历' : '文件'
}

export const getDocumentStatusLabel = (document) => {
  if (document?.status === 'processing') return '处理中'
  if (document?.status === 'failed') return '处理失败'
  return getDocumentTypeLabel(document)
}

export const normalizeCandidateDraft = (draft) => ({
  candidate_name: String(draft?.candidate_name || '').trim(),
  phone: String(draft?.phone || '').trim(),
  school: String(draft?.school || '').trim(),
})

export const resolveResumeConfirmationDecision = (initialDraft, currentDraft) => {
  const initial = normalizeCandidateDraft(initialDraft)
  const current = normalizeCandidateDraft(currentDraft)
  const isUnchanged = Object.keys(initial).every(field => initial[field] === current[field])

  if (isUnchanged) {
    return { decision: 'confirm_resume_as_extracted' }
  }

  return {
    decision: 'confirm_resume_with_corrections',
    candidate: current,
  }
}

export const resolveManualResumeConversionDecision = (draft) => ({
  decision: 'confirm_resume_with_corrections',
  candidate: normalizeCandidateDraft(draft),
})

export const createTypeDecisionPayload = (decision, draft) => {
  if (decision === 'confirm_resume_with_corrections') {
    return {
      decision,
      candidate: normalizeCandidateDraft(draft),
    }
  }

  return { decision }
}

export const getDocumentWorkflowErrorMessage = (status) => {
  if (status === 404) return '文档不存在或不属于当前用户'
  if (status === 409) return '文档当前不处于待确认状态，请刷新列表'
  if (status === 422) return '候选人信息校验失败，请检查字段'
  if (!status) return '网络错误，请检查网络后重试'
  return '文档类型确认失败，请稍后重试'
}

export const getValidationFieldErrors = (detail) => {
  const errors = {}

  if (Array.isArray(detail)) {
    detail.forEach((item) => {
      const field = Array.isArray(item?.loc) ? item.loc.at(-1) : ''
      if (field && item?.msg) errors[field] = item.msg
    })
    return errors
  }

  if (detail && typeof detail === 'object') {
    const fieldErrors = detail.field_errors || detail.errors
    if (fieldErrors && typeof fieldErrors === 'object') {
      Object.assign(errors, fieldErrors)
    }
  }

  return errors
}

export const executeTypeDecision = async ({
  post,
  apiBaseUrl,
  userId,
  documentId,
  decision,
  candidate,
  refreshDocuments,
  notifyStateChanged,
}) => {
  const result = await post(
    `${apiBaseUrl}/documents/${encodeURIComponent(documentId)}/type-decision`,
    createTypeDecisionPayload(decision, candidate),
    { params: { user_id: userId } },
  )

  await refreshDocuments()
  notifyStateChanged?.()
  return result
}

export const executeDocumentDelete = async ({
  remove,
  apiBaseUrl,
  userId,
  documentId,
  refreshDocuments,
  notifyStateChanged,
}) => {
  const result = await remove(`${apiBaseUrl}/documents/${encodeURIComponent(documentId)}`, {
    params: {
      user_id: userId,
    },
  })

  await refreshDocuments()
  notifyStateChanged?.()
  return result
}
