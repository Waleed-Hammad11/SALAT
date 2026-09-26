const express = require('express');
const router = express.Router();
const { getCountries, getMethods } = require('../controllers/locationController');

// Public endpoints
router.get('/countries', getCountries);
router.get('/methods', getMethods);

module.exports = router;
