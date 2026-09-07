#!/usr/bin/env node
// Script para probar el servidor NC

const http = require('http');

// Iniciar servidor node server.js en segundo plano
const child = require('child_process');
const serverProcess = child.spawn('node', ['server.js'], {
  cwd: 'C:\\Users\\abraham\\Downloads\\addon-manager',
  stdio: ['pipe', 'pipe', 'ignore']
});

let started = 0;
let maxRetries = 10;

serverProcess.stdout.on('data', (data) => {
  const text = data.toString();
  if (text.includes('🚀 Nodowa Network') && started === 0) {
    started = 1;
    console.log('✅ Servidor iniciado, esperando peticiones...');
    
    // Pequeña espera para que el server termine de iniciar
    setTimeout(() => {
      testEndpoints();
      // Después de probar, mata el proceso
      serverProcess.kill();
      process.exit(0);
    }, 500);
  }
});

serverProcess.stderr.on('data', (data) => {
  console.error('Error del servidor:', data.toString());
});

serverProcess.on('error', (err) => {
  console.error('Error al iniciar servidor:', err);
});

function testEndpoints() {
  const base = 'http://localhost:3334';
  
  console.log('\n=== PROBANDO ENDPOINTS NC ===\n');
  
  // Test 1: Configuración
  const req1 = http.request(`${base}/api/nc/config`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('1. GET /api/nc/config:', data);
      
      // Test 2: Crear listado (necesita usuario en db)
      testCreateListing();
    });
  });
  req1.end();
  
  function testCreateListing() {
    const req2 = http.request(`${base}/api/nc/?username=testplayer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('2. POST /api/nc/ (crear listado):', data);
        testBuyListing();
      });
    });
    req2.end(JSON.stringify({ amount: 500 }));
  }
  
  function testBuyListing() {
    const req3 = http.request(`${base}/api/nc/buy/testlistingid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('3. POST /api/nc/buy/:listingId:', data);
        console.log('\n=== TODOS LOS TESTS COMPLETADOS ===\n');
      });
    });
    req3.end(JSON.stringify({ buyerUsername: 'buyer1' }));
  }
}