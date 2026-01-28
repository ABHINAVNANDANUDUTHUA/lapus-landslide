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
      console.log('Cohesion:', parsed.prediction.details.cohesion);
      console.log('Friction Angle:', parsed.prediction.details.friction_angle);
      console.log('Shear Strength:', parsed.prediction.details.shear_strength);
      console.log('Shear Stress:', parsed.prediction.details.shear_stress);
      console.log('Clay:', parsed.data.clay);
      console.log('Sand:', parsed.data.sand);
      console.log('Silt:', parsed.data.silt);
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
