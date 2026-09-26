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
  method: {
    type: String,
    default: 'auto',
    enum: ['auto', '1', '2', '3', '4', '5', '8', '9', '10', '13', '15', '16']
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

// Auto-update timestamp
userSettingsSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

userSettingsSchema.pre('findOneAndUpdate', function (next) {
  this.set({ updatedAt: Date.now() });
  next();
});

module.exports = mongoose.model('UserSettings', userSettingsSchema);
