import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

// Phase 1 smoke spec. Its only job is to prove that the vitest harness is
// genuinely wired to Angular TestBed and renders a real component, rather than
// merely starting a runner. A bare `expect(1).toBe(1)` would pass even if
// TestBed were entirely broken, which is the failure mode this guards against.
@Component({
  selector: 'app-testbed-smoke',
  standalone: true,
  template: `<p id="smoke">TestBed is alive</p>`
})
class TestbedSmokeComponent {}

describe('TestBed smoke (zoneless)', () => {
  it('renders a standalone component into the DOM', () => {
    const fixture = TestBed.createComponent(TestbedSmokeComponent);

    // Zoneless app: no zone.js is installed and app.config.ts has no
    // provideZoneChangeDetection(). An explicit detectChanges() is what drives
    // the initial render, so it is required rather than optional here.
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#smoke')?.textContent).toBe('TestBed is alive');
    expect(el.textContent).toContain('TestBed is alive');
  });
});
