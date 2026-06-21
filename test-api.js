const { spawn } = require('child_process');
const http = require('http');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function testEndpoint(path, method, body, cookie) {
  return new Promise((resolve) => {
    const options = { hostname: 'localhost', port: 4000, path, method: method || 'GET', headers: { 'Content-Type': 'application/json' } };
    if (cookie) options.headers['Cookie'] = cookie;
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data), cookies: res.headers['set-cookie'] }); }
        catch(e) { resolve({ status: res.statusCode, raw: data }); }
      });
    });
    req.on('error', (err) => resolve({ error: err.message }));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  const server = spawn('C:\\Program Files\\nodejs\\node.exe', ['backend/server.js'], { cwd: 'C:\\Users\\anwar\\OneDrive\\Desktop\\Revision S6\\Recherche operationnelle\\whatsapp-bot1-master' });
  server.stdout.on('data', d => process.stdout.write(d));
  server.stderr.on('data', d => process.stderr.write(d));
  
  await sleep(10000); // Wait for server to start
  
  console.log('\n=== API TESTS ===');
  
  const health = await testEndpoint('/health');
  console.log('1. Health:', health.status === 200 ? 'OK' : 'FAIL', JSON.stringify(health.data).substring(0,60));
  
  const login = await testEndpoint('/api/auth/login', 'POST', { email: 'admin@example.com', password: 'admin123' });
  console.log('2. Login:', login.status === 200 && login.data?.success ? 'OK' : 'FAIL', JSON.stringify(login.data).substring(0,80));
  const cookie = login.cookies ? login.cookies[0].split(';')[0] : null;
  
  if (cookie) {
    const ws = await testEndpoint('/api/v1/workspaces', 'GET', null, cookie);
    console.log('3. Workspaces:', ws.status === 200 && ws.data?.success ? 'OK' : 'FAIL', 'count=' + (ws.data?.workspaces?.length || 0));
    
    const conv = await testEndpoint('/api/conversations', 'GET', null, cookie);
    console.log('4. Conversations:', conv.status === 200 && conv.data?.success ? 'OK' : 'FAIL', 'count=' + (conv.data?.conversations?.length || 0));
    
    const contacts = await testEndpoint('/api/contacts', 'GET', null, cookie);
    console.log('5. Contacts:', contacts.status === 200 && contacts.data?.success ? 'OK' : 'FAIL', 'count=' + (contacts.data?.contacts?.length || 0));
    
    const auto = await testEndpoint('/api/automation', 'GET', null, cookie);
    console.log('6. Automation:', auto.status === 200 && auto.data?.success ? 'OK' : 'FAIL');
    
    const media = await testEndpoint('/api/media', 'GET', null, cookie);
    console.log('7. Media:', media.status === 200 && media.data?.success ? 'OK' : 'FAIL', 'count=' + (media.data?.media?.length || 0));
    
    const metrics = await testEndpoint('/api/metrics', 'GET', null, cookie);
    console.log('8. Metrics:', metrics.status === 200 && metrics.data?.success ? 'OK' : 'FAIL');
    
    const logs = await testEndpoint('/api/logs', 'GET', null, cookie);
    console.log('9. Logs:', logs.status === 200 && logs.data?.success ? 'OK' : 'FAIL', 'count=' + (logs.data?.logs?.length || 0));
    
    const qr = await testEndpoint('/api/qr', 'GET', null, cookie);
    console.log('10. QR:', qr.status === 200 && qr.data?.success ? 'OK' : 'FAIL');
    
    const logout = await testEndpoint('/api/auth/logout', 'POST', {}, cookie);
    console.log('11. Logout:', logout.status === 200 ? 'OK' : 'FAIL');
  } else {
    console.log('NO COOKIE - skipping authenticated tests');
  }
  
  console.log('=== TESTS COMPLETE ===');
  server.kill();
  setTimeout(() => process.exit(0), 1000);
}

main().catch(e => { console.error('Test error:', e.message); process.exit(1); });
