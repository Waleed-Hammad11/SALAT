const mongoose = require('mongoose');

const prayerCacheSchema = new mongoose.Schema({
  cacheKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  city: { type: String, required: true },
  country: { type: String, required: true },
  method: { type: String, required: true },
  school: { type: String, required: true },
  timezone: { type: String, default: 'UTC' },
  timings: {
    Fajr:    { type: String, required: true },
    Sunrise: { type: String, required: true },
    Dhuhr:   { type: String, required: true },
    Asr:     { type: String, required: true },
    Maghrib: { type: String, required: true },
    Isha:    { type: String, required: true }
  },
  hijri: {
    day:     String,
    monthEn: String,
    monthAr: String,
    year:    String
  },
  gregorian: String,
  methodName: String,
  meta: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  fetchedAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 } // MongoDB TTL: auto-delete when expired
  }
});

// Static: generate cache key safely
prayerCacheSchema.statics.buildKey = function (city, country, method, school, dateStr) {
  const d = dateStr || new Date().toISOString().split('T')[0];
  const c = String(city || '').trim().toLowerCase().replace(/\s+/g, '-');
  const co = String(country || '').trim().toLowerCase().replace(/\s+/g, '-');
  const m = String(method || 'auto').trim().toLowerCase();
  const s = String(school || '0').trim();
  return `${c}_${co}_${m}_${s}_${d}`;
};

module.exports = mongoose.model('PrayerCache', prayerCacheSchema);
