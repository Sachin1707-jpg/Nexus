import { z } from 'zod';
import * as W from '../integrations/weather.js';
import { getSettings } from '../services/settings.js';
import { ok, ask } from './helpers.js';

async function locate(location) {
  const name = location || getSettings().location;
  if (!name) return { clarify: ask('Which city or place do you mean? (You can also set a default location in Settings.)') };
  const r = await W.geocode(name.split(',')[0].trim());
  if (!r.length) return { clarify: ask(`I couldn't find a place called "${name}". Could you give the city name?`) };
  return { place: r[0], alternatives: r.slice(1, 3) };
}
export const weatherTools = [
  { name: 'weather_forecast', domain: 'weather', risk: 'read', description: 'Get current weather and a 7-day forecast for a place name. Uses the default location if none is given.',
    schema: { location: z.string().optional() },
    handler: async (a) => { const l = await locate(a.location); if (l.clarify) return l.clarify; const f = await W.forecast({ lat: l.place.lat, lon: l.place.lon, tz: l.place.tz }); return ok({ place: l.place, current: f.current, daily: f.daily }); } },
  { name: 'weather_outing_advice', domain: 'weather', risk: 'read', description: 'Assess whether a day is suitable for an outdoor plan, from real forecast data. date is YYYY-MM-DD.',
    schema: { location: z.string().optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) },
    handler: async (a) => { const l = await locate(a.location); if (l.clarify) return l.clarify; const f = await W.forecast({ lat: l.place.lat, lon: l.place.lon, tz: l.place.tz }); return ok({ place: l.place, assessment: W.assessOuting(f, a.date), source: 'Open-Meteo' }); } },
];
