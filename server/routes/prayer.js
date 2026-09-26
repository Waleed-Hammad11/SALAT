const express = require('express');
const router = express.Router();
const { getTimings, getMyTimings } = require('../controllers/prayerController');
const { auth } = require('../middleware/auth');

// Public — anyone can fetch prayer times
router.get('/times', getTimings);

// Auth required — fetch times using saved settings
router.get('/times/today', auth, getMyTimings);

module.exports = router;
