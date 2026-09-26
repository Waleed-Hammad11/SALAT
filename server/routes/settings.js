const express = require('express');
const router = express.Router();
const { getSettings, updateSettings } = require('../controllers/settingsController');
const { auth } = require('../middleware/auth');

// All settings routes require auth
router.get('/', auth, getSettings);
router.put('/', auth, updateSettings);

module.exports = router;
