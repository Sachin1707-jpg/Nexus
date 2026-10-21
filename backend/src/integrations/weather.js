import { httpError } from '../security/paths.js';

const WMO = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Rain showers', 81: 'Heavy showers', 82: 'Violent showers', 95: 'Thunderstorm', 96: 'Thunderstorm, hail', 99: 'Severe thunderstorm' };
export const describeCode = (c) => WMO[c] ?? 'Unknown';

async function getJson(url) {
  let r;
  try { r = await fetch(url, { signal: AbortSignal.timeout(10000) }); } catch { throw httpError(502, 'Weather service is unreachable right now.', 'weather_network'); }
  if (!r.ok) throw httpError(502, `Weather service error (${r.status}).`, 'weather_api');
  return r.json();
}
export async function geocode(name) {
  const u = new URL('https://geocoding-api.open-meteo.com/v1/search');
  u.search = new URLSearchParams({ name, count: '5', language: 'en', format: 'json' });
  const j = await getJson(u);
  return (j.results ?? []).map((x) => ({ name: x.name, region: x.admin1, country: x.country, lat: x.latitude, lon: x.longitude, tz: x.timezone }));
}
export async function forecast({ lat, lon, tz = 'auto', days = 7 }) {
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.search = new URLSearchParams({
    latitude: lat, longitude: lon, timezone: tz, forecast_days: String(Math.min(days, 16)),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
    hourly: 'temperature_2m,precipitation_probability,precipitation,wind_speed_10m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,uv_index_max',
  });
  const j = await getJson(u);
  return {
    timezone: j.timezone,
    current: { ...j.current, summary: describeCode(j.current?.weather_code) },
    daily: j.daily.time.map((d, i) => ({ date: d, summary: describeCode(j.daily.weather_code[i]), tMax: j.daily.temperature_2m_max[i], tMin: j.daily.temperature_2m_min[i], rainProb: j.daily.precipitation_probability_max[i], rainMm: j.daily.precipitation_sum[i], windMax: j.daily.wind_speed_10m_max[i], uv: j.daily.uv_index_max[i] })),
    hourly: j.hourly.time.map((t, i) => ({ time: t, temp: j.hourly.temperature_2m[i], rainProb: j.hourly.precipitation_probability[i], rainMm: j.hourly.precipitation[i], wind: j.hourly.wind_speed_10m[i], code: j.hourly.weather_code[i] })),
  };
}

/** Rule-based outing assessment grounded only in retrieved data. */
export function assessOuting(fc, date) {
  const day = fc.daily.find((d) => d.date === date);
  if (!day) return { available: false, message: `No forecast is available for ${date}.` };
  const hrs = fc.hourly.filter((h) => h.time.startsWith(date) && +h.time.slice(11, 13) >= 8 && +h.time.slice(11, 13) <= 20);
  const scored = hrs.map((h) => ({ ...h, bad: (h.rainProb ?? 0) >= 40 || h.rainMm > 0.5 || h.wind > 35 || h.temp > 38 || h.temp < 5 }));
  const good = scored.filter((h) => !h.bad);
  // contiguous window of good hours
  let best = [], cur = [];
  for (const h of scored) { if (!h.bad) { cur.push(h); if (cur.length > best.length) best = [...cur]; } else cur = []; }
  const issues = [];
  if (day.rainProb >= 60) issues.push('high chance of rain'); else if (day.rainProb >= 30) issues.push('some chance of rain');
  if (day.tMax >= 36) issues.push('very hot'); if (day.tMax >= 32 && day.tMax < 36) issues.push('hot afternoon');
  if (day.tMin <= 8) issues.push('cold');
  if (day.windMax >= 35) issues.push('strong wind');
  if (day.uv >= 8) issues.push('strong UV');
  const level = day.rainProb >= 60 || day.tMax >= 38 || day.windMax >= 45 ? 'poor' : issues.length >= 2 || day.rainProb >= 30 ? 'fair' : 'good';
  return {
    available: true, date, level, issues, day,
    window: best.length >= 2 ? { from: best[0].time.slice(11, 16), to: best.at(-1).time.slice(11, 16) } : null,
    goodHours: good.length,
    note: 'Based on the Open-Meteo forecast only. Forecasts change; check again before leaving and consider local conditions and any official warnings.',
  };
}
