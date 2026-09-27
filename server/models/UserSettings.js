const mongoose = require('mongoose');

const userSettingsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  city: {
    type: String,
    default: 'Damietta',
    trim: true
  },
  country: {
    type: String,
    default: 'Egypt',
    trim: true
  },
  coordinates: {
    latitude: Number,
    longitude: Number
  },
  timeFormat: {
    type: String,
    enum: ['12h', '24h'],
    default: '12h'
  },
  method: {
    type: String,
    default: 'auto',
    enum: ['auto', '1', '2', '3', '4', '5', '8', '9', '10', '13', '15', '16', '17', '18', '20', '21', '23', '99']
  },
  school: {
    type: String,
    enum: ['0', '1'],
    default: '0' // 0 = Shafi'i, 1 = Hanafi
  },
  iqamaOffsets: {
    fajr:    { type: Number, default: 25, min: 0, max: 60 },
    dhuhr:   { type: Number, default: 20, min: 0, max: 60 },
    asr:     { type: Number, default: 15, min: 0, max: 60 },
    maghrib: { type: Number, default: 10, min: 0, max: 60 },
    isha:    { type: Number, default: 20, min: 0, max: 60 }
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Auto-update timestamp.
// Promise-style hooks: Mongoose 9 does not pass `next` to document middleware,
// so calling it would throw. `timestamps: true` is preferred in production,
// but these hooks keep behaviour identical for plain `save()` and
// `findOneAndUpdate()` without a broader schema change.
userSettingsSchema.pre('save', function () {
  this.updatedAt = Date.now();
});

userSettingsSchema.pre('findOneAndUpdate', function () {
  this.set({ updatedAt: Date.now() });
});

module.exports = mongoose.models.UserSettings || mongoose.model('UserSettings', userSettingsSchema);
