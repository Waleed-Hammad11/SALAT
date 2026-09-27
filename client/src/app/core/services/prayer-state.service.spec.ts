import { TestBed } from '@angular/core/testing';
import { Subscription } from 'rxjs';
import { PrayerArrival, PrayerStateService } from './prayer-state.service';
import { SettingsService } from './settings.service';
import { I18nService } from './i18n.service';
import { PrayerResponse } from '../models/prayer.model';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2 — direct unit tests for PrayerStateService.
//
// Covers the three members that used to be `private` on App (toMin, calcState,
// resolveNowMin) plus the arrival contract, which is new behaviour.
//
// Phase 1 carry-forwards: no describe/it/expect import (tsconfig.spec.json
// supplies the vitest globals); all time is driven with vi.setSystemTime() and
// fake timers, never by sleeping.
//
// The service is tested through its PUBLIC surface only — start/setTimings/
// stop/syncNow plus the ticker. checkArrival and updateHeroTimer stay private
// and are reached the way production reaches them: by a tick.
// ─────────────────────────────────────────────────────────────────────────────

// UTC+3 all year (no DST), so city time is exactly `h - 3` in UTC below and
// every expectation here is machine-timezone independent.
const TZ = 'Asia/Riyadh';
const DAY1 = '2026-01-15';
const DAY2 = '2026-01-16';

/** Absolute instant, expressed in UTC. */
function at(h: number, m: number, s = 0, dayOffset = 0): Date {
  return new Date(Date.UTC(2026, 0, 15 + dayOffset, h, m, s));
}

/** Riyadh wall clock → absolute instant. */
function utc(h: number, m: number, s = 0, dayOffset = 0): Date {
  return at(h - 3, m, s, dayOffset);
}

const TIMINGS = {
  Fajr: '04:32',
  Sunrise: '05:58',
  Dhuhr: '12:14',
  Asr: '15:41',
  Maghrib: '18:22',
  Isha: '19:52'
} as const;

function payload(overrides: Partial<PrayerResponse> = {}): PrayerResponse {
  return {
    city: 'Riyadh',
    country: 'Saudi Arabia',
    timings: { ...TIMINGS },
    hijri: { day: '5', monthEn: 'Rabi al-Awwal', monthAr: 'ربيع الأول', year: '1447' },
    gregorian: DAY1,
    methodName: 'Umm Al-Qura',
    timezone: TZ,
    cached: false,
    ...overrides
  };
}

/** Minutes-of-day the browser's own clock reads for `d` — the local fallback. */
function localMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

let svc: PrayerStateService;
let subs: Subscription[] = [];

function collect(): PrayerArrival[] {
  const seen: PrayerArrival[] = [];
  subs.push(svc.prayerArrived$.subscribe(a => seen.push(a)));
  return seen;
}

/** Park the clock at `t`, feed the payload, and arm the ticker there. */
function arm(t: Date, p: PrayerResponse = payload()): void {
  vi.setSystemTime(t);
  svc.setTimings(p);
  svc.start();
}

/**
 * One ticker step with the clock at `t`. Used for suspended / throttled / frozen
 * tabs: the interval did not run while the page was away, so the next thing that
 * happens is a single tick at the new time.
 */
function tickTo(t: Date): void {
  vi.setSystemTime(t);
  vi.advanceTimersByTime(1000);
}

/** A backgrounded tab throttled to roughly one wake-up per minute. */
function stepMinutes(from: Date, minutes: number): Date {
  let t = from;
  for (let i = 1; i <= minutes; i++) {
    t = new Date(t.getTime() + 60_000);
    tickTo(t);
  }
  return t;
}

