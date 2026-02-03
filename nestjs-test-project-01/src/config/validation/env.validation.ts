import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
  Staging = 'staging',
}

export const getCurrentEnvFilePath = () => {
  if (process.env.NODE_ENV === Environment.Production) {
    return '.env.production';
  }
  if (process.env.NODE_ENV === Environment.Development) {
    return '.env.development';
  }
  return '.env';
};

export class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @Type(() => Number)
  @IsNumber()
  @Min(1024)
  @Max(65535)
  @IsOptional()
  APP_PORT: number = 3000;

  @IsString()
  POSTGRES_HOST: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(65535)
  @IsOptional()
  POSTGRES_PORT: string;

  @IsString()
  POSTGRES_USERNAME: string;

  @IsString()
  POSTGRES_PASSWORD: string;

  @IsString()
  POSTGRES_DATABASE: string;

  @IsString()
  POSTGRES_APP_DB_USER: string;

  @IsString()
  POSTGRES_APP_DB_PASSWORD: string;

  @IsString()
  POSTGRES_APP_DB_NAME: string;
}

export const validate = (config: Record<string, unknown>) => {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig);

  if (0 < errors.length) {
    const messages = errors
      .map((err) => Object.values(err.constraints || {}).join(', '))
      .join('\n');
    throw new Error(`Environment validation failed:\n${messages}`);
  }

  return validatedConfig;
};
