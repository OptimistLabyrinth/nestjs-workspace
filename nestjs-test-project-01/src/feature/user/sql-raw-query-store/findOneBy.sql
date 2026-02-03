-- sql log: UserRepository.findOneBy

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
  (
    (
      (
        "UserModel"."id" = "019c1d6b-7995-73fb-9c52-75b7ef19f1b6"
      )
    )
  )
  AND ("UserModel"."deletedAt" IS NULL)
LIMIT
  1
-- PARAMETERS: ["019c1d6b-7995-73fb-9c52-75b7ef19f1b6"]
