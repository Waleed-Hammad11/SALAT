const express = require('express');
const router = express.Router();
const { getTimings, getTimingsByCoords, getMyTimings } = require('../controllers/prayerController');
const { auth } = require('../middleware/auth');

// Public endpoints
router.get('/times', getTimings);
router.get('/times-by-coords', getTimingsByCoords);

// Auth required — fetch times using saved settings
router.get('/times/today', auth, getMyTimings);

module.exports = router;
