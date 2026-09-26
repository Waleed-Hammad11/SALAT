const aladhanService = require('../services/aladhanService');
const UserSettings = require('../models/UserSettings');

/**
 * Validate input string (prevents injection, limits length)
 */
function sanitizeInput(val, maxLen = 100) {
  if (!val || typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen).replace(/[<>{}\\]/g, '');
}

/**
 * GET /api/prayer/times?city=X&country=Y&method=Z&school=S
 * Public endpoint — fetches prayer times (cached via MongoDB)
 */
exports.getTimings = async (req, res, next) => {
  try {
    const rawCity = sanitizeInput(req.query.city);
    const rawCountry = sanitizeInput(req.query.country);
    const rawMethod = sanitizeInput(req.query.method, 20);
    const rawSchool = sanitizeInput(req.query.school, 5);

    if (!rawCity || !rawCountry) {
      return res.status(400).json({
        success: false,
        message: 'المدينة والدولة مطلوبتان'
      });
    }

    const data = await aladhanService.getTimingsByCity(
      rawCity,
      rawCountry,
      rawMethod || 'auto',
      rawSchool || '0'
    );

    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: error.message || 'تعذر جلب مواقيت الصلاة حالياً'
    });
  }
};

/**
 * GET /api/prayer/times/today
 * Auth required — uses user's saved location
 */
exports.getMyTimings = async (req, res, next) => {
  try {
    const settings = await UserSettings.findOne({ userId: req.user._id });

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على الإعدادات — يرجى ضبط الموقع أولاً'
      });
    }

    const data = await aladhanService.getTimingsByCity(
      settings.city,
      settings.country,
      settings.method,
      settings.school
    );

    res.json({
      success: true,
      data: {
        ...data,
        settings: {
          city: settings.city,
          country: settings.country,
          method: settings.method,
          school: settings.school,
          iqamaOffsets: settings.iqamaOffsets
        }
      }
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: error.message || 'تعذر جلب مواقيت الصلاة حالياً'
    });
  }
};
