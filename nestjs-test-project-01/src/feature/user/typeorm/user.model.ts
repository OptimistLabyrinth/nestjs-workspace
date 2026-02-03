import { v7 as uuidv7 } from 'uuid';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export const tableName = 'users';

@Entity(tableName)
export class UserModel {
  constructor(params: Pick<UserModel, 'id' | 'name' | 'email'>) {
    Object.assign(this, params);
  }

  @PrimaryColumn('uuid')
  // UUID v7
  // > best balance of MSA compatibility and PostgreSQL performance with minimal complexity.
  // > Time-ordered UUID — sequential like auto-increment, but globally unique.
  id: string = uuidv7();

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', nullable: true })
  updatedAt: Date | null;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
