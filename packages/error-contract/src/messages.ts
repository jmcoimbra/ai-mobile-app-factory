import type { ErrorCode } from './codes.ts';

export interface UserMessage {
  title: string;
  body: string;
  /** Whether offering "Try again" makes sense for this failure. */
  canRetry: boolean;
}

/**
 * What a person reads. Plain words, no status codes, no server text. The
 * Record type makes the compiler refuse a code with no message.
 */
export const USER_MESSAGES: Record<ErrorCode, UserMessage> = {
  'network.offline': {
    title: 'You are offline',
    body: 'Check your connection and try again.',
    canRetry: true,
  },
  'network.timeout': {
    title: 'This is taking too long',
    body: 'The request timed out. Try again in a moment.',
    canRetry: true,
  },
  'request.invalid': {
    title: 'Something in the request was not accepted',
    body: 'Review what you entered and try again.',
    canRetry: false,
  },
  'auth.required': {
    title: 'Sign in to continue',
    body: 'Your session has ended. Sign in again.',
    canRetry: false,
  },
  'auth.forbidden': {
    title: 'You do not have access to this',
    body: 'Ask your manager if you need it.',
    canRetry: false,
  },
  'resource.not_found': {
    title: 'We could not find that',
    body: 'It may have been removed. Go back and refresh the list.',
    canRetry: false,
  },
  'resource.conflict': {
    title: 'This changed while you were working',
    body: 'Refresh to see the latest version, then try again.',
    canRetry: true,
  },
  'rate.limited': {
    title: 'Too many requests',
    body: 'Wait a moment before trying again.',
    canRetry: true,
  },
  'server.unavailable': {
    title: 'The service is unavailable',
    body: 'We are having trouble on our side. Try again in a moment.',
    canRetry: true,
  },
  'server.error': {
    title: 'Something went wrong on our side',
    body: 'Try again. If it keeps happening, contact support.',
    canRetry: true,
  },
  'checklist.task_not_found': {
    title: 'That task is no longer on the checklist',
    body: 'Refresh the checklist to see the current tasks.',
    canRetry: false,
  },
  unknown: {
    title: 'Something went wrong',
    body: 'Try again. If it keeps happening, contact support.',
    canRetry: true,
  },
};

export function userMessageFor(code: ErrorCode): UserMessage {
  return USER_MESSAGES[code];
}
