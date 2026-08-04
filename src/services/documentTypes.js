export const normalizeDocumentsResponse = (data) => {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.items)) return data.items
  return []
}

export const canShowResumeConfirmation = (document) => (
  document?.status === 'ready' &&
  document?.suggested_document_type === 'resume' &&
  document?.requires_confirmation === true
)

export const canUseResumeTypeReview = (review) => (
  review?.suggested_document_type === 'resume' &&
  review?.classification_status === 'pending_confirmation' &&
  review?.requires_confirmation === true
)

export const normalizeCandidateDraft = (draft) => ({
  candidate_name: String(draft?.candidate_name || '').trim(),
  phone: String(draft?.phone || '').trim(),
  school: String(draft?.school || '').trim(),
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
