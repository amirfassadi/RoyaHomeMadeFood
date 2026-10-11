# استقرار محصولات غذایی رویا — فاز ۵

سورس اصلی یک برنامهٔ Next.js با PostgreSQL است. پیش‌نمایش Sites یک خروجی استاتیک خصوصی برای بررسی ظاهر است؛ سفارش، پرداخت، ورود و ذخیرهٔ پنل در آن اجرا نمی‌شوند. دادهٔ نمونه و عکس نمونه را با اطلاعات واقعی فروشگاه جایگزین کنید. تست‌های فعلی اتصال واقعی بانک یا PostgreSQL را تأیید نمی‌کنند.

## آماده‌سازی مشترک

Node.js نسخهٔ 24 و npm نصب کنید. از فایل `.env.example` یک `.env` محلی بسازید؛ آن را در گیت ثبت نکنید. در محیط واقعی این متغیرها را تنظیم کنید:

| متغیر | کاربرد |
| --- | --- |
| DATABASE_URL | اتصال PostgreSQL در زمان اجرا؛ اتصال pool برای Vercel |
| DIRECT_URL | اتصال مستقیم PostgreSQL برای migration |
| NEXT_PUBLIC_SITE_URL، NEXTAUTH_URL | مبدأ HTTPS یکسان، بدون مسیر؛ دامنهٔ واقعی فروشگاه |
| NEXTAUTH_SECRET | راز تصادفی حداقل ۳۲ کاراکتر؛ تغییر آن نشست‌ها را باطل می‌کند |
| CLOUDINARY_CLOUD_NAME، CLOUDINARY_API_KEY، CLOUDINARY_API_SECRET | حساب واقعی Cloudinary؛ کلید secret فقط روی سرور |
| ZARINPAL_MERCHANT_ID | شناسهٔ پذیرنده؛ نبود آن پرداخت آنلاین را غیرفعال می‌کند |
| ZARINPAL_SANDBOX | برای آزمون `true`، برای پذیرندهٔ واقعی `false` |
| ROYA_DEMO_CATALOG | در محیط واقعی `0` |
| ROYA_INDEXABLE | ابتدا `0`؛ بعد از تکمیل اطلاعات و آزمون عملی `1` |

برای PostgreSQL راه دور از TLS و اعتبارسنجی گواهیِ توصیه‌شدهٔ ارائه‌دهنده استفاده کنید. رمزها را در secret manager یا فایل محدود به مالک نگه دارید. `NEXT_PUBLIC_*` عمومی است؛ هیچ راز یا اطلاعات مشتری را در آن قرار ندهید. این متغیرها در build استفاده می‌شوند؛ پس از تغییر دامنه یا تنظیمات سئو دوباره build و deploy کنید.

```sh
npm ci
npm run deploy:check
npm run db:deploy
npm run db:seed
npm run admin:create
npm test
npm run typecheck
npm run build
```

Seed فقط دسته‌بندی‌ها و تنظیمات اولیه را ایجاد می‌کند؛ مدیر، کالای ساختگی، قیمت یا منطقهٔ ارسال نمی‌سازد. دستور ساخت مدیر نام، موبایل و رمز را تعاملی می‌پرسد و حساب موجود را بازنویسی نمی‌کند. مدیر باید محصولات، مناطق ارسال، ساعات کاری و اطلاعات تماس را تکمیل کند. ورود در `/admin/login/` است. احراز هویت با موبایل و رمز، محدودیت تلاش ورود و بررسی نقش مدیر در هر درخواست اجرا شده است؛ 2FA اختیاری پیاده‌سازی نشده و حسابی که پرچم 2FA آن روشن باشد اجازهٔ ورود ندارد.

## Vercel

مخزن GitHub را import و framework را Next.js انتخاب کنید. متغیرهای بالا را در محیط Production و Preview به‌صورت جداگانه وارد کنید؛ Preview باید `ROYA_INDEXABLE=0` و پایگاه دادهٔ جداگانه داشته باشد. `SITES_STATIC_PREVIEW` را تنظیم نکنید. Build command برابر `npm run build` باشد؛ Output Directory را برای تشخیص خودکار Next.js خالی بگذارید.

