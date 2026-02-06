const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();

/* ===================== BASIC SETUP ===================== */
app.use(cors());
app.use(express.json());

// Explicit CORS headers and preflight handling to cover serverless/platform edge cases
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Kerala Landslide Prediction API",
    timestamp: new Date().toISOString()
  });
});

/* ===================== WEATHER (REALTIME ONLY) ===================== */
const fetchWeather = async (lat, lon) => {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,precipitation` +
      `&daily=precipitation_sum&past_days=7&forecast_days=1`;

    const res = await axios.get(url, { timeout: 10000 });

    const rain7 = res.data.daily.precipitation_sum
      .slice(0, 7)
      .reduce((a, b) => a + (b || 0), 0);

    return {
      temperature: res.data.current.temperature_2m,
      humidity: res.data.current.relative_humidity_2m,
      rain_current: res.data.current.precipitation,
      rain_7day: rain7
    };
  } catch (err) {
    // Safe fallback
    return {
      temperature: 25,
      humidity: 70,
      rain_current: 0,
      rain_7day: 0
    };
  }
};

/* ===================== FIXED CLIMATE (KERALA) ===================== */
/* Climate is STATIC – no weather-based inference */
const CLIMATE = {
  zone: "Tropical Monsoon (Am)",
  vegetation: "dense"
};

/* ===================== SOIL STRENGTH (PDF-INSPIRED) ===================== */
const STRENGTH_TABLE = [
  { min: 0, max: 1.5, c: 35, phi: 28, gamma: 15.5 },
  { min: 1.5, max: 3.0, c: 32, phi: 30, gamma: 16.2 },
  { min: 3.0, max: 5.0, c: 28, phi: 31, gamma: 16.8 },
  { min: 5.0, max: 10.0, c: 25, phi: 32, gamma: 17.5 }
];

const getStrengthFromDepth = (z) => {
  return (
    STRENGTH_TABLE.find(r => z >= r.min && z < r.max) ||
    STRENGTH_TABLE[1]
  );
};

/**
 * Compute effective cohesion (c) and friction angle (phi) using:
 * - base strength per depth (STRENGTH_TABLE)
 * - soil composition (clay, sand, silt percentages)
 * - depth compaction
 * - saturation (reduces effective cohesion)
 * Returns { c, phi, gamma }
 */
const computeSoilStrength = (base, soil = { clay: 30, sand: 30, silt: 40 }, z = 2.5, saturation = 0) => {
  // copy base values
  let c = Number(base.c);
  let phi = Number(base.phi);
  const gamma = Number(base.gamma);

  // safe soil values
  const clay = Number((soil.clay || 0));
  const sand = Number((soil.sand || 0));
  const silt = Number((soil.silt || 0));

  // Reference composition (typical balanced soil)
  const refClay = 30;
  const refSand = 30;
  const refSilt = 40;

  // Adjust cohesion: clays increase cohesion, silt moderately increases cohesion
  // kC_clay: kPa per percent clay; kC_silt smaller
  const kC_clay = 0.6; // kPa per % clay
  const kC_silt = 0.2; // kPa per % silt
  const clayEffect = (clay - refClay) * kC_clay;
  const siltEffect = (silt - refSilt) * kC_silt;
  c = Math.max(0, c + clayEffect + siltEffect);

  // Round intermediate values for stability
  c = Number(c.toFixed(4));
  phi = Number(phi.toFixed(4));

  // Adjust friction angle: sand increases phi, clay decreases it slightly
  const kPhi_sand = 0.12; // degrees per % sand
  const kPhi_clay = -0.06; // degrees per % clay
  phi = phi + (sand - refSand) * kPhi_sand + (clay - refClay) * kPhi_clay;

  // Depth compaction: small increase per metre below 0.5m
  if (z > 0.5) {
    c = c * (1 + 0.005 * (z - 0.5)); // 0.5% per additional metre
    phi = phi + 0.2 * (z - 0.5); // 0.2 deg per additional metre
  }

  // Saturation reduces effective cohesion (loss of matric suction)
  // At full modelled saturation (saturation=1) reduce cohesion by up to 60%
  const c_effective = c * Math.max(0, 1 - 0.6 * Math.min(1, saturation));

  // Clamp reasonable bounds
  phi = Math.min(45, Math.max(12, phi));

  return {
    c: Number(c_effective),
    phi: Number(phi),
    gamma
  };
};

/* ===================== SOIL COMPOSITION (REGIONAL PATTERNS) ===================== */
const getSoilComposition = (lat, lon) => {
  // Regional soil patterns for Kerala and surrounding areas based on geological data
  const seed = Math.abs(lat * lon * 1000) % 100;

  let clay, sand, silt;

  // Kerala Western Ghats (9-13°N, 73-78°E) - Lateritic soils, high clay
  if (lat > 9 && lat < 13.5 && lon > 73 && lon < 78) {
    if (lon > 75.5) {
      // Western Ghats - Laterite, high clay content
      clay = 38 + (seed % 8);
      sand = 28 + (seed % 6);
    } else {
      // Coastal plains - moderate clay
      clay = 32 + (seed % 6);
      sand = 38 + (seed % 6);
    }
  } 
  // Southern Kerala (8-10°N) - Coastal alluvial
  else if (lat > 8 && lat < 10) {
    clay = 28 + (seed % 8);
    sand = 42 + (seed % 6);
  }
  // Central India (18-24°N) - Black soil, high clay
  else if (lat > 17 && lat < 25) {
    clay = 40 + (seed % 10);
    sand = 20 + (seed % 6);
  }
  // Northern plains (25-32°N) - Alluvial soils
  else if (lat > 24) {
    clay = 30 + (seed % 8);
    sand = 40 + (seed % 6);
  }
  // Default tropical
  else {
    clay = 35 + (seed % 8);
    sand = 30 + (seed % 6);
  }

  silt = Math.max(0, 100 - clay - sand);

  return {
    clay: Math.min(100, Math.max(0, clay)),
    sand: Math.min(100, Math.max(0, sand)),
    silt: Math.min(100, Math.max(0, silt))
  };
};

/* ===================== TOPOGRAPHY ===================== */
const calculateSlope = async (lat, lon) => {
  try {
    // sample center, north, south, east, west
    const d = 0.003;
    const url =
      `https://api.open-meteo.com/v1/elevation?` +
      `latitude=${lat},${lat + d},${lat - d},${lat},${lat}` +
      `&longitude=${lon},${lon},${lon},${lon + d},${lon - d}`;

    const res = await axios.get(url, { timeout: 10000 });
    const e = res.data.elevation;

    // Expected order: center, north, south, east, west
    const h0 = e[0];
    const hN = e[1];
    const hS = e[2];
    const hE = e[3];
    const hW = e[4];

    // If sampled elevations suggest water (majority of sampled points at or below sea level), treat as water (ocean/lake)
    const elevations = [h0, hN, hS, hE, hW].filter(h => typeof h === 'number');
    const waterCount = elevations.filter(h => h <= 0).length;
    const isWaterByElev = elevations.length > 0 && (waterCount / elevations.length) >= 0.6; // majority rule (~60%)
    let placeName = null;
    let placeClass = null;
    let placeType = null;

    if (isWaterByElev) {
      return { elevation: h0, slope: 0, isWater: true, isIce: false, place: placeName, place_class: placeClass, place_type: placeType };
    }

    // Try reverse-geocoding (Nominatim) to detect water bodies or glaciers/ice where elevation alone fails
    try {
      const geoUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
      const geoRes = await axios.get(geoUrl, {
        timeout: 5000, // allow more time for reverse-geocoding over ocean/remote regions
        headers: { 'User-Agent': 'KeralaLandslidePredictionAPI/1.0 (mailto:info@example.com)' }
      });

      const g = geoRes.data || {};
      const cls = (g.class || '').toLowerCase();
      const type = (g.type || '').toLowerCase();

      const waterTypes = ['sea','ocean','bay','strait','river','canal','reservoir','lake'];
      const iceTypes = ['glacier','ice_shelf','ice_cap','snowfield'];

      const isWaterByGeo = cls === 'water' || waterTypes.includes(type);
      const isIceByGeo = cls === 'natural' && iceTypes.includes(type) || iceTypes.includes(type);

      // capture place metadata if available
      placeName = g.display_name || null;
      placeClass = cls || null;
      placeType = type || null;

      if (isWaterByGeo) return { elevation: h0, slope: 0, isWater: true, isIce: false, place: placeName, place_class: placeClass, place_type: placeType };
      if (isIceByGeo) return { elevation: h0, slope: 0, isWater: false, isIce: true, place: placeName, place_class: placeClass, place_type: placeType };
    } catch (geoErr) {
      // reverse-geocode failed or timed out; continue with slope calculation
    }

    // Convert degree offsets to meters at the given latitude
    const latRad = (lat * Math.PI) / 180;
    const metersPerDegLat = 111320; // approximate
    const metersPerDegLon = 111320 * Math.cos(latRad);

    const distY = d * metersPerDegLat; // north-south spacing (m)
    const distX = d * metersPerDegLon; // east-west spacing (m)

    // central difference derivatives (m/m)
    const dzdx = (hE - hW) / (2 * distX);
    const dzdy = (hN - hS) / (2 * distY);

    const slopeDeg = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)) * (180 / Math.PI);

    return {
      elevation: h0,
      slope: Number(slopeDeg.toFixed(2)),
      isWater: false,
      isIce: false,
      place: placeName,
      place_class: placeClass,
      place_type: placeType
    };
  } catch (err) {
    return { elevation: 0, slope: 0, isWater: false, isIce: false, place: null, place_class: null, place_type: null };
  }
};

