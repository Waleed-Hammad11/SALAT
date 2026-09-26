import { Injectable, signal } from '@angular/core';
import { UserSettings, IqamaOffsets } from '../models/prayer.model';

const STORAGE_KEY = 'salat-settings';

const DEFAULTS: UserSettings = {
  city: 'Damietta',
  country: 'Egypt',
  method: 'auto',
  school: '0',
  iqamaOffsets: { fajr: 25, dhuhr: 20, asr: 15, maghrib: 10, isha: 20 }
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private _settings = signal<UserSettings>(this.load());

  settings = this._settings.asReadonly();

  get current(): UserSettings {
    return this._settings();
  }

  update(partial: Partial<UserSettings>): void {
    const merged = { ...this._settings(), ...partial };
    if (partial.iqamaOffsets) {
      merged.iqamaOffsets = { ...this._settings().iqamaOffsets, ...partial.iqamaOffsets };
    }
    this._settings.set(merged);
    this.save(merged);
  }

  private load(): UserSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...DEFAULTS, ...parsed, iqamaOffsets: { ...DEFAULTS.iqamaOffsets, ...(parsed.iqamaOffsets || {}) } };
      }
    } catch {}
    return { ...DEFAULTS };
  }

  private save(s: UserSettings): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
  }
}
