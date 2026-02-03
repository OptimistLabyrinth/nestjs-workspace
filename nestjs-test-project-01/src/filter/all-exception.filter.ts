import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { GqlContextType } from '@nestjs/graphql';
import { Response } from 'express';
import { GraphQLError } from 'graphql';

@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionFilter.name);

  private static readonly CONNECTION_ERROR_CODES = new Set([
    'ECONNREFUSED', // Connection refused
    'ECONNRESET', // Connection reset by peer
    'ETIMEDOUT', // Connection timed out
    'ENOTFOUND', // DNS lookup failed
    'EHOSTUNREACH', // Host unreachable
    'ENETUNREACH', // Network unreachable
    'ECONNABORTED', // Connection aborted
    'EPIPE', // Broken pipe
    'EAI_AGAIN', // DNS temporary failure
    'EADDRINUSE', // Address already in use
  ]);

  catch(exception: unknown, host: ArgumentsHost) {
    const contextType = host.getType<GqlContextType>();

    const { statusCode, message, errorName } = this.extractErrorInfo(exception);

    // Log without stacktrace (production-safe)
    this.logger.error(`[${errorName}] ${message}`, `Status: ${statusCode}`);
    // this.logger.error(exception);

    // Handle based on context type
    if (contextType === 'graphql') {
      return this.handleGraphQLException(exception, statusCode, message);
    }
    // HTTP context
    return this.handleHttpException(host, statusCode, message, errorName);
  }

  private extractErrorInfo(exception: unknown): {
    statusCode: number;
    message: string;
    errorName: string;
  } {
    if (exception instanceof HttpException) {
      return {
        statusCode: exception.getStatus(),
        message: exception.message,
        errorName: exception.name,
      };
    }

    if (this.isConnectionError(exception)) {
      const errorCode = this.extractErrorCode(exception);
      return {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: `Service temporarily unavailable. Connection error: ${errorCode}`,
        errorName: 'ConnectionError',
      };
    }

    const errorName =
      exception instanceof Error ? exception.name : 'UnknownError';
    const message =
      exception instanceof Error ? exception.message : 'Internal server error';

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message,
      errorName,
    };
  }

  private isConnectionError(exception: unknown): boolean {
    if (!(exception instanceof Error)) {
      return false;
    }
    const errorWithCode = exception as Error & { code?: string };
    // Check direct error code
    if (
      errorWithCode.code &&
      AllExceptionFilter.CONNECTION_ERROR_CODES.has(errorWithCode.code)
    ) {
      return true;
    }
    // Check AggregateError with nested connection errors
    if (exception.name === 'AggregateError') {
      const aggError = exception as AggregateError;
      return aggError.errors?.some(
        (err: Error & { code?: string }) =>
          err.code && AllExceptionFilter.CONNECTION_ERROR_CODES.has(err.code),
      );
    }

    return false;
  }

  private extractErrorCode(exception: unknown): string {
    if (!(exception instanceof Error)) {
      return 'Unknown';
    }
    const errorWithCode = exception as Error & { code?: string };
    if (errorWithCode.code) {
      return errorWithCode.code;
    }
    if (exception.name === 'AggregateError') {
      const aggError = exception as AggregateError;
      const firstErrorWithCode = aggError.errors?.find(
        (err: Error & { code?: string }) => err.code,
      ) as (Error & { code?: string }) | undefined;
      return firstErrorWithCode?.code || 'Unknown';
    }
    return 'Unknown';
  }

  private handleGraphQLException(
    exception: unknown,
    statusCode: number,
    message: string,
  ) {
    // For GraphQL, throw GraphQLError which Apollo will process via formatError
    if (exception instanceof HttpException) {
      throw exception;
    }
    // For non-HTTP exceptions (like ECONNREFUSED), throw GraphQLError
    throw new GraphQLError(message || 'Internal server error', {
      extensions: {
        code: this.getGraphQLErrorCode(statusCode),
        status: statusCode,
      },
    });
  }
  private handleHttpException(
    host: ArgumentsHost,
    statusCode: number,
    message: string,
    errorName: string,
  ) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    response.status(statusCode).json({
      statusCode,
      message,
      error: errorName,
      timestamp: new Date().toISOString(),
    });
  }

  private getGraphQLErrorCode(statusCode: number): string {
    return HttpStatus[statusCode] || 'INTERNAL_SERVER_ERROR';
  }
}
