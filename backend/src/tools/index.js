import { taskTools } from './tasks.js';
import { calendarTools } from './calendar.js';
import { emailTools } from './email.js';
import { weatherTools } from './weather.js';
import { systemTools } from './system.js';
import { githubTools } from './github.js';
import { memoryTools } from './memory.js';
import { newsTools } from './news.js';
import { actionStatusTools } from './action_status.js';

export function validateTools(tools) {
  const seen = new Set();
  for (const t of tools) {
    if (seen.has(t.name)) {
      throw new Error(`Duplicate tool registered: "${t.name}"`);
    }
    seen.add(t.name);
  }
}

/** Central tool registry. Tool definitions are the single source of truth for MCP and the orchestrator. */
export const TOOLS = [
  ...taskTools,
  ...calendarTools,
  ...emailTools,
  ...weatherTools,
  ...systemTools,
  ...githubTools,
  ...memoryTools,
  ...newsTools,
  ...actionStatusTools,
];

validateTools(TOOLS);

export const toolByName = new Map(TOOLS.map((t) => [t.name, t]));
