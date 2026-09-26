// Calculation methods supported by Aladhan API
const METHODS = [
  ['auto', 'Auto · تلقائي'],
  ['5', 'Egypt (Survey) · الهيئة المصرية العامة للمساحة'],
  ['4', 'Makkah · جامعة أم القرى بمكة المكرمة'],
  ['2', 'ISNA · الجمعية الإسلامية لأمريكا الشمالية'],
  ['3', 'MWL · رابطة العالم الإسلامي'],
  ['1', 'Karachi · جامعة العلوم الإسلامية بكراتشي'],
  ['8', 'Gulf · دول الخليج'],
  ['9', 'Kuwait · وزارة الأوقاف الكويتية'],
  ['10', 'Qatar · وزارة الأوقاف القطرية'],
  ['13', 'Turkey (Diyanet) · رئاسة الشؤون الدينية التركية'],
  ['20', 'Indonesia (KEMENAG) · وزارة الشؤون الدينية الإندونيسية'],
  ['21', 'Morocco · وزارة الأوقاف والشؤون الإسلامية المغربية'],
  ['23', 'Jordan · وزارة الأوقاف الأردنية'],
  ['18', 'Tunisia · وزارة الشؤون الدينية التونسية'],
  ['17', 'Malaysia (JAKIM) · مصلحة التنمية الإسلامية بماليزيا'],
  ['16', 'UAE · الهيئة العامة للشؤون الإسلامية والأوقاف بالإمارات']
];

// Auto method selection by country
const AUTO_BY_COUNTRY = {
  'egypt': '5',
  'saudi arabia': '4',
  'united arab emirates': '16',
  'qatar': '10',
  'kuwait': '9',
  'bahrain': '8',
  'oman': '8',
  'jordan': '23',
  'morocco': '21',
  'tunisia': '18',
  'malaysia': '17',
  'turkey': '13',
  'indonesia': '20',
  'pakistan': '1'
};

// Prayer definitions
const PRAYERS = [
  { id: 'fajr',    ar: 'الفجر',   en: 'Fajr' },
  { id: 'sunrise', ar: 'الشروق',  en: 'Sunrise', ref: true },
  { id: 'dhuhr',   ar: 'الظهر',   en: 'Dhuhr' },
  { id: 'asr',     ar: 'العصر',   en: 'Asr' },
  { id: 'maghrib', ar: 'المغرب',  en: 'Maghrib' },
  { id: 'isha',    ar: 'العشاء',  en: 'Isha' }
];

// Hijri month names (AR)
const AR_MONTHS = {
  'Muharram': 'محرم', 'Safar': 'صفر',
  'Rabīʿ al-awwal': 'ربيع الأول', 'Rabīʿ al-thānī': 'ربيع الثاني',
  'Rabīʿ al-Thānī': 'ربيع الثاني',
  'Jumādá al-ūlá': 'جمادى الأولى', 'Jumādá al-ākhirah': 'جمادى الآخرة',
  'Rajab': 'رجب', 'Shaʿbān': 'شعبان', 'Ramaḍān': 'رمضان',
  'Shawwāl': 'شوال', 'Dhū al-Qaʿdah': 'ذو القعدة', 'Dhū al-Ḥijjah': 'ذو الحجة'
};

