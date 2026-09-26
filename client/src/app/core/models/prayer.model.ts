export interface PrayerTimings {
  Fajr: string;
  Sunrise: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
}

export interface HijriDate {
  day: string;
  monthEn: string;
  monthAr: string;
  year: string;
}

export interface PrayerResponse {
  timings: PrayerTimings;
  hijri: HijriDate;
  gregorian: string;
  methodName: string;
  timezone?: string;
  cached: boolean;
  offline?: boolean;
}

export interface PrayerDef {
  id: string;
  ar: string;
  en: string;
  ref?: boolean;
}

export interface PrayerState {
  mode: 'athan' | 'iqama';
  prayer: string;
  target: number;
}

export interface IqamaOffsets {
  fajr: number;
  dhuhr: number;
  asr: number;
  maghrib: number;
  isha: number;
  [key: string]: number;
}

export interface UserSettings {
  city: string;
  country: string;
  method: string;
  school: string;
  iqamaOffsets: IqamaOffsets;
}

export interface Country {
  code: string;
  name: string;
  cities: City[];
}

export interface City {
  code: string;
  name: string;
}

export interface CalcMethod {
  id: string;
  name: string;
}
