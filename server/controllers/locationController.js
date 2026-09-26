const { COUNTRIES, METHODS } = require('../utils/constants');

/**
 * GET /api/locations/countries
 * Returns all countries with their cities (public)
 */
exports.getCountries = (req, res) => {
  const lang = req.query.lang || 'ar';

  const data = COUNTRIES.map(country => ({
    code: country.c,
    name: lang === 'ar' ? country.ar : country.c,
    cities: country.cities.map(city => ({
      code: city[0],
      name: lang === 'ar' ? city[1] : city[0]
    }))
  }));

  res.json({
    success: true,
    data: { countries: data }
  });
};

/**
 * GET /api/locations/methods
 * Returns all calculation methods (public)
 */
exports.getMethods = (req, res) => {
  const data = METHODS.map(m => ({
    id: m[0],
    name: m[1]
  }));

  res.json({
    success: true,
    data: { methods: data }
  });
};
