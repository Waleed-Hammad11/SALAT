const mongoose = require('mongoose');

// Disable buffering so queries fail fast when DB is unreachable instead of hanging for 10s
mongoose.set('bufferCommands', false);

// Cache the connection on globalThis so warm serverless invocations (Vercel)
// reuse the same socket instead of opening a new one per request.
let cachedConn = globalThis.__salatMongoConn || null;

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    console.warn('⚠️ No MONGO_URI provided in environment. Running in database-less mode.');
    return;
  }

  // 1 = connected, 2 = connecting
  if (cachedConn && mongoose.connection.readyState === 1) return cachedConn;
  if (mongoose.connection.readyState === 1) {
    cachedConn = mongoose.connection;
    return cachedConn;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 30000,
    });
    cachedConn = conn;
    globalThis.__salatMongoConn = conn;
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    globalThis.__salatDbError = error.message;
    console.error(`❌ MongoDB Error: ${error.message}`);
    console.log('⚠️ Server running in resilient mode — prayer API operates directly via Aladhan API');
  }

  return cachedConn;
};

module.exports = connectDB;
