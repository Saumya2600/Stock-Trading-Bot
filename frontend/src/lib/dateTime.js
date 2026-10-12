const ATLANTIC_TIME_ZONE = 'America/Halifax';

function parseUtcTimestamp(value) {
  if (!value) return null;

  const timestamp = String(value);
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp);
  const normalized = hasTimeZone ? timestamp : `${timestamp}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatAtlanticDate(value) {
  const date = parseUtcTimestamp(value);
  return date
    ? new Intl.DateTimeFormat('en-US', {
      timeZone: ATLANTIC_TIME_ZONE,
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
    }).format(date)
    : 'N/A';
}

export function formatAtlanticTime(value) {
  const date = parseUtcTimestamp(value);
  return date
    ? new Intl.DateTimeFormat('en-US', {
      timeZone: ATLANTIC_TIME_ZONE,
      hour: 'numeric',
      minute: '2-digit',
    }).format(date)
    : 'N/A';
}

export function formatAtlanticDateTime(value) {
  const date = parseUtcTimestamp(value);
  return date
    ? new Intl.DateTimeFormat('en-US', {
      timeZone: ATLANTIC_TIME_ZONE,
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date)
    : 'N/A';
}