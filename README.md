# محصولات غذایی رویا — فازهای ۱ تا ۴

پروژهٔ اصلی: **Next.js App Router + TypeScript + Tailwind CSS + PostgreSQL/Prisma + NextAuth + Cloudinary + Zod + next-intl**.

این نسخه زیرساخت، سیستم طراحی، صفحات عمومی، سبد، تسویه‌حساب، پرداخت و پیگیری سفارش قابل اجراست. تمرکز کسب‌وکار روی فینگر فود، سینی مزه، سوسیس و کالباس خانگی است. هنوز فروشگاهِ آمادهٔ پذیرش سفارش نیست. کد تولیدیِ همین فاز کامل است؛ ورود مدیر و مدیریت فروشگاه در فاز ۴ پیاده شده‌اند؛ آماده‌سازی نهایی برای فروش در فاز ۵ انجام می‌شود. هیچ درگاه یا پنل مدیریتی نمایشی به‌عنوان قابلیت فعال معرفی نشده است.

## اجرای سریع بدون دیتابیس

Node.js نسخهٔ 22.12 یا جدیدتر و npm لازم است.

```bash
npm ci
npm run dev
```

مسیر فارسی: http://localhost:3000/fa/؛ انگلیسی: http://localhost:3000/en/.
ریشهٔ سایت به فارسی هدایت می‌شود. ساخت رابط کاربری فعلی بدون اتصال دیتابیس یا کلیدهای سرویس‌ها کار می‌کند.

```bash
npm run db:validate
npm run typecheck
npm test
npm run build
npm start
```

`npm run build` خروجی استاندارد Next.js با `output: standalone` می‌سازد و برای Vercel/VPS قابل استفاده است. برای اجرای مستقیم standalone، پوشه‌های `public` و `.next/static` را کنار سرور کپی کنید:

```bash
cp -r public .next/standalone/public
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
node .next/standalone/server.js
```

راهنمای کامل استقرار و تنظیم امنیت عملیاتی در فاز ۵ ارائه می‌شود.

## راه‌اندازی PostgreSQL محلی

```bash
cp .env.example .env
POSTGRES_PASSWORD=roya_local_only docker compose up -d
npm run db:deploy
npm run db:seed
```

رمز بالا فقط برای توسعهٔ محلی است. برای سرور واقعی رمز تصادفی انتخاب و URLهای دیتابیس را مطابق آن تغییر دهید. `DATABASE_URL` برای اتصال برنامه و `DIRECT_URL` برای مهاجرت‌هاست. متغیرهای محیطی واقعی را در مخزن ثبت نکنید.

مهاجرت اولیهٔ SQL همراه با محدودیت‌های دیتابیس موجود است. Seed فقط نام برند و چهار دستهٔ فینگر فود، سینی مزه، سوسیس خانگی و کالباس خانگی را ایجاد می‌کند؛ حساب مدیر، قیمت، منطقه، تلفن یا آدرس ساختگی ایجاد نمی‌کند. تکرار Seed، تنظیمات موجود را بازنویسی نمی‌کند.

## ساختار

```text
src/app/(entry)/             ورودی ریشه
src/app/[locale]/           صفحات با زبان fa و en و جهت صحیح
src/components/brand/       لوگوی تایپوگرافیک
src/components/ui/          Button، Card، Badge، QuantitySelector
src/components/design-examples.tsx   نمونه‌های تعاملی سیستم طراحی
src/i18n/                   تنظیم next-intl و زبان‌ها
src/lib/format.ts           رقم فارسی، تومان، تاریخ جلالی، تبدیل ارقام
src/lib/domain/order.ts     قواعد مقدار، مبلغ و زمان تحویل
src/lib/validation/         اعتبارسنجی محصول و رسانه با Zod
src/lib/server/             اتصال امن سمت سرور به Prisma و Cloudinary
src/generated/prisma/      کد تولیدشدهٔ Prisma (در زمان build)
messages/                   متن‌های فارسی و انگلیسی
prisma/schema.prisma        مدل‌های داده
prisma/migrations/          SQL اولیه و محدودیت‌های داده
prisma/seed.ts              ایجاد دادهٔ پایهٔ واقعی برند
scripts/build-sites.mjs     ساخت پیش‌نمایش استاتیک خصوصی
 tests/                     آزمون قواعد دامنه و اعتبارسنجی
```

