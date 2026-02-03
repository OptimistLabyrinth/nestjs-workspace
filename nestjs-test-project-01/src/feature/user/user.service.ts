import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateUserInput,
  UpdateUserInput,
  PaginationOffsetInput,
  PaginationOffsetOutput,
} from './dto';
import { UserRepository } from './typeorm/user.repository';
import { UserMapper } from './mappers/user.mapper';
import { UserEntity } from './graphql/user.entity';
import { UserModel } from './typeorm/user.model';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { AsyncOptional } from 'src/utils';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  private async findUserOrThrow(id: string): Promise<UserModel> {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) {
      throw new NotFoundException(`user with id ${id} not found`);
    }
    return user;
  }

  async createUser(input: CreateUserInput): Promise<UserEntity> {
    // method 1 - check and create
    //
    // const exists = await this.userRepository.existsBy({
    //   email: input.email,
    // });
    // if (exists) {
    //   throw new ConflictException('Email already exists');
    // }
    // const user = await this.userRepository.createUser(input);
    // return UserMapper.toEntity(saved);

    // method 2 - most robust with single db query
    //
    try {
      const user = await this.userRepository.saveUser(input);
      return UserMapper.toEntity(user);
    } catch (error) {
      const pgError = error as { code: string; detail: string };
      if (pgError.code === '23505') {
        const detail: string = pgError.detail ?? '';
        const match = detail.match(/Key \((\w+)\)=/);
        const column = match?.[1] ?? 'field';
        throw new ConflictException(
          `${column.charAt(0).toUpperCase() + column.slice(1)} already exists`,
        );
      }
      throw error;
    }
  }

  async findManyOffset(
    paginationInput: PaginationOffsetInput,
  ): Promise<PaginationOffsetOutput> {
    const { page, limit, orderBy } = paginationInput;
    const [users, totalCount] = await this.userRepository.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { ...orderBy },
    });
    const items = users.map((user) => UserMapper.toEntity(user));
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    return { items, totalCount, page, limit, totalPages, hasNextPage };
  }

  async findOne(id: string): Promise<UserEntity> {
    // method 1 - findOne or throw
    //
    const user = await this.findUserOrThrow(id);
    return UserMapper.toEntity(user);

    // method 2 - java style fluent api
    //
    // return AsyncOptional.of(this.userRepository.findOneBy({ id }))
    //   .map((user) => UserMapper.toEntity(user))
    //   .orElseThrow(() => new NotFoundException(`user with id ${id} not found`));
  }

  async update(id: string, updateUserInput: UpdateUserInput) {
    // method 1 - findOne and update or throw
    //
    const foundUser = await this.findUserOrThrow(id);
    const user = await this.userRepository.saveUser({
      ...foundUser,
      ...updateUserInput,
      id,
    });
    return UserMapper.toEntity(user);

    // method 2 - java style fluent api
    //
    // return AsyncOptional.of(this.userRepository.findOneBy({ id }))
    //   .map((foundUser) => ({ ...foundUser, ...updateUserInput, id }))
    //   .flatMap((merged) => this.userRepository.save(merged))
    //   .map((user) => UserMapper.toEntity(user))
    //   .orElseThrow(() => new NotFoundException(`user with id ${id} not found`));
  }

  async remove(id: string): Promise<UserEntity> {
    const user = await this.findUserOrThrow(id);
    const timestamp = Date.now().toString().slice(-5);
    user.email = `${user.email}_deleted_${timestamp}`;
    user.deletedAt = new Date();
    const updatedUser = await this.userRepository.saveUser(user);
    return UserMapper.toEntity(updatedUser);
  }
}
