import { IsNotEmpty, IsUUID } from 'class-validator';
import { CreateUserInput } from './create-user.input';
import { InputType, Field, PartialType, ID } from '@nestjs/graphql';

@InputType()
export class UpdateUserInput extends PartialType(CreateUserInput) {
  @Field(() => ID, { description: 'User ID to update' })
  @IsNotEmpty()
  @IsUUID()
  id: string;
}