## قراردادهای داده

- پول: عدد صحیحِ تومان، سقف سازگار با `Int` دیتابیس. تبدیل تومان به ریال فقط در مرز درگاه پرداخت انجام می‌شود.
- مقدار: `Decimal(12,3)`، محاسبه با مقیاس هزارم و بدون خطای اعشار شناور. مقدار معتبر = حداقل + مضرب صحیح گام افزایش.
- مثال گرم: واحد `GRAM`، قیمت ۱۲۰٬۰۰۰، مبنای قیمت ۱۰۰۰، حداقل ۵۰۰، گام ۲۵۰. مثال کیلوگرم: واحد `KG`، مبنا ۱، حداقل ۰٫۵، گام ۰٫۲۵.
- تعداد/بسته باید صحیح باشند. موجودی و ظرفیت `null` یعنی بدون محدودیت؛ صفر یعنی موجودی/ظرفیت صفر.
- هر سطر سفارش قیمت، نام، واحد، مبنای قیمت و زمان آماده‌سازی را به‌صورت snapshot حفظ می‌کند. گرد کردن هر سطر به نزدیک‌ترین تومان، نیم رو به بالاست.
- زمان تخمینی تحویل = زمان پذیرش سفارش + بیشترین آماده‌سازی اقلام + زمان ارسال منطقه. تاریخ‌ها در دیتابیس `timestamptz`، نمایش فارسی با تقویم جلالی و منطقهٔ `Asia/Tehran` است.
- `OrderStatusHistory` برای timeline، `PaymentAttempt` برای تلاش‌های پرداخت و `RateLimitBucket` برای محدودسازی مشترک بین چند instance اضافه شده‌اند. ثبت سفارش، پرداخت و پیگیری در فاز ۳ پیاده شده‌اند؛ تغییر وضعیت مدیریتی در فاز ۴ پیاده شده است.
- `User` هم برای مدیر و هم مشتری اختیاری است. سفارش مهمان بدون User پشتیبانی می‌شود. ورود credentials مدیر با JWT در NextAuth و بررسی نقش سمت سرور پیاده شده است؛ به همین دلیل جدول‌های OAuth/Session غیرضروری اضافه نشده‌اند.
- رسانه دارای شناسهٔ Cloudinary، متن جایگزین دوزبانه، ابعاد و اندازه است. سقف ویدیو **۲۰٬۰۰۰٬۰۰۰ بایت (20 MB)** در Zod و SQL اعمال می‌شود. بررسی دادهٔ واقعی آپلود و فشرده‌سازی در فاز ۴ پیاده شده است.
- محصولات دارای سوابق سفارش معمولاً غیرفعال می‌شوند. snapshotها برای حفظ سابقه حتی در حذف استثنایی محصول نیز باقی می‌مانند.

## سیستم طراحی

رنگ‌ها: سبز `#4A7C59`، کرم `#FAF6EE`، قهوه‌ای `#8B5E3C`، متن `#2B2B2B`. رنگ سبز تیره برای کنتراست بیشتر افزوده شده است. فونت متغیر Vazirmatn به‌صورت فایل‌های محلی npm bundle می‌شود؛ به Google Fonts وابسته نیست. فارسی RTL و انگلیسی LTR، بدون CDN خارجی برای فونت. کارت‌های گرد، سایهٔ نرم، کنترل‌های لمسی حداقل ۴۴ پیکسل، focus مشخص، skip link و اعلان‌های `aria-live` در کنترل‌های تعاملی.

صفحهٔ سیستم طراحی به `/fa/design-system/` و `/en/design-system/` منتقل شده است. خانه، کاتالوگ، جزئیات محصول، درباره، تماس و پرسش‌های متداول در هر دو زبان اضافه شده‌اند. عکس تولیدشده، قیمت‌ها و محصولات پیش‌نمایش **نمونه** هستند.

## پیش‌نمایش Sites

```bash
npm run build:sites
```

این فرمان با همان سورس Next.js، خروجی استاتیک `out/` می‌سازد. `SITES_STATIC_PREVIEW=1` فقط تنظیم build است، نه کلید محرمانه. خروجی استاتیک فازهای ۱ تا ۴ برای بررسی خصوصی طراحی است؛ بک‌اند PostgreSQL، NextAuth و پرداخت را اجرا نمی‌کند. پشتهٔ سرور برای Vercel یا VPS باقی می‌ماند. فازهای بعد نباید قابلیت‌های سروری را با دادهٔ mock در پیش‌نمایش جایگزین یا فعال اعلام کنند.

