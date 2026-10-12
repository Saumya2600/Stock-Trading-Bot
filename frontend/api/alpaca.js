import { createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import process from 'node:process';

const COOKIE_NAME = 'stockbot_session';

const ENDPOINTS = {
  snapshots: {
    base: 'https://data.alpaca.markets',
    path: '/v2/stocks/snapshots',
    params: ['symbols', 'feed'],
  },
  bars: {
    base: 'https://data.alpaca.markets',
    path: '/v2/stocks/bars',
    params: ['symbols', 'timeframe', 'feed', 'start', 'end', 'limit', 'adjustment'],
  },
  movers: {
    base: 'https://data.alpaca.markets',
    path: '/v1beta1/screener/stocks/movers',
    params: ['top'],
  },
  most_actives: {
    base: 'https://data.alpaca.markets',
    path: '/v1beta1/screener/stocks/most-actives',
    params: ['by', 'top'],
  },
  positions: {
    base: 'https://paper-api.alpaca.markets',
    path: '/v2/positions',
    params: [],
    private: true,
  },
  account: {
    base: 'https://paper-api.alpaca.markets',
    path: '/v2/account',
    params: [],
    private: true,
  },
  orders: {
    base: 'https://paper-api.alpaca.markets',
    path: '/v2/orders',
    params: ['status', 'limit', 'direction'],
    private: true,
  },
};

function hasValidSession(req, secret) {
  const cookies = (req.headers.cookie || '').split(';');
  const entry = cookies.find(cookie => cookie.trim().startsWith(`${COOKIE_NAME}=`));
  if (!entry) return false;

  const [expiresAt, suppliedSignature] = entry.trim().slice(COOKIE_NAME.length + 1).split('.');
  if (!expiresAt || !suppliedSignature || Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false;

  const expectedSignature = createHmac('sha256', secret).update(expiresAt).digest('base64url');
  const expected = Buffer.from(expectedSignature);
  const supplied = Buffer.from(suppliedSignature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function pickFields(value, fields) {
  return Object.fromEntries(fields.filter(field => value[field] !== undefined).map(field => [field, value[field]]));
}

function filterPrivateResponse(endpoint, payload) {
  if (endpoint === 'account') {
    return pickFields(payload, ['cash', 'portfolio_value', 'equity', 'last_equity']);
  }

  if (endpoint === 'positions') {
    return Array.isArray(payload) ? payload.map(position => pickFields(position, [
      'symbol', 'qty', 'avg_entry_price', 'current_price', 'unrealized_pl',
      'unrealized_intraday_pl', 'unrealized_intraday_plpc', 'cost_basis', 'market_value',
    ])) : [];
  }

  if (endpoint === 'orders') {
    return Array.isArray(payload) ? payload.map(order => pickFields(order, [
      'symbol', 'side', 'status', 'filled_at', 'filled_qty', 'qty', 'filled_avg_price',
    ])) : [];
  }

  return payload;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  const sessionSecret = process.env.DASHBOARD_SESSION_SECRET;
  if (!key || !secret || !sessionSecret) {
    return res.status(503).json({ error: 'Vercel server environment is missing required configuration.' });
  }
  if (!hasValidSession(req, sessionSecret)) {
    return res.status(401).json({ error: 'Sign in to use Alpaca data.' });
  }

  const requestUrl = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const endpoint = requestUrl.searchParams.get('endpoint');
  const config = ENDPOINTS[endpoint];
  if (!config) return res.status(400).json({ error: 'Unsupported Alpaca endpoint.' });

  const upstreamUrl = new URL(config.path, config.base);
  for (const name of config.params) {
    const value = requestUrl.searchParams.get(name);
    if (value !== null) upstreamUrl.searchParams.set(name, value);
  }

  const symbols = upstreamUrl.searchParams.get('symbols');
  if (symbols && (!/^[a-zA-Z0-9.,\s-]+$/.test(symbols) || symbols.length > 2000)) {
    return res.status(400).json({ error: 'Invalid symbols parameter.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  res.setHeader('Cache-Control', 'private, no-store');

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        'APCA-API-KEY-ID': key,
        'APCA-API-SECRET-KEY': secret,
        accept: 'application/json',
      },
      signal: controller.signal,
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: payload.message || 'Alpaca request failed.' });
    }

    return res.status(200).json(config.private ? filterPrivateResponse(endpoint, payload) : payload);
  } catch (error) {
    const status = error.name === 'AbortError' ? 504 : 502;
    return res.status(status).json({ error: 'Could not reach Alpaca.' });
  } finally {
    clearTimeout(timeout);
  }
}