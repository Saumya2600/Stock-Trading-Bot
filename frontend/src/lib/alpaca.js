export async function alpacaRequest(endpoint, params = {}) {
  const query = new URLSearchParams({ endpoint });
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) query.set(name, String(value));
  }

  const response = await fetch(`/api/alpaca?${query}`, { credentials: 'same-origin' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Alpaca request failed (${response.status}).`);
  return payload;
}