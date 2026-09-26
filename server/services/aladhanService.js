const PrayerCache = require('../models/PrayerCache');
const mongoose = require('mongoose');
const { AUTO_BY_COUNTRY, AR_MONTHS, FALLBACK } = require('../utils/constants');

const ALADHAN_BASE = 'https://api.aladhan.com/v1';

// In-flight request deduplication to prevent cache stampede
const inFlightRequests = new Map();

// Known Aladhan geocoding edge cases mapping
const CITY_COUNTRY_ALIASES = {
  'faiyum,egypt': { city: 'Fayoum', country: 'Egypt' },
  'fayoum,egypt': { city: 'Fayoum', country: 'Egypt' },
  'jerusalem,palestine': { city: 'Jerusalem', country: 'Palestinian Territory' },
  'gaza,palestine': { city: 'Gaza', country: 'State of Palestine' },
  'hebron,palestine': { city: 'Hebron', country: 'Palestinian Territory' },
  'nablus,palestine': { city: 'Nablus', country: 'Palestinian Territory' }
};

/**
 * Resolve "auto" method to actual method number based on country
 */
function resolveMethod(method, country) {
  if (method && method !== 'auto') {
    return String(method);
  }
  const key = String(country || '').trim().toLowerCase();
  return AUTO_BY_COUNTRY[key] || '3'; // Default to Muslim World League (MWL)
}

/**
 * Clean time string (removes timezone suffixes like " (EET)")
 */
function cleanHM(s) {
  return String(s || '').split(' ')[0].trim();
}

/**
 * Check if MongoDB connection is ready
 */
function isDBConnected() {
  return mongoose.connection.readyState === 1;
}

/**
 * Normalize DD-MM-YYYY to YYYY-MM-DD
 */
function normalizeDateStr(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const parts = dateStr.split('-');
  if (parts.length === 3 && parts[0].length === 2 && parts[2].length === 4) {
    // DD-MM-YYYY -> YYYY-MM-DD
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
}

/**
 * Fetch prayer times with cache-first strategy and in-flight deduplication
 */
async function getTimingsByCity(rawCity, rawCountry, rawMethod = 'auto', rawSchool = '0') {
  // 1. Sanitize and validate inputs
  const city = String(rawCity || '').trim();
  const country = String(rawCountry || '').trim();
  let method = String(rawMethod || 'auto').trim();
  let school = String(rawSchool || '0').trim();

  if (!/^(auto|[0-9]{1,2}|99)$/.test(method)) {
    method = 'auto';
  }
  if (school !== '0' && school !== '1') {
    school = '0';
  }

  const effectiveMethod = resolveMethod(method, country);

  // Check alias for geocoding
  const aliasKey = `${city.toLowerCase()},${country.toLowerCase()}`;
  const geocoded = CITY_COUNTRY_ALIASES[aliasKey] || { city, country };

  const cacheKey = PrayerCache.buildKey(city, country, effectiveMethod, school);

  // 2. Prevent cache stampede: check if already in flight
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  const fetchPromise = (async () => {
    // 3. Check MongoDB Cache first
    if (isDBConnected()) {
      try {
        const cached = await PrayerCache.findOne({ cacheKey });
        if (cached && cached.timings) {
          return {
            timings: cached.timings,
            hijri: cached.hijri,
            gregorian: cached.gregorian,
            methodName: cached.methodName,
            timezone: cached.timezone || cached.meta?.timezone || 'UTC',
            cached: true
          };
        }
      } catch (cacheErr) {
        console.warn('⚠️ Cache read warning:', cacheErr.message);
      }
    }

    // 4. Fetch from Aladhan API with timeout
    try {
      const params = new URLSearchParams({
        city: geocoded.city,
        country: geocoded.country,
        method: effectiveMethod,
        school: school
      });

      const url = `${ALADHAN_BASE}/timingsByCity?${params.toString()}`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(6000)
      });

      if (!response.ok) {
        throw new Error(`Aladhan API responded with status ${response.status}`);
      }

      const data = await response.json();
      if (!data || data.code !== 200 || !data.data || !data.data.timings) {
        throw new Error(data?.data || 'Invalid response from Aladhan API');
      }

      const tm = data.data.timings;
      const timings = {
        Fajr:    cleanHM(tm.Fajr),
        Sunrise: cleanHM(tm.Sunrise),
        Dhuhr:   cleanHM(tm.Dhuhr),
        Asr:     cleanHM(tm.Asr),
        Maghrib: cleanHM(tm.Maghrib),
        Isha:    cleanHM(tm.Isha)
      };

      const h = data.data.date.hijri;
      const hijri = {
        day: String(h?.day || ''),
        monthEn: h?.month?.en || '',
        monthAr: AR_MONTHS[h?.month?.en] || h?.month?.ar || h?.month?.en || '',
        year: String(h?.year || '')
      };

      const rawGreg = data.data.date.gregorian?.date;
      const gregorian = normalizeDateStr(rawGreg);
      const methodName = data.data.meta?.method?.name || '';
      const timezone = data.data.meta?.timezone || 'UTC';

      // 5. Store in MongoDB Cache with 24-hour TTL
      if (isDBConnected()) {
        try {
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
          await PrayerCache.findOneAndUpdate(
            { cacheKey },
            {
              city,
              country,
              method: effectiveMethod,
              school,
              timings,
              hijri,
              gregorian,
              methodName,
              timezone,
              meta: data.data.meta,
              expiresAt
            },
            { upsert: true, new: true }
          );
        } catch (writeErr) {
          console.warn('⚠️ Cache write warning:', writeErr.message);
        }
      }

      return {
        timings,
        hijri,
        gregorian,
        methodName,
        timezone,
        cached: false
      };

    } catch (apiError) {
      console.error(`⚠️ Aladhan API failed for (${city}, ${country}):`, apiError.message);

      // Only return hardcoded fallback if Damietta specifically was requested
      if (city.toLowerCase() === 'damietta' && country.toLowerCase() === 'egypt') {
        return {
          timings: {
            Fajr: FALLBACK.Fajr, Sunrise: FALLBACK.Sunrise,
            Dhuhr: FALLBACK.Dhuhr, Asr: FALLBACK.Asr,
            Maghrib: FALLBACK.Maghrib, Isha: FALLBACK.Isha
          },
          hijri: FALLBACK.hijri,
          gregorian: FALLBACK.greg,
          methodName: FALLBACK.methodName,
          timezone: FALLBACK.timezone,
          cached: false,
          offline: true
        };
      }

      // For any other city, throw so the caller receives a proper 503 error
      throw new Error(`تعذر جلب مواقيت الصلاة لمدينة (${city}). يرجى المحاولة لاحقاً.`);
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}

module.exports = {
  getTimingsByCity,
  resolveMethod
};
