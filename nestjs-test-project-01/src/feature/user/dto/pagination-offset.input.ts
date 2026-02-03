import { InputType, Field, Int } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min, ValidateNested } from 'class-validator';
import { SortOrder } from 'src/constant/enums';

@InputType()
export class OrderByInput {
  @Field(() => SortOrder, { nullable: true })
  @IsOptional()
  @IsIn([SortOrder.ASC, SortOrder.DESC])
  updatedAt?: SortOrder;

  @Field(() => SortOrder, { nullable: true })
  @IsOptional()
  @IsIn([SortOrder.ASC, SortOrder.DESC])
  name?: SortOrder;
}

@InputType()
export class PaginationOffsetInput {
  @Field(() => Int, { defaultValue: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number;

  @Field(() => Int, { defaultValue: 10 })
  @Type(() => Number)
  @IsInt()
  @IsIn([10, 20, 50, 100])
  limit: number;

  @Field(() => OrderByInput, { nullable: true })
  @ValidateNested()
  @IsOptional()
  orderBy?: OrderByInput;
}
