/** Fast deterministic pre-router: picks which tool domains to expose so a small model sees only a few tools. */
const D = {
  tasks: /\b(task|tasks|todo|to-do|reminder|assignment|deadline|submit|complete[d]?|done|pending|kaam|kam|bana\s?do|ho\s?gaya|hogaya|finish|due)\b/i,
  calendar: /\b(calendar|meeting|meetings|event|events|schedule|reschedul\w*|appointment|shift|postpone|cancel|call|agenda|free slot|invite)\b|wali meeting|kal ki meeting/i,
  gmail: /\b(email|e-mail|mail|gmail|inbox|draft|send|reply|faculty|coordinator|subject|thread|unread)\b/i,
  weather: /\b(weather|rain|barish|baarish|temperature|forecast|ghoom\w*|outing|outdoor|picnic|trip|umbrella|garmi|sardi|mausam|hot|cold)\b/i,
  system: /\b(laptop|computer|pc|cpu|ram|memory|disk|storage|slow|process\w*|large files?|downloads|space|performance|lag|hang|battery|health)\b/i,
  github: /\b(github|repo|repository|repositories|commit|branch|pull request|pr|bug|bugs|code review|todo comments?|readme)\b/i,
  memory: /\b(remember|yaad rakh\w*|yaad|save this|memory|memories|forget)\b/i,
  news: /\b(news|headlines?|khabar|samachar|tech news|breaking news|updates? today|latest in tech|ai news)\b/i,
};
const SUPPORT = /\b(feeling (low|sad|down|anxious|lonely|overwhelmed)|i am (sad|stressed|anxious|lonely|tired|overwhelmed)|i'm (sad|stressed|anxious|lonely|overwhelmed)|can we talk|stressed|anxiety|depressed|lonely|overwhelm\w*|lost|burnt out|burnout|udaas|akela|akeli|tension|ghabra\w*|bura lag|man nahi|thak gaya|thak gayi|rona|cry)\b/i;
const CRISIS = /\b(kill myself|suicide|suicidal|end my life|want to die|don'?t want to live|self[- ]harm|hurt myself|mar jaana|jeena nahi|khatam kar)\b/i;

const SMALLTALK = /^\s*(hi|hello|hey|hii+|namaste|thanks|thank you|thx|shukriya|dhanyavaad|ok|okay|bye|good (morning|night|evening)|how are you|kaise ho)\b/i;

export function routeMessage(text, lastDomains = []) {
  const domains = Object.entries(D).filter(([, re]) => re.test(text)).map(([k]) => k);
  const support = SUPPORT.test(text);
  const crisis = CRISIS.test(text);
  if (!domains.length && !SMALLTALK.test(text) && !support && !crisis && lastDomains.length && text.split(/\s+/).length <= 8) return { domains: lastDomains, support, crisis, carried: true };
  return { domains: support && !/\b(task|calendar|email|meeting)\b/i.test(text) ? [] : domains, support, crisis, carried: false };
}
export const wantsHistory = (t) => /\b(earlier|last time|pichh?le|before|previous|we discussed|discussed|yesterday|last week|hafte|phle|pehle)\b/i.test(t);
