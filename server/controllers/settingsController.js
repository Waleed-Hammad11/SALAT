const UserSettings = require('../models/UserSettings');

/**
 * GET /api/settings
 * Get user settings (auth required)
 */
exports.getSettings = async (req, res, next) => {
  try {
    let settings = await UserSettings.findOne({ userId: req.user._id });

    // Create default settings if not found
    if (!settings) {
      settings = await UserSettings.create({ userId: req.user._id });
    }

    res.json({
      success: true,
      data: { settings }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/settings
 * Update user settings (auth required)
 */
exports.updateSettings = async (req, res, next) => {
  try {
    const allowedFields = ['city', 'country', 'method', 'school', 'timeFormat'];
    const updates = { updatedAt: new Date() };

    // Pick scalar allowed fields
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = String(req.body[field]).trim();
      }
    });

    // Handle coordinates if present
    if (req.body.coordinates && typeof req.body.coordinates === 'object') {
      const lat = parseFloat(req.body.coordinates.latitude);
      const lng = parseFloat(req.body.coordinates.longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        updates['coordinates.latitude'] = lat;
        updates['coordinates.longitude'] = lng;
      }
    }

    // Handle iqamaOffsets with dotted paths to prevent wiping other prayers
    if (req.body.iqamaOffsets && typeof req.body.iqamaOffsets === 'object') {
      const offsets = req.body.iqamaOffsets;
      const validPrayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

      validPrayers.forEach(p => {
        if (offsets[p] !== undefined) {
          const val = parseInt(offsets[p], 10);
          updates[`iqamaOffsets.${p}`] = Math.max(0, Math.min(60, isNaN(val) ? 0 : val));
        }
      });
    }

    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.user._id },
      { $set: updates },
      { new: true, upsert: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'تم حفظ الإعدادات',
      data: { settings }
    });
  } catch (error) {
    next(error);
  }
};
