import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, timeout, retry } from 'rxjs/operators';
import { PrayerResponse, Country, CalcMethod } from '../models/prayer.model';

@Injectable({ providedIn: 'root' })
export class PrayerService {
  // Uses relative path so both local proxy and production reverse-proxy work seamlessly
  private baseUrl = '/api';

  constructor(private http: HttpClient) {}

  getTimings(city: string, country: string, method: string = 'auto', school: string = '0'): Observable<PrayerResponse> {
    return this.http.get<{ success: boolean; data: PrayerResponse }>(
      `${this.baseUrl}/prayer/times`,
      { params: { city, country, method, school } }
    ).pipe(
      timeout(8000),
      retry(1),
      map(res => res.data)
    );
  }

  getCountries(lang: string = 'ar'): Observable<Country[]> {
    return this.http.get<{ success: boolean; data: { countries: Country[] } }>(
      `${this.baseUrl}/locations/countries`,
      { params: { lang } }
    ).pipe(
      timeout(8000),
      map(res => res.data.countries)
    );
  }

  getMethods(): Observable<CalcMethod[]> {
    return this.http.get<{ success: boolean; data: { methods: CalcMethod[] } }>(
      `${this.baseUrl}/locations/methods`
    ).pipe(
      timeout(8000),
      map(res => res.data.methods)
    );
  }
}
