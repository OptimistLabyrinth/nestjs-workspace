import { UserEntity } from '../graphql/user.entity';
import { UserModel } from '../typeorm/user.model';

export class UserMapper {
  static toEntity(model: UserModel): UserEntity {
    return new UserEntity({ ...model, id: model.id.toString() });
  }

  static toModel(entity: UserEntity): UserModel {
    return new UserModel({ ...entity });
  }
}