/* ===================== CORE PHYSICS ===================== */
const calculateRisk = (f) => {
  const z = Number(f.depth || 2.5);
  const slopeDeg = Number(f.slope || 0);
  const beta = slopeDeg * Math.PI / 180;

  const baseStrength = getStrengthFromDepth(z);
  const gamma = baseStrength.gamma;

  // Normal and shear stress on an infinite slope (unit width)
  const sigma = gamma * z * Math.cos(beta) * Math.cos(beta);
  const tau = gamma * z * Math.sin(beta) * Math.cos(beta);

  // Saturation from humidity + recent rainfall (0..1)
  // More accurate: combines base moisture from humidity with additional rainfall contribution
  const humidityFactor = Number(f.humidity || 70) / 100;
  const baseMoisture = 0.12 + 0.15 * humidityFactor;
  const rainMoisture = Math.min((f.rain_7day || 0) / 200, 0.6);
  const saturation = Math.min(baseMoisture + rainMoisture, 1);

  // Soil composition (percentages from features)
  const soil = { clay: Number(f.clay || 0), sand: Number(f.sand || 0), silt: Number(f.silt || 0) };

  // Compute effective cohesion and friction angle using soil composition, depth and saturation
  let { c, phi } = computeSoilStrength(baseStrength, soil, z, saturation);

  // Root cohesion (shallow only) - added on top of effective cohesion
  if (CLIMATE.vegetation === "dense" && z <= 1.5) {
    c += 15;
  }

  const pore_pressure = sigma * Math.min(saturation * 0.6, 0.6);

  const shear_strength =
    c + (sigma - pore_pressure) * Math.tan(phi * Math.PI / 180);

  const FoS = shear_strength / (tau + 0.01);

  // Keep the original FoS for decision logic but cap the displayed value at 3
  let risk = "Low";
  if (FoS < 1.0) risk = "Extreme";
  else if (FoS < 1.3) risk = "High";
  else if (FoS < 1.7) risk = "Medium";

  const displayFoS = Math.min(FoS, 3);

  // Return both top-level metrics and a details object for compatibility
  const roundedPhi = Number((phi).toFixed(1));

  // Expose diagnostics for reproducibility and debugging
  const baseC = Number(baseStrength.c);
  const basePhi = Number(baseStrength.phi);

  return {
    risk_level: risk,
    FoS: Number(displayFoS.toFixed(2)),
    shear_strength: Number(shear_strength.toFixed(2)),
    shear_stress: Number(tau.toFixed(2)),
    saturation_percent: Number((saturation * 100).toFixed(0)),
    friction_angle: roundedPhi,
    // richer diagnostic details
    details: {
      base_cohesion: Number(baseC.toFixed(2)),
      base_friction_angle: Number(basePhi.toFixed(2)),
      computed_cohesion: Number(c.toFixed(2)),
      computed_friction_angle: roundedPhi,
      root_cohesion_added: (CLIMATE.vegetation === "dense" && z <= 1.5) ? 15 : 0,
      gamma: Number(gamma.toFixed(2)),
      normal_stress: Number(sigma.toFixed(3)),
      pore_pressure: Number(pore_pressure.toFixed(3)),
      shear_strength: Number(shear_strength.toFixed(2)),
      shear_stress: Number(tau.toFixed(2)),
      FoS: Number(displayFoS.toFixed(2)),
      saturation_percent: Number((saturation * 100).toFixed(0))
    }
  };
};

