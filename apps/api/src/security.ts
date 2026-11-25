import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 256)
    throw new Error('La contraseña debe tener entre 12 y 256 caracteres');
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (password.length > 256) return false;
  const [algorithm, salt, encoded] = hash.split(':');
  if (algorithm !== 'scrypt' || !salt || !encoded || !/^[0-9a-f]{128}$/.test(encoded)) return false;
  return timingSafeEqual(await derive(password, salt), Buffer.from(encoded, 'hex'));
}
export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
