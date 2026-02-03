import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserResolver } from './graphql/user.resolver';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserRepository } from './typeorm/user.repository';
import { UserModel } from './typeorm/user.model';

@Module({
  imports: [TypeOrmModule.forFeature([UserModel])],
  providers: [UserResolver, UserService, UserRepository],
})
export class UserModule {}
