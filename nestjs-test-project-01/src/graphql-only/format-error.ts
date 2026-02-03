import { HttpStatus } from '@nestjs/common';
import { GraphQLFormattedError } from 'graphql';

export const formatError = (formattedError: GraphQLFormattedError) => {
  if (process.env.NODE_ENV === 'production') {
    // TODO add logic for production-only later
  }

  const formattedErrorExtensions = formattedError.extensions as
    | {
        code: string;
        status: number;
        originalError: {
          message: string;
          error: string;
          statusCode: number;
        };
      }
    | undefined;
  if (
    (formattedErrorExtensions?.status &&
      (HttpStatus.INTERNAL_SERVER_ERROR as number) <=
        formattedErrorExtensions.status) ||
    formattedErrorExtensions?.code === 'UnknownError'
  ) {
    return {
      message: 'Service temporarily unavailable',
      locations: formattedError.locations,
      path: formattedError.path,
      extensions: {
        code: 'SERVICE_UNAVAILABLE',
        status: 503,
      },
    };
  }
  return {
    message: formattedError.message,
    locations: formattedError.locations,
    path: formattedError.path,
    extensions: {
      code: formattedErrorExtensions?.code,
      status: formattedErrorExtensions?.status,
      originalError: {
        message: formattedErrorExtensions?.originalError.message,
        error: formattedErrorExtensions?.originalError.error,
        statusCode: formattedErrorExtensions?.originalError.statusCode,
      },
    },
  };
};
