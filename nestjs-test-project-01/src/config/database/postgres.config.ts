import { registerAs } from '@nestjs/config';
import { Environment } from '../validation/env.validation';

export const namespace = 'postgresql_typeorm';

export default registerAs(namespace, () => ({
  type: 'postgres' as const,
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  username: process.env.POSTGRES_APP_DB_USER || 'root',
  password: process.env.POSTGRES_APP_DB_PASSWORD || 'root',
  database: process.env.POSTGRES_APP_DB_NAME || 'test',
  synchronize: process.env.NODE_ENV !== Environment.Production,
  logging: process.env.NODE_ENV === Environment.Development,
  autoLoadEntities: process.env.NODE_ENV !== Environment.Production,
}));