## فازهای بعد

۲. صفحات عمومی، کاتالوگ و رسانهٔ محصول — تکمیل شده.
۳. سبد، checkout، پرداخت Zarinpal/COD، محاسبهٔ معتبر سمت سرور و پیگیری سفارش — تکمیل کد.
۴. مدیریت محصولات، سفارش‌ها، مشتریان و تنظیمات؛ احراز هویت و rate limit — تکمیل کد.
۵. SEO، تکمیل امنیت و راهنمای استقرار.

کد فازهای ۱ تا ۴ تکمیل شده است؛ فاز ۵ پس از دریافت «continue» شروع می‌شود.

## نتیجهٔ بررسی این نسخه

Prisma validation، TypeScript، ۲۹ آزمون دامنه/ورودی/قرارداد سرور و build تولیدی اجرا می‌شوند. اجرای migration روی یک سرور PostgreSQL واقعی و بررسی بصری مرورگر در محیط ساخت حاضر انجام نشده‌اند؛ این‌ها پیش از آماده‌شدن فروشگاه برای مشتری لازم هستند.


## قابلیت‌های فاز ۲ و مسیرهای اجرا

- `/fa/` و `/en/`: صفحهٔ اصلی با هویت جدید فینگر فود و سینی مزه، محصولات منتخب و معرفی رویا.
- `/fa/catalog/` و `/en/catalog/`: جست‌وجوی نام/توضیح، یکسان‌سازی حروف عربی/فارسی و فیلتر دسته.
- `/{locale}/products/{slug}/`: گالری عکس و ویدیو، قیمت و مبنای مقدار، حداقل/گام سفارش، وضعیت موجودی، زمان آماده‌سازی و مبلغ مقدار انتخاب‌شده.
- `/{locale}/about/`، `/{locale}/contact/`، `/{locale}/faq/`: صفحات کامل عمومی.
- سربرگ دارای منوی موبایل و تغییر زبان با حفظ مسیر صفحه است. پرسش‌های متداول با `details/summary` حتی بدون JavaScript قابل استفاده‌اند.
- کاتالوگ واقعی فقط محصولات فعال در دستهٔ فعال را از Prisma می‌خواند؛ خروجی دادهٔ قابل سریال‌سازی، با کش ۶۰ ثانیه‌ای و tag `catalog` است. اسلاگ محصول تازه در نسخهٔ سروری به‌صورت runtime/ISR قابل دسترسی است.
- اگر `DATABASE_URL` تنظیم نشده باشد، کاتالوگ اصلی خالی و ارسال پیام غیرفعال است. اتصال ناموفقِ دیتابیس تنظیم‌شده خطا نشان می‌دهد؛ هرگز به محصولات ساختگی تبدیل نمی‌شود.
- برای بررسی محلی با محصولات نمونه، `ROYA_DEMO_CATALOG=1 npm run dev` را اجرا کنید (در Windows این متغیر را در `.env` تنظیم کنید). این حالت صریحاً برچسب نمونه دارد و فرم تماس را غیرفعال می‌کند. Seed هیچ محصول نمونه‌ای در دیتابیس نمی‌نویسد.
- فرمان `npm run build:sites` همان سورس Next.js را با خروجی استاتیک و محصولات نمونه می‌سازد. `pageExtensions` در این حالت فقط `.tsx` است تا route handlerهای سروری `.ts` وارد خروجی استاتیک نشوند. ساخت عادی `.ts` و `.tsx` را شامل می‌شود و `/api/contact/` را اجرا می‌کند.

## فرم تماس واقعی

مهاجرت جدید `20261010152000_contact_messages` مدل `ContactMessage` را اضافه می‌کند. پس از تنظیم دیتابیس:

```bash
npm run db:deploy
npm run db:seed
npm run build
npm start
```

