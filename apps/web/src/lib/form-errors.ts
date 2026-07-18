import type { UseFormSetError, FieldValues, Path } from 'react-hook-form';
import { ApiError } from './api';

/**
 * Maps an API failure back onto the form's inputs.
 *
 * The point: an error about the email field belongs ON the email field. A toast
 * saying "Validation failed" makes the user hunt for which of eleven inputs is
 * wrong, and a toast for a duplicate email is the same failure — the answer is
 * "change this value", so the message must sit next to the value.
 *
 * Returns a form-level message for anything genuinely not field-specific.
 */
export function applyApiErrorToForm<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  knownFields: readonly string[],
): string | null {
  if (!(error instanceof ApiError)) {
    return 'Something went wrong. Please try again.';
  }

  // 400 — Zod field errors from the API's errorHandler: { email: ['...'] }
  if (error.fields !== undefined) {
    let mappedAny = false;
    for (const [field, messages] of Object.entries(error.fields)) {
      const message = messages[0];
      if (message === undefined) continue;
      if (!knownFields.includes(field)) continue;
      setError(field as Path<T>, { type: 'server', message });
      mappedAny = true;
    }
    // Only fall back to a banner if nothing landed on an input — otherwise the
    // user would see the same problem reported twice.
    return mappedAny ? null : error.message;
  }

  // 409 — duplicate email. The API says "An employee with this email already
  // exists", which is a fact about one field, so it goes on that field.
  if (error.status === 409 && /email/i.test(error.message)) {
    setError('email' as Path<T>, { type: 'server', message: error.message });
    return null;
  }

  // 409 — a cycle from the manager assignment (Phase 3). Same reasoning.
  if (error.status === 409 && /(cycle|report)/i.test(error.message)) {
    if (knownFields.includes('managerId')) {
      setError('managerId' as Path<T>, { type: 'server', message: error.message });
      return null;
    }
  }

  // 404 — an unknown manager id.
  if (error.status === 404 && /manager/i.test(error.message)) {
    if (knownFields.includes('managerId')) {
      setError('managerId' as Path<T>, { type: 'server', message: error.message });
      return null;
    }
  }

  // 403 from sanitizeFields names exactly which fields were refused.
  if (error.rejectedFields !== undefined && error.rejectedFields.length > 0) {
    for (const field of error.rejectedFields) {
      if (!knownFields.includes(field)) continue;
      setError(field as Path<T>, {
        type: 'server',
        message: 'You do not have permission to change this field.',
      });
    }
    return null;
  }

  return error.message;
}
