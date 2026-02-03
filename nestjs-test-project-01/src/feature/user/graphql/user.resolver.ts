import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UserService } from '../user.service';
import { UserEntity } from './user.entity';
import { CreateUserInput } from '../dto/create-user.input';
import { UpdateUserInput } from '../dto/update-user.input';
import {
  PaginationOffsetInput,
  PaginationOffsetOutput,
} from 'src/feature/user/dto';

@Resolver(() => UserEntity)
export class UserResolver {
  constructor(private readonly userService: UserService) {}

  @Mutation(() => UserEntity)
  async createUser(
    @Args('createUserInput') createUserInput: CreateUserInput,
  ): Promise<UserEntity> {
    return await this.userService.createUser(createUserInput);
  }

  @Query(() => PaginationOffsetOutput, { name: 'users' })
  async findManyOffset(
    @Args('paginationInput') paginationInput: PaginationOffsetInput,
  ): Promise<PaginationOffsetOutput> {
    return await this.userService.findManyOffset(paginationInput);
  }

  @Query(() => UserEntity, { name: 'user' })
  async findOne(@Args('id') id: string) {
    return await this.userService.findOne(id);
  }

  @Mutation(() => UserEntity)
  async updateUser(@Args('updateUserInput') updateUserInput: UpdateUserInput) {
    return await this.userService.update(updateUserInput.id, updateUserInput);
  }

  @Mutation(() => UserEntity)
  async removeUser(@Args('id') id: string) {
    return await this.userService.remove(id);
  }
}
