-- Explicit owner request: pause SMS and allow guest checkout temporarily.
-- Later admin choices survive deployments because this migration runs only once.
INSERT INTO "Setting" ("key","value","updatedAt") VALUES ('sms-policy','{"enabled":false}'::jsonb,NOW())
ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value","updatedAt"=EXCLUDED."updatedAt";
