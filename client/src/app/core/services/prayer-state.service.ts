import { Injectable, computed, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { PrayerResponse, PrayerState } from '../models/prayer.model';
import { SettingsService } from './settings.service';
import { I18nService } from './i18n.service';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2 — prayer-state service and the arrival event.
//
// Owns the app's time-of-day clock and the countdown state derived from it, and
// manufactures the "a prayer time just arrived" event that Phases 4/5 consume.
// The time arithmetic here is a VERBATIM move of app.ts's logic: the +1440
// rollover, the DST fall-back behaviour and the catch-up policy are all
// preserved as-is. See phase2.md "Known limitations" — do not "fix" them here.
//
// It does NOT own the midnight refresh timer: that fires fetchTimings(), which
// manages the component's `loading` and `errorMessage`. The service owns the
// *arrival* clock, not the *refresh* clock.
// ─────────────────────────────────────────────────────────────────────────────

/** Prayer ids that can produce an arrival. Sunrise is excluded by construction. */
export type ArrivalPrayerId = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

/** The arrival contract. See phase2.md. */
export interface PrayerArrival {
  /** 'sunrise' is excluded: PRAYERS marks it `ref: true` and calcState skips iqama for refs. */
  prayerId: ArrivalPrayerId;
  /** The RAW athan minute-of-day — never the iqama target. */
  atMin: number;
  /** `data().gregorian` verbatim. Never a locally derived date. */
  dateKey: string;
  /** Strictly increasing, never reused. */
  seq: number;
}

const ARRIVAL_IDS: ArrivalPrayerId[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

@Injectable({ providedIn: 'root' })
export class PrayerStateService {
  private _data = signal<PrayerResponse | null>(null);
  private _nowMin = signal(0);
  private _heroTimer = signal('--:--:--');
  private _heroTimerLabel = signal('');

  // One timer handle, one job. (The component keeps its own midnight handle.)
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * The nowMin of the previous tick, or null before start()/setTimings() seeds
   * it. Seeded, never back-filled: a prayer already past cannot satisfy
   * "previous strictly below", which is the whole catch-up policy.
   */
  private previousNowMin: number | null = null;

  /** `${prayerId}|${dateKey}` keys already emitted. Retired for the life of the page. */
  private readonly retired = new Set<string>();
  private seq = 0;
  private readonly arrivals = new Subject<PrayerArrival>();

  readonly nowMin = this._nowMin.asReadonly();
  readonly heroTimer = this._heroTimer.asReadonly();
  readonly heroTimerLabel = this._heroTimerLabel.asReadonly();

  readonly currentState = computed<PrayerState | null>(() => {
    const d = this._data();
    const n = this._nowMin();
    if (!d) return null;
    return this.calcState(d, n);
  });

  /**
   * A real event stream, deliberately NOT a signal. A signal retains its last
   * value and Angular effects run once on creation, so a consumer attaching
   * after an arrival (a lazily-created component, a settings sheet opening an
   * audio service) would read the retained value and play a stale adhan. The
   * dedupe key is owned here; consumers must not re-implement it.
   *
   * Ships unconsumed on purpose — Phases 4/5 attach to it.
   */
  readonly prayerArrived$: Observable<PrayerArrival> = this.arrivals.asObservable();

  constructor(
    private settings: SettingsService,
    private i18n: I18nService
  ) {}

  // ─── Lifecycle ───────────────────────

  /**
   * Synchronously resolve + update the hero timer BEFORE arming the interval, so
   * nowMin is correct on the first painted frame rather than 0. Then seed the
   * arrival baseline (evaluating nothing) and arm. The arrival check runs after
   * both, so a consumer's effect sees a consistent currentState on the same tick.
   */
  start(): void {
    this.resolveNowMin();
    this.updateHeroTimer();
    this.seedPrevious();
    this.armInterval();
  }

  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  /**
   * Feed a fresh payload. Re-seeds the arrival baseline (never evaluates), so a
   * refetch, a city change or a midnight rollover cannot replay a prayer the
   * page has already announced.
   */
  setTimings(data: PrayerResponse): void {
    this._data.set(data);
    this.seedPrevious();
  }

  /**
   * The post-fetch sequencing, in one call: resolve the city clock, then refresh
   * the hero countdown. Deliberately does NOT re-seed — the seed has to stay on
   * the *previous* tick's nowMin, or a fetch landing on a prayer minute would
   * swallow that prayer's arrival. The component still owns its own midnight
   * re-arm and calls it alongside this.
   */
  syncNow(): void {
    this.resolveNowMin();
    this.updateHeroTimer();
  }

  // ─── Arrival ─────────────────────────

  private tick(): void {
    this.resolveNowMin();
    this.updateHeroTimer();
    this.checkArrival();
  }

  private armInterval(): void {
    this.stop();
    this.tickInterval = setInterval(() => this.tick(), 1000);
  }

  private seedPrevious(): void {
    this.previousNowMin = this._nowMin();
  }

  private checkArrival(): void {
    const d = this._data();
    const previous = this.previousNowMin;
    const now = this._nowMin();

    // Advance the baseline first: every tick produces a new previous, so a later
    // crossing can only ever be counted against the tick that just ran.
    this.previousNowMin = now;

    // No baseline yet → nothing to compare a crossing against.
    if (!d || previous === null) return;

    // A decreasing nowMin is a DST fall-back or a 23:59 → 00:01 rollover, not an
    // upward crossing. The baseline above has already absorbed the lower value,
    // so the next prayer still fires normally.
    if (now < previous) return;

    const crossed: { id: ArrivalPrayerId; atMin: number }[] = [];
    for (const id of ARRIVAL_IDS) {
      // D7: the comparison value is the RAW athan minute from the timings, never
      // currentState().target. After isha the target is fajr + 1440, which nowMin
      // can never reach, so a detector keyed on `target` can never fire fajr.
      const atMin = this.toMin(d.timings[this.capId(id) as keyof typeof d.timings]);
      if (previous < atMin && atMin <= now) crossed.push({ id, atMin });
    }

    // count 0 → do nothing.
    // count 1 → emit it, regardless of how large the tick delta was: a large
    //   delta with a single crossing is a suspension, not a burst, and the user
    //   still wants the adhan.
    // count > 1 → suppress all. This is the catch-up policy, and it is what a
    //   frozen/12h-suspended tab produces.
    // This is a COUNT of crossed prayers, NOT a time-delta threshold: a
    // `delta <= 2 min` guard fails for a backgrounded tab throttled to ~1/min.
    if (crossed.length !== 1) return;

    const hit = crossed[0];

    // dateKey is data().gregorian VERBATIM — the date the server labelled these
    // timings with, already normalised to 'YYYY-MM-DD' in the city's timezone.
    // Deriving it from the local clock retires every prayer under a new key
    // while the old timings are still loaded, silently deleting a day of alarms
    // for any user whose city is ahead of their browser — most of the planet.
    const dateKey = d.gregorian;
    const key = `${hit.id}|${dateKey}`;
    if (this.retired.has(key)) return;

    this.retired.add(key);
    this.seq += 1;
    this.arrivals.next({ prayerId: hit.id, atMin: hit.atMin, dateKey, seq: this.seq });
  }

  // ─── Timezone-Aware Time Calculation (moved verbatim from App.updateNow) ──

  resolveNowMin(): void {
    const tz = this._data()?.timezone;
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
        this._nowMin.set(h * 60 + m + s / 60);
        return;
      } catch {
        // Fallback to local browser time
      }
    }

    const now = new Date();
    this._nowMin.set(now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60);
  }

  // ─── Moved verbatim from App ─────────

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

  calcState(d: PrayerResponse, nowMin: number): PrayerState {
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
    const diffSec = Math.max(0, Math.round((st.target - this._nowMin()) * 60));

    if (st.mode === 'iqama') {
      this._heroTimerLabel.set(this.i18n.t('remI'));
      this._heroTimer.set(this.formatMS(diffSec));
    } else if (st.prayer === 'sunrise') {
      this._heroTimerLabel.set(this.i18n.t('remS'));
      this._heroTimer.set(this.formatHMS(diffSec));
    } else {
      this._heroTimerLabel.set(this.i18n.t('remA'));
      this._heroTimer.set(this.formatHMS(diffSec));
    }
  }

  // ─── Format Helpers (moved verbatim) ──

  private pad(n: number): string {
    return n < 10 ? '0' + n : '' + n;
  }

  private formatHMS(sec: number): string {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${this.pad(h)}:${this.pad(m)}:${this.pad(s)}`;
  }

  private formatMS(sec: number): string {
    sec = Math.max(0, Math.floor(sec));
    if (sec >= 3600) {
      return this.formatHMS(sec);
    }
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${this.pad(m)}:${this.pad(s)}`;
  }
}
