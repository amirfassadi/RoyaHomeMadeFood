import 'dotenv/config';
import {PrismaClient} from '../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const db = new PrismaClient({adapter: new PrismaPg({connectionString})});
try {
  for (const [slug, nameFa, nameEn] of [
    ['home-meals', 'غذاهای خانگی', 'Home meals'], ['pickles', 'ترشی و شور', 'Pickles'],
    ['jams', 'مربا و صبحانه', 'Jams & breakfast'], ['ready-to-cook', 'آمادهٔ پخت', 'Ready to cook'],
  ]) await db.category.upsert({where: {slug}, update: {}, create: {slug, nameFa, nameEn}});
  await db.setting.upsert({where: {key: 'brand'}, update: {}, create: {key: 'brand', value: {
    nameFa: 'محصولات غذایی رویا', nameEn: 'Roya Food Products',
    sloganFa: 'غذای خانگی تازه، بدون هیچ افزودنی', sloganEn: 'Fresh Homemade Food, No Additives',
  }}});
  // Deliberately no default admin/password, invented contact data, prices or delivery fees.
  console.log('Brand and categories seeded. Configure actual business data before sales.');
} finally {await db.$disconnect();}
