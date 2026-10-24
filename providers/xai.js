const { num, money } = require('./util');
const { netFetch } = require('./browser');

const pad = (n) => String(n).padStart(2, '0');

function monthRange(now = Date.now()) {
  const d = new Date(now);
  const fmt = (x) =>
    `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())} ${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}:${pad(x.getUTCSeconds())}`;
  return {
    startTime: fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))),
    endTime: fmt(d),
  };
}

// /v1/billing/teams/<team>/usage -> { windows: [], note } or { error }
function parseUsage(body) {
  if (!body || !Array.isArray(body.timeSeries)) return { error: 'xai_format' };
  let total = 0;
  for (const series of body.timeSeries) {
    for (const point of series.dataPoints || []) {
      const value = Array.isArray(point.values) ? num(point.values[0]) : null;
      if (value != null) total += value;
    }
  }
  return { windows: [], note: 'cost_month', noteParams: { amount: money('USD', total) } };
}

async function run(cfg) {
  const key = cfg.xaiManagementKey;
  const team = typeof cfg.xaiTeamId === 'string' ? cfg.xaiTeamId.trim() : '';
  if (!key) return { action: 'key', error: 'xai_nokey' };
  if (!team) return { action: 'key', error: 'xai_noteam' };

  const { startTime, endTime } = monthRange();
  const body = {
    analyticsRequest: {
      timeRange: { startTime, endTime, timezone: 'Etc/GMT' },
      timeUnit: 'TIME_UNIT_DAY',
      values: [{ name: 'usd', aggregation: 'AGGREGATION_SUM' }],
      groupBy: ['description'],
      filters: [],
    },
  };

  const r = await netFetch(`https://management-api.x.ai/v1/billing/teams/${encodeURIComponent(team)}/usage`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (r.status === 401 || r.status === 403) return { action: 'key', error: 'xai_badkey' };
  if (r.status === 404) return { error: 'xai_notfound' };
  if (r.status !== 200) return { error: 'http', errorParams: { name: 'xAI', status: r.status } };
  let json = null;
  try {
    json = await r.json();
  } catch (_) {}
  if (!json) return { error: 'xai_format' };
  return parseUsage(json);
}

module.exports = {
  id: 'xai',
  name: 'xAI (Grok)',
  loginUrl: null,
  settings: [
    { key: 'xaiManagementKey', type: 'secret' },
    { key: 'xaiTeamId', type: 'string' },
  ],
  run,
  parseUsage,
  monthRange,
};
