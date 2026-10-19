// Keeps contact details out of chat so hiring and payment stay on Nogoman (and stay protected).
// It catches the usual ways people slip a number through; it can't catch everything, and isn't
// meant to: the protection Nogoman offers is the real reason to stay.

export type ContactFlag = 'PHONE' | 'EMAIL' | 'LINK' | 'APP';

export interface FilterResult {
  text: string;
  flags: ContactFlag[];
}

const MASK = '•••';

const DIGIT_WORDS: Record<string, string> = {
  zero: '0', zéro: '0', un: '1', une: '1', deux: '2', trois: '3', quatre: '4', cinq: '5',
  six: '6', sept: '7', huit: '8', neuf: '9', dix: '10', onze: '11', douze: '12', treize: '13',
  quatorze: '14', quinze: '15', seize: '16', vingt: '20', trente: '30', quarante: '40',
  cinquante: '50', soixante: '60',
};

// 8+ digits with optional separators, an optional +, and letter O used as zero ("O7 O8...").
const PHONE = /(?:\+|00)?(?:[0-9oO][\s.\-_/]*){8,}/g;
const DATE = /^\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})$/;
const EMAIL = /[A-Za-z0-9._%+-]+\s*(?:@|\(at\)|\[at\]| at )\s*[A-Za-z0-9.-]+\s*(?:\.|\(dot\)| dot )\s*[A-Za-z]{2,}/gi;
const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|ci|fr|net|org|me|ly|io)\b(?:\/\S*)?/gi;
const APP = /\b(?:whats?\s?app|watsap+|ouatsap+|wa\.me|telegram|t\.me|signal|messenger|facebook|fb|insta(?:gram)?|imo|viber|tiktok|snap(?:chat)?)\b/gi;

function maskPhones(text: string): { text: string; hit: boolean } {
  let hit = false;
  const out = text.replace(PHONE, (m) => {
    const digits = m.replace(/[^0-9oO]/g, '');
    // Dates ("02/11/2026") stay readable; prices like "192 780" have fewer than 8 digits anyway.
    if (DATE.test(m.trim())) return m;
    if (digits.length < 8 || !/[0-9]/.test(digits)) return m;
    hit = true;
    return `${MASK} `;
  });
  return { text: out.trimEnd() === text.trimEnd() ? text : out.replace(/\s+$/, ''), hit };
}

/** "zéro sept zéro huit douze trente-quatre..." counts as a number too. */
function maskSpelledPhones(text: string): { text: string; hit: boolean } {
  const tokens = text.split(/(\s+|-)/);
  let run: number[] = [];
  let digits = '';
  const hits: number[][] = [];
  const flush = () => {
    if (digits.length >= 8) hits.push(run);
    run = [];
    digits = '';
  };
  tokens.forEach((tok, i) => {
    if (/^\s+$|^-$/.test(tok)) { if (run.length) run.push(i); return; }
    const word = tok.toLowerCase().replace(/[.,;:!?]+$/, '');
    const value = DIGIT_WORDS[word] ?? (/^\d{1,3}$/.test(word) ? word : undefined);
    if (value !== undefined) { run.push(i); digits += value; } else flush();
  });
  flush();
  if (!hits.length) return { text, hit: false };
  for (const h of hits) {
    const words = h.filter((i) => !/^\s+$|^-$/.test(tokens[i]));
    words.forEach((i, k) => { tokens[i] = k === 0 ? MASK : ''; });
    for (const i of h) if (/^\s+$|^-$/.test(tokens[i])) tokens[i] = '';
  }
  return { text: tokens.join('').replace(new RegExp(`${MASK}(?=\\S)`, 'g'), `${MASK} `), hit: true };
}

export function filterContacts(input: string): FilterResult {
  const flags = new Set<ContactFlag>();
  let text = input;

  text = text.replace(EMAIL, () => { flags.add('EMAIL'); return MASK; });
  text = text.replace(LINK, () => { flags.add('LINK'); return MASK; });
  text = text.replace(APP, () => { flags.add('APP'); return MASK; });
  const phones = maskPhones(text);
  if (phones.hit) flags.add('PHONE');
  text = phones.text;
  const spelled = maskSpelledPhones(text);
  if (spelled.hit) flags.add('PHONE');
  text = spelled.text;

  return { text: text.replace(/[ \t]{2,}/g, ' ').trim(), flags: [...flags] };
}