`NEXT_PUBLIC_SITE_URL` یا `NEXTAUTH_URL` باید origin واقعی سایت (با پروتکل صحیح) باشد. POST `/api/contact/` تنها JSON با Origin مطابق می‌پذیرد؛ حجم واقعی جریان درخواست تا ۱۶ KiB کنترل می‌شود؛ نام، شمارهٔ موبایل ایرانی و پیام با Zod اعتبارسنجی می‌شوند. شماره‌های فارسی/عربی به لاتین تبدیل می‌شوند. Honeypot، محدودیت اتمی PostgreSQL (۳ پیام از هر موبایل در ۱۰ دقیقه، ۵۰ پیام کلی در ۱۰ دقیقه)، و پاسخ‌های ۴۰۰/۴۰۳/۴۱۳/۴۱۵/۴۲۹/۵۰۳ پیاده شده‌اند. ذخیرهٔ موفق، پاسخ ۲۰۱ می‌دهد. پیام به ایمیل/شخص دیگری ارسال نمی‌شود. پیام‌های تماس در جدول ContactMessage نگه‌داری می‌شوند؛ صندوق پیام‌ها جزو محدودهٔ پنل این فاز نیست.

اطلاعات تماس عمومی از `Setting` با کلید `contact` خوانده می‌شود؛ مقدار JSON پشتیبانی می‌کند:

```json
{
  "phone": "+989123456789",
  "email": "hello@example.com",
  "addressFa": "نشانی واقعی کسب‌وکار",
  "addressEn": "Actual business address",
  "hoursFa": "ساعات واقعی پاسخ‌گویی",
  "hoursEn": "Actual response hours"
}
```

این JSON صرفاً شکل تنظیمات است و در دیتابیس seed نمی‌شود؛ تلفن/ایمیل واقعی رویا باید وارد شوند. نمونه‌ها را در سایت واقعی ثبت نکنید.

## مواردی که هنوز فعال نیستند

پنل مدیریت پیاده شده است. دکمهٔ افزودن به سبد فعال است؛ ثبت نهایی در نسخهٔ نمونه غیرفعال است. سئو و سیاست‌های نهایی امنیت و استقرار در فاز ۵ تکمیل می‌شوند. `noindex` پیش‌نمایش حفظ شده است.

رسانهٔ عمومی نمونه در `public/images/roya-party-spread.webp` و توضیح منشأ و پرامپت آن در `public/images/README.md` است. این دارایی با ابزار داخلی تولید تصویر ساخته شده و عکس محصول واقعی رویا نیست.


## فاز ۳: سفارش و پرداخت

مسیرها در هر دو زبان: `/{locale}/cart/`، `/{locale}/checkout/`، `/{locale}/tracking/` و `/{locale}/payment-result/`.
سبد در localStorage فقط شناسهٔ محصول و مقدار را نگه می‌دارد؛ سبد نمونه و واقعی جدا هستند. هیچ قیمت ذخیره‌شدهٔ مرورگر مبنای سفارش نیست. شماره/آدرس مشتری در storage ذخیره نمی‌شوند. رسید جلسه فقط کد پیگیری، مبلغ، زمان تخمینی و وضعیت اولیه را نگه می‌دارد؛ وضعیت معتبر پرداخت همیشه از پیگیری گرفته می‌شود.

مهاجرت `20261010180000_checkout` ظرفیت روزانه، اثر انگشت درخواست، رزرو موجودی و قرارداد یک تلاش درگاه به‌ازای سفارش را اضافه می‌کند. اگر خارج از برنامهٔ فاز ۲ پرداختی ساخته شده باشد، مهاجرت عمداً متوقف می‌شود تا ابتدا سوابق پرداخت بررسی شوند.

```bash
npm run db:deploy
npm run db:seed
npm run build
npm start
```

محصولات واقعی، قیمت/موجودی و حداقل/گام صحیح، و `DeliveryZone` فعال باید در PostgreSQL وارد شوند؛ این کار از پنل مدیریت انجام می‌شود. Seed فقط دسته‌ها را وارد می‌کند. هزینه ارسال، شهر و زمان ارسال از zone انتخاب‌شده خوانده می‌شود و به مبلغ/شهر ارسالی مرورگر اعتماد نمی‌شود.

### APIهای واقعی

