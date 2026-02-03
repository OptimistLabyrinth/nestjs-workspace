import { registerAs } from '@nestjs/config';

export const namespace = 'nest_app';

export default registerAs(namespace, () => ({
  environment: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.APP_PORT || '3000', 10),
}));
