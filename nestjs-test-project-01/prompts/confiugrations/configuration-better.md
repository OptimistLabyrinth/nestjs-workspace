# NestJS Configuration Improvement Plan

## Current State Analysis

### Files Reviewed
- `.env.development` - Environment variables for development
- `src/app.module.ts` - Main application module with ConfigModule and TypeOrmModule
- `src/config/configuration.ts` - Single configuration file

### Current Issues

1. **No Environment Separation**: Single `.env.development` file with no clear strategy for production/test
2. **Missing `isGlobal`**: ConfigModule not set as global, requiring re-import in every module
3. **No Validation**: Environment variables lack schema validation (missing vars fail silently)
4. **Monolithic Config**: All configurations in one file - doesn't scale for multiple databases
5. **No Type Safety**: Configuration returns plain objects without TypeScript interfaces
6. **Dangerous Defaults**: `synchronize: true` hardcoded - risky for production
7. **Entity Registration**: Entities manually listed in config file

---

## Recommended Configuration Architecture

### Directory Structure
```
src/config/
├── index.ts                    # Re-exports all configs
├── app.config.ts               # Application-level config (port, name, etc.)
├── database/
│   ├── index.ts                # Re-exports database configs
│   ├── postgresql.config.ts    # PostgreSQL configuration
│   ├── mongodb.config.ts       # (Future) MongoDB configuration
│   └── redis.config.ts         # (Future) Redis configuration
├── validation/
│   └── env.validation.ts       # Environment validation schema
└── interfaces/
    └── config.interface.ts     # TypeScript interfaces for configs
```

### Environment Files
```
.env                    # Shared defaults (committed, non-sensitive)
.env.development        # Development overrides
.env.production         # Production settings
.env.test               # Test settings
```

---

## Implementation Details

---

## Option A: Joi Validation

**Best for**: Projects that prefer schema-based validation separate from TypeScript classes.

### A1. Install Joi
```bash
npm install joi
```

### A2. Validation Schema

```typescript
// src/config/validation/env.validation.ts
import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'staging')
    .default('development'),

  // PostgreSQL
  POSTGRES_HOST: Joi.string().required(),
  POSTGRES_PORT: Joi.number().default(5432),
  POSTGRES_USERNAME: Joi.string().required(),
  POSTGRES_PASSWORD: Joi.string().required(),
  POSTGRES_DATABASE: Joi.string().required(),

  // MongoDB (future)
  // MONGODB_URI: Joi.string().uri().optional(),

  // Redis (future)
  // REDIS_HOST: Joi.string().optional(),
  // REDIS_PORT: Joi.number().default(6379).optional(),

  // App
  APP_PORT: Joi.number().default(3000),
});
```

### A3. AppModule with Joi

```typescript
// src/app.module.ts
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validationSchema } from './config/validation/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
      load: [appConfig, postgresConfig],
      validationSchema,
      validationOptions: {
        abortEarly: true,  // Stop on first error
        allowUnknown: true, // Allow env vars not in schema
      },
    }),
    // ...
  ],
})
export class AppModule {}
```

### A4. Joi Pros/Cons

| Pros | Cons |
|------|------|
| Native NestJS ConfigModule support | Separate validation layer from TypeScript |
| Excellent error messages | Schema duplication (Joi + interfaces) |
| Powerful schema composition | Additional dependency |
| Default values in schema | Less "NestJS-idiomatic" |

---

## Option B: class-validator + class-transformer

**Best for**: Teams already using decorators for DTOs, prefer unified validation approach.

### B1. Install Dependencies
```bash
npm install class-validator class-transformer
```

### B2. Environment Configuration Class

```typescript
// src/config/validation/env.validation.ts
import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
  Staging = 'staging',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  // PostgreSQL
  @IsString()
  POSTGRES_HOST: string;

  @IsNumber()
  @Min(1)
  @Max(65535)
  @IsOptional()
  POSTGRES_PORT: number = 5432;

  @IsString()
  POSTGRES_USERNAME: string;

  @IsString()
  POSTGRES_PASSWORD: string;

  @IsString()
  POSTGRES_DATABASE: string;

  // MongoDB (future)
  // @IsString()
  // @IsOptional()
  // MONGODB_URI?: string;

  // Redis (future)
  // @IsString()
  // @IsOptional()
  // REDIS_HOST?: string;

  // @IsNumber()
  // @IsOptional()
  // REDIS_PORT?: number = 6379;

  // App
  @IsNumber()
  @IsOptional()
  APP_PORT: number = 3000;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((err) => Object.values(err.constraints || {}).join(', '))
      .join('\n');
    throw new Error(`Environment validation failed:\n${messages}`);
  }

  return validatedConfig;
}
```

### B3. AppModule with class-validator

```typescript
// src/app.module.ts
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validate } from './config/validation/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
      load: [appConfig, postgresConfig],
      validate,  // Custom validation function
    }),
    // ...
  ],
})
export class AppModule {}
```

### B4. class-validator Pros/Cons

