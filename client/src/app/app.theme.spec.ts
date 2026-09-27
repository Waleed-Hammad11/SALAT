import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { App } from './app';
import { PrayerService } from './core/services/prayer.service';
import { ThemeService } from './core/services/theme.service';
import { CalcMethod, Country, PrayerResponse } from './core/models/prayer.model';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3 — App-level theme wiring.
//
// The headline test here is the first-visit geolocation regression. Read its
// comment before touching anything.
//
// Phase 1 carry-forwards honoured here:
//   · no describe/it/expect import — tsconfig.spec.json supplies them.
//   · fixture.detectChanges() on every TestBed spec (the app is zoneless).
//
// NOTE: the settings sheet is behind `*ngIf="setSheetOpen()"`, and the theme
// control lives inside it. So merely rendering App does NOT construct
// ThemeService — it is constructed the first time the sheet is opened and
// rendered, or when a theme button is clicked. Every test that needs the
// service to exist therefore opens the sheet.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'salat-settings';

const PAYLOAD: PrayerResponse = {
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
  timezone: 'Asia/Riyadh',
  cached: false
};

/** Counts calls so "the toggle did not go through saveSettings()" is provable. */
class PrayerServiceStub {
  getTimingsCalls = 0;
  getTimings(): Observable<PrayerResponse> {
    this.getTimingsCalls++;
    return of(PAYLOAD);
  }
  getTimingsByCoords(): Observable<PrayerResponse> {
    return of(PAYLOAD);
  }
  getCountries(): Observable<Country[]> {
    return of([]);
  }
  getMethods(): Observable<CalcMethod[]> {
    return of([]);
  }
}

function installMatchMediaStub(matches: boolean): void {
  const mql = () => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('matchMedia', vi.fn(mql));
  (window as unknown as { matchMedia: unknown }).matchMedia = vi.fn(mql);
}

/** Configures the TestBed and creates App WITHOUT rendering it. */
function createUnrendered() {
  const prayerSvc = new PrayerServiceStub();
  TestBed.configureTestingModule({
    providers: [{ provide: PrayerService, useValue: prayerSvc }]
  });
  const fixture = TestBed.createComponent(App);
  return { fixture, cmp: fixture.componentInstance, prayerSvc };
}

function render() {
  const r = createUnrendered();
  // Zoneless app: nothing ambient drives the first render.
  r.fixture.detectChanges();
  return r;
}

function segButtons(fixture: { nativeElement: unknown }): HTMLButtonElement[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll('.seg-btn')
  ) as HTMLButtonElement[];
}

