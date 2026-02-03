-- sql log: UserRepository.findAndCount

SELECT
  "UserModel"."id" AS "UserModel_id",
  "UserModel"."name" AS "UserModel_name",
  "UserModel"."email" AS "UserModel_email",
  "UserModel"."createdAt" AS "UserModel_createdAt",
  "UserModel"."updatedAt" AS "UserModel_updatedAt",
  "UserModel"."deletedAt" AS "UserModel_deletedAt"
FROM
  "users" "UserModel"
WHERE
  "UserModel"."deletedAt" IS NULL
LIMIT
  10
OFFSET
  0
