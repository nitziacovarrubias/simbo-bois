import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSessionToken,
  hashSessionToken,
  hashPassword,
  verifyPassword,
} from '../apps/api/src/security.ts';
test('contraseña se almacena con sal distinta y verifica sin guardar texto', async () => {
  const a = await hashPassword('Contraseña de pruebas 2026');
  const b = await hashPassword('Contraseña de pruebas 2026');
  assert.notEqual(a, b);
  assert.ok(!a.includes('Contraseña'));
  assert.equal(await verifyPassword('Contraseña de pruebas 2026', a), true);
  assert.equal(await verifyPassword('Otra contraseña', a), false);
});
test('contraseña y hash inválidos se rechazan', async () => {
  await assert.rejects(hashPassword('corta'));
  assert.equal(await verifyPassword('x', 'invalid'), false);
});
test('sesión tiene token aleatorio y huella independiente', () => {
  const token = createSessionToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(token, createSessionToken());
  assert.equal(hashSessionToken(token).length, 64);
  assert.notEqual(hashSessionToken(token), token);
});
