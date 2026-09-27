import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';
import { SettingsService } from './settings.service';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3 — ThemeService (dark mode).
//
// Phase 1 carry-forwards honoured here:
//   · no describe/it/expect import — tsconfig.spec.json supplies them via
//     "types": ["vitest/globals"].
//   · every TestBed spec calls detectChanges() (only app.theme.spec.ts renders).
//   · no new dependency.
//
// ── WHY matchMedia IS STUBBED ────────────────────────────────────────────────
// jsdom's real matchMedia ALWAYS reports `matches: false` and NEVER fires a
// `change` event. An unstubbed "system" test would therefore pass for the wrong
// reason: the light branch would be the only reachable outcome, and "tracks the
// OS live" would assert nothing at all. So the stub below exists purely to make
// the dark branch reachable and to let a change event fire.
//
// The stub is deliberately MINIMAL. Nothing here asserts that the stub behaves
// like a real MediaQueryList — these tests assert only the SERVICE'S REACTION to
// what the stub reports. A real-browser pass is explicitly out of scope for this
// phase (see phase3.md "Known limitations").
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'salat-settings';

interface MediaStub {
  matches: boolean;
  /** Flip the reported preference and fire `change`, like the real thing. */
  set(next: boolean): void;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

let media: MediaStub;
let listeners: Set<unknown>;

function installMatchMediaStub(): void {
  listeners = new Set();
  media = {
    matches: false,
    set(next: boolean) {
      media.matches = next;
      for (const l of [...listeners]) (l as () => void)();
    },
    addEventListener: vi.fn((_type: string, fn: unknown) => {
      listeners.add(fn);
    }),
    removeEventListener: vi.fn((_type: string, fn: unknown) => {
      listeners.delete(fn);
    })
  };
  const mql = () => media as unknown as MediaQueryList;
  // vi.stubGlobal writes globalThis, which IS window under jsdom. Assigned to
  // window as well so the service's `window.matchMedia` read cannot miss it.
  vi.stubGlobal('matchMedia', vi.fn(mql));
  (window as unknown as { matchMedia: unknown }).matchMedia = vi.fn(mql);
}

/** Seed the settings payload the way a previous session would have left it. */
function stored(extra: Record<string, unknown> | null): void {
  if (extra === null) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(extra));
}

