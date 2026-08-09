import { createAssistantMessage } from './ragSources.js'

export const RAG_COMMAND_HEADER = 'X-RAG-Command'
export const RESET_COMMAND = 'reset'
export const RESET_CONFIRMATION_MESSAGE = '上下文已清理，可以开始新的对话。'

const getHeaderValue = (headers, headerName) => {
  if (!headers) {
    return ''
  }

  if (typeof headers.get === 'function') {
    const headerValue = headers.get(headerName) ?? headers.get(headerName.toLowerCase())
    if (headerValue !== null && headerValue !== undefined) {
      return headerValue
    }
  }

  if (typeof headers === 'object') {
    const matchingKey = Object.keys(headers).find(key => key.toLowerCase() === headerName.toLowerCase())
    return matchingKey ? headers[matchingKey] : ''
  }

  return ''
}

export const getRagCommandFromResponse = (response) => (
  String(getHeaderValue(response?.headers, RAG_COMMAND_HEADER) || '').trim().toLowerCase()
)

export const isValidResetResponse = (data) => (
  data?.command === RESET_COMMAND && data?.context_reset === true
)

export const parseResetResponse = async (response) => {
  const data = await response.json()
  if (!response.ok || !isValidResetResponse(data)) {
    throw new Error('invalid RAG reset response')
  }
  return data
}

export const createResetConfirmationMessage = () => ({
  ...createAssistantMessage(),
  content: RESET_CONFIRMATION_MESSAGE,
})
