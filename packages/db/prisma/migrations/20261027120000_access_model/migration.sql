-- CreateEnum
CREATE TYPE "AccessLevel" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'STANDARD');

-- CreateEnum
CREATE TYPE "Scope" AS ENUM ('OWN', 'TEAM', 'DEPARTMENT', 'ALL');

-- AlterTable
ALTER TABLE "Permission" ADD COLUMN     "scopes" "Scope"[];

-- AlterTable
ALTER TABLE "RolePermission" ADD COLUMN     "scope" "Scope";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accessLevel" "AccessLevel" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "roleId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data mapping from the old role-based model. Runs after the new columns exist
-- and before "UserRole" and the SUPER_ADMIN role are dropped, because it reads both.

-- 1. The earliest-created ACTIVE holder of the old SUPER_ADMIN role becomes the
--    one SUPER_ADMIN. Ties on createdAt are broken by id so the choice is stable.
UPDATE "User" SET "accessLevel" = 'SUPER_ADMIN'
WHERE "id" = (
  SELECT u."id"
  FROM "User" u
  JOIN "UserRole" ur ON ur."userId" = u."id"
  JOIN "Role" r ON r."id" = ur."roleId" AND r."name" = 'SUPER_ADMIN'
  WHERE u."isActive"
  ORDER BY u."createdAt" ASC, u."id" ASC
  LIMIT 1
);

-- 2. Every other holder of that role (including inactive ones) becomes ADMIN.
UPDATE "User" SET "accessLevel" = 'ADMIN'
WHERE "accessLevel" = 'STANDARD'
  AND "id" IN (
    SELECT ur."userId"
    FROM "UserRole" ur
    JOIN "Role" r ON r."id" = ur."roleId" AND r."name" = 'SUPER_ADMIN'
  );

-- 3. Everyone left (still STANDARD) gets one role: the first non-EMPLOYEE role by
--    name, else EMPLOYEE, else none. Admins keep roleId NULL: they hold everything.
UPDATE "User" u SET "roleId" = (
  SELECT r."id"
  FROM "UserRole" ur
  JOIN "Role" r ON r."id" = ur."roleId"
  WHERE ur."userId" = u."id"
  ORDER BY (r."name" = 'EMPLOYEE') ASC, r."name" ASC
  LIMIT 1
)
WHERE u."accessLevel" = 'STANDARD';

-- 4. Existing grants of scoped permissions become scope ALL, which is what an
--    unscoped grant meant before. No permission row lists scopes yet (the seed
--    fills them after this migration), so this only matters for a database that
--    already carries them; on/off permissions keep a NULL scope.
UPDATE "RolePermission" rp SET "scope" = 'ALL'
FROM "Permission" p
WHERE p."key" = rp."permissionKey" AND cardinality(p."scopes") > 0;

-- 5. Retire the old SUPER_ADMIN role (its RolePermission rows cascade), then the
--    join table. UserRole -> Role is RESTRICT, so the role's assignments go first.
DELETE FROM "UserRole" WHERE "roleId" IN (SELECT "id" FROM "Role" WHERE "name" = 'SUPER_ADMIN');
DELETE FROM "Role" WHERE "name" = 'SUPER_ADMIN';

-- DropForeignKey
ALTER TABLE "UserRole" DROP CONSTRAINT "UserRole_roleId_fkey";

-- DropForeignKey
ALTER TABLE "UserRole" DROP CONSTRAINT "UserRole_userId_fkey";

-- DropTable
DROP TABLE "UserRole";

-- AlterTable
ALTER TABLE "Role" DROP COLUMN "isSystem";

-- At most one SUPER_ADMIN row can exist. Prisma cannot express a partial unique
-- index, so it lives only in this SQL; a later `migrate diff` will want to drop it.
CREATE UNIQUE INDEX one_super_admin ON "User" ("accessLevel") WHERE "accessLevel" = 'SUPER_ADMIN';