describe('PrayerStateService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    localStorage.setItem('salat-lang', 'en');
    svc = TestBed.inject(PrayerStateService);
  });

  afterEach(() => {
    svc.stop();
    subs.forEach(s => s.unsubscribe());
    subs = [];
    vi.useRealTimers();
    localStorage.clear();
  });

  // ─── toMin ──────────────────────────

  const TO_MIN_CASES: [string, number][] = [
    ['04:32', 272],
    ['24:00', 1440],
    ['00:00', 0],
    ['not-a-time', 0],
    ['', 0],
    // The Aladhan payload appends a UTC offset; toMin must ignore it.
    ['05:58 (EEST)', 358],
    ['7:05', 425]
  ];

  it.each(TO_MIN_CASES)('toMin(%s) is %s', (input, expected) => {
    expect(svc.toMin(input)).toBe(expected);
  });

  it('toMin tolerates a non-string and a nullish value', () => {
    expect(svc.toMin(null as unknown as string)).toBe(0);
    expect(svc.toMin(undefined as unknown as string)).toBe(0);
    expect(svc.toMin(1234 as unknown as string)).toBe(0);
  });

  it('capId capitalises the first letter only', () => {
    expect(svc.capId('fajr')).toBe('Fajr');
    expect(svc.capId('maghrib')).toBe('Maghrib');
  });

  // ─── calcState ──────────────────────

  it('calcState: before fajr it targets the fajr athan minute', () => {
    expect(svc.calcState(payload(), 271)).toEqual({ mode: 'athan', prayer: 'fajr', target: 272 });
  });

  it('calcState: between two prayers it targets the next athan', () => {
    // Past fajr and sunrise, before dhuhr.
    expect(svc.calcState(payload(), 400)).toEqual({ mode: 'athan', prayer: 'dhuhr', target: 734 });
  });

  it('calcState: an open iqama window targets athan + offset', () => {
    // fajr athan 272, iqama offset 25 → 297. 285 is inside the window.
    expect(svc.calcState(payload(), 285)).toEqual({ mode: 'iqama', prayer: 'fajr', target: 297 });
  });

  it('calcState: a closed iqama window advances to the next prayer', () => {
    expect(svc.calcState(payload(), 310)).toEqual({ mode: 'athan', prayer: 'sunrise', target: 358 });
  });

  it('calcState: an iqama offset of 0 never produces iqama mode', () => {
    const zeroed = TestBed.inject(SettingsService);
    zeroed.update({ iqamaOffsets: { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 } });

    // Exactly on the fajr athan minute with offset 0: no athan branch, no iqama
    // branch, so it falls through to sunrise.
    expect(svc.calcState(payload(), 272)).toEqual({
      mode: 'athan',
      prayer: 'sunrise',
      target: 358
    });
    // Past sunrise, before dhuhr — still athan, never iqama.
    expect(svc.calcState(payload(), 400)).toEqual({ mode: 'athan', prayer: 'dhuhr', target: 734 });
  });

  it('calcState: after isha it rolls over to fajr + 1440', () => {
    expect(svc.calcState(payload(), 1260)).toEqual({ mode: 'athan', prayer: 'fajr', target: 1712 });
  });

  it('calcState: sunrise is a ref and is never given an iqama window', () => {
    const settings = TestBed.inject(SettingsService);
    settings.update({
      iqamaOffsets: { fajr: 25, dhuhr: 20, asr: 15, maghrib: 10, isha: 20, sunrise: 30 }
    });

    // 370 is inside a hypothetical 05:58–06:28 sunrise iqama window. The ref-skip
    // means it lands on dhuhr instead.
    expect(svc.calcState(payload(), 370)).toEqual({ mode: 'athan', prayer: 'dhuhr', target: 734 });
  });

  it('calcState: reads the live settings, so an offset change moves the target', () => {
    const settings = TestBed.inject(SettingsService);
    expect(svc.calcState(payload(), 285).target).toBe(297);
    settings.update({ iqamaOffsets: { fajr: 40, dhuhr: 20, asr: 15, maghrib: 10, isha: 20 } });
    expect(svc.calcState(payload(), 285)).toEqual({ mode: 'iqama', prayer: 'fajr', target: 312 });
  });

  it('currentState is null until timings arrive', () => {
    expect(svc.currentState()).toBeNull();
    vi.setSystemTime(utc(4, 31, 0));
    svc.setTimings(payload());
    svc.resolveNowMin();
    expect(svc.currentState()).toEqual({ mode: 'athan', prayer: 'fajr', target: 272 });
  });

  // ─── resolveNowMin ──────────────────

  it('resolveNowMin: uses the payload timezone when the city carries one', () => {
    // 04:31:00 in Riyadh (UTC+3) is 01:31:00Z.
    vi.setSystemTime(utc(4, 31, 0));
    svc.setTimings(payload({ timezone: TZ }));
    svc.resolveNowMin();
    expect(svc.nowMin()).toBe(271);
  });

  it('resolveNowMin: timezone === "UTC" takes the local-browser branch', () => {
    const now = at(1, 31, 0);
    vi.setSystemTime(now);
    svc.setTimings(payload({ timezone: 'UTC' }));
    svc.resolveNowMin();
    expect(svc.nowMin()).toBe(localMinutes(now));
  });

  it('resolveNowMin: an absent timezone takes the same branch as "UTC" and the same result', () => {
    const now = at(1, 31, 0);
    vi.setSystemTime(now);

    svc.setTimings(payload({ timezone: 'UTC' }));
    svc.resolveNowMin();
    const withUtcString = svc.nowMin();

    svc.setTimings(payload({ timezone: undefined }));
    svc.resolveNowMin();
    const withNoTimezone = svc.nowMin();

    expect(withNoTimezone).toBe(withUtcString);
    expect(withNoTimezone).toBe(localMinutes(now));
  });

  it('resolveNowMin: a city behind UTC still resolves in the city clock', () => {
    // 01:31Z is 20:31 the previous day in New York (EST, UTC-5).
    vi.setSystemTime(at(1, 31, 0));
    svc.setTimings(payload({ timezone: 'America/New_York' }));
    svc.resolveNowMin();
    expect(svc.nowMin()).toBe(20 * 60 + 31);
  });

  // ─── D7 regression ──────────────────

  it('D7: a fajr crossing emits the RAW athan minute, never the iqama target', () => {
    // The shipped default, so the iqama target genuinely differs from the athan
    // minute: 04:32 + 25 = 04:57.
    expect(TestBed.inject(SettingsService).current.iqamaOffsets.fajr).toBe(25);

    arm(utc(4, 31, 59));
    const seen = collect();
    tickTo(utc(4, 32, 0));

    expect(seen).toHaveLength(1);
    expect(seen[0].prayerId).toBe('fajr');
    expect(seen[0].atMin).toBe(272);
    expect(seen[0].atMin).not.toBe(297);

    // At this very instant the countdown target IS 297 — that is the value a
    // target-keyed detector would have compared against and shipped as the
    // adhan time. A detector keyed on `target` passes every other test in this
    // file and still ships the wrong alarm.
    expect(svc.currentState()).toEqual({ mode: 'iqama', prayer: 'fajr', target: 297 });
  });

  it('D7: after isha the target is fajr + 1440, which nowMin can never reach', () => {
    arm(utc(23, 0, 0));

    expect(svc.currentState()).toEqual({ mode: 'athan', prayer: 'fajr', target: 1712 });
    // nowMin is minutes-of-day, so it lives in [0, 1440). An upward crossing of
    // 1712 is impossible, which is why `target` is the wrong comparison value.
    expect(svc.nowMin()).toBeLessThan(1440);
    expect(1712).toBeGreaterThanOrEqual(1440);
  });

  it('D7: fajr still fires after a target-keyed detector would have lost it', () => {
    arm(utc(23, 0, 0));
    const seen = collect();
    expect(svc.currentState()!.target).toBe(1712); // unreachable

    // Midnight rollover. nowMin decreases, so the crossing is not upward and
    // nothing fires; the baseline absorbs the new, lower value.
    tickTo(utc(0, 1, 0, 1));
    expect(seen).toHaveLength(0);
    expect(svc.currentState()!.target).toBe(272);

    // The bug this phase exists to prevent: at the previous tick the comparison
    // value was 1712, so the 00:01 tick saw previous=1380 against target=272 —
    // "1380 < 272" is false, and from then on previous is already above 272, so
    // fajr is gone for the whole day.
    expect(1380).toBeGreaterThan(272);

    // Correct behaviour: the comparison is against the raw athan minute and the
    // baseline was reset by the rollover, so fajr still fires.
    tickTo(utc(4, 32, 0, 1));
    expect(seen).toHaveLength(1);
    expect(seen[0].prayerId).toBe('fajr');
    expect(seen[0].atMin).toBe(272);
  });

  // ─── Arrival: the count guard ────────

  it('count 0: a tick that crosses nothing emits nothing', () => {
    arm(utc(4, 31, 0));
    const seen = collect();
    tickTo(utc(4, 31, 30));
    expect(seen).toEqual([]);
  });

  it('count 1: a 30-second suspension still fires', () => {
    arm(utc(4, 31, 50));
    const seen = collect();
    tickTo(utc(4, 32, 20));
    expect(seen).toHaveLength(1);
    expect(seen[0].prayerId).toBe('fajr');
  });

  it('count 1: a 150-second suspension still fires', () => {
    // A time-delta guard would discard this arrival permanently: the next tick's
    // previous value is already past the prayer minute, so nothing can retry it.
    arm(utc(4, 29, 40));
    const seen = collect();
    tickTo(utc(4, 32, 10));
    expect(seen).toHaveLength(1);
    expect(seen[0].prayerId).toBe('fajr');
    expect(seen[0].atMin).toBe(272);
  });

  it('count 5: a frozen tab crossing the whole day is suppressed entirely', () => {
    arm(utc(0, 30, 0));
    const seen = collect();
    // One tick, ~23 hours later: fajr, dhuhr, asr, maghrib and isha all crossed.
    tickTo(utc(23, 30, 0));
    expect(seen).toEqual([]);
  });

  it('count > 1 is suppressed, not truncated to the first prayer', () => {
    arm(utc(11, 0, 0));
    const seen = collect();
    tickTo(utc(16, 0, 0)); // dhuhr + asr
    expect(seen).toEqual([]);
  });

  it('a 12-hour freeze across midnight emits nothing', () => {
    arm(utc(12, 0, 0));
    const seen = collect();
    tickTo(utc(0, 0, 30, 1)); // nowMin wrapped past 1440 → decreases
    expect(seen).toEqual([]);
  });

  it('a 1/min background tab gets exactly one arrival per prayer', () => {
    arm(utc(4, 31, 0));
    const seen = collect();
    stepMinutes(utc(4, 31, 0), 60 * 15 + 29); // → 20:00

    expect(seen.map(a => a.prayerId)).toEqual(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']);
    expect(seen.map(a => a.atMin)).toEqual([272, 734, 941, 1102, 1192]);
    // seq is strictly increasing and never reused.
    expect(seen.map(a => a.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it('sunrise never produces an arrival', () => {
    arm(utc(5, 57, 0));
    const seen = collect();
    tickTo(utc(5, 58, 30));
    expect(seen).toEqual([]);
    expect(seen.some(a => a.prayerId === ('sunrise' as never))).toBe(false);
  });

  it('the 23:59 → 00:01 rollover emits nothing and fajr still fires afterwards', () => {
    arm(utc(23, 59, 30));
    const seen = collect();
    tickTo(utc(0, 1, 0, 1));
    expect(seen).toEqual([]);

    tickTo(utc(4, 32, 0, 1));
    expect(seen).toHaveLength(1);
    expect(seen[0].prayerId).toBe('fajr');
  });

  it('a decreasing nowMin (DST fall-back) fires nothing and keeps the next prayer', () => {
    arm(utc(2, 30, 0));
    const seen = collect();
    // The wall clock repeats an hour: nowMin jumps backwards.
    tickTo(utc(1, 30, 0));
    expect(seen).toEqual([]);

    tickTo(utc(4, 32, 0));
    expect(seen).toHaveLength(1);
    expect(seen[0].prayerId).toBe('fajr');
  });

  // ─── Arrival: dateKey ───────────────

  it('dateKey is data().gregorian, not a locally derived date', () => {
    // The browser's own calendar date here is 2026-01-20; the payload says
    // 2026-01-19. Deriving the key from `Date` would retire a whole day of
    // alarms early for any user whose city is behind their browser.
    const when = new Date(Date.UTC(2026, 0, 20, 1, 31, 0));
    arm(when, payload({ gregorian: '2026-01-19' }));
    const seen = collect();
    tickTo(new Date(when.getTime() + 60_000));

    expect(seen).toHaveLength(1);
    expect(seen[0].dateKey).toBe('2026-01-19');
    expect(when.getUTCDate()).toBe(20);
  });

  it('dateKey changes when data().gregorian changes, and the prayer can fire again', () => {
    arm(utc(4, 31, 0), payload({ gregorian: DAY1 }));
    const seen = collect();

    tickTo(utc(4, 32, 0, 0));
    expect(seen).toHaveLength(1);
    expect(seen[0].dateKey).toBe(DAY1);

    // The midnight refresh replaces the payload with tomorrow's.
    vi.setSystemTime(utc(23, 59, 30, 0));
    svc.setTimings(payload({ gregorian: DAY2 }));
    tickTo(utc(0, 0, 0, 1));
    expect(seen).toHaveLength(1);

    tickTo(utc(4, 32, 0, 1));
    expect(seen).toHaveLength(2);
    expect(seen[1].prayerId).toBe('fajr');
    expect(seen[1].dateKey).toBe(DAY2);
    expect(seen[1].seq).toBe(2);
  });

  // ─── Arrival: dedupe and re-seeding ──

  it('the dedupe key blocks a second fire for the same prayer and payload', () => {
    arm(utc(4, 31, 0));
    const seen = collect();

    tickTo(utc(4, 32, 0));
    expect(seen).toHaveLength(1);

    // Keep ticking for another half hour: no second fajr.
    stepMinutes(utc(4, 32, 0), 30);
    expect(seen).toHaveLength(1);
  });

  it('an identical refetch does not re-fire a prayer that already fired', () => {
    arm(utc(12, 0, 0));
    const seen = collect();

    tickTo(utc(12, 14, 0)); // dhuhr
    expect(seen).toHaveLength(1);
    expect(seen[0].prayerId).toBe('dhuhr');

    // Refetch the very same payload mid-morning, then keep ticking.
    vi.setSystemTime(utc(16, 0, 0));
    svc.setTimings(payload());
    svc.syncNow();
    stepMinutes(utc(16, 0, 0), 30);

    expect(seen.filter(a => a.prayerId === 'dhuhr')).toHaveLength(1);
  });

  it('a city change via a replaced data() does not double-fire', () => {
    arm(utc(4, 31, 0), payload({ city: 'Riyadh' }));
    const seen = collect();
    tickTo(utc(4, 32, 0));
    expect(seen).toHaveLength(1);

    // Switch city: different timings AND a different timezone.
    vi.setSystemTime(utc(4, 40, 0));
    svc.setTimings(
      payload({
        city: 'Cairo',
        country: 'Egypt',
        timezone: 'Africa/Cairo',
        gregorian: DAY1,
        timings: { ...TIMINGS, Fajr: '04:10' }
      })
    );
    svc.syncNow();
    stepMinutes(utc(4, 40, 0), 30);

    // 04:10 is already past in the new payload; the re-seed means no fire.
    expect(seen).toHaveLength(1);
  });

  it('a stale previous-day payload fires nothing for an already-retired prayer', () => {
    arm(utc(4, 31, 0), payload({ gregorian: DAY1 }));
    const seen = collect();
    tickTo(utc(4, 32, 0));
    expect(seen).toHaveLength(1);

    // A cache serving yesterday's payload under today's clock.
    vi.setSystemTime(utc(4, 40, 0));
    svc.setTimings(payload({ gregorian: '2026-01-14' }));
    svc.syncNow();
    stepMinutes(utc(4, 40, 0), 30);

    expect(seen).toHaveLength(1);
    expect(seen[0].dateKey).toBe(DAY1);
  });

  it('opening the app after a prayer has passed produces no arrival for it', () => {
    // 15:00 — fajr (04:32) and dhuhr (12:14) are already history.
    arm(utc(15, 0, 0));
    const seen = collect();

    vi.advanceTimersByTime(1000);
    expect(seen).toEqual([]);

    // Only prayers that were still ahead may ever fire.
    stepMinutes(utc(15, 0, 0), 60 * 4 + 30); // → 19:30
    expect(seen.map(a => a.prayerId)).toEqual(['asr', 'maghrib']);
    expect(seen.every(a => a.atMin > 900)).toBe(true);
    expect(svc.currentState()!.prayer).toBe('isha');
  });

  it('the first tick after start() emits nothing for already-past prayers', () => {
    vi.setSystemTime(utc(18, 0, 0));
    svc.setTimings(payload());
    svc.start();
    const seen = collect();

    vi.advanceTimersByTime(1000);
    expect(seen).toEqual([]);
  });

  it('prayerArrived$ does not replay a past arrival to a late subscriber', () => {
    arm(utc(4, 31, 0));
    // Nobody is listening yet when fajr arrives.
    tickTo(utc(4, 32, 0));

    const late: PrayerArrival[] = [];
    subs.push(svc.prayerArrived$.subscribe(a => late.push(a)));

    // A signal would have retained and replayed this value here, and a lazily
    // created consumer would play a stale adhan.
    expect(late).toEqual([]);
  });

  // ─── Lifecycle ──────────────────────

  it('stop() leaves no live interval', () => {
    arm(utc(4, 31, 0));
    const seen = collect();
    expect(vi.getTimerCount()).toBe(1);

    const frozenNow = svc.nowMin();
    const frozenHero = svc.heroTimer();
    svc.stop();
    expect(vi.getTimerCount()).toBe(0);

    tickTo(utc(4, 32, 0));
    vi.advanceTimersByTime(5000);
    expect(svc.nowMin()).toBe(frozenNow);
    expect(svc.heroTimer()).toBe(frozenHero);
    expect(seen).toEqual([]);
  });

  it('start() resolves the city clock and the hero timer before the first tick', () => {
    vi.setSystemTime(utc(4, 31, 0));
    svc.setTimings(payload());
    svc.start();

    // Synchronously, with no timer having fired yet.
    expect(svc.nowMin()).toBe(271);
    expect(svc.currentState()).toEqual({ mode: 'athan', prayer: 'fajr', target: 272 });
    expect(svc.heroTimerLabel()).toBe('Athan in');
    expect(svc.heroTimer()).toBe('00:01:00');
  });

  it('syncNow() refreshes the clock and the hero timer without re-seeding', () => {
    arm(utc(4, 31, 59));
    const seen = collect();

    // A fetch resolves exactly on the fajr minute. The seed stays on the previous
    // tick's value, so this tick does not swallow the arrival.
    vi.setSystemTime(utc(4, 32, 0));
    svc.syncNow();
    expect(svc.heroTimerLabel()).toBe('Iqama in');

    tickTo(utc(4, 32, 1));
    expect(seen).toHaveLength(1);
    expect(seen[0].prayerId).toBe('fajr');
  });
});