describe('App — Phase 3 theme wiring', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    // 'en' so the button-label assertions below are readable. I18nService reads
    // this at construction. It is a DIFFERENT key from salat-settings, which is
    // exactly why it is safe to set here.
    localStorage.setItem('salat-lang', 'en');
    installMatchMediaStub(false);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  // ═══════════════════════════════════════════════════════════════════════
  // THE FIRST-VISIT GEOLOCATION REGRESSION — the serious risk of this phase.
  //
  // app.ts ngOnInit treats the EXISTENCE of the 'salat-settings' key as a
  // first-visit flag:
  //
  //   const hasSavedSettings = localStorage.getItem('salat-settings');
  //   if (!hasSavedSettings && 'geolocation' in navigator) this.detectLocation(false);
  //
  // So a ThemeService that normalised and persisted its defaults on
  // construction — constructed as an eager field initializer on App, which runs
  // before ngOnInit — would create that key in time, and EVERY genuine
  // first-time user would silently lose the automatic location prompt and get
  // Damietta instead. No warning, no error, first impression.
  //
  // This test deliberately goes as far as actually CONSTRUCTING ThemeService
  // (by rendering the settings sheet) before re-asserting the key is still
  // absent, so it cannot pass just because nothing happened.
  // ═══════════════════════════════════════════════════════════════════════
  it('constructing App and rendering the theme control leaves salat-settings null', () => {
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    const { fixture, cmp } = render();
    fixture.detectChanges();

    // Opening the sheet renders the theme buttons, which calls themeChoice(),
    // which is the first thing that constructs ThemeService.
    cmp.openSetSheet();
    fixture.detectChanges();
    expect(segButtons(fixture).length).toBe(3);

    expect(TestBed.inject(ThemeService)).toBeInstanceOf(ThemeService);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    // Nothing at all was written: salat-lang is the only key present, and it
    // was put there by this spec's own beforeEach, not by the app.
    expect(Object.keys(localStorage)).toEqual(['salat-lang']);
  });

  it('…and the service it constructed is storage-clean', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    const { fixture, cmp } = render();
    cmp.openSetSheet();
    fixture.detectChanges();

    expect(TestBed.inject(ThemeService).theme()).toBe('system');
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('…yet an explicit user action DOES create the key (so the test above is not trivially true)', () => {
    const { cmp } = render();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    cmp.saveLocation();

    // Same key, written by SettingsService from an explicit user action. The
    // contrast with the tests above is the whole point: the key CAN appear
    // during a session, it just must not appear by merely looking at the page.
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).theme).toBeUndefined();
  });

  it('does not construct ThemeService until the template reads it', () => {
    // ThemeService's constructor is the only thing in the app that writes
    // documentElement[data-theme]. If App injected it as a constructor
    // parameter — i.e. an eager field initializer, running before ngOnInit —
    // the attribute would already be set here, with the sheet still closed.
    // Lazy resolution through the Injector is the mitigation; this is its
    // observable consequence.
    const { fixture, cmp } = createUnrendered();

    expect(document.documentElement.dataset['theme']).toBeUndefined();

    fixture.detectChanges();
    // Still closed ⇒ the theme control was never rendered ⇒ no service yet.
    expect(document.documentElement.dataset['theme']).toBeUndefined();

    cmp.openSetSheet();
    fixture.detectChanges();

    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  // ── The toggle control ──────────────────────────────────────────────────
  it('renders three theme buttons with the current choice marked selected', () => {
    const { fixture, cmp } = render();
    cmp.openSetSheet();
    fixture.detectChanges();

    const buttons = segButtons(fixture);

    expect(buttons.map(b => b.textContent?.trim())).toEqual(['Light', 'Dark', 'System']);
    // Default is 'system', so the third button is the selected one.
    expect(buttons.map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);
    expect(buttons[2].classList.contains('on')).toBe(true);
    expect(buttons[0].classList.contains('on')).toBe(false);
  });

  it('clicking "Dark" applies it immediately and persists it', () => {
    const { fixture, cmp } = render();
    cmp.openSetSheet();
    fixture.detectChanges();

    segButtons(fixture)[1].click();
    fixture.detectChanges();

    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(cmp.themeChoice()).toBe('dark');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).theme).toBe('dark');

    // The selection moved, and the sheet stayed open — the theme is not part of
    // the Save/Cancel transaction.
    const buttons = segButtons(fixture);
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[2].getAttribute('aria-pressed')).toBe('false');
    expect(cmp.setSheetOpen()).toBe(true);
  });

  it('clicking a theme does NOT route through saveSettings() and refetch timings', () => {
    // theme is a purely visual preference; saveSettings() would also fire
    // fetchTimings() (app.ts) for a colour change.
    const { fixture, cmp, prayerSvc } = render();
    const before = prayerSvc.getTimingsCalls;
    cmp.openSetSheet();
    fixture.detectChanges();

    segButtons(fixture)[1].click();
    fixture.detectChanges();

    expect(prayerSvc.getTimingsCalls).toBe(before);
    expect(cmp.setSheetOpen()).toBe(true);
  });

  it('round-trips dark → system → light through the control', () => {
    const { fixture, cmp } = render();
    cmp.openSetSheet();
    fixture.detectChanges();

    segButtons(fixture)[1].click();
    fixture.detectChanges();
    expect(cmp.themeChoice()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');

    segButtons(fixture)[2].click();
    fixture.detectChanges();
    expect(cmp.themeChoice()).toBe('system');
    // 'system' against a light-OS stub resolves to light.
    expect(document.documentElement.dataset['theme']).toBe('light');

    segButtons(fixture)[0].click();
    fixture.detectChanges();
    expect(cmp.themeChoice()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).theme).toBe('light');
  });

  it('reflects a theme that was already stored before this session', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark' }));

    const { fixture, cmp } = render();
    cmp.openSetSheet();
    fixture.detectChanges();

    expect(cmp.themeChoice()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(segButtons(fixture)[1].classList.contains('on')).toBe(true);
  });

  // ── The honest FOUC proxy ───────────────────────────────────────────────
  // A first-frame/FOUC test is NOT possible here: index.html is not part of the
  // test environment, the TestBed's jsdom document starts with no data-theme,
  // and the pre-paint script never runs. These two tests are therefore
  // SERVICE-LEVEL assertions about what happens once ThemeService exists — they
  // are NOT evidence that the first paint is dark. That claim can only be
  // verified by loading the app in a real browser, which this phase does not do.
  it('[SERVICE-LEVEL PROXY, not a FOUC test] applies the stored theme when the service is constructed', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark' }));

    const { fixture, cmp } = render();
    cmp.openSetSheet();
    fixture.detectChanges();

    expect(cmp.themeChoice()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('the app never writes data-theme on its own while the settings sheet is closed', () => {
    // Pinned deliberately. Because ThemeService is resolved lazily and the theme
    // control lives behind *ngIf, a session that never opens Settings leaves
    // ThemeService unconstructed — so the inline pre-paint script in index.html
    // is the ONLY thing that applies the theme, and it is the only thing
    // standing between a dark-mode user and a light flash.
    //
    // This is why the script's position and its 'salat-settings' literal are
    // load-bearing rather than nice-to-have, and why a real browser check is
    // the one thing this suite cannot substitute for.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark' }));

    render();

    expect(document.documentElement.dataset['theme']).toBeUndefined();
  });
});
