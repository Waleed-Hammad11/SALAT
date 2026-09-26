const mongoose = require('mongoose');

// Disable buffering so queries fail fast when DB is unreachable instead of hanging for 10s
mongoose.set('bufferCommands', false);

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    console.warn('⚠️ No MONGO_URI provided in environment. Running in database-less mode.');
    return;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 30000,
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB Error: ${error.message}`);
    console.log('⚠️ Server running in resilient mode — prayer API operates directly via Aladhan API');
  }
};

module.exports = connectDB;
