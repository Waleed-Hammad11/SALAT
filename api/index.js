/**
 * Vercel serverless entry point.
 *
 * Vercel imports this module and invokes it per HTTP request. The Express app
 * in `server/server.js` is required — NOT started — because the platform owns
 * the TCP listener. `server.js` guards its `app.listen()` behind
 * `require.main === module`, so importing it is side-effect free apart from
 * middleware registration.
 *
 * The database warmup middleware lives inside `server.js`, registered ahead of
 * the routers, so it is not duplicated here: anything added after a route
 * handler never runs for that route. Mongoose is cached on `globalThis` by
 * `server/config/db.js`, so warm invocations reuse the same socket.
 */
const app = require('../server/server.js');

module.exports = app;
