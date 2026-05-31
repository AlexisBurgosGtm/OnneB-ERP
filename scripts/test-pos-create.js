require('dotenv').config();
const http = require('http');

const emp = process.env.TEST_EMPNIT || 'ME-PETEN';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: 'localhost',
        port: process.env.PORT || 6500,
        path: `${path}${path.includes('?') ? '&' : '?'}empnit=${encodeURIComponent(emp)}`,
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(buf || '{}') });
          } catch {
            resolve({ status: res.statusCode, body: buf });
          }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  const cfg = await request('GET', '/api/pos/config');
  console.log('config', cfg.status, cfg.body?.coddocDefault);
  if (cfg.status !== 200) return process.exit(1);
  const ped = await request('POST', '/api/pos/pedidos', {
    USUARIO: 'TEST',
    CODCLIENTE: cfg.body.clienteDefault?.CODCLIENTE,
  });
  console.log('create', ped.status, ped.body?.header?.CODDOC, ped.body?.header?.CORRELATIVO);
  if (ped.status !== 201) {
    console.log(ped.body);
    process.exit(1);
  }
  const h = ped.body.header;
  const prod = await request('GET', '/api/pos/productos?q=101000&limit=5');
  const p = prod.body?.rows?.[0];
  if (!p) {
    console.log('no product');
    process.exit(0);
  }
  const pr = p.precios[0];
  const line = await request(
    'POST',
    `/api/pos/pedidos/${h.CODDOC}/${h.CORRELATIVO}/lineas`,
    { CODPROD: p.CODPROD, CODMEDIDA: pr.CODMEDIDA, CANTIDAD: 1 }
  );
  console.log('line', line.status, line.body?.pedido?.lines?.length);
  console.log('OK');
})().catch((e) => {
  console.error('Server must be running:', e.message);
  process.exit(1);
});
