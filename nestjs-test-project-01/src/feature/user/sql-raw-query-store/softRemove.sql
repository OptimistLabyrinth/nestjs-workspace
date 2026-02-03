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
  "UserModel"."id" IN ($1)
-- PARAMETERS: ["019c1d26-6e02-7197-b3bd-3452edd0459f"]

START TRANSACTION

UPDATE "users"
SET
  "deletedAt" = CURRENT_TIMESTAMP,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE
  "id" IN ($1)
RETURNING "updatedAt", "deletedAt"
-- PARAMETERS: ["019c1d26-6e02-7197-b3bd-3452edd0459f"]

COMMIT