| Pros | Cons |
|------|------|
| Consistent with NestJS DTOs | More boilerplate code |
| Single validation approach | Requires custom validate function |
| Class acts as interface | Default values can be tricky |
| Decorator-based, familiar pattern | Less powerful than Joi for complex rules |

---

## Recommendation

| Scenario | Recommended |
|----------|-------------|
| New project, small team | **Joi** - simpler setup |
| Large team, many DTOs | **class-validator** - consistency |
| Complex validation rules | **Joi** - more powerful |
| Already using class-validator everywhere | **class-validator** - uniformity |

---

### Type-Safe Configuration Interfaces

```typescript
// src/config/interfaces/config.interface.ts
export interface PostgresConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  synchronize: boolean;
  logging: boolean;
}

export interface MongoConfig {
  uri: string;
  dbName: string;
  retryWrites: boolean;
  retryAttempts: number;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
}

export interface AppConfig {
  port: number;
  environment: string;
}

export interface AllConfig {
  app: AppConfig;
  postgres: PostgresConfig;
  mongodb: MongoConfig;
  redis: RedisConfig;
}
```

---

## Database Configuration Examples

### PostgreSQL Configuration

```typescript
// src/config/database/postgresql.config.ts
import { registerAs } from '@nestjs/config';
import { PostgresConfig } from '../interfaces/config.interface';

export default registerAs('postgres', (): PostgresConfig => ({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  username: process.env.POSTGRES_USERNAME || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '',
  database: process.env.POSTGRES_DATABASE || 'app',
  synchronize: process.env.NODE_ENV !== 'production',
  logging: process.env.NODE_ENV === 'development',
}));
```

### MongoDB Configuration

```typescript
// src/config/database/mongodb.config.ts
import { registerAs } from '@nestjs/config';
import { MongoConfig } from '../interfaces/config.interface';

export default registerAs('mongodb', (): MongoConfig => ({
  uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
  dbName: process.env.MONGODB_DATABASE || 'app',
  retryWrites: process.env.NODE_ENV === 'production',
  retryAttempts: parseInt(process.env.MONGODB_RETRY_ATTEMPTS || '3', 10),
}));
```

### Redis Configuration

```typescript
// src/config/database/redis.config.ts
import { registerAs } from '@nestjs/config';
import { RedisConfig } from '../interfaces/config.interface';

export default registerAs('redis', (): RedisConfig => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  keyPrefix: process.env.REDIS_PREFIX || 'app:',
}));
```

### Database Configs Barrel Export

```typescript
// src/config/database/index.ts
export { default as postgresConfig } from './postgresql.config';
export { default as mongodbConfig } from './mongodb.config';
export { default as redisConfig } from './redis.config';
```

### Application Config

```typescript
// src/config/app.config.ts
import { registerAs } from '@nestjs/config';
import { AppConfig } from './interfaces/config.interface';

export default registerAs('app', (): AppConfig => ({
  port: parseInt(process.env.APP_PORT || '3000', 10),
  environment: process.env.NODE_ENV || 'development',
}));
```

### Root Barrel Export

```typescript
// src/config/index.ts
export * from './database';
export { default as appConfig } from './app.config';
export * from './interfaces/config.interface';
export * from './validation/env.validation';
```

---

## Module Integration Examples

### TypeORM (PostgreSQL) Module Setup

```typescript
// src/app.module.ts - PostgreSQL section
TypeOrmModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    type: 'postgres',
    host: config.get<string>('postgres.host'),
    port: config.get<number>('postgres.port'),
    username: config.get<string>('postgres.username'),
    password: config.get<string>('postgres.password'),
    database: config.get<string>('postgres.database'),
    synchronize: config.get<boolean>('postgres.synchronize'),
    logging: config.get<boolean>('postgres.logging'),
    autoLoadEntities: true,
  }),
}),
```

### Mongoose (MongoDB) Module Setup

```typescript
// src/app.module.ts - MongoDB section
// Required: npm install @nestjs/mongoose mongoose
import { MongooseModule } from '@nestjs/mongoose';

MongooseModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    uri: config.get<string>('mongodb.uri'),
    dbName: config.get<string>('mongodb.dbName'),
    retryWrites: config.get<boolean>('mongodb.retryWrites'),
    retryAttempts: config.get<number>('mongodb.retryAttempts'),
  }),
}),
```

### Redis Module Setup (using @nestjs-modules/ioredis)

```typescript
// src/app.module.ts - Redis section
// Required: npm install @nestjs-modules/ioredis ioredis
import { RedisModule } from '@nestjs-modules/ioredis';

RedisModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    type: 'single',
    options: {
      host: config.get<string>('redis.host'),
      port: config.get<number>('redis.port'),
      password: config.get<string>('redis.password'),
      db: config.get<number>('redis.db'),
      keyPrefix: config.get<string>('redis.keyPrefix'),
    },
  }),
}),
```

### Alternative: CacheModule with Redis

