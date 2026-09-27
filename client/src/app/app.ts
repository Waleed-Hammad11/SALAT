import { Component, OnInit, OnDestroy, HostListener, Injector, signal, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PrayerService } from './core/services/prayer.service';
import { I18nService } from './core/services/i18n.service';
import { SettingsService } from './core/services/settings.service';
import { PrayerStateService } from './core/services/prayer-state.service';
import { AudioService } from './core/services/audio.service';
import { Subscription } from 'rxjs';
import { ThemeChoice, ThemeService } from './core/services/theme.service';
import { PrayerResponse, PrayerDef, Country, CalcMethod } from './core/models/prayer.model';

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
  //
  // Phase 2: the 1 Hz clock, the countdown state and the arrival event moved to
  // PrayerStateService. This component keeps ONE timer handle — the midnight
  // refresh, which drives fetchTimings() and therefore this component's own
  // `loading` / `errorMessage` state. The service owns the arrival clock, not
  // the refresh clock.
  private midnightTimer: ReturnType<typeof setTimeout> | null = null;

  // Athan audio subscription
  athanSubscription: Subscription | null = null;

  // Template-facing: app.html:52 and app.html:54 read these two names. They are
  // the service's own signals, not copies — aliasing keeps the template working
  // unchanged and guarantees there is exactly one countdown in the app.
  readonly heroTimer: Signal<string>;
  readonly heroTimerLabel: Signal<string>;

  // Theme (Phase 3) — the one DI member added in this phase.
  //
  // PHASE 3 POINTER: ThemeService is deliberately NOT a constructor parameter.
  // A constructor parameter is a field initializer, so it would be constructed
  // before ngOnInit — and ngOnInit reads the EXISTENCE of 'salat-settings' as
  // its first-visit geolocation flag (see below). ThemeService writes no
  // storage on construction, so it is safe either way, but making that safety
  // load-bearing on a different file's invariant is a trap. Injecting the
  // Injector instead (which has no side effects whatsoever) and resolving
  // ThemeService lazily on first use keeps the guarantee local and obvious.
  constructor(
    public i18n: I18nService,
    public settings: SettingsService,
    private prayerSvc: PrayerService,
    private prayerState: PrayerStateService,
    private audioSvc: AudioService,
    private injector: Injector
  ) {
    this.heroTimer = this.prayerState.heroTimer;
    this.heroTimerLabel = this.prayerState.heroTimerLabel;
  }

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

    // Start the 1-second ticker: resolves the city clock and the hero timer
    // synchronously (so the first painted frame is not zero), seeds the arrival
    // baseline, then arms the interval.
    this.prayerState.start();

    // Athan fires on arrival — the arrival carries the prayer that is due, which
    // is NOT the next one the hero card is already counting down to.
    this.athanSubscription = this.prayerState.prayerArrived$.subscribe(arrival => {
      this.audioSvc.playAthan(arrival.prayerId);
    });

    // Prime audio on the first gesture; browsers block unattended playback.
    // `{ once: true }` is enough — unlock() is idempotent, so whichever event
    // lands first wins and the other listener never gets a useful second run.
    addEventListener('pointerdown', () => this.audioSvc.unlock(), { once: true });
    addEventListener('keydown', () => this.audioSvc.unlock(), { once: true });

    // Schedule automatic midnight refresh
    this.scheduleMidnightRefresh();
  }

  ngOnDestroy(): void {
    this.prayerState.stop();
    if (this.midnightTimer) clearTimeout(this.midnightTimer);
    if (this.athanSubscription) this.athanSubscription.unsubscribe();
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
            this.prayerState.setTimings(res);
            this.prayerState.syncNow();
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
        this.prayerState.setTimings(res);
        this.prayerState.syncNow();
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

  // ─── Midnight Refresh ───────────────
  // Stays in the component: it fires fetchTimings(), which manages this
  // component's `loading` and `errorMessage`. The service owns the arrival
  // clock, not the refresh clock. Phase 2 moved the timezone-aware clock itself
  // (App.updateNow → PrayerStateService.resolveNowMin, a rename only).
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

  // ─── Time Helpers ───────────────────
  //
  // PHASE 2 POINTER: toMin, capId, pad, formatHMS and formatMS now also exist on
  // PrayerStateService, which is where the countdown state and the arrival event
  // read them. The copies below stay because this component's own display
  // methods still call them directly:
  //   capId      → getRawPrayerTime   (and getPrayerMin → getPrayerTime, app.html:106)
  //   toMin      → getPrayerMin
  //   pad        → getHeroRawTime
  //   formatHMS  → getCountdown
  //   formatMS   → getCountdown
  // The duplication is deliberate and scoped to this one phase — a third shared
  // module is explicitly out of scope. Collapsing it is a later phase's job, and
  // any such change must be behaviour-preserving.
  toMin(hm: string): number {
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
    const diffSec = Math.max(0, Math.round((targetMin - this.prayerState.nowMin()) * 60));
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
    const st = this.prayerState.currentState();
    if (!st || !this.data()) return '';

    const am = this.getPrayerMin(p.id);
    const offsets = this.settings.current.iqamaOffsets;
    const n = this.prayerState.nowMin();

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
    const st = this.prayerState.currentState();
    if (!st || !this.data()) return false;

    const am = this.getPrayerMin(p.id);
    const n = this.prayerState.nowMin();
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
    const st = this.prayerState.currentState();
    if (!st || !this.data()) return '';

    const am = this.getPrayerMin(p.id);
    const offsets = this.settings.current.iqamaOffsets;

    if (!p.ref && st.prayer === p.id && st.mode === 'iqama') {
      const iq = am + (offsets[p.id] || 0);
      return this.i18n.t('inWord') + ' ' + this.getCountdown(iq, 'ms');
    }
    if (this.prayerState.nowMin() < am) {
      return this.i18n.t('inWord') + ' ' + this.getCountdown(am, 'hms');
    }
    return '';
  }

  // ─── Hero Section ────────────────────
  getHeroPrayerDef(): PrayerDef {
    const st = this.prayerState.currentState();
    return PRAYERS.find(p => p.id === (st?.prayer || 'fajr')) || PRAYERS[0];
  }

  getHeroRawTime(): string {
    const st = this.prayerState.currentState();
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
    const st = this.prayerState.currentState();
    if (!st || !this.data() || st.mode !== 'iqama') return '';
    const athanHM = this.formatDisplayTime(this.getRawPrayerTime(st.prayer));
    const heroTime = this.getHeroTime();
    const prefix = this.i18n.t('athanAt') + ' ';
    return `${prefix}${athanHM} · ${heroTime}`;
  }

  isIqamaMode(): boolean {
    return this.prayerState.currentState()?.mode === 'iqama';
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

  // ─── Athan Audio ──────────────────
  //
  // Plays itself on arrival (see ngOnInit). The only control is mute.
  isPlayingAthan(): boolean {
    return this.audioSvc.playing();
  }

  muteAthan(): void {
    this.audioSvc.mute();
  }

  // ─── Theme (Phase 3) ─────────────────
  //
  // Resolved lazily and memoized, on FIRST USE — which in practice means the
  // first time the settings sheet is opened, or a theme button is clicked,
  // because the control sits behind *ngIf="setSheetOpen()". That is stronger
  // than the "safe either way" argument above: with the sheet never opened,
  // ThemeService is never constructed at all, so no code path here can create
  // the first-visit key. app.theme.spec.ts pins both halves of that.
  private themeSvc: ThemeService | null = null;
  private get theme(): ThemeService {
    return (this.themeSvc ??= this.injector.get(ThemeService));
  }

  /** The user's stored choice — 'system' is a valid answer here. */
  themeChoice(): ThemeChoice {
    return this.theme.theme();
  }

  /** Applies and persists immediately. Deliberately NOT routed through saveSettings(). */
  setTheme(choice: ThemeChoice): void {
    this.theme.setTheme(choice);
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
