import { Injectable, signal, computed } from '@angular/core';

export type Lang = 'ar' | 'en';

interface Translations {
  [key: string]: string;
}

const T: Record<Lang, Translations> = {
  ar: {
    brand: 'مواقيت الصلاة', today: 'صلوات اليوم', myCity: 'مدينتي', change: 'تغيير',
    remA: 'متبقي على الأذان', remI: 'متبقي على الإقامة', remS: 'متبقي على الشروق',
    locSheet: 'الموقع وطريقة الحساب', cityL: 'المدينة / المحافظة', countryL: 'الدولة',
    methodL: 'طريقة الحساب', methodHint: 'اتركها على "تلقائي" — بنختار الطريقة الرسمية حسب الدولة.',
    save: 'حفظ', cancel: 'إلغاء', setSheet: 'الإعدادات',
    schoolL: 'دقة الحساب (مذهب العصر)', schoolSh: 'شافعي (الجمهور)', schoolHa: 'حنفي',
    iqamaT: 'مهلة الإقامة بعد الأذان (دقائق)',
    offHint: 'لما ييجي وقت الأذان، بنبدأ عدّاد الإقامة بالمدة دي لكل صلاة.',
    errFetch: 'تعذّر جلب المواقيت — تحقق من الاتصال أو اسم المدينة.',
    errGeneric: 'تعذر الاتصال بالخادم — يرجى إعادة المحاولة.',
    retry: 'إعادة المحاولة',
    offline: 'بيانات محفوظة (وضع غير متصل)',
    live: 'مباشر', next: 'القادمة', now: 'الإقامة الآن', done: 'تمت',
    athanAt: 'الأذان', iqamaAt: 'الإقامة', inWord: 'بعد',
    locTz: 'التوقيت المحلي لمدينة',
    langSwitch: 'EN'
  },
  en: {
    brand: 'Prayer Times', today: "Today's Prayers", myCity: 'My City', change: 'Change',
    remA: 'Athan in', remI: 'Iqama in', remS: 'Sunrise in',
    locSheet: 'Location & Calculation', cityL: 'City / Governorate', countryL: 'Country',
    methodL: 'Method', methodHint: 'Leave on Auto — we pick the official method per country.',
    save: 'Save', cancel: 'Cancel', setSheet: 'Settings',
    schoolL: 'Calculation precision (Asr school)', schoolSh: "Shafi'i (majority)", schoolHa: 'Hanafi',
    iqamaT: 'Iqama delay after Athan (minutes)',
    offHint: 'When Athan arrives, the Iqama countdown starts with this delay per prayer.',
    errFetch: 'Could not fetch times — check connection or city name.',
    errGeneric: 'Could not reach server — please try again.',
    retry: 'Retry',
    offline: 'Saved data (offline mode)',
    live: 'Live', next: 'Next', now: 'Iqama now', done: 'Done',
    athanAt: 'Athan', iqamaAt: 'Iqama', inWord: 'in',
    locTz: 'Local time for',
    langSwitch: 'ع'
  }
};

const AR_WDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const AR_GMONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

@Injectable({ providedIn: 'root' })
export class I18nService {
  private _lang = signal<Lang>(this.loadLang());

  lang = this._lang.asReadonly();
  isRtl = computed(() => this._lang() === 'ar');
  dir = computed(() => this._lang() === 'ar' ? 'rtl' : 'ltr');

  t(key: string): string {
    return T[this._lang()][key] || key;
  }

  toggle(): void {
    const next = this._lang() === 'ar' ? 'en' : 'ar';
    this._lang.set(next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr';
    try { localStorage.setItem('salat-lang', next); } catch {}
  }

  formatGregorian(d: Date): string {
    if (this._lang() === 'ar') {
      return `${AR_WDAYS[d.getDay()]} ${d.getDate()} ${AR_GMONTHS[d.getMonth()]} ${d.getFullYear()}`;
    }
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  private loadLang(): Lang {
    try {
      const saved = localStorage.getItem('salat-lang');
      if (saved === 'ar' || saved === 'en') return saved;
    } catch {}
    return 'ar';
  }
}
