import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { appConfigNamespace } from './config';
import { AllExceptionFilter, TypeOrmExceptionFilter } from './filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>(`${appConfigNamespace}.port`);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // enables @Type() transformation
      whitelist: true, // strips unknown properties
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(
    // filter execution in reverse order
    new AllExceptionFilter(),
    new TypeOrmExceptionFilter(),
  );
  await app.listen(port ?? 3000);
}
bootstrap();
