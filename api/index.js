/**
 * Vercel serverless entry point.
 *
 * Vercel imports this module and invokes it per HTTP request. The Express app
 * in `server/server.js` is required — NOT started — because the platform owns
 * the TCP listener. `server.js` guards its `app.listen()` behind
 * `require.main === module`, so importing it is side-effect free apart from
 * middleware registration.
 *
 * Mongoose is warmed once per cold start and then reused across warm
 * invocations via the cache on `globalThis` in `server/config/db.js`.
 */
const app = require('../server/server.js');
const connectDB = require('../server/config/db.js');

// Ensure the database is connected before handling the first request of a
// cold start. Cached afterwards, so warm invocations skip straight through.
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    // Never block a request on infrastructure — the prayer endpoints degrade
    // gracefully to the Aladhan API and then to the local fallback.
    console.error('DB warmup failed:', error.message);
    next();
  }
});

module.exports = app;
