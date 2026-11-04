export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly detail?: string

  constructor(status: number, code: string, message?: string, detail?: string) {
    super(message ?? code)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.detail = detail
  }
}
