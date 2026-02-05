const http = require('http');

const data = JSON.stringify({
  lat: 10.0818,
  lng: 77.0728,
  depth: 2.5
});

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/predict',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  },
  timeout: 30000
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS:`, JSON.stringify(res.headers));
  res.setEncoding('utf8');
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });
  res.on('end', () => {
    console.log('BODY:', body);
    try {
      const parsed = JSON.parse(body);
      console.log('\nPARSED RESPONSE:');
      console.log('FoS:', parsed.prediction.details.FoS);
      console.log('Computed Cohesion:', parsed.prediction.details.computed_cohesion || parsed.prediction.details.cohesion);
      console.log('Computed Friction Angle:', parsed.prediction.details.computed_friction_angle || parsed.prediction.details.friction_angle);
      console.log('Shear Strength:', parsed.prediction.details.shear_strength);
      console.log('Shear Stress:', parsed.prediction.details.shear_stress);
      console.log('Clay:', parsed.input.clay);
      console.log('Sand:', parsed.input.sand);
      console.log('Silt:', parsed.input.silt);
      console.log('Saturation %:', parsed.prediction.details.saturation_percent);
    } catch(e) {
      console.log('Failed to parse response:', e.message);
    }
  });
});

req.on('error', (error) => {
  console.error(`Problem with request: ${error.message}`);
  console.error('Error code:', error.code);
  console.error('Full error:', error);
});

req.on('timeout', () => {
  console.error('Request timeout');
  req.destroy();
});

console.log('Sending request to http://localhost:5000/predict');
console.log('Data:', data);
req.write(data);
req.end();
