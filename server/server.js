require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const prayerRoutes = require('./routes/prayer');
const settingsRoutes = require('./routes/settings');
const locationRoutes = require('./routes/location');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust reverse proxy (Cloudflare / Nginx / Render)
app.set('trust proxy', 1);

// ───── Security & Parser Middleware ─────
app.use(helmet({
  contentSecurityPolicy: false // Allow Angular inline styles and fonts
}));

// Origins are whitelist-driven via CLIENT_ORIGIN (comma-separated) so the
// public deployment can be pointed at its own domain without a code change.
const allowedOrigins = [
  'http://localhost:4200',
  'http://localhost:3000',
  'http://127.0.0.1:4200',
  'http://127.0.0.1:3000',
  ...(process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
];

app.use(cors({
  origin: (origin, callback) => {
    // No Origin header => same-origin navigation, curl, or a native client
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Dev stays permissive so `ng serve` on any port just works.
    if (process.env.NODE_ENV !== 'production') return callback(null, true);
    return callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ───── Rate Limiters ─────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  message: { success: false, message: 'كثرة الطلبات — يرجى المحاولة بعد قليل' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'محاولات دخول كثيرة — يرجى الانتظار 15 دقيقة' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ───── API Routes ─────
app.use('/api/auth', authRoutes);
app.use('/api/prayer', prayerRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/locations', locationRoutes);

// ───── Health Check ─────
app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = dbState === 1 ? 'connected' : dbState === 2 ? 'connecting' : 'disconnected';

  res.json({
    success: true,
    message: '🕌 SALAT API is running',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    database: dbStatus
  });
});

// ───── 404 for unknown API routes ─────
// Must be registered BEFORE the SPA fallback, otherwise unknown /api/* paths
// get index.html with a 200 instead of a JSON error.
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'المسار غير موجود' });
});

// ───── Serve Angular (Production) ─────
// On Vercel the static bundle is served by the CDN, so this block is skipped
// (the built folder is not part of the function bundle).
const clientPath = path.join(__dirname, '..', 'client', 'dist', 'client', 'browser');

if (process.env.NODE_ENV === 'production' && fs.existsSync(clientPath)) {
  app.use(express.static(clientPath, { maxAge: '1y', index: false }));

  // SPA fallback — Express 5 compliant (no bare '*')
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientPath, 'index.html'));
  });
}

// ───── Error Handler ─────
app.use(errorHandler);

// ───── Start Server ─────
let server;
const startServer = async () => {
  await connectDB();

  server = app.listen(PORT, () => {
    console.log(`\n🕌 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`   SALAT Server running on port ${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   API:  http://localhost:${PORT}/api/health`);
    console.log(`🕌 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  });
};

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  if (server) server.close(() => console.log('HTTP server closed'));
});

// Only listen when executed directly (`node server.js`).
// When imported as a module — e.g. by the Vercel serverless entry in /api —
// we must NOT bind a port; the platform owns the listener.
if (require.main === module) {
  startServer();
}

module.exports = app;
