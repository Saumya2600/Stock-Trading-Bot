import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import process from 'node:process';

const COOKIE_NAME = 'stockbot_session';
const SESSION_SECONDS = 8 * 60 * 60;

function getConfig() {
  return {
    password: process.env.DASHBOARD_PASSWORD,
    secret: process.env.DASHBOARD_SESSION_SECRET,
  };
}

function signature(expiresAt, secret) {
  return createHmac('sha256', secret).update(String(expiresAt)).digest('base64url');
}

function getCookie(req) {
  const cookies = (req.headers.cookie || '').split(';');
  const entry = cookies.find(cookie => cookie.trim().startsWith(`${COOKIE_NAME}=`));
  return entry ? entry.trim().slice(COOKIE_NAME.length + 1) : '';
}

function isAuthorized(req, secret) {
  const [expiresAt, suppliedSignature] = getCookie(req).split('.');
  if (!expiresAt || !suppliedSignature || Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false;

  const expected = Buffer.from(signature(expiresAt, secret));
  const supplied = Buffer.from(suppliedSignature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function setSessionCookie(res, value, maxAge) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`
  );
}

export default function handler(req, res) {
  const { password, secret } = getConfig();
  if (!password || !secret) {
    return res.status(503).json({ error: 'Dashboard authentication is not configured.' });
  }

  if (req.method === 'GET') {
    return res.status(200).json({ authenticated: isAuthorized(req, secret) });
  }

  if (req.method === 'DELETE') {
    setSessionCookie(res, '', 0);
    return res.status(200).json({ authenticated: false });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const submittedPassword = String(req.body?.password || '');
  const expectedHash = createHash('sha256').update(password).digest();
  const submittedHash = createHash('sha256').update(submittedPassword).digest();
  if (!timingSafeEqual(expectedHash, submittedHash)) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  setSessionCookie(res, `${expiresAt}.${signature(expiresAt, secret)}`, SESSION_SECONDS);
  return res.status(200).json({ authenticated: true });
}