-- Enable public indexing for the real storefront; preview mode and private
-- routes always retain their independent noindex protections.
INSERT INTO "Setting" ("key", "value", "updatedAt")
VALUES ('seo', '{"enabled":true,"googleVerification":""}'::jsonb, NOW())
ON CONFLICT ("key") DO NOTHING;
