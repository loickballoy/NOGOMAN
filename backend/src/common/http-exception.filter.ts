import {
  ArgumentsHost, BadRequestException, Catch, ExceptionFilter, HttpException, HttpStatus, Logger, ValidationError,
} from '@nestjs/common';

/** What every error response looks like (rule 9). Business errors may add fields, e.g. `details`. */
export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  [extra: string]: unknown;
}

/** Code and French message for errors thrown without a business code, by HTTP status. */
const DEFAULTS: Record<number, { code: string; message: string }> = {
  [HttpStatus.BAD_REQUEST]: { code: 'BAD_REQUEST', message: 'La demande est invalide. Vérifiez et réessayez.' },
  [HttpStatus.UNAUTHORIZED]: { code: 'UNAUTHORIZED', message: 'Vous devez vous reconnecter.' },
  [HttpStatus.FORBIDDEN]: { code: 'FORBIDDEN', message: 'Vous n’avez pas accès à cette action.' },
  [HttpStatus.NOT_FOUND]: { code: 'NOT_FOUND', message: 'Introuvable.' },
  [HttpStatus.METHOD_NOT_ALLOWED]: { code: 'METHOD_NOT_ALLOWED', message: 'Action non autorisée.' },
  [HttpStatus.CONFLICT]: { code: 'CONFLICT', message: 'Cette action a déjà été faite.' },
  [HttpStatus.PAYLOAD_TOO_LARGE]: { code: 'PAYLOAD_TOO_LARGE', message: 'Envoi trop lourd.' },
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Ce type de fichier n’est pas accepté.' },
  [HttpStatus.TOO_MANY_REQUESTS]: { code: 'TOO_MANY_REQUESTS', message: 'Trop de demandes. Réessayez dans une minute.' },
  [HttpStatus.SERVICE_UNAVAILABLE]: { code: 'SERVICE_UNAVAILABLE', message: 'Service momentanément indisponible. Réessayez plus tard.' },
};
const INTERNAL = { code: 'INTERNAL_ERROR', message: 'Une erreur est survenue. Réessayez plus tard.' };
const OTHER_CLIENT_ERROR = { code: 'REQUEST_FAILED', message: 'La demande n’a pas pu aboutir. Réessayez.' };

export const VALIDATION_MESSAGE = 'Certaines informations sont invalides. Vérifiez et réessayez.';

/** ValidationPipe errors become VALIDATION_FAILED; the technical details go apart, in `details`. */
export function validationException(errors: ValidationError[]) {
  return new BadRequestException({ code: 'VALIDATION_FAILED', message: VALIDATION_MESSAGE, details: flatten(errors) });
}

function flatten(errors: ValidationError[], parent = ''): { field: string; errors: string[] }[] {
  return errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own = e.constraints ? [{ field, errors: Object.values(e.constraints) }] : [];
    return [...own, ...flatten(e.children ?? [], field)];
  });
}

/**
 * Gives every error the same body: `{ statusCode, code, message }`, with a stable English code
 * and a plain French message the app can read aloud. Business errors keep their code and
 * message; errors without a code get one from their status; anything unexpected becomes a
 * 500 INTERNAL_ERROR that reveals nothing (the details only go to the server log).
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') throw exception;
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    const body = this.toBody(exception);
    if (body.statusCode >= 500 && !(exception instanceof HttpException && hasCode(exception.getResponse()))) {
      this.logger.error(
        `${req?.method} ${req?.originalUrl?.split('?')[0]} failed`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(body.statusCode).json(body);
  }

  toBody(exception: unknown): ApiErrorBody {
    const status = httpStatusOf(exception);
    if (status === undefined) return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, ...INTERNAL };
    const fallback = DEFAULTS[status] ?? (status >= 500 ? INTERNAL : OTHER_CLIENT_ERROR);
    const response = exception instanceof HttpException ? exception.getResponse() : undefined;
    if (hasCode(response)) {
      const { statusCode: _status, code, message, ...extra } = response as Record<string, unknown>;
      return {
        statusCode: status,
        code: code as string,
        message: typeof message === 'string' && message.trim() ? message : fallback.message,
        ...extra,
      };
    }
    // No business code: Nest's default messages are English and technical, so they are dropped.
    return { statusCode: status, ...fallback };
  }
}

function hasCode(response: unknown): boolean {
  return typeof response === 'object' && response !== null
    && typeof (response as { code?: unknown }).code === 'string'
    && /^[A-Z_]+$/.test((response as { code: string }).code);
}

/**
 * The HTTP status of an exception: Nest's HttpException, or the errors Express middleware
 * raises before Nest sees the request (body-parser: malformed JSON, body too large...).
 */
function httpStatusOf(exception: unknown): number | undefined {
  if (exception instanceof HttpException) return exception.getStatus();
  const e = exception as { status?: unknown; statusCode?: unknown; type?: unknown } | null;
  const status = e?.status ?? e?.statusCode;
  // Only trust a status set by body-parser (it also sets `type`), never one from arbitrary errors.
  if (typeof e?.type === 'string' && typeof status === 'number' && status >= 400 && status < 500) return status;
  return undefined;
}