- POST `/api/shop/quote`: `{items:[{productId,quantity}],zoneId,discountCode}`؛ اعتبارسنجی مقدار/موجودی/ظرفیت، تخفیف و مبلغ در دیتابیس جاری، پاسخ subtotal/discount/fee/total/ETA. این پاسخ رزرو نیست.
- POST `/api/shop/checkout`: دادهٔ بالا + `name,mobile,address,notes,locale,paymentMethod,idempotencyKey,expectedTotal`. `expectedTotal` فقط تأیید تغییر نکردن مبلغ است؛ محاسبهٔ قیمت مستقل روی سرور انجام می‌شود. `idempotencyKey` یک UUID است. تکرار همان درخواست همان سفارش را می‌دهد؛ تغییر محتوا با همان کلید پاسخ ۴۰۹ دارد.
- POST `/api/shop/tracking`: `{trackingCode,mobile}`؛ کد ۹۶بیتی تصادفی با پیشوند `ROYA-` و موبایل مطابق لازم است. پاسخ فقط وضعیت، اقلام، مبالغ و تاریخچهٔ عمومی دارد؛ آدرس و یادداشت‌های داخلی ارسال نمی‌شوند.
- GET `/api/payment/callback`: callback درگاه؛ attempt + nonce + authority ذخیره‌شده باید مطابقت داشته باشند. تغییر Status توسط مرورگر پرداخت را موفق نمی‌کند. موفقیت فقط بعد از verify سروری ثبت می‌شود. کدهای verify 100 و 101 پذیرفته می‌شوند؛ callback تکراری رزرو/تخفیف را تکرار نمی‌کند.

تمام POSTها محدودیت ۱۶ KiB، Zod، Origin مطابق، محدودسازی اتمی مشترک و `no-store` دارند. checkout حداکثر ۵ درخواست برای هر موبایل در ۱۰ دقیقه؛ tracking حداکثر ۱۰. قیمت‌ها integer Toman هستند و درخواست/verify زرین‌پال صریحاً با `IRR` و ضرب مبلغ تومان در ۱۰ انجام می‌شود.

رزرو با تراکنش و قفل ردیف محصولات به ترتیب شناسه، قفل تخفیف و قفل اشتراکی منطقه انجام می‌شود. موجودی و ظرفیت روزانه هم‌زمان کنترل می‌شوند؛ روز ظرفیت بر اساس Asia/Tehran است. ظرفیت این نسخه ظرفیت پذیرش روزانهٔ سفارش است. `ProductDailyUsage` مقدار رزروشدهٔ هر محصول در آن روز را نگه می‌دارد. تاریخ تحویل = پذیرش COD یا تأیید پرداخت آنلاین + بیشترین آماده‌سازی + زمان ارسال.

### تنظیم زرین‌پال

در محیط سرور `ZARINPAL_MERCHANT_ID` را UUID واقعی درگاه، `NEXT_PUBLIC_SITE_URL` را origin سایت و `ZARINPAL_SANDBOX` را `true` برای آزمایش یا `false` برای واقعی تنظیم کنید. درگاه واقعی به origin HTTPS نیاز دارد. حالت sandbox نیز ثبت سفارش واقعی در دیتابیس شما انجام می‌دهد؛ فقط پرداخت پول واقعی ندارد. در یک دیتابیس تست مستقل آزمایش کنید.

مستندات رسمی مبنا:
- https://www.zarinpal.com/docs/paymentGateway/connectToGateway
- https://www.zarinpal.com/docs/paymentGateway/sandBox
- https://www.zarinpal.com/docs/paymentGateway/moreFeatures/currency

یک درخواست اولیهٔ درگاه برای هر سفارش صادر می‌شود. اگر اتصال قطع شود و مشخص نباشد درگاه authority ساخته یا خیر، تلاش به `UNKNOWN` می‌رود و درخواست جدید خودکار صادر نمی‌شود. اگر authority ذخیره شده باشد، مشتری از پیگیری می‌تواند پرداخت همان authority را ادامه دهد. وضعیت نامطمئن هرگز پرداخت موفق اعلام نمی‌شود. پاسخ NOK مرورگر دلیل قطعی برای لغو/آزادسازی موجودی نیست.