// Countries + cities (from Open Design SALAT project)
const COUNTRIES = [
  { c: 'Egypt', ar: 'مصر', cities: [['Cairo','القاهرة'],['Alexandria','الإسكندرية'],['Giza','الجيزة'],['Damietta','دمياط'],['Port Said','بورسعيد'],['Suez','السويس'],['Ismailia','الإسماعيلية'],['Mansoura','المنصورة'],['Tanta','طنطا'],['Zagazig','الزقازيق'],['Fayoum','الفيوم'],['Minya','المنيا'],['Asyut','أسيوط'],['Sohag','سوهاج'],['Qena','قنا'],['Luxor','الأقصر'],['Aswan','أسوان'],['Hurghada','الغردقة'],['Sharm El Sheikh','شرم الشيخ'],['Beni Suef','بني سويف']]},
  { c: 'Saudi Arabia', ar: 'السعودية', cities: [['Makkah','مكة المكرمة'],['Madinah','المدينة المنورة'],['Riyadh','الرياض'],['Jeddah','جدة'],['Dammam','الدمام'],['Khobar','الخبر'],['Taif','الطائف'],['Tabuk','تبوك'],['Abha','أبها'],['Buraidah','بريدة']]},
  { c: 'United Arab Emirates', ar: 'الإمارات', cities: [['Dubai','دبي'],['Abu Dhabi','أبوظبي'],['Sharjah','الشارقة'],['Ajman','عجمان'],['Ras Al Khaimah','رأس الخيمة'],['Fujairah','الفجيرة']]},
  { c: 'Qatar', ar: 'قطر', cities: [['Doha','الدوحة'],['Al Rayyan','الريان'],['Al Wakrah','الوكرة']]},
  { c: 'Kuwait', ar: 'الكويت', cities: [['Kuwait City','مدينة الكويت'],['Hawalli','حولي'],['Ahmadi','الأحمدي']]},
  { c: 'Bahrain', ar: 'البحرين', cities: [['Manama','المنامة'],['Riffa','الرفاع']]},
  { c: 'Oman', ar: 'عمان', cities: [['Muscat','مسقط'],['Salalah','صلالة'],['Sohar','صحار']]},
  { c: 'Jordan', ar: 'الأردن', cities: [['Amman','عمّان'],['Zarqa','الزرقاء'],['Irbid','إربد'],['Aqaba','العقبة']]},
  { c: 'Palestine', ar: 'فلسطين', cities: [['Jerusalem','القدس'],['Gaza','غزة'],['Hebron','الخليل'],['Nablus','نابلس']]},
  { c: 'Lebanon', ar: 'لبنان', cities: [['Beirut','بيروت'],['Tripoli','طرابلس']]},
  { c: 'Syria', ar: 'سوريا', cities: [['Damascus','دمشق'],['Aleppo','حلب'],['Homs','حمص']]},
  { c: 'Iraq', ar: 'العراق', cities: [['Baghdad','بغداد'],['Basra','البصرة'],['Erbil','أربيل'],['Mosul','الموصل']]},
  { c: 'Yemen', ar: 'اليمن', cities: [['Sanaa','صنعاء'],['Aden','عدن']]},
  { c: 'Sudan', ar: 'السودان', cities: [['Khartoum','الخرطوم'],['Omdurman','أم درمان'],['Port Sudan','بورتسودان']]},
  { c: 'Libya', ar: 'ليبيا', cities: [['Tripoli','طرابلس'],['Benghazi','بنغازي']]},
  { c: 'Tunisia', ar: 'تونس', cities: [['Tunis','تونس'],['Sfax','صفاقس']]},
  { c: 'Algeria', ar: 'الجزائر', cities: [['Algiers','الجزائر'],['Oran','وهران'],['Constantine','قسنطينة']]},
  { c: 'Morocco', ar: 'المغرب', cities: [['Rabat','الرباط'],['Casablanca','الدار البيضاء'],['Fes','فاس'],['Marrakech','مراكش']]},
  { c: 'Turkey', ar: 'تركيا', cities: [['Istanbul','إسطنبول'],['Ankara','أنقرة'],['Izmir','إزمير'],['Bursa','بورصة'],['Antalya','أنطاليا'],['Konya','قونيا'],['Adana','أضنة'],['Gaziantep','غازي عنتاب']]},
  { c: 'Indonesia', ar: 'إندونيسيا', cities: [['Jakarta','جاكرتا'],['Surabaya','سورابايا'],['Medan','ميدان']]},
  { c: 'Malaysia', ar: 'ماليزيا', cities: [['Kuala Lumpur','كوالالمبور'],['George Town','جورج تاون']]},
  { c: 'Pakistan', ar: 'باكستان', cities: [['Karachi','كراتشي'],['Lahore','لاهور'],['Islamabad','إسلام آباد']]},
  { c: 'India', ar: 'الهند', cities: [['New Delhi','نيودلهي'],['Mumbai','مومباي'],['Hyderabad','حيدر آباد']]},
  { c: 'United States', ar: 'أمريكا', cities: [['New York','نيويورك'],['Dearborn','ديربورن'],['Houston','هيوستن'],['Chicago','شيكاغو']]},
  { c: 'United Kingdom', ar: 'بريطانيا', cities: [['London','لندن'],['Birmingham','برمنغهام'],['Manchester','مانشستر']]},
  { c: 'France', ar: 'فرنسا', cities: [['Paris','باريس'],['Marseille','مارسيليا']]},
  { c: 'Germany', ar: 'ألمانيا', cities: [['Berlin','برلين'],['Hamburg','هامبورغ']]},
  { c: 'Canada', ar: 'كندا', cities: [['Toronto','تورونتو'],['Montreal','مونتريال']]}
];

// Fallback data (Damietta, Egypt) - only used for Damietta local emergency fallback
const FALLBACK = {
  Fajr: '05:15', Sunrise: '06:43', Dhuhr: '12:44',
  Asr: '16:10', Maghrib: '18:44', Isha: '20:03',
  hijri: { day: '15', monthEn: 'Rabīʿ al-Thānī', monthAr: 'ربيع الثاني', year: '1448' },
  greg: '2026-09-26',
  methodName: 'Egyptian General Authority of Survey',
  timezone: 'Africa/Cairo'
};

module.exports = {
  METHODS,
  AUTO_BY_COUNTRY,
  PRAYERS,
  AR_MONTHS,
  COUNTRIES,
  FALLBACK
};
