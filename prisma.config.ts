import 'dotenv/config';
import {defineConfig} from 'prisma/config';
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {path: 'prisma/migrations', seed: 'node --import tsx prisma/seed.ts'},
  // A real connection is needed for migrations, but not generation or static UI builds.
  datasource: {url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? 'postgresql://localhost:5432/roya'},
});
