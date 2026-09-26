import { Component, OnInit, OnDestroy, HostListener, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PrayerService } from './core/services/prayer.service';
import { I18nService } from './core/services/i18n.service';
import { SettingsService } from './core/services/settings.service';
import { PrayerResponse, PrayerDef, PrayerState, Country, CalcMethod } from './core/models/prayer.model';

const PRAYERS: PrayerDef[] = [
  { id: 'fajr', ar: 'الفجر', en: 'Fajr' },
  { id: 'sunrise', ar: 'الشروق', en: 'Sunrise', ref: true },
  { id: 'dhuhr', ar: 'الظهر', en: 'Dhuhr' },
  { id: 'asr', ar: 'العصر', en: 'Asr' },
  { id: 'maghrib', ar: 'المغرب', en: 'Maghrib' },
  { id: 'isha', ar: 'العشاء', en: 'Isha' }
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  prayers = PRAYERS;
  data = signal<PrayerResponse | null>(null);
  loading = signal(false);
  geoLoading = signal(false);
  errorMessage = signal<string | null>(null);
  countries = signal<Country[]>([]);
  methods = signal<CalcMethod[]>([]);

  // Sheets
  locSheetOpen = signal(false);
  setSheetOpen = signal(false);

  // Location sheet temp values
  tempCountry = '';
  tempCity = '';
  tempMethod = '';

  // Settings sheet temp values
  tempSchool = '';
  tempTimeFormat: '12h' | '24h' = '12h';
  tempOffsets: Record<string, number> = {};

  // Countdown & Time keeping
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private midnightTimer: ReturnType<typeof setTimeout> | null = null;
  nowMin = signal(0);

  currentState = computed<PrayerState | null>(() => {
    const d = this.data();
    const n = this.nowMin();
    if (!d) return null;
    return this.calcState(d, n);
  });

  heroTimer = signal('--:--:--');
  heroTimerLabel = signal('');

  constructor(
    public i18n: I18nService,
    public settings: SettingsService,
    private prayerSvc: PrayerService
  ) {}

  ngOnInit(): void {
    // Apply saved language & direction
    document.documentElement.lang = this.i18n.lang();
    document.documentElement.dir = this.i18n.dir();

    // Initial data fetch
    this.loadCountries();
    this.loadMethods();

    // Check if user has explicitly saved settings or should request auto location
    const hasSavedSettings = localStorage.getItem('salat-settings');
    if (!hasSavedSettings && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      // First visit: automatically request location permission
      this.detectLocation(false);
    } else {
      this.fetchTimings();
    }

    // Start 1-second ticker
    this.updateNow();
    this.tickInterval = setInterval(() => {
      this.updateNow();
      this.updateHeroTimer();
    }, 1000);

    // Schedule automatic midnight refresh
    this.scheduleMidnightRefresh();
  }

  ngOnDestroy(): void {
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.midnightTimer) clearTimeout(this.midnightTimer);
  }

  // Accessibility: Close sheets on Escape key
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.locSheetOpen()) this.locSheetOpen.set(false);
    if (this.setSheetOpen()) this.setSheetOpen.set(false);
  }

  // ─── Automatic Geolocation ───────────
  detectLocation(showFeedback = true): void {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      if (showFeedback) {
        this.errorMessage.set(this.i18n.t('locDenied'));
      }
      this.fetchTimings();
      return;
    }

    this.geoLoading.set(true);
    this.errorMessage.set(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const s = this.settings.current;

        this.prayerSvc.getTimingsByCoords(lat, lng, s.method, s.school).subscribe({
          next: (res) => {
            this.data.set(res);
            this.geoLoading.set(false);
            this.loading.set(false);

            // Update user settings with detected city/country
            const newCity = res.city || s.city;
            const newCountry = res.country || s.country;
            this.settings.update({
              city: newCity,
              country: newCountry,
              isAutoLocation: true
            });

            this.locSheetOpen.set(false);
            this.updateNow();
            this.updateHeroTimer();
            this.scheduleMidnightRefresh();
          },
          error: (err) => {
            this.geoLoading.set(false);
            if (showFeedback) {
              this.errorMessage.set(err.error?.message || this.i18n.t('locDenied'));
            }
            this.fetchTimings();
          }
        });
      },
      (err) => {
        this.geoLoading.set(false);
        if (showFeedback) {
          this.errorMessage.set(this.i18n.t('locDenied'));
        }
        if (!this.data()) {
          this.fetchTimings();
        }
      },
      {
        timeout: 10000,
        enableHighAccuracy: true
      }
    );
  }

  // ─── Data Fetching ────────────────────
  fetchTimings(): void {
    const s = this.settings.current;
    this.loading.set(true);
    this.errorMessage.set(null);

    this.prayerSvc.getTimings(s.city, s.country, s.method, s.school).subscribe({
      next: (res) => {
        this.data.set(res);
        this.loading.set(false);
        this.updateNow();
        this.updateHeroTimer();
        this.scheduleMidnightRefresh();
      },
      error: (err) => {
        this.loading.set(false);
        const msg = err.error?.message || this.i18n.t('errFetch');
        this.errorMessage.set(msg);
      }
    });
  }

  loadCountries(): void {
    this.prayerSvc.getCountries(this.i18n.lang()).subscribe({
      next: (c) => this.countries.set(c),
      error: () => {}
    });
  }

  loadMethods(): void {
    this.prayerSvc.getMethods().subscribe({
      next: (m) => this.methods.set(m),
      error: () => {}
    });
  }

  // ─── Timezone-Aware Time Calculation ─
  private updateNow(): void {
    const tz = this.data()?.timezone;
    if (tz && tz !== 'UTC') {
      try {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          hour12: false,
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric'
        }).formatToParts(new Date());

        let h = 0, m = 0, s = 0;
        for (const p of parts) {
          if (p.type === 'hour') {
            const parsed = parseInt(p.value, 10);
            h = parsed === 24 ? 0 : parsed;
          } else if (p.type === 'minute') {
            m = parseInt(p.value, 10);
          } else if (p.type === 'second') {
            s = parseInt(p.value, 10);
          }
        }
        this.nowMin.set(h * 60 + m + s / 60);
        return;
      } catch {
        // Fallback to local browser time
      }
    }

    const now = new Date();
    this.nowMin.set(now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60);
  }

  private scheduleMidnightRefresh(): void {
    if (this.midnightTimer) clearTimeout(this.midnightTimer);

    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    const msUntilMidnight = Math.max(1000, tomorrow.getTime() - now.getTime());

    this.midnightTimer = setTimeout(() => {
      this.fetchTimings();
      this.scheduleMidnightRefresh();
    }, msUntilMidnight);
  }

  private toMin(hm: string): number {
    if (!hm || typeof hm !== 'string') return 0;
    const clean = hm.split(' ')[0].trim();
    const p = clean.split(':');
    if (p.length < 2) return 0;
    const h = parseInt(p[0], 10);
    const m = parseInt(p[1], 10);
    return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
  }

  capId(id: string): string {
    return id.charAt(0).toUpperCase() + id.slice(1);
  }

  private calcState(d: PrayerResponse, nowMin: number): PrayerState {
    const order = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
    const offsets = this.settings.current.iqamaOffsets;

    for (const id of order) {
      const key = this.capId(id) as keyof typeof d.timings;
      const am = this.toMin(d.timings[key]);
      const isRef = id === 'sunrise';

      if (nowMin < am) {
        return { mode: 'athan', prayer: id, target: am };
      }
      if (!isRef) {
        const offsetVal = offsets[id] !== undefined ? offsets[id] : 0;
        const iq = am + offsetVal;
        if (offsetVal > 0 && nowMin < iq) {
          return { mode: 'iqama', prayer: id, target: iq };
        }
      }
    }
    // After isha -> tomorrow fajr
    return { mode: 'athan', prayer: 'fajr', target: this.toMin(d.timings.Fajr) + 1440 };
  }

  private updateHeroTimer(): void {
    const st = this.currentState();
    if (!st) return;
    const diffSec = Math.max(0, Math.round((st.target - this.nowMin()) * 60));

    if (st.mode === 'iqama') {
      this.heroTimerLabel.set(this.i18n.t('remI'));
      this.heroTimer.set(this.formatMS(diffSec));
    } else if (st.prayer === 'sunrise') {
      this.heroTimerLabel.set(this.i18n.t('remS'));
      this.heroTimer.set(this.formatHMS(diffSec));
    } else {
      this.heroTimerLabel.set(this.i18n.t('remA'));
      this.heroTimer.set(this.formatHMS(diffSec));
    }
  }

  // ─── Format Helpers ──────────────────
  pad(n: number): string {
    return n < 10 ? '0' + n : '' + n;
  }

  formatHMS(sec: number): string {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${this.pad(h)}:${this.pad(m)}:${this.pad(s)}`;
  }

  formatMS(sec: number): string {
    sec = Math.max(0, Math.floor(sec));
    if (sec >= 3600) {
      return this.formatHMS(sec);
    }
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${this.pad(m)}:${this.pad(s)}`;
  }

  // 12-Hour vs 24-Hour display format
  formatDisplayTime(hm: string): string {
    if (!hm || hm === '--:--') return '--:--';
    const clean = hm.split(' ')[0].trim();
    if (this.settings.current.timeFormat === '24h') {
      return clean;
    }
    const p = clean.split(':');
    if (p.length < 2) return clean;
    let h = parseInt(p[0], 10);
    const m = p[1];
    if (isNaN(h)) return clean;
    const isPm = h >= 12;
    h = h % 12;
    if (h === 0) h = 12;
    const suffix = isPm ? this.i18n.t('pm') : this.i18n.t('am');
    return `${h}:${m} ${suffix}`;
  }

  getCountdown(targetMin: number, fmt: string = 'hms'): string {
    const diffSec = Math.max(0, Math.round((targetMin - this.nowMin()) * 60));
    return fmt === 'ms' ? this.formatMS(diffSec) : this.formatHMS(diffSec);
  }

  // ─── Prayer Card Helpers ─────────────
  getRawPrayerTime(id: string): string {
    const d = this.data();
    if (!d || !d.timings) return '--:--';
    const key = this.capId(id) as keyof typeof d.timings;
    return d.timings[key] || '--:--';
  }

  getPrayerTime(id: string): string {
    return this.formatDisplayTime(this.getRawPrayerTime(id));
  }

  getPrayerMin(id: string): number {
    return this.toMin(this.getRawPrayerTime(id));
  }

  getCardClass(p: PrayerDef): string {
    const st = this.currentState();
    if (!st || !this.data()) return '';

    const am = this.getPrayerMin(p.id);
    const offsets = this.settings.current.iqamaOffsets;
    const n = this.nowMin();

    if (p.ref) {
      if (st.prayer === p.id && st.mode === 'athan') return 'is-next';
      if (n >= am) return 'is-past';
      return '';
    }

    const offsetVal = offsets[p.id] !== undefined ? offsets[p.id] : 0;
    const iq = am + offsetVal;
    if (st.prayer === p.id && st.mode === 'iqama') return 'is-iqama';
    if (st.prayer === p.id && st.mode === 'athan') return 'is-next';
    if (n >= (offsetVal > 0 ? iq : am)) return 'is-past';
    return '';
  }

  getChipText(p: PrayerDef): string {
    const cls = this.getCardClass(p);
    if (cls === 'is-next') return this.i18n.t('next');
    if (cls === 'is-iqama') return this.i18n.t('now');
    if (cls === 'is-past' && !p.ref) return this.i18n.t('done');
    return '';
  }

  hasCountdown(p: PrayerDef): boolean {
    const st = this.currentState();
    if (!st || !this.data()) return false;

    const am = this.getPrayerMin(p.id);
    const n = this.nowMin();
    const offsets = this.settings.current.iqamaOffsets;

    if (!p.ref) {
      const offsetVal = offsets[p.id] !== undefined ? offsets[p.id] : 0;
      const iq = am + offsetVal;
      if (st.prayer === p.id && st.mode === 'iqama') return true;
      if (n < am) return true;
    } else if (n < am) {
      return true;
    }
    return false;
  }

  getCardCountdown(p: PrayerDef): string {
    const st = this.currentState();
    if (!st || !this.data()) return '';

    const am = this.getPrayerMin(p.id);
    const offsets = this.settings.current.iqamaOffsets;

    if (!p.ref && st.prayer === p.id && st.mode === 'iqama') {
      const iq = am + (offsets[p.id] || 0);
      return this.i18n.t('inWord') + ' ' + this.getCountdown(iq, 'ms');
    }
    if (this.nowMin() < am) {
      return this.i18n.t('inWord') + ' ' + this.getCountdown(am, 'hms');
    }
    return '';
  }

  // ─── Hero Section ────────────────────
  getHeroPrayerDef(): PrayerDef {
    const st = this.currentState();
    return PRAYERS.find(p => p.id === (st?.prayer || 'fajr')) || PRAYERS[0];
  }

  getHeroRawTime(): string {
    const st = this.currentState();
    if (!st || !this.data()) return '--:--';
    if (st.mode === 'iqama') {
      const am = this.getPrayerMin(st.prayer);
      const offsets = this.settings.current.iqamaOffsets;
      const iqMin = am + (offsets[st.prayer] || 0);
      return `${this.pad(Math.floor(iqMin / 60) % 24)}:${this.pad(iqMin % 60)}`;
    }
    return this.getRawPrayerTime(st.prayer);
  }

  getHeroTime(): string {
    return this.formatDisplayTime(this.getHeroRawTime());
  }

  getHeroSub(): string {
    const st = this.currentState();
    if (!st || !this.data() || st.mode !== 'iqama') return '';
    const athanHM = this.formatDisplayTime(this.getRawPrayerTime(st.prayer));
    const heroTime = this.getHeroTime();
    const prefix = this.i18n.t('athanAt') + ' ';
    return `${prefix}${athanHM} · ${heroTime}`;
  }

  isIqamaMode(): boolean {
    return this.currentState()?.mode === 'iqama';
  }

  // ─── Date Display ────────────────────
  getDateDisplay(): string {
    const d = this.data();
    if (!d) return '';
    const now = new Date();
    const greg = this.i18n.formatGregorian(now);
    const hijri = d.hijri && d.hijri.day
      ? `${d.hijri.day} ${this.i18n.lang() === 'ar' ? d.hijri.monthAr : d.hijri.monthEn} ${d.hijri.year}${this.i18n.lang() === 'ar' ? 'هـ' : ' AH'}`
      : '';
    return hijri ? `${greg} · ${hijri}` : greg;
  }

  getLocationDisplay(): string {
    const s = this.settings.current;
    const sep = this.i18n.lang() === 'ar' ? '، ' : ', ';

    const c = this.countries().find(x => x.code === s.country);
    if (c) {
      const city = c.cities.find(x => x.code === s.city);
      return `${city?.name || s.city}${sep}${c.name}`;
    }
    return s.country ? `${s.city}${sep}${s.country}` : s.city;
  }

  // ─── Location Sheet ──────────────────
  openLocSheet(): void {
    const s = this.settings.current;
    this.tempCountry = s.country;
    this.tempCity = s.city;
    this.tempMethod = s.method;
    this.loadCountries();
    this.locSheetOpen.set(true);
  }

  getCitiesForCountry(): { code: string; name: string }[] {
    const c = this.countries().find(x => x.code === this.tempCountry);
    return c?.cities || [];
  }

  onTempCountryChange(): void {
    const cities = this.getCitiesForCountry();
    if (cities.length && !cities.find(c => c.code === this.tempCity)) {
      this.tempCity = cities[0].code;
    }
  }

  saveLocation(): void {
    this.settings.update({
      city: this.tempCity,
      country: this.tempCountry,
      method: this.tempMethod,
      isAutoLocation: false
    });
    this.locSheetOpen.set(false);
    this.fetchTimings();
  }

  // ─── Settings Sheet ──────────────────
  openSetSheet(): void {
    const s = this.settings.current;
    this.tempSchool = s.school;
    this.tempTimeFormat = s.timeFormat || '12h';
    this.tempOffsets = { ...s.iqamaOffsets };
    this.setSheetOpen.set(true);
  }

  saveSettings(): void {
    for (const key of Object.keys(this.tempOffsets)) {
      this.tempOffsets[key] = Math.max(0, Math.min(60, +this.tempOffsets[key] || 0));
    }
    this.settings.update({
      school: this.tempSchool,
      timeFormat: this.tempTimeFormat,
      iqamaOffsets: this.tempOffsets as any
    });
    this.setSheetOpen.set(false);
    this.fetchTimings();
  }

  // ─── Language ────────────────────────
  toggleLang(): void {
    this.i18n.toggle();
    this.loadCountries();
  }

  get iqamaPrayers(): PrayerDef[] {
    return PRAYERS.filter(p => !p.ref);
  }
}
