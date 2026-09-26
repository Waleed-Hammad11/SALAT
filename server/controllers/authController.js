const jwt = require('jsonwebtoken');
const User = require('../models/User');
const UserSettings = require('../models/UserSettings');

/**
 * Generate JWT token
 */
function generateToken(userId) {
  const secret = process.env.JWT_SECRET || 'salat_default_dev_secret_key_32_bytes_long';
  return jwt.sign({ id: userId }, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
}

/**
 * POST /api/auth/register
 */
exports.register = async (req, res, next) => {
  try {
    const rawEmail = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const displayName = String(req.body.displayName || '').trim();
    const language = req.body.language === 'en' ? 'en' : 'ar';

    if (!rawEmail || !password) {
      return res.status(400).json({
        success: false,
        message: 'البريد الإلكتروني وكلمة المرور مطلوبان'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'كلمة المرور يجب أن لا تقل عن 8 خانات'
      });
    }

    // Check if user exists
    const existing = await User.findOne({ email: rawEmail });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'البريد الإلكتروني مسجل بالفعل'
      });
    }

    // Create user
    const user = await User.create({
      email: rawEmail,
      password,
      displayName: displayName || rawEmail.split('@')[0],
      language
    });

    // Create default settings
    await UserSettings.create({ userId: user._id });

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'تم التسجيل بنجاح',
      data: {
        user: user.toJSON(),
        token
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/login
 */
exports.login = async (req, res, next) => {
  try {
    const rawEmail = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!rawEmail || !password) {
      return res.status(400).json({
        success: false,
        message: 'البريد الإلكتروني وكلمة المرور مطلوبان'
      });
    }

    // Find user with password
    const user = await User.findOne({ email: rawEmail }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'بيانات الدخول غير صحيحة'
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'بيانات الدخول غير صحيحة'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      data: {
        user: user.toJSON(),
        token
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auth/me
 */
exports.getMe = async (req, res) => {
  res.json({
    success: true,
    data: { user: req.user }
  });
};
