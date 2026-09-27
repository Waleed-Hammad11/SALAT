import { Injectable, OnDestroy, signal } from '@angular/core';

const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=';

@Injectable({ providedIn: 'root' })
export class AudioService implements OnDestroy {
  private audio: HTMLAudioElement | null = null;
  private primed = false;
  private readonly _playing = signal(false);
  readonly playing = this._playing.asReadonly();

  private el(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = 'auto';
      this.audio.addEventListener('ended', () => this._playing.set(false));
      this.audio.addEventListener('pause', () => this._playing.set(false));
    }
    return this.audio;
  }

  /**
   * Browsers refuse to start audio unless the element was already played inside a
   * user gesture, and the athan can be hours away. Priming the SAME element we
   * later play on is what survives that check — a throwaway element does not.
   *
   * Keyed off `primed`, not element existence: a playAthan() that lost the
   * autoplay race creates the element too, and that must not disable priming.
   */
  unlock(): void {
    if (this.primed) return;
    this.primed = true;
    const a = this.el();
    a.src = SILENT;
    a.play().catch(() => {});
  }

  async playAthan(prayerId: string): Promise<void> {
    try {
      const res = await fetch(`https://alfurqan.online/api/v1/athan/${prayerId}`);
      if (!res.ok) throw new Error(String(res.status));
      const { audioUrl } = await res.json();
      if (!audioUrl) return;
      const a = this.el();
      a.src = audioUrl;
      await a.play();
      this._playing.set(true);
    } catch {
      this._playing.set(false);
      console.error('Failed to play Athan');
    }
  }

  mute(): void {
    this.audio?.pause();
    this._playing.set(false);
  }

  ngOnDestroy(): void {
    this.mute();
    if (this.audio) {
      this.audio.src = '';
      this.audio = null;
    }
  }
}