**سیاست رزرو این فاز:** سفارش آنلاین پرداخت‌نشده موجودی/ظرفیت و سهم کد تخفیف را نگه می‌دارد. زمان‌سنج خودکار آزادسازی وجود ندارد تا callback دیرهنگام باعث فروش بیش از موجودی نشود. رسیدگی به سفارش‌های معلق، لغو امن و بررسی تلاش‌های دارای authority، در پنل فاز ۴ انجام می‌شود. تلاش UNKNOWN بدون authority همچنان نیازمند بررسی پنل زرین‌پال است و عمداً قابل لغو/آزادسازی خودکار نیست. رزرو آزادشده باید فقط یک بار و تحت قفل سفارش ثبت شود؛ فیلدهای `inventoryReserved`، `capacityDay` و `stockReserved` برای این کار حفظ شده‌اند.

### بررسی و محدودیت‌ها

۱۹ آزمون شامل تزریق قیمت، تکرار محصول، مقدار نامعتبر، ارقام فارسی، تخفیف/سقف، تبدیل ریال و مرز روز تهران اجرا می‌شوند. پنج آزمون قرارداد درگاه با fetch/Prisma mock، درخواست یک‌باره، UNKNOWN، nonce، NOK، verify 101 و callback تکراری را بررسی می‌کنند؛ این‌ها جای آزمون زندهٔ PostgreSQL/درگاه را نمی‌گیرند. TypeScript، Prisma و build استاندارد و استاتیک نیز بررسی می‌شوند. این محیط سرور PostgreSQL و کلید درگاه واقعی ندارد؛ اجرای تراکنش‌های هم‌زمان، migration روی PostgreSQL و چرخهٔ sandbox/verify هنوز آزمون یکپارچهٔ زنده نشده‌اند. مرورگر QA در این محیط در دسترس نیست. فروشگاه تا تکمیل فازهای ۴/۵ و این بررسی‌ها برای پذیرش سفارش واقعی آماده اعلام نمی‌شود.


## فاز ۴: پنل مدیریت

مسیر `/admin/` و بخش‌های `products/`، `orders/`، `customers/` و `settings/`؛ ورود در `/admin/login/` است. پنل فارسی و RTL، دارای فهرست صفحه‌بندی‌شده، جست‌وجو، فیلتر سفارش، جزئیات و چاپ سفارش است. اطلاعات مشتری از سفارش مهمان بر اساس موبایل گروه‌بندی می‌شود و تاریخچهٔ همهٔ سفارش‌ها در دسترس مدیر است. مجموع سفارش‌ها، گردش مبلغ همهٔ وضعیت‌هاست و درآمد خالص محسوب نمی‌شود.

### اولین مدیر واقعی

مهاجرت جدید و ایجاد حساب فقط در محیط واقعی شما انجام می‌شود؛ هیچ حساب یا رمز پیش‌فرض ساخته نشده است.

```bash
npm run db:deploy
npm run db:seed
npm run admin:create
```

فرمان آخر در ترمینال تعاملی نام و موبایل را می‌پرسد؛ رمز ۱۲ تا ۱۲۸ کاراکتری مخفی وارد می‌شود و با scrypt تصادفی ذخیره می‌شود. حساب موجود را بازنویسی نمی‌کند. متغیر `NEXTAUTH_SECRET` باید تصادفی و حداقل ۳۲ کاراکتر باشد؛ `NEXTAUTH_URL` و `NEXT_PUBLIC_SITE_URL` باید origin صحیح سایت باشند.

ورود credentials در NextAuth 4، CSRF داخلی به‌علاوه Origin مطابق و سقف جریان فرم ۴ KiB دارد. ۵ تلاش برای هر موبایل در ۱۰ دقیقه و ۶۰ تلاش کلی در دقیقه با PostgreSQL مشترک کنترل می‌شود. برای حساب ناموجود نیز scrypt اجرا می‌شود. نشست JWT حداکثر ۸ ساعت است؛ هر خواندن/تغییر مدیریتی نقش ADMIN، فعال بودن و sessionVersion جاری دیتابیس را مجدداً بررسی می‌کند. برای ابطال همهٔ نشست‌های یک مدیر، sessionVersion او را در دیتابیس افزایش دهید؛ غیرفعال‌کردن حساب هم دسترسی را فوری می‌بندد. 2FA اختیاری در این نسخه پیاده نشده؛ حساب دارای twoFactorEnabled عمداً اجازه ورود ندارد و رمز به‌تنهایی آن را دور نمی‌زند.

