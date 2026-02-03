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
  "name" = $1,
  "email" = $2,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE
  "id" IN ($3)
RETURNING "updatedAt"
-- PARAMETERS: ["Peterrr","peterrr0202@email.com","019c1d26-6e02-7197-b3bd-3452edd0459f"]

COMMIT
