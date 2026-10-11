import 'dotenv/config';
import {PrismaClient} from '../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
async function main(){
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const db = new PrismaClient({adapter: new PrismaPg({connectionString})});
try {
  for (const [slug, nameFa, nameEn] of [
    ['finger-food', 'فینگر فود', 'Finger foods'], ['snack-platters', 'سینی مزه', 'Snack platters'],
    ['homemade-sausages', 'سوسیس خانگی', 'Homemade sausages'], ['homemade-cold-cuts', 'کالباس خانگی', 'Homemade cold cuts'],
  ]) await db.category.upsert({where: {slug}, update: {}, create: {slug, nameFa, nameEn}});
  await db.setting.upsert({where: {key: 'brand'}, update: {}, create: {key: 'brand', value: {
    nameFa: 'محصولات غذایی رویا', nameEn: 'Roya Food Products',
    sloganFa: 'غذای خانگی تازه، بدون هیچ افزودنی', sloganEn: 'Fresh Homemade Food, No Additives',
  }}});
  // Deliberately no default admin/password, invented contact data, prices or delivery fees.
  console.log('Brand and categories seeded. Configure actual business data before sales.');
} finally {await db.$disconnect();}

}
main().catch(()=>{console.error('Seed failed; check the database connection and applied migrations.');process.exitCode=1;});