```typescript
// Using NestJS built-in CacheModule with Redis store
// Required: npm install @nestjs/cache-manager cache-manager cache-manager-ioredis-yet
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-ioredis-yet';

CacheModule.registerAsync({
  isGlobal: true,
  inject: [ConfigService],
  useFactory: async (config: ConfigService) => ({
    store: await redisStore({
      host: config.get<string>('redis.host'),
      port: config.get<number>('redis.port'),
      password: config.get<string>('redis.password'),
      db: config.get<number>('redis.db'),
      keyPrefix: config.get<string>('redis.keyPrefix'),
      ttl: 60 * 1000, // 60 seconds default TTL
    }),
  }),
}),
```

---

## Environment Variables Template

```bash
# .env.development / .env.production / .env.test

# Application
NODE_ENV=development
APP_PORT=3000

# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USERNAME=postgres
POSTGRES_PASSWORD=secret
POSTGRES_DATABASE=app_dev

# MongoDB
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=app_dev
MONGODB_RETRY_ATTEMPTS=3

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_PREFIX=app:dev:
```

---

## Complete AppModule Example

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { RedisModule } from '@nestjs-modules/ioredis';

// Config imports
import appConfig from './config/app.config';
import { postgresConfig, mongodbConfig, redisConfig } from './config/database';
import { validationSchema } from './config/validation/env.validation';

// Feature modules
import { UserModule } from './feature/user/user.module';

@Module({
  imports: [
    // Configuration - MUST be first
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
      load: [appConfig, postgresConfig, mongodbConfig, redisConfig],
      validationSchema,           // For Joi
      // validate,                // For class-validator (use one or the other)
      validationOptions: {
        abortEarly: true,
        allowUnknown: true,
      },
    }),

    // PostgreSQL (TypeORM)
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('postgres.host'),
        port: config.get<number>('postgres.port'),
        username: config.get<string>('postgres.username'),
        password: config.get<string>('postgres.password'),
        database: config.get<string>('postgres.database'),
        synchronize: config.get<boolean>('postgres.synchronize'),
        logging: config.get<boolean>('postgres.logging'),
        autoLoadEntities: true,
      }),
    }),

    // MongoDB (Mongoose) - uncomment when ready
    // MongooseModule.forRootAsync({
    //   inject: [ConfigService],
    //   useFactory: (config: ConfigService) => ({
    //     uri: config.get<string>('mongodb.uri'),
    //     dbName: config.get<string>('mongodb.dbName'),
    //   }),
    // }),

    // Redis - uncomment when ready
    // RedisModule.forRootAsync({
    //   inject: [ConfigService],
    //   useFactory: (config: ConfigService) => ({
    //     type: 'single',
    //     options: {
    //       host: config.get<string>('redis.host'),
    //       port: config.get<number>('redis.port'),
    //       password: config.get<string>('redis.password'),
    //       db: config.get<number>('redis.db'),
    //     },
    //   }),
    // }),

    // Feature modules
    UserModule,
  ],
})
export class AppModule {}
```

---

## Key Improvements Summary

| Aspect | Current | Proposed |
|--------|---------|----------|
| Environment handling | Single .env.development | Per-environment files + validation |
| ConfigModule scope | Per-module import | Global (`isGlobal: true`) |
| Validation | None | Joi schema with fail-fast |
| Type safety | Plain objects | TypeScript interfaces |
| Database configs | Monolithic | Namespaced (`registerAs`) |
| Entity loading | Manual list | `autoLoadEntities: true` |
| Prod safety | `synchronize: true` always | Environment-aware |
| Multi-DB ready | No | Modular structure ready |

---

## Files to Create/Modify

### Create
1. `src/config/validation/env.validation.ts` - Validation schema (Joi or class-validator)
2. `src/config/interfaces/config.interface.ts` - TypeScript interfaces
3. `src/config/database/postgresql.config.ts` - PostgreSQL namespaced config
4. `src/config/database/mongodb.config.ts` - MongoDB namespaced config
5. `src/config/database/redis.config.ts` - Redis namespaced config
6. `src/config/database/index.ts` - Database configs barrel export
7. `src/config/app.config.ts` - Application-level config
8. `src/config/index.ts` - Root barrel export
9. `.env.production` - Production environment variables
10. `.env.test` - Test environment variables

### Modify
1. `src/app.module.ts` - Update ConfigModule and TypeOrmModule setup
2. `.env.development` - Add NODE_ENV, APP_PORT, and optionally MongoDB/Redis vars

### Delete (after migration)
1. `src/config/configuration.ts` - Replaced by modular configs

### Dependencies to Install

**Validation (choose one)**:
```bash
# Option A: Joi
npm install joi

# Option B: class-validator
npm install class-validator class-transformer
```

**Database Clients (install as needed)**:
```bash
# PostgreSQL (already installed if using TypeORM)
npm install @nestjs/typeorm typeorm pg

# MongoDB
npm install @nestjs/mongoose mongoose

# Redis (choose one approach)
npm install @nestjs-modules/ioredis ioredis
# OR for caching
npm install @nestjs/cache-manager cache-manager cache-manager-ioredis-yet
```

---

## Verification Steps

1. Start dev server with `NODE_ENV=development npm run start:dev`
2. Verify database connection works
3. Remove a required env var and confirm validation fails on startup
4. Test with `NODE_ENV=test` to verify environment switching