/* ===================== API ===================== */
app.post("/predict", async (req, res) => {
  try {
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    const depth = Number(req.body.depth || 2.5);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: "Invalid coordinates" });
    }

    const [weatherOrig, topo] = await Promise.all([
      fetchWeather(lat, lng),
      calculateSlope(lat, lng)
    ]);

    // Allow manual rainfall override for simulation
    const manualRain = req.body.manualRain;
    const weather = { ...weatherOrig };
    let isSimulated = false;
    if (manualRain !== null && manualRain !== undefined && Number.isFinite(Number(manualRain))) {
      const mr = Number(manualRain);
      weather.rain_current = mr;
      // approximate 7-day cumulative as 7 × current (simple simulation)
      weather.rain_7day = mr * 7;
      isSimulated = true;
    }

    // If the sampled points are over water (e.g., ocean/lake) or ice (glacier/ice-shelf), report zeroed inputs and a maximum FoS
    if (topo && (topo.isWater || topo.isIce)) {
      const why = topo.isWater ? "water body" : "ice-covered area";

      // Zero out environmental inputs to make it explicit that landslide model is not applicable
      const features = {
        temperature: 0,
        humidity: 0,
        rain_current: 0,
        rain_7day: 0,
        elevation: 0,
        slope: 0,
        isWater: !!topo.isWater,
        isIce: !!topo.isIce,
        soil: null,
        depth: 0
      };

      const maxFoS = 3.0; // maximum display FoS used elsewhere in the app
      const prediction = {
        risk_level: `N/A (${why})`,
        FoS: maxFoS,
        message: `Location appears to be over ${why}; landslide risk not applicable`,
        details: {
          cohesion: 0,
          friction_angle: 0,
          shear_strength: 0,
          shear_stress: 0,
          FoS: maxFoS,
          saturation_percent: 0
        }
      };

      return res.json({
        location: { lat, lng },
        location_type: topo.isWater ? 'water' : 'ice',
        location_info: {
          place: topo.place || null,
          place_class: topo.place_class || null,
          place_type: topo.place_type || null
        },
        climate: CLIMATE,
        input: features,
        prediction,
        isSimulated,
        disclaimer: "Prediction model – not a deterministic guarantee",
        timestamp: new Date().toISOString()
      });
    }

    const soil = getSoilComposition(lat, lng);

    const features = {
      ...weather,
      ...topo,
      ...soil,
      depth
    };

    const prediction = calculateRisk(features);

    // Ensure FoS is capped at 3.00 in both top-level and details for consistent UI display
    if (prediction && typeof prediction.FoS === 'number') {
      prediction.FoS = Number(Math.min(prediction.FoS, 3.0).toFixed(2));
    }
    if (prediction && prediction.details && typeof prediction.details.FoS === 'number') {
      prediction.details.FoS = Number(Math.min(prediction.details.FoS, 3.0).toFixed(2));
    }

    res.json({
      location: { lat, lng },
      location_type: 'land',
      location_info: {
        place: topo.place || null,
        place_class: topo.place_class || null,
        place_type: topo.place_type || null
      },
      climate: CLIMATE,
      input: features,
      prediction,
      isSimulated,
      disclaimer: "Prediction model – not a deterministic guarantee",
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({
      error: "Prediction failed",
      message: err.message
    });
  }
});

/* ===================== SERVER ===================== */
const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log("✅ Kerala Landslide Prediction API");
    console.log("🌧️ Climate fixed: Tropical Monsoon (Am)");
    console.log(`🚀 Server running on port ${PORT}`);
  });
} else {
  // Export helpers for unit testing without starting the server
  module.exports = {
    app,
    computeSoilStrength,
    getStrengthFromDepth,
    calculateRisk
  };
}