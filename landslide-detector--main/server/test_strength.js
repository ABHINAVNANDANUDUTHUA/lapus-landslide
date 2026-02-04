const assert = require('assert');
const { computeSoilStrength, getStrengthFromDepth, calculateRisk } = require('./index');

console.log('Running soil strength tests...');

// Test 1: clayey soil should have higher computed cohesion than sandy soil
const claySoilFeatures = { depth: 1.0, slope: 15, rain_7day: 0, clay: 40, sand: 30, silt: 30 };
const sandySoilFeatures = { depth: 1.0, slope: 15, rain_7day: 0, clay: 10, sand: 60, silt: 30 };

const rClay = calculateRisk(claySoilFeatures);
const rSand = calculateRisk(sandySoilFeatures);

console.log('Clay soil output:', rClay.details);
console.log('Sand soil output:', rSand.details);

assert(rClay.details.computed_cohesion > rSand.details.computed_cohesion, 'Clay soil computed cohesion should be greater than sandy soil');
assert(rSand.details.computed_friction_angle > rClay.details.computed_friction_angle, 'Sandy soil should have higher friction angle than clayey soil');

// Test 2: saturation reduces effective cohesion
const wetClay = { ...claySoilFeatures, rain_7day: 200 };
const rWetClay = calculateRisk(wetClay);
console.log('Wet clay output:', rWetClay.details);
assert(rWetClay.details.computed_cohesion < rClay.details.computed_cohesion, 'Saturation should reduce computed cohesion');

// Test 3: silt increase should increase cohesion slightly
const siltLow = { depth: 1.0, slope: 15, rain_7day: 0, clay: 30, sand: 40, silt: 30 };
const siltHigh = { depth: 1.0, slope: 15, rain_7day: 0, clay: 30, sand: 30, silt: 40 };
const rSiltLow = calculateRisk(siltLow);
const rSiltHigh = calculateRisk(siltHigh);
console.log('Silt low output:', rSiltLow.details);
console.log('Silt high output:', rSiltHigh.details);
assert(rSiltHigh.details.computed_cohesion > rSiltLow.details.computed_cohesion, 'Higher silt should increase computed cohesion slightly');

console.log('All tests passed ✅');
