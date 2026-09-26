# 🔍 SALAT — خطة المراجعة الشاملة + التقرير المجمَّع

> **التاريخ:** 2026-09-26 · **المشروع:** `E:\Projects\Airport Project\SALAT`
> **النطاق:** `client/` (Angular 22.2.0 + TS 6.0.3) · `server/` (Express 5.2.1 + Mongoose 9.10.2) · `docs/PLAN_A.md`
> **المرجع التصميمي:** النموذج الأولي `prayer-quran-theme.html` (519 سطرًا)
> **نوع المراجعة:** قراءة فقط — لم يُعدَّل أي ملف.

---

## 1. خطة المراجعة (Methodology)

### 1.1 تقسيم المسؤوليات على 5 وكلاء

| # | الوكيل | النطاق | الملفات | المحاور |
|---|---|---|---|---|
| **A1** | أمن الخادم | `server/` كاملًا (18 ملف) | server.js · middleware/* · controllers/* · routes/* · models/* | مصادقة، JWT، IDOR، حقن، Helmet/CORS/Rate-Limit، إدارة الأخطاء |
| **A2** | طبقة البيانات | models + services + ثوابت | models/* · services/aladhanService.js · config/db.js · utils/constants.js | Mongoose، TTL، مفتاح الكاش، Cache-First، صحة التاريخ/المنطقة الزمنية، بيانات مرجعية |
| **A3** | واجهة Angular | `client/src/app` كاملًا | app.ts · app.html · core/{models,services}/* | Signals، آلة حالة العدّاد، تدفّق reactive، عقد API، TypeScript، البنية |
| **A4** | UI/UX + A11y + i18n | `client/src` كاملًا + النموذج | index.html · styles.css · app.{ts,html,css} · i18n.service.ts | مطابقة التصميم، RTL/LTR، WCAG 2.1 AA، النسخ، الاستجابة |
| **A5** | الخطة والبناء والجودة | الجذر + configs + توثيق | PLAN_A.md · package.json×2 · angular.json · tsconfig* · .env · git | مطابقة الخطة، الاختبارات، الحزم، الأسرار، نظافة المستودع |

### 1.2 منهجية التحقق

لكل ملاحظة في التقارير:

1. **تحديد الموضع** — `file:line` دقيق من القراءة الفعلية.
2. **معيار التصنيف** — `CRITICAL / HIGH / MEDIUM / LOW`.
3. **كتابة سيناريو واقعي** — متى يظهر العطل للمستخدم بالضبط (وليس وصفاً نظرياً).
4. **حل مقترح** — مقطع كود قابل للتطبيق.
5. **تحقق تجريبي حيث أمكن** — تشغيل الكود، استدعاء Aladhan API، اختبار الفرضيات أمنياً.
6. **ممنوع الاختراع** — لا ملاحظة بدون سطر مُثبت.

### 1.3 معايير التصنيف

| المستوى | التعريف |
|---|---|
| 🔴 **CRITICAL** | إيقاف الإنتاج · تسرّب أسرار · بيانات착 Lite خاطئة تُعرض على المستخدم |
| 🟠 **HIGH** | ثغرة قابلة للاستغلال · خطأ فقهي/منطقي ظاهر · انحراف جوهري عن الخطة |
| 🟡 **MEDIUM** | خطأ في الحالات النادرة · كلفة أداء · صيانة أضعف مما ينبغي |
| 🔵 **LOW** | تحسينات · كود ميت · اتساق شكلي |

### 1.4 مراحل التنفيذ (مكتملة)

```
[x] المرحلة 1 — جرد المشروع واستخراج النطاق (27 ملف مصدري)
[x] المرحلة 2 — إطلاق 5 وكلاء متوازيين بتقسيم غير متداخل
[x] المرحلة 3 — تجميع النتائج + إزالة التكرار + الترتيب حسب الأولوية
[x] المرحلة 4 — استخراج الـ CRITICAL العابر للوكلاء (نقاط تعارض)
[ ] المرحلة 5 — تنفيذ الإصلاحات (طارئ: CRITICAL فقط)
[ ] المرحلة 6 — إعادة بناء + اختبار بناء الإنتاج + تشغيل إقلاع production
```

---

## 2. التقرير المجمَّع

### 2.1 حصيلة الأرقام

| الوكيل | CRITICAL | HIGH | MEDIUM | LOW | الإجمالي |
|---|---|---|---|---|---|
| A1 · أمن الخادم | 1 | 3 | 16 | 25 | **45** |
| A2 · طبقة البيانات | 5 | 5 | 9 | 9 | **28** |
| A3 · واجهة Angular | 2 | 5 | 17 | 12 | **36** |
| A4 · UI/UX + A11y | 3 | 7 | 17 | 11 | **38** |
| A5 · الخطة والبناء | 4 | 7 | 13 | 7 | **31** |
| **الإجمالي الخام** | **15** | **27** | **72** | **64** | **178** |
| **بعد إزالة التكرار (تقاطعياً)** | **10** | **13** | **26** | **21** | **≈ 70** |

**نقاط التعارض بين الوكلاء تم توحيدها في原材料 (انظر §2.2 و §2.5).**

### 2.2 الـ 10 ملاحظات CRITICAL (بعد إزالة التكرار)

#### 🔴 C1 · الإنتاج معطَّل كلياً — `app.get('*')` غير صالح في Express 5
- **الملف:** `server/server.js:60` · **اكتشفه:** A1 + A2 + A5 (تطابق تام)
- **الدليل التجريبي:** `NODE_ENV=production node server.js` ⇒ `PathError: Missing parameter name at index 1: *` عند تحميل الوحدة، قبل `app.listen`، `EXIT=1`.
- **السبب:** Express 5.2.1 يستخدم path-to-regexp 8.4.2 الذي يرفض البدل `*` غير المُسمّى.
- **السيناريو:** أول `render deploy` أو `npm start` بـ `NODE_ENV=production` ⇒ الحاوية تعيد التشغيل كل ثوانٍ، ولا صفحة خطأ، ولا سجل مرئي.
- **الإصلاح:**
```js
if (process.env.NODE_ENV === 'production') {
  const clientPath = path.join(__dirname, '..', 'client', 'dist', 'client', 'browser');
  app.use(express.static(clientPath, { maxAge: '1y', index: false }));
  app.use((req, res, next) => {                 // catch-all بلا path
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(clientPath, 'index.html'));
  });
}
```

#### 🔴 C2 · أسرار حقيقية في `server/.env`
- **الملف:** `server/.env:2` (سلسلة اتصال Atlas ببيانات اعتماد مدمجة) · `server/.env:3` (`JWT_SECRET` نصّي يحوي حرفياً `_change_in_production`)
- **الوضع:** `.env` مُستثنى في `server/.gitignore:2` ✅ — لكن **المشروع ليس git repo أصلاً**، فحماية `.gitignore` غير فعّالة اليوم. ولا يوجد `.env.example`.
- **الأثر:** مشاركة المجلد = تسريب قاعدة البيانات كاملة. وسر JWT الضعيف = توقيع رموز مزوّرة لكل المستخدمين (payload = `{id}` فقط ⇒ تحكّم كامل).
- **الإجراء الفوري:** تدوير كلمة مرور Atlas · توليد `JWT_SECRET` عشوائي ≥ 32 بايت · إنشاء `server/.env.example` · فحص إقلاع يرفض سراً ضعيفاً.

#### 🔴 C3 · `baseUrl` مثبَّت على localhost — الواجهة معطَّلة خارج التطوير
- **الملف:** `client/src/app/core/services/prayer.service.ts:9`
- **الوصف:** `'http://localhost:3000/api'` قيمة حرفية. لا `src/environments/`، لا `fileReplacements` في `angular.json`، لا `proxy.conf.json` — في حين أن `server.js:58` يخدم الـ SPA من **نفس الأصل**.
- **السيناريو:** زائر على `https://salat.app` ⇒ كل طلب يذهب إلى `localhost` جهازه ⇒ `ERR_CONNECTION_REFUSED` ⇒ 6 بطاقات `--:--` بلا أي رسالة.
- **الإصلاح:** `baseUrl = '/api'` + `proxy.conf.json` للتطوير.

#### 🔴 C4 · بيانات `FALLBACK` الثابتة (دمياط) تُقدَّم لأي مستخدم في أي مكان
- **الملف:** `server/services/aladhanService.js:105-121` · `server/utils/constants.js:83-89`
- **الوصف:** الـ `catch` لا يفحص المدينة إطلاقاً. أي فشل (timeout / 5xx / 400 / DNS) ⇒ يعيد مواقيت دمياط `05:15 … 20:03` داخل غلاف **`success: true`** و `offline: true`.
- **السيناريو (مقاس):** مستخدم في الرياض، تعطّل Aladhan ثانيتين ⇒ يرى "الرياض، السعودية" مع Fajr 05:15 و Isha 20:03 (توقيت دمياط). الفارق ساعة. لا تنبيه سوى سطر رمادي 12.8px.
- **الإصلاح:** لا تُرجع fallback كبيانات صالحة — `503 + success:false`، أو اجعل `FALLBACK_BY_CITY` وتاريخ مشتق من `new Date()`.

#### 🔴 C5 · 5 من 112 مدينة تُرجع مواقيت مدينة أخرى تماماً — والـ API يردّ 200
- **الملف:** `server/utils/constants.js:52` (Faiyum) · `:60` (فلسطين) · **اكتشفه:** A2 باختبار فعلي لـ 112 مدينة

| المُدخل | `meta.timezone` المُعادة | الموعد المتوقع |
|---|---|---|
| Faiyum / Egypt | **Australia/Brisbane** | Africa/Cairo |
| Jerusalem / Palestine | **America/Mexico_City** | Asia/Jerusalem |
| Gaza / Palestine | **Asia/Riyadh** | Asia/Gaza |
| Hebron / Palestine | **Asia/Manila** | Asia/Hebron |
| Nablus / Palestine | **America/Chicago** | Asia/Jerusalem |

- **السبب:** Aladhan لا يُخطئ عند فشل الـ geocoding — يرجع `code:200` بموقع افتراضي. الأسماء الصحيحة: `Fayoum` و `Palestinian Territory`.
- **السيناريو:** مستخدم مصري يختار «الفيوم» ⇒ يمر كل التحقق ⇒ يُخزَّن كـ Brisbane 24 ساعة ⇒ يرى Fajr 04:11 / Isha 19:06.
- **الإصلاح:** تصحيح الأسماء + **فرض** مقارنة `meta.timezone` قبل قبول الكاش + سكربت CI يفحص كل مدينة.

#### 🔴 C6 · لا يوجد أي تحقّق من المدخلات ⇒ تلويث الكاش بصمت
- **الملف:** `server/services/aladhanService.js:59` · `server/controllers/prayerController.js:9-23`
- **الوصف:** `city`/`country` مُرمَّزان ✅ لكن **`method` و `school` يُدرجان خامَين** و`school` يأتي من `req.query` بلا تحقق. **مقاس:**

| الطلب | ما أعادته Aladhan فعلياً | مفتاح الكاش الناتج |
|---|---|---|
| `?method=3&method=99` | **ISNA (2)** لا MWL | `damietta_egypt_3,99_0_…` ← يدّعي MWL ويحمل ISNA |
| `?method=4%26method%3D20` | **KEMENAG (20)** | `damietta_egypt_4&method=20_0_…` |
| `?method=4%26school%3D1` | **حنفي** | `damietta_egypt_4&school=1_0_…` |

- **الأسوأ:** `?method=3&method=99` ينتج مفتاحاً نظيف الشكل يدّعي MWL لكنه يحمل مواقيت ISNA. كل إدخال عشوائي = دليل جديد في الكاش، و TTL 24h يمنع التنظيف.
- **الإصلاح:** `URLSearchParams` + whitelist `/^(auto|[0-9]|99)$/` و`school ∈ {0,1}` + تحقّق من `data.data.meta.method.id === effectiveMethod` قبل الحفظ.

#### 🔴 C7 · لا `timeout` على طلب Aladhan ⇒ تعليقRequests حتى الأبد
- **الملف:** `server/services/aladhanService.js:60`
- **الدليل:** `node-fetch@2` ⇒ `lib/index.js:188` ⇒ `timeout = 0` افتراضياً، ولا `AbortSignal`.
- **السيناريو:** Aladhan يبطئ (حدث معتاد — خدماته الجغرافية داخلية Google) ⇒ كل طلب يحتجز socket. عند 100 طلب (حدّ المعدّل!) كل المقابس محجوزة ⇒ **كل طلبات `/api` تتجمّد بلا 500 ولا 504 ولا timeout**. عميل واحد يُسقط الخدمة بهجوم بطيء.
- **الإصلاح:** `fetch(url, { signal: AbortSignal.timeout(5000) })` — Node 18+ يوفّرها، وتُغني عن `node-fetch@2` المتقادَم.

#### 🔴 C8 · مطابقة توقيتات المدينة بوقت المتصفح — لا يوجدaware任何区域 زمنية
- **الملف:** `client/src/app/app.ts:110-113` · `server/services/aladhanService.js:44-50,103`
- **الوصف:** `new Date().getHours()` = **منطقة المتصفح**، بينما المواقيت محسوبة لمنطقة **المدينة**. الخادم يخزّن `meta` في الكاش (`:95`) لكنه **لا يُرجعه**، و`PrayerResponse` لا تطلب الحقل.
- **السيناريو:** مستخدم في برلين يختار الرياض. الرياض 18:30 / برلين 17:30 ⇒ التطبيق يقارن 1050 دقيقة بمواقيت الرياض ⇒ البطاقة الخضراء "الإقامة الآن" تظهر على **المغرب بدل العشاء** — خطأ فقهي مباشر.
- **الإصلاح:** إرجاع `meta.timezone` من الـ API + حساب `now` عبر `Intl.DateTimeFormat('en-GB',{timeZone})`، مع تنبيه عند اختلاف المنطقة.

#### 🔴 C9 · مفتاح الكاش بتاريخ UTC للسيرفر لا بتاريخ المدينة
- **الملف:** `server/models/PrayerCache.js:43`
- **الوصف:** `new Date().toISOString().split('T')[0]` = تاريخ UTC الذي يخص **السيرفر**، بينما بيانات Aladhan بتاريخ **المدينة المحلي** (مقاس: جاكرتا عند `20:5xZ` أعاد `date: 27-09` وخُزّن تحت `…_2026-09-26`).
- **النافذة المتأثرة:** 21:00–24:00 UTC = 00:00–03:00 بالقاهرة ⇒ تُخزَّن مواقيت الغد تحت مفتاح اليوم.
- **الإصلاح:** اجعل Aladhan مصدر الحقيقة في التاريخ (أرسل `date=` محسوبة في منطقة المدينة، أو اقرأ `data.data.date.gregorian.date`).

#### 🔴 C10 · لا يوجد تحكّم في الإصدارات إطلاقاً
- **الملف:** الجذر · **اكتشفه:** A5 (`git rev-parse` ⇒ `fatal: not a git repository` من الجذر و `client/` و `server/`)
- **الأثر:** صفر commits · لا رجوع · لا مراجعة · لا تتبّع. وملفا `.gitignore` مكتوبان لكنهما **إعداد ميت** — لا شيء يقرؤهما. أول `git init && git add -A` = تسريب `.env` في التاريخ.
- **الإجراء:** تدوير الأسرار (C2) **قبل** `git init`، ثم `.gitignore` موحّد + commit أولي.

### 2.3 أعلى 8 ملاحظات HIGH (بعد إزالة التكرار)

| # | الملاحظة | الموضع | الأثر |
|---|---|---|---|
| H1 | لا `logout` / `refresh` / إلغاء رموز؛ الرمز صالح 7 أيام | `routes/auth.js` · `authController.js:8` | رمز مسروق = وصول أسبوع كامل بلا وسيلة إلغاء |
| H2 | Cache stampede — لا دمج للطلبات المتزامنة | `aladhanService.js:35-122` | 200 مستخدم على نفس المفتاح = 200 نداء Aladhan ⇒ حظر الـ IP |
| H3 | `trust proxy` غير مضبوط | `server.js:33-38` | **مقاس:** كل العملاء في تقنيونفس العدّاد ⇒ بعد 100 تحميل (33 مستخدماً) يتوقف التطبيق كلياً |
| H4 | التاريخ الهجري يبقى قديماً من المغرب حتى منتصف الليل | `aladhanService.js:77-83` | يوم 30 من كل شهر هجري يتكرر: **5 ساعات وربع** خطأ |
| H5 | `iqamaOffsets` الجزئي يمسح باقي الإزاحات | `settingsController.js:42-61` | إرسال `{fajr:30}` فقط ⇒ صفر ⇒ **الإقامة تختفي بصمت** |
| H6 | `scheduleMidnight` مفقود (regression عن النموذج) | `app.ts:65-85` | التطبيق مفتوح ليلاً ⇒ يعرض مواقيت **أمس** حتى إعادة التحميل |
| H7 | لا حالة خطأ إطلاقاً + لا timeout + لا retry | `app.ts:97` · `prayer.service.ts` | الخادم متوقف ⇒ 6 بطاقات `--:--` و spinner **لا يتوقف أبداً** |
| H8 | لا `strict` ولا `strictTemplates` + 0 اختبارات + `npm test` مكسور | `tsconfig.json` · `package.json:9` | آلة حالة العدّاد بلا أي شبكة أمان |

### 2.4 إصلاحات MEDIUM ذات الأثرollars الأعلى (مختارة)

- **`formatMS(3600) = "60:00"`** — `app.ts:172-175`: الإزاحة مسموحة حتى 60 دقيقة ⇒ عدّاد MUHBroken فعلياً. (مثبت)
- **خطوط Google عبر `@import` بلا `preconnect`** — `styles.css:1` · `index.html`: **regression** عن النموذج ⇒ FOUT مرئي + RTT إضافي.
- **`:focus-visible` ضاع كلياً** — النموذج عرّفه (`prayer-quran-theme.html:44`) ⇒QWARN على `.btn.primary` (خلفية `#211D16`) غير مرئية تقريباً.
- **`.err` + `errFetch` مفقودان** — النموذج كان يملك صندوق خطأ كامل؛ المنفذ لا عنصر ولا CSS ولا مفتاح مستخدم ⇒ صمت عند الفشل.
- **أسماء الصلوات الستّ تبقى عربية في الوضع الإنجليزي** — `app.html:37,75` + `i18n.service.ts:50` (`isRtl` غير مستخدم).
- **فقد `fmt12`** — `الأذان 12:44 · 13:04` يعرض الرقم نفسه مرتين بلا تمييز 12/24 ساعة.
- **إندونيسيا مُسنَدة للطريقة 15 (Moonsighting) بدل 20 (KEMENAG)** — `constants.js:13,27` ⇒ **العشاء متأخر 6 دقائق** (مقاس).
- **`AUTO_BY_COUNTRY` ناقصة لـ 4 دول** — المغرب 21، الأردن 23، تونس 18، ماليزيا 17 ⇒ كلهاmwL اليوم (مقاس: الفجر 5 دقائق).
- **خطط}e Trust proxy / auth limiter / validation (zod) / CSP** — كلها في §2.5.
- **`ALADHAN_BASE` ثابت** ⇒ لا SSRF، لكن `method`/`school` بلا ترميز (C6).

### 2.5 مصفوفة "تنفيذ مكرر" (اكتشفه أكثر من وكيل — انتبه للتنفيذ الواحد)

| الملاحظة | Opera Independientes | الترتيب الصحيح |
|---|---|---|
| `app.get('*')` | A1 · A2 · A5 | C1 (مرة واحدة) |
| `baseUrl` localhost | A2 · A3 · A4 · A5 | C3 |
| Fallback دمياط | A1 · A2 · A3 · A4 · A5 (**الكل**) | C4 |
| الميزانية 7.85/8 kB | A3 · A4 · A5 | رتّبها **قبل** أي إصلاح CSS |
| `trust proxy` | A1 · A2 · A5 | H3 |
| لا اختبارات | A3 · A5 | H8 |

### 2.6 ما هو سليم فعلاً (لا تُلمسه)

| # | النقطة | الدليل |
|---|---|---|
| 1 | **بناء الإنتاج ينجح** | `ng build` exit 0 · 327.80 kB / 82.75 kB transfer |
| 2 | **الاعتماديات حديثة وآمنة** | `npm audit` ⇒ **0 ثغرات** · express 5.2.1 · mongoose 9.10.2 · helmet 8.3.0 |
| 3 | **لا IDOR** | المالك مشتق من `req.user._id` المُتحقَّق منه، لا من `req.body`/`req.query` |
| 4 | **لا mass-assignment** | قائمة بيضاء صريحة + لا حقل `role` في المخطط |
| 5 | **bcrypt 12 جولة + `select:false` + `toJSON` يحذف** | لا كلمة مرور نصية أبداً |
| 6 | **لا `[innerHTML]` في المشروع** | 0 نتيجة ⇒ **لا XSS** — تحسّن صريح عن النموذج |
| 7 | **CORS ليس ثغرة** | لا `*` ولا `origin:true` مع `credentials` |
| 8 | **Async rejections تمر تلقائياً** | Express 5 يمرّرها للـ errorHandler ⇒ **لا طلب يعلّق** (نقطة معمارية سليمة) |
| 9 | **16 توكن تصميم مطابقة حرفياً** | `styles.css:4-19` مقابل النموذج — فرق **صفر** |
| 10 | **معالجة `+1440` بعد العشاء** | منطق حقيقي غير موثّق في الخطة |
| 11 | `tickInterval` **يُمسح فعلاً** | `app.ts:83-85` — تحسّن عن النموذج |
| 12 | لا عاصفة إعادة رسم | استُبدل `updateCounts()` التكراري بالعرض التصريحي |
| 13 | `angle.json` §3 مطابق 100% | كل الملفات موجودة؛ `app.ts` وليس `app.component.ts` |
| 14 | الفصل dev/prod dependencies | سليم في المشروعين |
| 15 | `dist` المتوقع `client/dist/client/browser` ✔ مطابق لما ينتظره `server.js:58` | |

---

## 3. خلاصة التوصيات — رودماب الإصلاح

### المرحلة A · طوارئ (يبطّل الإنتاج أو يعرض بيانات خاطئة)
```
1. C2 تدوير الأسرار + .env.example            ← قبل أي git init
2. C1 إصلاح app.get('*')                       ← يعيد الإنتاج للحياة
3. C3 baseUrl = '/api' + proxy.conf.json       ← يعيد الواجهة للحياة
4. C4 إيقاف Fallback الصامت                    ← يوقف بيانات خاطئة
5. C5 تصحيح أسماء المدن + فحص meta.timezone    ← يوقف مواقيت FOREIGN
6. C6 URLSearchParams + whitelist              ← يوقف تلويث الكاش
7. C7 AbortSignal.timeout(5000) + حذف node-fetch
8. C9 تصحيح مفتاح الكاش (تاريخ المدينة)
9. C10 git init بعد 1
```

### المرحلة B · دقة فقهية (الأخطاء التي تُصلّي على غير وقتها)
```
C8    إرجاع meta.timezone + حساب now بمنطقة المدينة
H4    تصحيح التاريخ الهجري (احسبه محلياً بـ Intl islamic-umalqura)
H6    استعادة scheduleMidnight
H5    تصحيح iqamaOffsets (dotted paths)
      إزاحة 0 دقيقة ⇒ إصلاح فرع iqama في calcState
      NaN guard في toMin (استعادة cleanHM الدفاعية)
     Quaternion: تصحيح method 20 لإندونيسيا + 4 دول مفقودة في AUTO_BY_COUNTRY
```

### المرحلة C · الأمان والمتانة
```
H1    tokenVersion + access 15m + refresh + logout
H3    app.set('trust proxy', 1) + authLimiter (limit 10, skipSuccessfulRequests)
      zod لكل المدخلات + school/method whitelist
      CSP مفعّل (styleSrc 'unsafe-inline' فقط)
      errorHandler لا يسرّب err.message في الإنتاج + headersSent guard
      /api/health يفحص readyState ويرجع 503
      graceful shutdown + mongoose error listeners
      bcrypt.compare لهاش وهمي (مiguarding التوقيت)
      trim/lowercase للبريد قبل الاستعلام
      كلمة مرور minlength 8
```

### المرحلة D · الواجهة وتجربة المستخدم
```
H7    error signal + timeout + retry + عرض errFetch
      استعادة .err (colors مُختبَرة التباين: #8A1C1C ≈ 7.5:1)
      :focus-visible لكل العناصر التفاعلية
      role="dialog" + aria-modal + focus trap + Escape + focus return + inert
      aria-label ثنائي اللغة (كان في النموذج!)
      labels بـ for/id لكل select/input
      استعادة fmt12 + استخدام athanAt/iqamaAt الميتان
      أسماء الصلوات تتبع اللغة
      preconnect/preload للخطوط + حذف @import
      max-width:100% على .next-timer (فحص 200%)
      prefers-reduced-motion
```

### المرحلة E · الجودة والبنية
```
H8    vitest + test target + references لـ tsconfig.spec.json
      strict + strictTemplates + noUnusedLocals (آمن — البناء نجح مع --strict)
      ESLint (typescript-eslint + angular-eslint) + prettier --write
      GitHub Actions: prettier → build → test
      استخراج HeroComponent / PrayerListComponent / LocationSheet / SettingsSheet
      نقل calcState إلى prayer-state.ts (ليصبح قابلاً للاختبار)
      README جذري + LICENSE + openapi.yaml
      تصحيح PLAN_A.md: 29→28 دولة، 11 طريقة، /times/today، أسماء الإشارات
      .editorconfig + .gitignore جذريان
```

---

## 4. تقدير نسبة الاكتمال

| المرحلة (من PLAN_A.md §9) | التقدير | المبرر |
|---|---|---|
| الأسبوع 1 · Backend | **~90%** | النماذج والـ API كاملان؛ ينقص `app.get('*')` و`trust proxy` وinput validation |
| الأسبوع 2 · Angular UI | **~92%** | التصميم مطابق حرفياً؛ ينقص `.err` و`:focus-visible` و`fmt12` و`strict` |
| الأسبوع 3 · التكامل + المزامنة | **~35%** | المواقيت + المواقع متكاملة؛ **المصادقة والمزامنة السحابية 0%** (صفر كود auth في العميل) |
| الأسبوع 4 · اختبارات + إنتاج + نشر | **~15%** | صفر اختبارات · صفر CI · صفر نطاق · والخادم ينهار في production |
| **الإجمالي** | **≈ 58%** | |

**النقطة الجوهرية:** 5 من 10 نقاط نهاية REST (register/login/me/settings×2/times-today) **لا يستدعيها أي كود في العميل** — بحث نصّي بصفر نتيجة عن `auth|login|token|Bearer|times/today`. إما تُنفَّذ `AuthService` + `SettingsSyncService`، أو تُحذف طبقة المصادقة نهائياً (YAGNI) ويُحدَّث التوثيق.

---

## 5. أين reside التقارير الكاملة

المخرجات الكاملة للوكلاء الخمسة (178 ملاحظة بأرقام أسطرها) محفوظة في:

```
C:\Users\walee\.local\share\opencode\tool-output\tool_0df664ab8001I21mdTfblmRdJz.txt   (A1 · أمن الخادم)
C:\Users\walee\.local\share\opencode\tool-output\tool_0df80324f001E7LTBdrKW5Og8p.txt   (A2 · طبقة البيانات)
C:\Users\walee\.local\share\opencode\tool-output\tool_0df6736c7001z6elyd7ijeQUND.txt   (A3 · واجهة Angular)
C:\Users\walee\.local\share\opencode\tool-output\tool_0df79dcaa001hAim5Jc5UZzyN8.txt   (A4 · UI/UX + A11y)
C:\Users\walee\.local\share\opencode\tool-output\tool_0df7aea30001NHKhaurJleNwkU.txt   (A5 · الخطة والبناء)
```

> **ملاحظة على أولوية التنفيذ:** ميزانية `anyComponentStyle` (7.85 kB من 8 kB) يجب **رفعها أولاً**، وإلا فكل إصلاح في المرحلة D (focus rings, reduced-motion, `.err`) سيُفشل بناء الإنتاج.
