import { Injectable } from '@nestjs/common';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { UserModel, tableName } from './user.model';

@Injectable()
export class UserRepository extends Repository<UserModel> {
  constructor(private dataSource: DataSource) {
    super(UserModel, dataSource.createEntityManager());
  }

  createQueryBuilder(alias?: string): SelectQueryBuilder<UserModel> {
    const cur = alias ?? tableName;
    return super.createQueryBuilder(cur).where(`${cur}.deletedAt IS NULL`);
  }

  createQueryBuilderWithDeleted(alias?: string): SelectQueryBuilder<UserModel> {
    const cur = alias ?? tableName;
    return super.createQueryBuilder(cur);
  }

  async saveUser(input: Partial<UserModel>): Promise<UserModel> {
    return await this.save(this.create(input));
  }
}
