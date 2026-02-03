import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  ExceptionFilter,
  InternalServerErrorException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

@Catch(QueryFailedError)
export class TypeOrmExceptionFilter implements ExceptionFilter {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  catch(exception: QueryFailedError, _host: ArgumentsHost) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const code = (exception as any).code;

    switch (code) {
      case '23502': // Not null violation
        throw new BadRequestException('Required field missing');
      case '23503': // Foreign key violation
        throw new BadRequestException('Invalid reference');
      case '23505': // Unique violation
        throw new ConflictException('Resource already exists');
      default:
        throw new InternalServerErrorException('Database error');
    }
  }
}