APIهای `/api/admin/*` بدون مدیر معتبر ۴۰۱ می‌دهند. تغییرات فقط POST با JSON، Origin صحیح، Zod، حجم واقعی حداکثر ۱۲۸ KiB و rate limit هستند؛ پاسخ‌ها no-store و صفحات مدیریتی پویا هستند. صفحهٔ ظاهری پنل نمونه مجوز API واقعی ایجاد نمی‌کند. `AdminAudit` شناسهٔ مدیر، نوع عملیات، هدف و زمان را بدون رمز/آدرس مشتری ثبت می‌کند.

### محصولات و رسانه

افزودن، ویرایش، گالری چندعکس/ویدیو، ترتیب رسانه، قیمت، واحد، حداقل/گام، موجودی، ظرفیت روزانه، زمان آماده‌سازی، منتخب و فعال بودن قابل تنظیم‌اند. حذف محصول به‌صورت آرشیو/غیرفعال‌سازی است تا سابقهٔ سفارش حفظ شود. حذف از گالری فقط لینک دیتابیس را حذف می‌کند؛ پاک‌سازی دارایی‌های بلااستفاده در Cloudinary باید جداگانه بررسی شود.

ویرایش محصول با expectedUpdatedAt و قفل ردیف انجام می‌شود؛ اگر در زمان باز بودن فرم سفارشی موجودی را رزرو کند، ذخیرهٔ فرم قدیمی ۴۰۹ می‌دهد تا موجودی رزروشده بازنویسی نشود. واحد محصول دارای سابقه سفارش قابل تغییر نیست. ظرفیت کمتر از رزروهای روز جاری پذیرفته نمی‌شود. پس از تغییر، کش کاتالوگ فوراً نامعتبر می‌شود.

آپلود مستقیم و امضاشده به Cloudinary از `/api/admin/media/sign`، با ticket مختص مدیر و public_id تصادفی انجام می‌شود. فایل بزرگ از بدنهٔ Vercel عبور نمی‌کند. تصویر به WebP با حداکثر ابعاد ۱۸۰۰ و ویدیو به MP4/H.264 با حداکثر ابعاد ۱۲۸۰ و کیفیت خودکار تبدیل می‌شود. مرورگر حجم اولیهٔ عکس را ۱۰ MB و ویدیو را ۲۰ MB محدود می‌کند؛ هنگام ذخیره، metadata از Cloudinary API حساب خودمان خوانده می‌شود، نوع/فرمت/URL/ابعاد/بایت/مدت ویدیو بررسی و ticket داخل تراکنش یک‌بار مصرف می‌شود. سقف ذخیره‌شدهٔ ویدیو ۲۰٬۰۰۰٬۰۰۰ بایت است؛ به بایت/URL ارسالی مرورگر اعتماد نمی‌شود.

### سفارش، لغو و پرداخت

وضعیت‌ها: PENDING → PREPARING → SHIPPED → DELIVERED. لغو فقط از PENDING/PREPARING؛ وضعیت نهایی باز نمی‌شود. برای آماده‌سازی سفارش آنلاین، پرداخت PAID لازم است. دریافت وجه COD فقط برای سفارش ارسال‌شده/تحویل‌شده و با تأیید صریح مدیر ثبت می‌شود.

لغو زیر قفل سفارش، موجودی و ظرفیت روز اولیه را دقیقاً یک بار برمی‌گرداند و سهم استفادهٔ تخفیف را آزاد می‌کند. ترتیب قفل محصولات مطابق checkout است. سفارش COD یا آنلاین با پرداخت قطعی/درخواست صادرنشده/رد قطعی قابل لغو است؛ REQUESTING/READY/UNKNOWN پرداخت‌نشده قابل آزادسازی نیست. درخواست جدید درگاه نیز زیر قفل سفارش، لغو را دوباره بررسی می‌کند تا پرداخت بعد از آزادسازی رزرو شروع نشود.

دکمهٔ بررسی پرداخت، verify همان authority ذخیره‌شده را با مبلغ snapshot به زرین‌پال می‌فرستد. نتیجه نامطمئن pending می‌ماند. UNKNOWN بدون authority نیازمند تطبیق مستقیم در پنل زرین‌پال است؛ برنامه به مدیر اجازهٔ حدس‌زدن «پرداخت نشده» و آزادسازی رزرو نمی‌دهد.

