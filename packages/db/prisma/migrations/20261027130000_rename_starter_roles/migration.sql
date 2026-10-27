-- Starter roles now use display names. Rename only where the new name is free, so a
-- database that already has (or was seeded with) the new name is left alone.
UPDATE "Role" SET "name" = 'HR Admin'
WHERE "name" = 'HR_ADMIN' AND NOT EXISTS (SELECT 1 FROM "Role" WHERE "name" = 'HR Admin');

UPDATE "Role" SET "name" = 'Finance Officer'
WHERE "name" = 'FINANCE_OFFICER' AND NOT EXISTS (SELECT 1 FROM "Role" WHERE "name" = 'Finance Officer');

UPDATE "Role" SET "name" = 'Employee'
WHERE "name" = 'EMPLOYEE' AND NOT EXISTS (SELECT 1 FROM "Role" WHERE "name" = 'Employee');

-- Backfill: a grant of a scoped permission must carry a scope; a NULL one is an old
-- unscoped grant, which meant "everything", i.e. ALL. New writes are validated in the API.
UPDATE "RolePermission" SET "scope" = 'ALL'
WHERE "scope" IS NULL
  AND "permissionKey" IN (SELECT "key" FROM "Permission" WHERE cardinality("scopes") > 0);
