/**
 * Errors with a safe, user-facing message. Anything else that reaches the error handler
 * is logged in full and answered with a generic message: raw technical errors
 * (stack traces, driver messages, "list index out of range"…) never reach clients.
 */
import type { FastifyInstance } from 'fastify';
import type { ApiErrorBody } from '@runsaturday/shared';
import type { z } from 'zod';

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    readonly userMessage: string,
  ) {
    super(userMessage);
    this.name = 'AppError';
  }
}

export const notFound = (what: string) => new AppError(404, 'not_found', `${what} could not be found.`);

const body = (code: string, message: string): ApiErrorBody => ({ error: { code, message } });

/** Validate request input; invalid input becomes a 400 with a readable message. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((i) => i.path.join('.')).filter(Boolean))];
    const detail = fields.length > 0 ? ` Check: ${fields.join(', ')}.` : '';
    throw new AppError(400, 'invalid_request', `Some request parameters are invalid.${detail}`);
  }
  return result.data;
}

export function registerErrorHandling(app: FastifyInstance) {
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send(body('not_found', `No API route matches ${request.method} ${request.url.split('?')[0]}.`));
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      if (error.statusCode >= 500) request.log.error({ err: error }, error.userMessage);
      return reply.status(error.statusCode).send(body(error.code, error.userMessage));
    }

    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      request.log.warn({ err: error }, 'Client error');
      return reply.status(status).send(body('bad_request', 'The request could not be processed.'));
    }

    // Unexpected: full details go to the structured log only.
    request.log.error({ err: error }, 'Unhandled error');
    return reply.status(500).send(body('internal_error', 'Something went wrong on our side. Please try again.'));
  });
}
