import { ObjectType, Field, Int } from '@nestjs/graphql';
import { UserEntity } from '../graphql/user.entity';

@ObjectType()
export class PaginationOffsetOutput {
  @Field(() => [UserEntity], { description: 'List of items' })
  items: UserEntity[];

  @Field(() => Int, { description: 'Total number of items' })
  totalCount: number;

  @Field(() => Int, { description: 'Current page number' })
  page: number;

  @Field(() => Int, { description: 'Items per page' })
  limit: number;

  @Field(() => Int, { description: 'Total number of pages' })
  totalPages: number;

  @Field(() => Boolean, { description: 'Whether more pages exist' })
  hasNextPage: boolean;
}