describe('ThemeService — dark mode (Phase 3)', () => {
  beforeEach(() => {
    // A root-provided service is cached by the injector, so a fresh TestBed per
    // test is what gives each case a fresh construction — and it is also what
    // makes the ngOnDestroy assertion in the listener test non-vacuous.
    TestBed.resetTestingModule();
    installMatchMediaStub();
    localStorage.clear();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  // ── Defaults & validation ──────────────────────────────────────────────
  it('defaults to "system" when nothing has ever been stored', () => {
    const svc = TestBed.inject(ThemeService);
    expect(svc.theme()).toBe('system');
  });

  it('reads a stored "dark" and resolves it to "dark"', () => {
    stored({ theme: 'dark' });
    const svc = TestBed.inject(ThemeService);
    expect(svc.theme()).toBe('dark');
    expect(svc.resolved()).toBe('dark');
  });

  it('reads a stored "light" and resolves it to "light" even when the OS is dark', () => {
    media.matches = true;
    stored({ theme: 'light' });
    const svc = TestBed.inject(ThemeService);
    expect(svc.resolved()).toBe('light');
  });

  // ── The first-visit / storage invariant ─────────────────────────────────
  it('WRITES NOTHING TO STORAGE in its constructor', () => {
    // Direct proof, not an inference from the key being absent: a setItem spy
    // catches a write of ANY value, including a write the loader would then
    // overwrite.
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    TestBed.inject(ThemeService);

    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  // ── The DOM attribute ───────────────────────────────────────────────────
  it('writes the RESOLVED value to dataset.theme, never the raw choice', () => {
    media.matches = true;
    stored({ theme: 'system' });
    const svc = TestBed.inject(ThemeService);

    // The choice is 'system' but only light/dark match a CSS rule, so writing
    // data-theme="system" would fall back to the light :root and leave the
    // segmented control showing nothing selected.
    expect(svc.theme()).toBe('system');
    expect(svc.resolved()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  // ── Invalid stored values coerce (localStorage is user-editable) ────────
  it('coerces an unrecognised stored value to "system"', () => {
    stored({ theme: 'purple' });
    const svc = TestBed.inject(ThemeService);
    expect(svc.theme()).toBe('system');
  });

  it('coerces a null stored value to "system"', () => {
    stored({ theme: null });
    expect(TestBed.inject(ThemeService).theme()).toBe('system');
  });

  it('coerces a non-string stored value to "system"', () => {
    stored({ theme: 42 });
    expect(TestBed.inject(ThemeService).theme()).toBe('system');
  });

  it('coerces a missing theme key to "system"', () => {
    stored({ timeFormat: '24h', city: 'Damietta' });
    expect(TestBed.inject(ThemeService).theme()).toBe('system');
  });

  it('survives a corrupt (non-JSON) settings payload', () => {
    // SettingsService.load() swallows the parse error and returns DEFAULTS, so
    // the service sees no theme at all. Assert the two layers compose.
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(TestBed.inject(ThemeService).theme()).toBe('system');
  });

  // ── setTheme: validation, persistence, immediate apply ──────────────────
  it('setTheme persists through SettingsService into the existing salat-settings key', () => {
    const svc = TestBed.inject(ThemeService);
    svc.setTheme('dark');

    // The theme rides the SINGLE existing key. It is not a key of its own —
    // app.ts reads the existence of this key as its first-visit flag, so a
    // second key would not help, and a third consumer would not either.
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).theme).toBe('dark');
    // The other settings fields are still there: a merge, not a replace.
    expect(JSON.parse(raw!).city).toBe('Damietta');
  });

  it('setTheme survives a re-read — the next session sees the same choice', () => {
    TestBed.inject(ThemeService).setTheme('dark');
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    // Fresh injector ⇒ SettingsService re-parses the payload from storage,
    // which is exactly what the pre-paint script in index.html does even
    // earlier than this.
    TestBed.resetTestingModule();
    installMatchMediaStub();
    expect(TestBed.inject(ThemeService).theme()).toBe('dark');
  });

  it('setTheme applies immediately rather than waiting for anything else', () => {
    const svc = TestBed.inject(ThemeService);
    expect(document.documentElement.dataset['theme']).toBe('light');

    svc.setTheme('dark');

    expect(svc.resolved()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('setTheme coerces an out-of-union argument to "system" and persists "system"', () => {
    const svc = TestBed.inject(ThemeService);
    svc.setTheme('purple' as never);

    expect(svc.theme()).toBe('system');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).theme).toBe('system');
  });

  it('setTheme can be called repeatedly and the last call wins', () => {
    const svc = TestBed.inject(ThemeService);
    svc.setTheme('dark');
    svc.setTheme('light');
    svc.setTheme('system');

    expect(svc.theme()).toBe('system');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).theme).toBe('system');
  });

  // ── system mode tracks the OS live ──────────────────────────────────────
  it('"system" resolves to "dark" when the OS prefers dark', () => {
    media.matches = true;
    stored({ theme: 'system' });
    expect(TestBed.inject(ThemeService).resolved()).toBe('dark');
  });

  it('"system" resolves to "light" when the OS does not', () => {
    media.matches = false;
    stored({ theme: 'system' });
    expect(TestBed.inject(ThemeService).resolved()).toBe('light');
  });

  it('tracks a live OS change while in "system" mode', () => {
    stored({ theme: 'system' });
    const svc = TestBed.inject(ThemeService);
    expect(svc.resolved()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');

    media.set(true);

    expect(svc.resolved()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');

    media.set(false);

    expect(svc.resolved()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('an explicit "light" choice ignores a live OS change to dark', () => {
    // The whole point of an explicit choice: a user who picked light on a dark
    // OS must not be overridden by the OS flipping later.
    stored({ theme: 'light' });
    const svc = TestBed.inject(ThemeService);
    expect(svc.resolved()).toBe('light');

    media.set(true);

    expect(svc.theme()).toBe('light');
    expect(svc.resolved()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  // ── Listener lifecycle ──────────────────────────────────────────────────
  it('registers exactly one matchMedia change listener', () => {
    TestBed.inject(ThemeService);
    expect(media.addEventListener).toHaveBeenCalledTimes(1);
    expect(media.addEventListener.mock.calls[0][0]).toBe('change');
    expect(listeners.size).toBe(1);
  });

  it('removes the matchMedia listener on destroy', () => {
    TestBed.inject(ThemeService);
    expect(listeners.size).toBe(1);

    // Without this reset, ngOnDestroy never runs for a root-provided service
    // and the assertion below would pass while the listener stayed attached
    // forever. A listener leaked here outlives every component in the app.
    TestBed.resetTestingModule();

    expect(media.removeEventListener).toHaveBeenCalledTimes(1);
    expect(media.removeEventListener.mock.calls[0][0]).toBe('change');
    expect(listeners.size).toBe(0);
  });

  it('a destroyed service no longer reacts to an OS change', () => {
    stored({ theme: 'system' });
    const svc = TestBed.inject(ThemeService);
    expect(svc.resolved()).toBe('light');

    TestBed.resetTestingModule();
    media.set(true);

    // Signal state is frozen; the live DOM attribute is left as it was.
    expect(svc.resolved()).toBe('light');
  });

  // ── No matchMedia at all (SSR / very old browser) ───────────────────────
  it('degrades to light when window.matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    (window as unknown as { matchMedia: unknown }).matchMedia = undefined;

    const svc = TestBed.inject(ThemeService);

    expect(svc.theme()).toBe('system');
    expect(svc.resolved()).toBe('light');
    // Must not throw on destroy either.
    expect(() => TestBed.resetTestingModule()).not.toThrow();
  });
});
