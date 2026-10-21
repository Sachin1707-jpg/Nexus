import { z } from 'zod';
import * as N from '../integrations/news.js';
import { ok } from './helpers.js';

export const newsTools = [
  {
    name: 'news_get_latest',
    domain: 'news',
    risk: 'read',
    description: 'Fetch the top 5 latest news headlines (tech, sports, business, general) or search for specific news topics.',
    schema: {
      category: z.enum(['tech', 'sports', 'business', 'general']).optional().default('tech'),
      query: z.string().optional()
    },
    handler: async (a) => ok(await N.getLatestNews(a))
  }
];
