import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AudioService } from './audio.service';

describe('AudioService', () => {
  let svc: AudioService;
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let playSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [AudioService] });
    svc = TestBed.inject(AudioService);

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ audioUrl: 'https://example.com/athan.mp3' }),
    } as Response);
    playSpy = vi.spyOn(HTMLAudioElement.prototype, 'play').mockResolvedValue(undefined);
    pauseSpy = vi.spyOn(HTMLAudioElement.prototype, 'pause').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it('fetches the athan url for the prayer and starts playback', async () => {
    await svc.playAthan('fajr');
    expect(fetchSpy).toHaveBeenCalledWith('https://alfurqan.online/api/v1/athan/fajr');
    expect(playSpy).toHaveBeenCalled();
  });

  it('reports playing so the mute button can appear', async () => {
    expect(svc.playing()).toBe(false);
    await svc.playAthan('asr');
    expect(svc.playing()).toBe(true);
  });

  it('mute() stops playback and clears the playing flag', async () => {
    await svc.playAthan('isha');
    svc.mute();
    expect(pauseSpy).toHaveBeenCalled();
    expect(svc.playing()).toBe(false);
  });

  it('stays silent when the fetch fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchSpy.mockRejectedValue(new Error('offline'));
    await svc.playAthan('maghrib');
    expect(playSpy).not.toHaveBeenCalled();
    expect(svc.playing()).toBe(false);
  });

  it('stays silent when the response is not ok', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchSpy.mockResolvedValue({ ok: false, status: 500 } as Response);
    await svc.playAthan('dhuhr');
    expect(playSpy).not.toHaveBeenCalled();
    expect(svc.playing()).toBe(false);
  });

  it('unlock() primes the element only once', () => {
    svc.unlock();
    svc.unlock();
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  // Regression: a playAthan() that loses the autoplay race creates the element
  // before any gesture. Priming must not be skipped just because it exists.
  it('unlock() still primes after a failed play created the element', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    playSpy.mockRejectedValue(new Error('NotAllowedError'));
    await svc.playAthan('fajr');

    svc.unlock();
    expect(playSpy).toHaveBeenCalledTimes(2);
  });
});
