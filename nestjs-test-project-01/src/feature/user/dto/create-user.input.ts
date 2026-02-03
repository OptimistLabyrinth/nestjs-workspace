import { InputType, Field } from '@nestjs/graphql';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

@InputType()
export class CreateUserInput {
  @Field({ description: 'user display name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @Field({ description: 'user email address' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