لغو سفارش آنلاین پرداخت‌شده، `refundRequired=true` را ثبت می‌کند و وضعیت پرداخت همچنان PAID می‌ماند. مبلغ خودکار بازپرداخت نمی‌شود و هرگز بازپرداخت انجام‌نشده به‌عنوان REFUNDED نمایش داده نمی‌شود؛ مدیر باید وجه را از درگاه/حساب بازگرداند و پیگیری کند. قابلیت خودکار refund در این فاز وجود ندارد.

### تنظیمات و بررسی

محدوده ارسال و کد تخفیف ایجاد/ویرایش/غیرفعال می‌شوند؛ سوابق وابسته باقی می‌مانند. کدهای درصدی/ثابت، حداقل سبد، سقف تخفیف، سقف استفاده و بازه اعتبار پشتیبانی می‌شوند. زمان اعتبار با ورودی شمسی و ارقام فارسی، وقت تهران، با round-trip تقویم Intl اعتبارسنجی می‌شود (سال‌های ۱۴۰۲ تا ۱۴۹۹). تغییر مالی هم با نسخه و قفل کنترل می‌شود. اطلاعات تماس و ساعات کاری در Setting/contact نگه‌داری و در سایت عمومی نمایش داده می‌شوند؛ ساعات کاری فعلاً اطلاعات نمایشی‌اند و در ETA فرمول جدیدی اضافه نمی‌کنند.

آزمون‌های رمز، نقش/فعال بودن مدیر، محدودیت ورود، انتقال وضعیت، آزادسازی یک‌باره و روز صحیح رزرو، لغو هم‌زمان با شروع درگاه، و تاریخ شمسی به آزمون‌های قبلی اضافه شدند. آزمون‌های سرور از Prisma/fetch mock استفاده می‌کنند. هیچ آزمون زندهٔ PostgreSQL، ورود در مرورگر یا Cloudinary/زرین‌پال در این محیط انجام نشده است؛ پیش از فروش واقعی این چرخه‌ها باید با سرویس‌های تنظیم‌شده آزمون شوند. مرورگر QA در این محیط در دسترس نیست. ساخت عادی و خروجی استاتیک هر دو با TypeScript بررسی می‌شوند.

مستندات رسمی پیاده‌سازی: https://next-auth.js.org/configuration/options ، https://next-auth.js.org/getting-started/client و https://cloudinary.com/documentation/upload_parameters .

فاز ۴ پایان یافته؛ فاز ۵ شامل SEO، تکمیل امنیت عملیاتی و راهنمای استقرار پس از «ادامه» انجام می‌شود.

## Phase 5 — SEO, security and deployment

Localized canonical/hreflang/Open Graph metadata, opt-in real-catalog Product JSON-LD (IRR conversion), sitemap/robots, private-page noindex, production security headers, deployment environment validation, database health endpoint and expired rate-limit maintenance are implemented. Demo/static exports stay noindex. Stock presentation subtracts today's reserved daily capacity.

See [the deployment and recovery guide](docs/DEPLOYMENT.md) for Vercel and VPS/systemd/Caddy setup, secrets, migrations, backups, operational limits and the real-service acceptance checks. `npm run deploy:check` validates production configuration without printing credentials. End-to-end database/gateway/browser verification still requires a configured deployment. Optional 2FA is not implemented.

## Optional customer accounts

`/fa/account/` and `/en/account/` provide optional SMS OTP signup/sign-in, consent settings, linked new orders and shop-selected club discount codes. Checkout and tracking remain available to guests. The admin customer page lists registered members and current marketing preferences; discount settings can opt a code into the club. Marketing campaigns are not sent automatically. Configure the separate OTP secret, Kavenegar template/key and feature flag described in [deployment](docs/DEPLOYMENT.md); the static preview cannot send codes or log customers in.

## Completion pass — communications and verification

Contact inbox and scheduled bilingual club announcements are available at `/admin/communications/`. Admin settings include password change with session revocation; trusted server operators can use `npm run admin:recover` for an existing active admin. No marketing messages are sent by these features. Guest checkout remains independent of accounts.

The PostgreSQL integration suite (`npm run test:integration`) exercises stock/capacity races, order idempotency, OTP redemption, account ownership, cancellation, admin password rotation and stale announcement edits. It refuses a non-test database URL. GitHub Actions runs migrations, seeds and checks with an isolated PostgreSQL service. External payment/SMS/Cloudinary acceptance remains a separate deployment task.
