const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();

/* ===================== BASIC SETUP ===================== */
app.use(cors());
app.use(express.json());

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
      slope: Number(slopeDeg.toFixed(2))
    };
  } catch (err) {
    return { elevation: 0, slope: 0 };
  }
};

/* ===================== CORE PHYSICS ===================== */
const calculateRisk = (f) => {
  const z = Number(f.depth || 2.5);
  const slopeDeg = Number(f.slope || 0);
  const beta = slopeDeg * Math.PI / 180;

  const strength = getStrengthFromDepth(z);

  let c = strength.c;
  const phi = strength.phi;
  const gamma = strength.gamma;

  // Root cohesion (shallow only)
  if (CLIMATE.vegetation === "dense" && z <= 1.5) {
    c += 15;
  }

  const sigma = gamma * z * Math.cos(beta) * Math.cos(beta);
  const tau = gamma * z * Math.sin(beta) * Math.cos(beta);

  const saturation = Math.min(f.rain_7day / 150, 1);
  const pore_pressure = sigma * Math.min(saturation * 0.6, 0.6);

  const shear_strength =
    c + (sigma - pore_pressure) * Math.tan(phi * Math.PI / 180);

  const FoS = shear_strength / (tau + 0.01);

  let risk = "Low";
  if (FoS < 1.0) risk = "Extreme";
  else if (FoS < 1.3) risk = "High";
  else if (FoS < 1.7) risk = "Medium";

  // Return both top-level metrics and a details object for compatibility
  const roundedPhi = Number((phi).toFixed(1));
  return {
    risk_level: risk,
    FoS: Number(FoS.toFixed(2)),
    shear_strength: Number(shear_strength.toFixed(1)),
    shear_stress: Number(tau.toFixed(1)),
    saturation_percent: Number((saturation * 100).toFixed(0)),
    friction_angle: roundedPhi,
    // legacy-style details for older clients
    details: {
      cohesion: Number(c.toFixed(1)),
      friction_angle: roundedPhi,
      shear_strength: Number(shear_strength.toFixed(1)),
      shear_stress: Number(tau.toFixed(1)),
      FoS: Number(FoS.toFixed(2)),
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

    const soil = getSoilComposition(lat, lng);

    const features = {
      ...weather,
      ...topo,
      ...soil,
      depth
    };

    const prediction = calculateRisk(features);

    res.json({
      location: { lat, lng },
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
app.listen(PORT, () => {
  console.log("✅ Kerala Landslide Prediction API");
  console.log("🌧️ Climate fixed: Tropical Monsoon (Am)");
  console.log(`🚀 Server running on port ${PORT}`);
});