migration را یک بار از محیط مطمئن متصل به دیتابیس با `npm run db:deploy` اجرا کنید؛ آن را در buildهای موازی Vercel اجرا نکنید. قبل از migration نسخهٔ پشتیبان بگیرید. پس از deploy دامنهٔ HTTPS را وصل کنید و دامنهٔ یکسان را در هر دو URL قرار دهید؛ سپس rebuild کنید. بارگذاری رسانه مستقیماً با امضای سرور به Cloudinary می‌رود تا محدودیت حجم درخواست Vercel مانع ویدیو نشود. ویدیو حداکثر ۲۰MB است و نتیجهٔ تبدیل نیز در سرور بررسی می‌شود.

## VPS با systemd و Caddy

روی سرور Linux، Node.js 24 در `/usr/bin/node`، PostgreSQL 17 یا ارائه‌دهندهٔ مدیریت‌شده و Caddy نصب کنید. DNS دامنه را به سرور وصل کنید؛ پورت‌های 80 و 443 را باز و PostgreSQL را از اینترنت عمومی جدا کنید. نمونهٔ محلی `compose.yaml` برای توسعه است، نه پیکربندی تولید.

سورس مخزن را در `/opt/roya/current` قرار دهید. این مسیر در فایل سرویس استفاده می‌شود. یک کاربر بدون ورود `roya` و پوشهٔ تنظیمات ایجاد کنید:

```sh
sudo useradd --system --home /opt/roya --shell /usr/sbin/nologin roya
sudo install -d -m 750 -o root -g roya /etc/roya
sudo install -m 640 -o root -g roya .env /etc/roya/roya.env
```

فرمان‌های آماده‌سازی مشترک را در `/opt/roya/current` اجرا کنید. سپس فایل‌های استاتیک را کنار standalone کپی کنید:

```sh
cp -r public .next/standalone/public
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
sudo chown -R roya:roya /opt/roya/current/.next
sudo cp deploy/roya.service /etc/systemd/system/roya.service
sudo systemctl daemon-reload
sudo systemctl enable --now roya
```

فایل `deploy/Caddyfile` را در `/etc/caddy/Caddyfile` قرار دهید. متغیر `ROYA_DOMAIN` را برای سرویس Caddy با دامنهٔ خودتان تنظیم کنید:

```sh
sudo systemctl edit caddy
```

در ویرایشگر مقدار واقعی را وارد کنید:

```ini
[Service]
Environment=ROYA_DOMAIN=shop.your-domain.example
```

این دامنه نمونه است و باید جایگزین شود. سپس:

```sh
sudo systemctl daemon-reload
sudo systemctl reload-or-restart caddy
curl --fail http://127.0.0.1:3000/api/health/
sudo journalctl -u roya --since today
```

Endpoint سلامت فقط وضعیت کلی اتصال دیتابیس را اعلام می‌کند و اطلاعات اتصال را برنمی‌گرداند. آن را با فاصلهٔ حداقل ۳۰ ثانیه پایش کنید. لاگ reverse proxy باید query string مسیر callback پرداخت و اطلاعات فرم را حذف کند؛ لاگ Next.js نباید به‌صورت عمومی منتشر شود. سرویس فقط روی localhost گوش می‌دهد؛ HTTPS را Caddy خاتمه می‌دهد. برای انتشار نسخهٔ بعد build را در مسیر release جدا انجام دهید، migration سازگار را اجرا کنید، فایل‌ها را کپی و symlink `current` را اتمیک جابه‌جا کنید؛ سپس سرویس را restart کنید. برای rollback برنامه، سازگاری دیتابیس را بررسی کنید؛ migration مخرب را صرفاً با بازگشت کد معکوس نکنید.

## نگهداری و بازیابی

از PostgreSQL هر روز نسخهٔ پشتیبان رمزنگاری‌شده در فضای جداگانه نگه دارید. آدرس اتصال مستقیم را با `PGSERVICE=roya` و فایل‌های `.pg_service.conf` / `.pgpass` با دسترسی `600` تنظیم کنید تا رمز در آرگومان فرمان یا تاریخچه قرار نگیرد:

