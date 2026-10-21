/** Prepare assistant text for speech: strip think blocks, tool JSON, markdown, URLs and code. */
export function cleanForSpeech(md) {
  return md
    .replace(/<think>[\s\S]*?<\/think>/gi, '') // strip model reasoning blocks
    .replace(/```[\s\S]*?```/g, ' (code omitted) ').replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1').replace(/https?:\/\/\S+/g, ' link ')
    .replace(/^#{1,6}\s*/gm, '').replace(/[*_~>|]/g, '').replace(/^\s*[-+]\s+/gm, '')
    .replace(/\n{2,}/g, '. ').replace(/\s+/g, ' ').trim();
}
export function chunkSpeech(text, max = 220) {
  const parts = text.match(/[^.!?।\n]+[.!?।]?/g) ?? [text]; const out = []; let cur = '';
  for (const p of parts) { if ((cur + p).length > max && cur) { out.push(cur.trim()); cur = ''; } cur += p + ' '; }
  if (cur.trim()) out.push(cur.trim()); return out;
}
const HI = /[ऀ-ॿ]/;
export const guessLang = (t) => (HI.test(t) ? 'hi-IN' : 'en-IN');
