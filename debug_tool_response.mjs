import { chat } from './backend/src/services/llm.js';

async function main() {
  const messages = [
    { role: 'system', content: 'You are Nexus, a helpful assistant. Keep replies short and direct.' },
    { role: 'user', content: 'list my github repositories' },
    { role: 'assistant', content: '', tool_calls: [{ function: { name: 'github_list_repos', arguments: {} } }] },
    { role: 'tool', tool_name: 'github_list_repos', content: JSON.stringify({ ok: true, data: { repos: [{ fullName: 'Muskan17it/Tic-tac-toe' }, { fullName: 'Muskan17it/movie-recommendation-system' }] } }) }
  ];
  const r = await chat({ messages, numPredict: 500 });
  console.log('RESULT:\n', JSON.stringify(r, null, 2));
}

main().catch(console.error);
