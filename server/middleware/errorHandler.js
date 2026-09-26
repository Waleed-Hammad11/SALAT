const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  console.error('❌ Server Error:', err.message);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors || {}).map(e => e.message);
    return res.status(400).json({
      success: false,
      message: 'خطأ في صحة البيانات المرسلة',
      errors: messages
    });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'الحقل';
    return res.status(400).json({
      success: false,
      message: `${field} مستخدم بالفعل`
    });
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'معرّف غير صالح'
    });
  }

  const statusCode = err.statusCode && err.statusCode >= 400 && err.statusCode < 600
    ? err.statusCode
    : 500;

  const userMessage = statusCode === 500 && process.env.NODE_ENV === 'production'
    ? 'حدث خطأ في الخادم الداخلي'
    : (err.message || 'خطأ في الخادم');

  res.status(statusCode).json({
    success: false,
    message: userMessage
  });
};

module.exports = errorHandler;
