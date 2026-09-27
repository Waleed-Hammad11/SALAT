import { Injectable, OnDestroy, Signal, WritableSignal, signal } from '@angular/core';
import { SettingsService } from './settings.service';
import { UserSettings } from '../models/prayer.model';

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3 — DARK MODE (light / dark / system).
//
// ── STORAGE ──────────────────────────────────────────────────────────────────
// This service owns NO localStorage key. `theme` is a field on UserSettings and
// is persisted by SettingsService through the single existing 'salat-settings'
// key, exactly like `timeFormat`. D1 from the phase3.md spec: riding the
// existing key means the server's settingsController.js PUT allowlist needs no
// change (an unlisted key in a PUT body is silently dropped).
//
// ── THE CONSTRUCTOR MUST NEVER WRITE TO STORAGE ─────────────────────────────
// app.ts ngOnInit reads the *existence* of 'salat-settings' as a FIRST-VISIT
// flag to decide whether to auto-request geolocation:
//
//     const hasSavedSettings = localStorage.getItem('salat-settings');
//     if (!hasSavedSettings && 'geolocation' in navigator) this.detectLocation(false);
//
// A service that normalised and persisted its defaults on construction would
// create that key before App.ngOnInit ever runs, and EVERY genuine first-time
// user would silently lose the automatic location prompt and get Damietta
// instead. Zero warnings; a first-impression regression in a prayer app's core
// function. Hence:
//   · read-only in the constructor (no setItem, ever);
//   · storage is written from exactly one place, setTheme();
//   · and App does NOT inject this service as an eager field initializer — it
//     resolves it lazily through the Injector on first use. See app.ts.
//
// The one write the constructor DOES perform is a DOM attribute
// (documentElement.dataset.theme). That is presentation, not persistence, and it
// is idempotent: in a real browser the pre-paint script in index.html has
// already set the identical value before first paint, so it agrees rather than
// corrects. It is not, and must not be mistaken for, a FOUC guard — see the
// corollary test in app.theme.spec.ts: because App resolves this service lazily
// and the theme control sits behind an *ngIf, a session that never opens
// Settings never constructs it at all. theme.service.spec.ts asserts storage is
// untouched by construction.
//
// ── THE 'salat-settings' LITERAL IS DUPLICATED IN index.html ────────────────
// The pre-paint script cannot use this service — Angular has not bootstrapped
// yet — so it reads the same key itself. The literal is duplicated deliberately
// and a mismatch is COMPLETELY SILENT: the app looks right, the toggle works,
// and the theme reverts on every reload forever. No unit test can catch it,
// because index.html is not in the test environment. Diff these two on review.
// ═══════════════════════════════════════════════════════════════════════════

/** The user's explicit choice. */
export type ThemeChoice = 'light' | 'dark' | 'system';
/** What that choice currently paints as. */
export type ResolvedTheme = 'light' | 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * localStorage is user-editable and SettingsService.load() is a type-asserted
 * runtime JSON.parse, so an unrecognised stored value is a real possibility. A
 * value of "purple" (or null, or a number) would produce data-theme="purple",
 * which matches no rule: light applies, the segmented control shows nothing
 * selected, and the user has no way out but to clear storage by hand.
 *
 * Coerced here as well as in the inline script — this one is the load-bearing
 * guard, because the inline script's guard is not reachable from a test.
 */
function coerce(raw: unknown): ThemeChoice {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}

/**
 * `theme` is not yet a declared field of UserSettings: prayer.model.ts and
 * settings.service.ts are outside this phase's granted file scope, so the read
 * and the write below are narrowed casts rather than typed access. Both become
 * unnecessary the moment `theme?: ThemeChoice` lands on UserSettings — delete
 * them and nothing else changes.
 */
function readTheme(s: UserSettings): unknown {
  return (s as { theme?: unknown }).theme;
}

function withTheme(theme: ThemeChoice): Partial<UserSettings> {
  return { theme } as Partial<UserSettings>;
}

@Injectable({ providedIn: 'root' })
export class ThemeService implements OnDestroy {
  private readonly _theme: WritableSignal<ThemeChoice>;
  private readonly _resolved: WritableSignal<ResolvedTheme>;

  /** The user's choice, as stored. May be 'system'. */
  readonly theme: Signal<ThemeChoice>;
  /** What is actually painted. Never 'system'. */
  readonly resolved: Signal<ResolvedTheme>;

  /**
   * The media query is read once and held, because `addEventListener` on a
   * MediaQueryList has to be paired with a removeEventListener on the SAME
   * object. Re-calling matchMedia() in ngOnDestroy would hand back a different
   * object and the listener would leak.
   */
  private readonly mql: MediaQueryList | null =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(DARK_QUERY)
      : null;

  private readonly onMediaChange = (): void => {
    this.recompute();
    this.apply();
  };

  constructor(private settings: SettingsService) {
    const choice = coerce(readTheme(this.settings.current));
    this._theme = signal<ThemeChoice>(choice);
    this._resolved = signal<ResolvedTheme>(this.resolve(choice));
    this.theme = this._theme.asReadonly();
    this.resolved = this._resolved.asReadonly();

    this.mql?.addEventListener('change', this.onMediaChange);
    this.apply();
  }

  /**
   * Validate, persist, recompute and repaint. Storage is written from here and
   * nowhere else — SettingsService.update() is what actually calls setItem, and
   * it writes the whole merged UserSettings, `theme` included.
   *
   * Applies IMMEDIATELY. The toggle deliberately does not route through
   * App.saveSettings(): theme is a purely visual preference, and that path
   * would also fire a fetchTimings() round trip for a colour change.
   */
  setTheme(choice: ThemeChoice): void {
    const next = coerce(choice);
    this.settings.update(withTheme(next));
    this._theme.set(next);
    this.recompute();
    this.apply();
  }

  ngOnDestroy(): void {
    // A root-provided service is destroyed with the app, so a listener left
    // attached here would outlive every component — and a stale closure would
    // keep writing to a destroyed injector.
    this.mql?.removeEventListener('change', this.onMediaChange);
  }

  private resolve(choice: ThemeChoice): ResolvedTheme {
    if (choice === 'light' || choice === 'dark') return choice;
    return this.prefersDark() ? 'dark' : 'light';
  }

  private prefersDark(): boolean {
    // A missing matchMedia (SSR, or an ancient browser) degrades to light
    // rather than throwing, matching the inline script's own `window.matchMedia
    // && …` guard.
    return this.mql ? this.mql.matches : false;
  }

  private recompute(): void {
    this._resolved.set(this.resolve(this._theme()));
  }

  private apply(): void {
    if (typeof document === 'undefined') return;
    // The RESOLVED value, never the raw choice: CSS only knows 'light' and
    // 'dark', and writing data-theme="system" would match no rule at all.
    //
    // Bracket access, not `dataset.theme`: DOMStringMap is an index signature
    // and this project sets noPropertyAccessFromIndexSignature, so dot access
    // is a compile error. The resulting attribute is identical, and it is the
    // same attribute the inline script in index.html writes pre-paint.
    document.documentElement.dataset['theme'] = this._resolved();
  }
}