```sh
PGSERVICE=roya pg_dump --format=custom --file=roya-backup.dump
PGSERVICE=roya_restore pg_restore --exit-on-error --no-owner --dbname=roya_restore roya-backup.dump
```

`roya_restore` باید سرویس و دیتابیس **جدا و خالی** باشد. ابتدا بازگردانی آزمایشی، شمارش سفارش‌ها و ورود مدیر را بررسی کنید؛ فایل backup را عمومی یا داخل مخزن نگذارید. Cloudinary جدا از دیتابیس است؛ حذف فایل ابری را پس از بررسی ارجاع‌ها انجام دهید. آرشیو محصول فایل را خودکار از Cloudinary حذف نمی‌کند.

برای پاک‌سازی روزانهٔ bucketهای منقضی‌شده، با محیط دیتابیس تنظیم‌شده اجرا کنید:

```sh
npm run maintenance:rate-limits
```

این دستور فقط bucketهای بیش از ۲۴ ساعت منقضی‌شده را حذف می‌کند. سفارش معلق، ظرفیت رزروشده، رسید پرداخت یا سابقهٔ مشتری را حذف نمی‌کند. پرداخت با نتیجهٔ نامعلوم را در داشبورد زرین‌پال بررسی کنید؛ آن را خودکار منقضی یا دوباره ایجاد نکنید. لغو سفارش پرداخت‌شده نیاز به بازپرداخت واقعی از طرف مدیر دارد؛ پنل وضعیت «نیازمند بازپرداخت» را نمایش می‌دهد و انتقال وجه انجام نمی‌دهد.

## پذیرش قبل از فروش واقعی

روی دیتابیس آزمایشی migration و ساخت مدیر را انجام دهید؛ سپس ورود صحیح/غلط، منع درخواست غیرمدیر، فرم Cloudinary، حد حجم ویدیو، مقدار حداقل/گام سفارش، قیمت دستکاری‌شده، ظرفیت هم‌زمان، تخفیف و ارسال شهری را آزمایش کنید. یک سفارش نقدی را تا تحویل و یک سفارش sandbox را تا callback موفق، تکرار callback و لغو/بازپرداخت بررسی کنید. پیگیری باید فقط با کد و موبایل صحیح پاسخ دهد. هزینهٔ ارسال و زمان تحویل برابر بیشترین زمان آماده‌سازی اقلام + زمان منطقه باشد. موبایل واقعی، جزئیات تماس، قیمت‌ها و هزینه‌ها را خودتان وارد کنید.

بعد از تأیید عملی، مرچنت واقعی، sandbox خاموش و `ROYA_INDEXABLE=1` را تنظیم و rebuild کنید. `/robots.txt` و `/sitemap.xml` را بررسی و sitemap را در Search Console ثبت کنید. صفحات سبد، پرداخت، پیگیری و ادمین noindex هستند. Product JSON-LD فقط برای کاتالوگ واقعی فعال می‌شود؛ UI قیمت تومان دارد و schema ارز رسمی IRR و مبلغ ×۱۰ را اعلام می‌کند. schema شامل واحد پایه و حداقل مقدار است؛ واجد شرایط بودن نمایش قیمت واحد در Google باید با Rich Results Test بررسی شود.

CSP مانع frame و object می‌شود و eval در production ندارد؛ برای سازگاری با hydration و ISR، script/style inline مجاز است و این سیاست nonce-based نیست. فرم‌های تغییردهندهٔ داده Origin، بدنهٔ محدود و Zod دارند؛ NextAuth از CSRF token استفاده می‌کند. نرخ درخواست‌ها در PostgreSQL مشترک است. هنگام استفاده از proxy فقط headerهای معتبر را از proxy خودتان عبور دهید؛ محدودیت کلی مستقل از IP نیز فعال است. تغییرات محیط/راز و بازیابی backup را ابتدا در محیط آزمایشی انجام دهید.

مراجع: [Next.js deployment](https://nextjs.org/docs/app/getting-started/deploying)، [Next.js metadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)، [Product structured data](https://developers.google.com/search/docs/appearance/structured-data/product-snippet).
