import type { ErrorCode } from '../shared/types.ts'

/**
 * A refusal the API is allowed to return.
 *
 * Thrown rather than returned only because it has to cross the store → route
 * boundary; the route turns it straight back into `{ error: { code, message } }`.
 * Anything else escaping a handler is a bug and becomes a 500, which is the
 * distinction worth keeping: a refusal is an answer, a 500 is a failure.
 */
export class ApiFailure extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'ApiFailure'
    this.code = code
  }
}

export const notFound = (what: string): never => {
  throw new ApiFailure('not_found', `${what} does not exist.`)
}

export const duplicateKey = (key: string): never => {
  throw new ApiFailure(
    'duplicate_key',
    `The key "${key}" is already used by another card in this project. Keys must be unique per project.`,
  )
}

export const invalidMove = (message: string): never => {
  throw new ApiFailure('invalid_move', message)
}

export const invalidParent = (message: string): never => {
  throw new ApiFailure('invalid_parent', message)
}
