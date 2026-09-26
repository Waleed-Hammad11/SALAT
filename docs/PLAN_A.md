# 🕌 SALAT — خطة العمل أ (Plan A: Monolithic MVC Architecture)

> **المشروع المستند إليه:** [Open Design SALAT Project](http://127.0.0.1:4178/projects/damietta-prayer-times-b2c7) — النموذج الأخير `prayer-quran-theme.html`  
> **حزمة التقنيات (Tech Stack):** MongoDB Atlas + Mongoose + Node.js (Express) + Angular (Standalone Signals) + JavaScript / TypeScript  
> **الهدف:** إطلاق سريع وقوي (Quick Launch) بهيكل موحد متماسك وعالي الأداء لمواقيت الصلاة مع تجربة مستخدم قرآنية فريدة.

---

## 📑 الفهرس (Table of Contents)
1. [نظرة عامة والتحليل التصميمي](#1-نظرة-عامة-والتحليل-التصميمي)
2. [المعمارية العامة للنظام (Architecture Diagram)](#2-المعمارية-العامة-للنظام)
3. [هيكلية ملفات المشروع (Project Structure)](#3-هيكلية-ملفات-المشروع)
4. [قواعد البيانات ونماذج Mongoose (Data Models)](#4-قواعد-البيانات-ونماذج-mongoose)
5. [نقاط نهاية الـ REST API (Endpoints)](#5-نقاط-نهاية-الـ-rest-api)
6. [منطق الأعمال وخدمات السيرفر (Backend Services)](#6-منطق-الأعمال-وخدمات-السيرفر)
7. [واجهة المستخدم وتطبيق Angular (Frontend Client)](#7-واجهة-المستخدم-وتطبيق-angular)
8. [نظام التصميم والألوان (Design System)](#8-نظام-التصميم-والألوان)
9. [مراحل التنفيذ والجدول الزمني (Implementation Phases)](#9-مراحل-التنفيذ-والجدول-الزمني)
10. [دليل التشغيل المحلي (Getting Started & Run Guide)](#10-دليل-التشغيل-المحلي)

---

## 1. نظرة عامة والتحليل التصميمي

يعتمد مشروع **SALAT** على تحويل النموذج الأولي من Open Design إلى تطبيق Full-Stack حقيقي يجمع بين دقة مواقيت الصلاة الإسلامية والجمالية الروحانية المستوحاة من المصحف الشريف.

| الخاصية | التفاصيل الفنية |
|---|---|
| **القسم الرئيسي (Hero)** | عداد تنازلي تفاعلي للصلاة القادمة بالثواني + عداد الإقامة مع تأثير نبض لوني أخضر |
| **قائمة الصلوات** | عرض 6 صلوات يومية (الفجر، الشروق، الظهر، العصر، المغرب، العشاء) مع شارات الحالة (مضت، حالية، قادمة) |
| **الموقع الجغرافي** | 29 دولة عربية وإسلامية وعالمية مع مدنها الرئيسية وخاصية الاختيار المباشر والفرز التلقائي |
| **الإعدادات الفقهية** | حساب وقت العصر (شافعي/حنفي)، 12 طريقة حساب فلكية، وتعديل زمن الإقامة لكل صلاة (0–60 دقيقة) |
| **مصدر البيانات** | Aladhan API الموثوق مع طبقة تخزين مؤقت (Cache Layer) على MongoDB لحماية حصص الاستدعاء وضمان سرعة الاستجابة |
| **دعم اللغات (i18n)** | دعم كامل للغتين العربية والإنجليزية مع التبديل التلقائي لاتجاه الواجهة (RTL ↔ LTR) |
| **الهوية البصرية** | ثيم المصحف الذهبي الدافئ (`--bg: #FAF4E9`، `--gold: #A97E12`، `--green: #1E9E6A`) وخطوط كلاسيكية أصيلة |

---

## 2. المعمارية العامة للنظام

تعتمد **Plan A** على معمارية **Monolithic MVC** متكاملة: واجهة مستخدم أحادية الصفحة (SPA) بـ Angular تتواصل عبر REST API مع سيرفر Express، الذي بدوره يتصل بقاعدة بيانات MongoDB Atlas ومزود البيانات الخارجي Aladhan API.

```mermaid
graph TB
    subgraph Client["🖥️ واجهة العميل — Angular Client (Port 4200)"]
        direction TB
        UI["AppComponent (Signals & Standalone)"]
        PS["PrayerService (HttpClient)"]
        SS["SettingsService (LocalStorage & Sync)"]
        IS["I18nService (AR / EN Signals)"]
        UI --> PS
        UI --> SS
        UI --> IS
    end

    subgraph Server["⚙️ الخادم — Node.js & Express API (Port 3000)"]
        direction TB
        Router["Express Router (/api)"]
        AuthCtrl["Auth Controller"]
        PrayerCtrl["Prayer Controller"]
        SettingsCtrl["Settings Controller"]
        LocationCtrl["Location Controller"]
        
        AladhanSvc["Aladhan Service"]
        
        Router --> AuthCtrl
        Router --> PrayerCtrl
        Router --> SettingsCtrl
        Router --> LocationCtrl
        PrayerCtrl --> AladhanSvc
    end

    subgraph Database["🗄️ قاعدة البيانات — MongoDB Atlas"]
        direction TB
        ColUsers[("users")]
        ColSettings[("settings")]
        ColCache[("prayer_cache (TTL 24h)")]
    end

    subgraph External["🌍 المصادر الخارجية"]
        AladhanAPI["Aladhan REST API"]
    end

    Client -->|HTTP REST Requests (JSON)| Router
    AuthCtrl --> ColUsers
    SettingsCtrl --> ColSettings
    AladhanSvc -->|1. تحقق من الكاش| ColCache
    AladhanSvc -->|2. جلب في حال عدم التوفر| AladhanAPI
    AladhanSvc -->|3. حفظ في الكاش| ColCache
```

---

## 3. هيكلية ملفات المشروع

```text
SALAT/
├── docs/
│   └── PLAN_A.md                      # توثيق الخطة أ بالكامل
├── server/                            # خادم Node.js & Express
│   ├── package.json
│   ├── .env                           # المتغيرات البيئية (PORT, MONGO_URI, JWT_SECRET)
│   ├── server.js                      # نقطة الدخول الرئيسية، Helmet، CORS، Rate-Limit
│   ├── config/
│   │   └── db.js                      # اتصال Mongoose مع معالجة الانقطاع التلقائي
│   ├── models/
│   │   ├── User.js                    # نموذج المستخدم وتشفير bcrypt
│   │   ├── UserSettings.js            # إعدادات المستخدم والصلوات والإقامة
│   │   └── PrayerCache.js             # التخزين المؤقت مع TTL Index
│   ├── controllers/
│   │   ├── authController.js          # التسجيل، الدخول، واسترجاع بيانات الحساب
│   │   ├── prayerController.js        # جلب المواقيت وتطبيق الإعدادات
│   │   ├── settingsController.js      # قراءة وتحديث التفضيلات
│   │   └── locationController.js      # توفير قوائم الدول والمدن وطرق الحساب
│   ├── services/
│   │   └── aladhanService.js          # وسيط Aladhan مع Cache-First و Fallback
│   ├── middleware/
│   │   └── auth.js                    # حماية المسارات عبر JWT Token
│   ├── routes/
│   │   ├── auth.js                    # مسارات المصادقة
│   │   ├── prayer.js                  # مسارات المواقيت
│   │   ├── settings.js                # مسارات الإعدادات
│   │   └── location.js                # مسارات الدول والمدن
│   └── utils/
│       └── constants.js               # قوائم 29 دولة، 12 طريقة، وترجمات الشهور
└── client/                            # واجهة المستخدم بـ Angular
    ├── package.json
    ├── angular.json
    └── src/
        ├── index.html                 # خطوط Google Fonts (Aref Ruqaa, Amiri, IBM Plex)
        ├── styles.css                 # متغيرات التصميم والأنماط العامة
        └── app/
            ├── app.config.ts          # تهيئة الـ HttpClient والتوجيه
            ├── app.routes.ts          # توجيه المسارات
            ├── app.ts                 # المكون الرئيسي بنظام Angular Signals
            ├── app.html               # واجهة المستخدم المكتملة
            ├── app.css                # أنماط المكون المستوحاة من Open Design
            └── core/
                ├── models/
                │   └── prayer.model.ts  # نماذج البيانات والواجهات TypeScript
                └── services/
                    ├── prayer.service.ts    # الاتصال بالخادم
                    ├── settings.service.ts  # إدارة تفضيلات المستخدم
                    └── i18n.service.ts      # إدارة اللغات والترجمة الحية
```

---

## 4. قواعد البيانات ونماذج Mongoose

### 4.1 نموذج المستخدم (`models/User.js`)
```javascript
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true // مشفر باستخدام bcryptjs
  },
  displayName: {
    type: String,
    trim: true,
    default: 'مستخدم'
  },
  language: {
    type: String,
    enum: ['ar', 'en'],
    default: 'ar'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});
```

### 4.2 نموذج إعدادات المستخدم (`models/UserSettings.js`)
```javascript
const mongoose = require('mongoose');

const userSettingsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  city: { type: String, default: 'Damietta' },
  country: { type: String, default: 'Egypt' },
  method: { type: String, default: 'auto' }, // auto أو رقم الطريقة الفلكية
  school: { type: String, enum: ['0', '1'], default: '0' }, // 0: شافعي/مالكي/حنبلي، 1: حنفي
  iqamaOffsets: {
    fajr: { type: Number, default: 25, min: 0, max: 60 },
    dhuhr: { type: Number, default: 20, min: 0, max: 60 },
    asr: { type: Number, default: 15, min: 0, max: 60 },
    maghrib: { type: Number, default: 10, min: 0, max: 60 },
    isha: { type: Number, default: 20, min: 0, max: 60 }
  },
  updatedAt: { type: Date, default: Date.now }
});
```

### 4.3 نموذج التخزين المؤقت للمواقيت (`models/PrayerCache.js`)
يستخدم خاصية **TTL Index** لحذف السجلات تلقائياً بعد مرور 24 ساعة:
```javascript
const mongoose = require('mongoose');

const prayerCacheSchema = new mongoose.Schema({
  cacheKey: {
    type: String,
    required: true,
    unique: true // مثال: "Damietta_Egypt_5_0_2026-09-26"
  },
  city: String,
  country: String,
  method: String,
  school: String,
  timings: {
    Fajr: String,
    Sunrise: String,
    Dhuhr: String,
    Asr: String,
    Maghrib: String,
    Isha: String
  },
  hijri: {
    day: String,
    monthEn: String,
    monthAr: String,
    year: String
  },
  gregorian: String,
  methodName: String,
  fetchedAt: { type: Date, default: Date.now },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 } // يحذف تلقائياً عند بلوغ تاريخ الصلاحية
  }
});
```

---

## 5. نقاط نهاية الـ REST API

| الطريقة | المسار | الحماية | الوصف |
|---|---|---|---|
| `POST` | `/api/auth/register` | عام | تسجيل حساب جديد وإنشاء إعدادات افتراضية له |
| `POST` | `/api/auth/login` | عام | تسجيل الدخول وإرجاع رمز JWT |
| `GET` | `/api/auth/me` | JWT محمي | جلب بيانات المستخدم الحالي |
| `GET` | `/api/prayer/times` | عام | جلب المواقيت بمعايير: `city`, `country`, `method`, `school` |
| `GET` | `/api/prayer/my-times` | JWT محمي | جلب المواقيت بالاعتماد على إعدادات المستخدم المسجلة |
| `GET` | `/api/settings` | JWT محمي | استرجاع إعدادات الحساب الحالي |
| `PUT` | `/api/settings` | JWT محمي | تحديث إعدادات المدينة أو الإقامة أو طريقة الحساب |
| `GET` | `/api/locations/countries` | عام | قائمة الـ 29 دولة ومدنها المدعومة |
| `GET` | `/api/locations/methods` | عام | قائمة طرق الحساب الفلكية الـ 12 المعتمدة |
| `GET` | `/api/health` | عام | فحص حالة الخادم واتصاله بقاعدة البيانات |

---

## 6. منطق الأعمال وخدمات السيرفر

### استراتيجية التخزين المؤقت والصلابة (Cache-First & Fallback Strategy):
1. عند طلب المواقيت، يتم بناء مفتاح فريد: `${city}_${country}_${method}_${school}_${YYYY-MM-DD}`.
2. يتم البحث في كوليكشن `PrayerCache`:
   - إذا وُجد وكانت البيانات صالحة، تُعاد فوراً بأقل من 10ms.
3. في حال عدم وجودها في الكاش:
   - يتم استدعاء Aladhan API.
   - تُحفظ النتيجة في MongoDB Atlas مع تعيين صلاحية 24 ساعة.
4. **الصلابة والمرونة (Graceful Degradation):**
   - في حال تعذر الاتصال بـ MongoDB Atlas (مثل انقطاع مؤقت لـ DNS أو الشبكة)، يتخطى الخادم الكاش تلقائياً ويتصل مباشرة بـ Aladhan API.
   - في حال تعذر الاتصال بكلاهما، يمتلك الخادم بيانات بديلة محلية (Fallback) لمدينة دمياط تضمن استمرار عمل التطبيق دون توقف.

---

## 7. واجهة المستخدم وتطبيق Angular

تم بناء الواجهة الأمامية باستخدام أحدث معايير **Angular 17+ Standalone Components** مع الاعتماد الكامل على **Signals**:

- **Reactivity عبر Signals:**
  - `selectedCountry`, `selectedCity`, `timings`, `nextPrayer`, `countdownStr` كلها إشارات تفاعلية تحدث الواجهة بدقة بالغة.
- **عداد حي دقيق (1-Second Ticker):**
  - يقوم بحساب الوقت المتبقي بالثواني والدقائق والساعات بدقة عالية ويحدث بطاقة الصلاة القادمة.
- **وضع الإقامة (Iqama Pulse Mode):**
  - عندما يحين وقت الأذان ويبدأ وقت الانتظار للإقامة، تتحول شارة الحالة إلى اللون الأخضر النابض مع عرض العد التنازلي للإقامة.
- **لوحات سفلية تفاعلية (Bottom Sheets):**
  - نافذة اختيار الدولة والمدينة مع فلترة فورية.
  - نافذة ضبط أوقات الإقامة وطريقة الحساب والمذهب الفقهي.
- **تخزين محلي ومزامنة سحابية (Local + Cloud Sync):**
  - يحفظ تفضيلات الزائر محلياً في `localStorage`، ويقوم بمزامنتها مع حسابه في MongoDB بمجرد تسجيل الدخول.

---

## 8. نظام التصميم والألوان

تم نقل وتطبيق نظام الألوان الخاص بـ Open Design بالكامل:

```css
:root {
  /* الخلفية واللوحات */
  --bg: #FAF4E9;              /* خلفية دافئة بلون ورق المصحف القديم */
  --card: #FFFFFF;            /* خلفية البطاقات البيضاء الصافية */
  --banner1: #DCCDA9;         /* تدرج البانر العلوي الدافئ */
  --banner2: #C7B489;         
  
  /* النصوص والخطوط */
  --ink: #211D16;             /* لون الحبر القرآني الداكن */
  --muted: #8B8172;           /* النصوص الثانوية الهادئة */
  --line: #EAE0CD;            /* حدود الفواصل الناعمة */
  --pill: #F3EBD8;            /* خلفيات الأزرار والشارات */
  
  /* ألوان التمييز الروحانية */
  --green: #1E9E6A;           /* أخضر إسلامي للصلوات النشطة والإقامة */
  --gold: #A97E12;            /* ذهبي إسلامي راقٍ للبطاقة البارزة والزخارف */
  --gold-soft: #F6ECD4;       /* لمسات ذهبية ناعمة */
  
  /* المنحنيات والظلال */
  --radius: 16px;
  --shadow: 0 1px 2px rgba(74, 60, 32, .07), 0 10px 28px rgba(74, 60, 32, .07);
  
  /* الخطوط */
  --font-ar: 'IBM Plex Sans Arabic', system-ui, sans-serif;
  --font-cal: 'Aref Ruqaa', 'Amiri', serif;
  --font-en: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

---

## 9. مراحل التنفيذ والجدول الزمني

```text
الأسبوع 1: تأسيس الـ Backend و Mongoose والنماذج وربط Aladhan API
الأسبوع 2: بناء واجهة Angular الكاملة بنظام Signals وربط نظام التصميم والترجمة
الأسبوع 3: التكامل بين الـ Client و الـ Server ومزامنة الإعدادات وحساب الإقامة
الأسبوع 4: اختبارات الأداء، تجهيز حزم الإنتاج (Production Build)، والربط مع النطاق
```

---

## 10. دليل التشغيل المحلي

### متطلبات التشغيل:
- **Node.js** (v18 أو أحدث)
- **NPM**
- اتصال إنترنت لجلب البيانات من Aladhan ومزامنة MongoDB Atlas

### 10.1 تشغيل الـ Backend Server:
```powershell
cd server
npm install
npm run dev
```
- سيعمل الخادم على المنفذ: `http://localhost:3000`
- فحص صحة الخادم: `http://localhost:3000/api/health`

### 10.2 تشغيل واجهة الـ Angular Client:
```powershell
cd client
npm install
npm start
```
- ستفتح الواجهة على: `http://localhost:4200`

---
*تم إعداد هذا المستند كمرجع شامل ومعتمد للخطة (Plan A) الخاصة بمشروع SALAT.*
