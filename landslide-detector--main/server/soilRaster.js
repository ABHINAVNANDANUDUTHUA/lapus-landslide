/**
 * Soil Raster Module
 * Provides soil properties for given coordinates using simple estimation
 * Can be extended with GeoTIFF data in the future
 */

// Initialize soil rasters (currently a no-op, can load GeoTIFF files here)
const initSoils = async () => {
  console.log("Initializing soil rasters...");
  // Placeholder for future GeoTIFF loading
  return Promise.resolve();
};

/**
 * Get soil properties for a given location
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} depth - Soil depth in cm (default: 2.5)
 * @returns {object} Soil properties including clay, sand, silt, cohesion, friction angle, etc.
 */
const getSoilProperties = (lat, lon, depth = 2.5) => {
  // Simple deterministic model based on coordinates
  // In production, this would read from GeoTIFF rasters
  
  const absLat = Math.abs(lat);
  const absLon = Math.abs(lon);
  const noise = (absLat * absLon * 1000) % 20;

  let clay, sand, silt, soilType;
  let cohesion = 20;
  let friction_angle = 28;
  let permeability = 5.0;
  let gamma = 17.5; // Unit weight in kN/m³

  // Zone-based soil properties
  if (absLat > 60) {
    // High latitude - glacial soils
    clay = 15 + noise;
    sand = 55 + noise;
    silt = 30 - noise;
    soilType = "sandy";
    cohesion = 15;
    friction_angle = 30;
  } else if (absLat < 23) {
    // Tropical - weathered soils
    clay = 40 + noise;
    sand = 25 + noise;
    silt = 35 - noise;
    soilType = "clayey";
    cohesion = 25;
    friction_angle = 26;
    gamma = 18.5;
  } else {
    // Temperate zone
    clay = 30 + noise;
    sand = 35 + noise;
    silt = 35 - noise;
    soilType = "loamy";
    cohesion = 20;
    friction_angle = 28;
  }

  // Adjust for depth
  if (depth > 1) {
    clay = Math.min(clay * 1.05, 60);
    cohesion = Math.max(cohesion * 0.95, 10);
  }

  return {
    clay: Math.max(0, Math.min(100, clay)),
    sand: Math.max(0, Math.min(100, sand)),
    silt: Math.max(0, Math.min(100, silt)),
    soilType,
    c: cohesion, // Cohesion in kPa
    phi: friction_angle, // Friction angle in degrees
    permeability, // in mm/h
    gamma, // Unit weight in kN/m³
  };
};

/**
 * Detect soil type from percentages
 * @param {number} clay - Clay percentage
 * @param {number} sand - Sand percentage
 * @param {number} silt - Silt percentage
 * @returns {string} Soil type classification
 */
const detectSoilType = (clay, sand, silt) => {
  const total = clay + sand + silt;
  const clayPct = (clay / total) * 100;
  const sandPct = (sand / total) * 100;
  const siltPct = (silt / total) * 100;

  if (clayPct > 40) {
    return "clay";
  } else if (sandPct > 50) {
    return "sand";
  } else if (siltPct > 50) {
    return "silt";
  } else if (clayPct > 27 && sandPct > 20) {
    return "clay-loam";
  } else if (clayPct < 27 && sandPct > 50) {
    return "sandy-loam";
  } else {
    return "loam";
  }
};

module.exports = {
  initSoils,
  getSoilProperties,
  detectSoilType,
};
