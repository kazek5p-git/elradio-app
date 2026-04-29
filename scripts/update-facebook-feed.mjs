import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const FACEBOOK_SOURCE_URL = 'https://www.facebook.com/people/ELRadio-908-FM/61584365428208/';
const FACEBOOK_CRAWLER_URL = 'https://mbasic.facebook.com/943822595472447';
const OUTPUT_PATH = resolve('data/facebook-feed.json');
const MAX_POSTS = 4;
const USER_AGENTS = [
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
];

function decodeFacebookString(value) {
  if (!value) {
    return '';
  }

  let decoded = value;
  try {
    decoded = JSON.parse(`"${value}"`);
  } catch {
    decoded = value
      .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\\//g, '/')
      .replace(/\\[nrt]/g, ' ')
      .replace(/\\"/g, '"');
  }

  return decoded
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanPostText(value) {
  let text = value
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/www\.\S+/gi, ' ')
    .replace(/ELRadio 90[,.]8 FM/gi, ' ')
    .replace(/El Radio 90[,.]8 FM/gi, ' ')
    .replace(/\bELRadio\b/gi, ' ')
    .replace(/\d*\s*(Skomentuj|Komentarz|Comment|Udostepnij|Udost.pnij|Share|Lubie to|Lubi. to|Like|Wyslij|Wy.lij|Send)\s*/gi, ' ')
    .replace(/\b(Zobacz wiecej|Zobacz wi.cej|See more|Pokaz wiecej|Poka. wi.cej|Obserwuj|Follow|Zaloguj sie|Zaloguj si.|Log in)\b/gi, ' ')
    .replace(/Komentowanie tego posta zostalo wylaczone\.?/gi, ' ')
    .replace(/Komentowanie tego posta zosta.o wy..czone\.?/gi, ' ')
    .replace(/\d+\s*(min\.|godz\.|dni?)\s*temu/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text || /^(Zobacz wiecej informacji|Zobacz wi.cej informacji|Strona|Ksiez|Ksi..|Czynne|Jeszcze nie oceniono)/i.test(text)) {
    return '';
  }
  if (/@context|schema\.org|SocialMediaPosting|interactionStatistic|dateCreated|dateModified/.test(text)) {
    return '';
  }
  if (text.length > 420) {
    text = `${text.slice(0, 420).replace(/\s+\S*$/, '').trim()}...`;
  }
  return text;
}

function makePostId(text, imageUrl, index) {
  const key = `${text.slice(0, 90)}|${imageUrl}`;
  const hash = key.split('').reduce((currentHash, char) => ((currentHash << 5) - currentHash) + char.charCodeAt(0), 0);
  return `${index + 1}-${Math.abs(hash)}`;
}

function parsePosts(html) {
  const posts = [];
  const seenKeys = new Set();
  const seenText = new Set();
  const messagePattern = /"message"\s*:\s*\{[^\}]{0,3000}?"text"\s*:\s*"((?:\\.|[^"\\]){20,900})"/g;
  const imagePattern = /"photo_image"\s*:\s*\{\s*"uri"\s*:\s*"([^"]+)"/;
  let match;
  let scanned = 0;

  while ((match = messagePattern.exec(html)) && posts.length < MAX_POSTS && scanned < MAX_POSTS * 40) {
    scanned += 1;
    const text = cleanPostText(decodeFacebookString(match[1]));
    if (!text) {
      continue;
    }

    const nextMessageIndex = html.indexOf('"message"', messagePattern.lastIndex);
    const segmentEnd = nextMessageIndex > match.index ? nextMessageIndex : Math.min(html.length, match.index + 70000);
    const segment = html.slice(match.index, segmentEnd);
    const imageMatch = imagePattern.exec(segment);
    const imageUrl = imageMatch ? decodeFacebookString(imageMatch[1]) : '';
    const textKey = text.slice(0, 110).toLowerCase();
    const key = `${text.slice(0, 90)}|${imageUrl}`.toLowerCase();

    if (seenKeys.has(key) || seenText.has(textKey)) {
      continue;
    }

    seenKeys.add(key);
    seenText.add(textKey);
    posts.push({ id: makePostId(text, imageUrl, posts.length), text, imageUrl });
  }

  return posts;
}

async function fetchFacebookHtml() {
  let lastError;
  for (const userAgent of USER_AGENTS) {
    try {
      const response = await fetch(FACEBOOK_CRAWLER_URL, {
        headers: {
          'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8',
          'User-Agent': userAgent,
        },
      });
      const html = await response.text();
      const posts = parsePosts(html);
      if (response.ok && posts.length) {
        return { posts, status: response.status };
      }
      lastError = new Error(`Facebook response ${response.status}, ${html.length} chars, ${posts.length} posts`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('Could not fetch Facebook feed');
}

const result = await fetchFacebookHtml();
const output = {
  updatedAt: new Date().toISOString(),
  source: 'facebook',
  sourceUrl: FACEBOOK_SOURCE_URL,
  crawlerUrl: FACEBOOK_CRAWLER_URL,
  status: result.status,
  posts: result.posts,
};

await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

console.log(`Wrote ${result.posts.length} Facebook posts to ${OUTPUT_PATH}`);
