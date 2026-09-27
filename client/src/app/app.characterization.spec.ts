import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { App } from './app';
import { PrayerService } from './core/services/prayer.service';
import { SettingsService } from './core/services/settings.service';
import {
  CalcMethod,
  Country,
  IqamaOffsets,
  PrayerDef,
  PrayerResponse
} from './core/models/prayer.model';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2 — CHARACTERIZATION SPEC (written FIRST, before any production code
// moved).
//
// This is the before-picture. Phase 2 extracts the time logic out of `App` into
// `PrayerStateService`; these assertions are what prove the move preserved
// behaviour. They are deliberately written against the component's PUBLIC
// surface only, and deliberately drive `data` through the HTTP path
// (`fetchTimings` → stubbed `PrayerService`) rather than by poking at a signal,
// so the same assertions stay valid before AND after the delegation.
//
// Phase 1 carry-forwards honoured here:
//   · no `describe`/`it`/`expect` import — tsconfig.spec.json supplies them
//     via "types": ["vitest/globals"].
//   · every TestBed spec calls fixture.detectChanges() (the app is zoneless).
//   · time is controlled with vi.setSystemTime(), never by sleeping.
// ─────────────────────────────────────────────────────────────────────────────

// UTC+3 all year (no DST), so city time is exactly `h - 3` in UTC below and
// every expectation in this file is machine-timezone independent.
const TZ = 'Asia/Riyadh';

/** City-local (Riyadh) wall clock on 2026-01-15 → an absolute instant. */
function city(h: number, m: number, s = 0): Date {
  return new Date(Date.UTC(2026, 0, 15, h - 3, m, s));
}

const DEFAULT_OFFSETS: IqamaOffsets = { fajr: 25, dhuhr: 20, asr: 15, maghrib: 10, isha: 20 };

function payload(overrides: Partial<PrayerResponse> = {}): PrayerResponse {
  return {
    city: 'Riyadh',
    country: 'Saudi Arabia',
    timings: {
      Fajr: '04:32',
      Sunrise: '05:58',
      Dhuhr: '12:14',
      Asr: '15:41',
      Maghrib: '18:22',
      Isha: '19:52'
    },
    hijri: { day: '5', monthEn: 'Rabi al-Awwal', monthAr: 'ربيع الأول', year: '1447' },
    gregorian: '2026-01-15',
    methodName: 'Umm Al-Qura',
    timezone: TZ,
    cached: false,
    ...overrides
  };
}

/** Swapped per test by `render()` so the stubbed fetch can return anything. */
let served: PrayerResponse = payload();

class PrayerServiceStub {
  getTimings(): Observable<PrayerResponse> {
    return of(served);
  }
  getTimingsByCoords(): Observable<PrayerResponse> {
    return of(served);
  }
  getCountries(): Observable<Country[]> {
    return of([]);
  }
  getMethods(): Observable<CalcMethod[]> {
    return of([]);
  }
}

interface RenderOpts {
  timeFormat?: '12h' | '24h';
  offsets?: IqamaOffsets;
  payload?: PrayerResponse;
}

function render(instant: Date, opts: RenderOpts = {}) {
  // 'en' so the assertions below are readable; I18nService reads this at
  // construction, so it must be set before TestBed creates anything.
  localStorage.setItem('salat-lang', 'en');
  // A saved-settings key also makes ngOnInit take the `fetchTimings()` branch
  // deterministically instead of probing for geolocation.
  localStorage.setItem(
    'salat-settings',
    JSON.stringify({ city: 'Riyadh', country: 'Saudi Arabia', timeFormat: opts.timeFormat ?? '24h' })
  );
  served = opts.payload ?? payload();

  // The hero timer is only recomputed by a ticker step, so the clock is parked
  // one second before the instant and then stepped forward onto it. Every
  // assertion below is therefore evaluated at exactly `instant`.
  vi.setSystemTime(new Date(instant.getTime() - 1000));

  TestBed.configureTestingModule({
    providers: [{ provide: PrayerService, useValue: new PrayerServiceStub() }]
  });
  const fixture = TestBed.createComponent(App);

  // Zoneless app: nothing ambient drives the first render.
  fixture.detectChanges();

  if (opts.offsets) {
    TestBed.inject(SettingsService).update({ iqamaOffsets: opts.offsets });
  }

  const tickTo = (t: Date) => {
    vi.setSystemTime(new Date(t.getTime() - 1000));
    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
  };
  tickTo(instant);

  return { fixture, cmp: fixture.componentInstance, tickTo };
}

function card(cmp: App, id: string): PrayerDef {
  return cmp.prayers.find(p => p.id === id)!;
}

describe('App — prayer-time state characterization (pre-move before-picture)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('before fajr: fajr is the next prayer, counted down at ATHAN time', () => {
    const { cmp } = render(city(4, 31, 0));

    expect(cmp.getCardClass(card(cmp, 'fajr'))).toBe('is-next');
    expect(cmp.getChipText(card(cmp, 'fajr'))).toBe('Next');
    expect(cmp.getCardClass(card(cmp, 'sunrise'))).toBe('');
    expect(cmp.getCardClass(card(cmp, 'isha'))).toBe('');

    expect(cmp.getHeroTime()).toBe('04:32');
    expect(cmp.getHeroSub()).toBe('');
    expect(cmp.heroTimerLabel()).toBe('Athan in');
    expect(cmp.heroTimer()).toBe('00:01:00');
  });

  it('iqama window open: mode flips to iqama and the hero shows the iqama time', () => {
    // fajr athan 04:32 + 25 min iqama = 04:57. City time 04:45 is inside.
    const { cmp } = render(city(4, 45, 0));

    expect(cmp.isIqamaMode()).toBe(true);
    expect(cmp.getCardClass(card(cmp, 'fajr'))).toBe('is-iqama');
    expect(cmp.getChipText(card(cmp, 'fajr'))).toBe('Iqama now');

    expect(cmp.getHeroTime()).toBe('04:57');
    expect(cmp.getHeroSub()).toBe('Athan 04:32 · 04:57');
    expect(cmp.heroTimerLabel()).toBe('Iqama in');
    expect(cmp.heroTimer()).toBe('12:00');
  });

  it('iqama window closed: the countdown target advances to sunrise', () => {
    const { cmp } = render(city(5, 10, 0));

    expect(cmp.isIqamaMode()).toBe(false);
    expect(cmp.getCardClass(card(cmp, 'fajr'))).toBe('is-past');
    expect(cmp.getCardClass(card(cmp, 'sunrise'))).toBe('is-next');

    expect(cmp.getHeroTime()).toBe('05:58');
    expect(cmp.getHeroSub()).toBe('');
    expect(cmp.heroTimerLabel()).toBe('Sunrise in');
    expect(cmp.heroTimer()).toBe('00:48:00');
  });

  it('sunrise is excluded from iqama even when an offset is configured for it', () => {
    // A `sunrise` offset of 30 would, without the ref-skip in calcState, put the
    // hero into iqama mode for sunrise somewhere in 05:58–06:28. It does not.
    const { cmp } = render(city(6, 10, 0), { offsets: { ...DEFAULT_OFFSETS, sunrise: 30 } });

    expect(cmp.getCardClass(card(cmp, 'sunrise'))).not.toBe('is-iqama');
    expect(cmp.getCardClass(card(cmp, 'sunrise'))).toBe('is-past');
    expect(cmp.getCardClass(card(cmp, 'dhuhr'))).toBe('is-next');
    expect(cmp.isIqamaMode()).toBe(false);
    expect(cmp.getHeroTime()).toBe('12:14');
    expect(cmp.heroTimer()).toBe('06:04:00');
  });

  it('at the exact athan minute the hero is already in iqama mode', () => {
    // nowMin == Dhuhr (734) → the `nowMin < am` athan branch is already missed,
    // so calcState lands on the iqama branch. Characterized, not endorsed.
    const { cmp } = render(city(12, 14, 0));

    expect(cmp.isIqamaMode()).toBe(true);
    expect(cmp.getCardClass(card(cmp, 'dhuhr'))).toBe('is-iqama');
    expect(cmp.getHeroTime()).toBe('12:34');
    expect(cmp.getHeroSub()).toBe('Athan 12:14 · 12:34');
    expect(cmp.heroTimer()).toBe('20:00');
  });

  it('post-isha: the target rolls over to fajr + 1440 while the hero time stays the raw fajr', () => {
    const { cmp } = render(city(21, 0, 0));

    // 1712 = 04:32 + 1440. The displayed time is still today's raw '04:32' —
    // the rollover only affects the countdown. Known quirk, pinned here.
    expect(cmp.getHeroTime()).toBe('04:32');
    expect(cmp.getHeroSub()).toBe('');
    expect(cmp.heroTimerLabel()).toBe('Athan in');
    expect(cmp.heroTimer()).toBe('07:32:00');

    // The rollover state names fajr as `st.prayer` in athan mode, so the fajr
    // card is highlighted "next" again rather than marked past — the `is-past`
    // branch is unreachable for it. Pinned so the move cannot quietly change it.
    expect(cmp.getCardClass(card(cmp, 'fajr'))).toBe('is-next');
    expect(cmp.getCardClass(card(cmp, 'isha'))).toBe('is-past');
    expect(cmp.getCardClass(card(cmp, 'sunrise'))).toBe('is-past');
  });

  it('late evening: the +1440 rollover keeps counting down toward tomorrow fajr', () => {
    const { cmp } = render(city(23, 30, 0));

    expect(cmp.heroTimerLabel()).toBe('Athan in');
    expect(cmp.heroTimer()).toBe('05:02:00');
    expect(cmp.getHeroTime()).toBe('04:32');
  });

  it('ticking across isha walks athan → iqama → the +1440 rollover', () => {
    const { cmp, tickTo } = render(city(19, 51, 0));

    expect(cmp.isIqamaMode()).toBe(false);
    expect(cmp.getCardClass(card(cmp, 'isha'))).toBe('is-next');
    expect(cmp.getHeroTime()).toBe('19:52');
    expect(cmp.heroTimer()).toBe('00:01:00');

    // 19:52:00 is exactly the isha athan minute, so the state is iqama (+20).
    tickTo(city(19, 52, 0));
    expect(cmp.isIqamaMode()).toBe(true);
    expect(cmp.getCardClass(card(cmp, 'isha'))).toBe('is-iqama');
    expect(cmp.getHeroTime()).toBe('20:12');
    expect(cmp.heroTimerLabel()).toBe('Iqama in');
    expect(cmp.heroTimer()).toBe('20:00');

    // Past the isha iqama, the loop falls through to tomorrow's fajr + 1440.
    tickTo(city(20, 14, 0));
    expect(cmp.isIqamaMode()).toBe(false);
    expect(cmp.getCardClass(card(cmp, 'isha'))).toBe('is-past');
    expect(cmp.getCardClass(card(cmp, 'fajr'))).toBe('is-next');
    expect(cmp.getHeroTime()).toBe('04:32');
    expect(cmp.heroTimerLabel()).toBe('Athan in');
    expect(cmp.heroTimer()).toBe('08:18:00');
  });

  it('renders every raw prayer time through formatDisplayTime (24h)', () => {
    const { cmp } = render(city(4, 31, 0));

    expect([
      cmp.getPrayerTime('fajr'),
      cmp.getPrayerTime('sunrise'),
      cmp.getPrayerTime('dhuhr'),
      cmp.getPrayerTime('asr'),
      cmp.getPrayerTime('maghrib'),
      cmp.getPrayerTime('isha')
    ]).toEqual(['04:32', '05:58', '12:14', '15:41', '18:22', '19:52']);
  });

  it('renders every raw prayer time through formatDisplayTime (12h)', () => {
    const { cmp } = render(city(4, 31, 0), { timeFormat: '12h' });

    expect(cmp.getPrayerTime('fajr')).toBe('4:32 AM');
    expect(cmp.getPrayerTime('isha')).toBe('7:52 PM');
    expect(cmp.getHeroTime()).toBe('4:32 AM');
  });

  it('an iqama offset of 0 collapses the iqama window to nothing', () => {
    // `offsetVal > 0` is the guard, so with 0 the state never enters iqama and
    // the 'is-past' cut-over falls back to the raw athan minute.
    const { cmp } = render(city(4, 32, 0), {
      offsets: { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 }
    });

    expect(cmp.isIqamaMode()).toBe(false);
    expect(cmp.getCardClass(card(cmp, 'fajr'))).toBe('is-past');
    expect(cmp.getCardClass(card(cmp, 'sunrise'))).toBe('is-next');
    expect(cmp.getHeroTime()).toBe('05:58');
    expect(cmp.heroTimer()).toBe('01:26:00');
  });
});
