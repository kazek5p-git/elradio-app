declare const process: { env: Record<string, string | undefined> };

const FACEBOOK_PAGE_ID = '61584365428208';
const FACEBOOK_PLUGIN_URL = `https://www.facebook.com/profile.php?id=${FACEBOOK_PAGE_ID}`;

export const FACEBOOK_URL = `https://www.facebook.com/people/ELRadio-908-FM/${FACEBOOK_PAGE_ID}/`;
export const FACEBOOK_CRAWLER_URL = 'https://mbasic.facebook.com/943822595472447';
export const FACEBOOK_FEED_JSON_URL = 'https://raw.githubusercontent.com/kazek5p-git/elradio-app/main/data/facebook-feed.json';
export const FACEBOOK_FEED_URL = `https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(
  FACEBOOK_PLUGIN_URL,
)}&tabs=timeline&width=500&height=900&small_header=true&adapt_container_width=true&hide_cover=true&show_facepile=false`;
export const FACEBOOK_CRAWLER_USER_AGENT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
export const FACEBOOK_WEBVIEW_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36';
export const DEBUG_FACEBOOK_FEED = typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_ELRADIO_DEBUG_FACEBOOK === '1';

const MAX_FACEBOOK_POSTS = 4;
const FACEBOOK_EXTRACT_SCRIPT = `
  (function () {
    function boot() {
      if (!document.documentElement || !document.head || !document.body) {
        setTimeout(boot, 120);
        return;
      }

    var attempts = 0;
    var maxPosts = 4;
    var includeImages = __ELRADIO_INCLUDE_IMAGES__;

    function setCompactViewport() {
      var viewport = document.querySelector('meta[name="viewport"]');
      if (!viewport) {
        viewport = document.createElement('meta');
        viewport.setAttribute('name', 'viewport');
        document.head.appendChild(viewport);
      }
      viewport.setAttribute('content', 'width=500, initial-scale=1, maximum-scale=1, user-scalable=no');
    }

    function installExtractorStyle() {
      if (document.getElementById('elradio-compact-facebook')) {
        return;
      }

      var style = document.createElement('style');
      style.id = 'elradio-compact-facebook';
      var compactRules = [
        'button, form, a[role="button"], [role="button"], .pluginConnectButton, .UFILikeLink, .UFICommentLink, .UFIShareLink, ._42ft { display: none !important; }',
        '[aria-label*="Skomentuj"], [aria-label*="Comment"], [aria-label*="Komentarz"], [aria-label*="Lubię to"], [aria-label*="Like"], [aria-label*="Udostępnij"], [aria-label*="Share"], [aria-label*="Wyślij"], [aria-label*="Send"], [aria-label*="Follow"], [aria-label*="Obserwuj"] { display: none !important; }'
      ];
      if (!includeImages) {
        compactRules.push('img, picture, source { display: none !important; }');
      }
      style.textContent = compactRules.join('\\n');
      document.head.appendChild(style);
    }

    function normalizeText(value) {
      return (value || '').replace(/\\s+/g, ' ').trim();
    }

    function relayToParent(payload) {
      var relay = {
        type: 'elradio-facebook-relay',
        payload: payload
      };

      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(relay, '*');
        }
      } catch (error) {
        // Some Facebook frames are cross-origin; try the remaining routes.
      }

      try {
        if (window.top && window.top !== window && window.top !== window.parent) {
          window.top.postMessage(relay, '*');
        }
      } catch (error) {
        // Cross-origin access can be denied by WebKit.
      }
    }

    function postToNative(payload) {
      var message = JSON.stringify(payload);
      var posted = false;

      function tryBridge(target) {
        try {
          if (target && target.ReactNativeWebView && target.ReactNativeWebView.postMessage) {
            target.ReactNativeWebView.postMessage(message);
            posted = true;
          }
        } catch (error) {
          // Keep trying other frame bridges.
        }
      }

      tryBridge(window);
      tryBridge(window.parent);
      tryBridge(window.top);

      if (!posted) {
        relayToParent(payload);
      }
    }

    if (!window.__elradioFacebookRelayListener) {
      window.__elradioFacebookRelayListener = true;
      window.addEventListener('message', function (event) {
        var data = event.data;
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch (error) {
            return;
          }
        }
        if (!data || data.type !== 'elradio-facebook-relay' || !data.payload) {
          return;
        }
        postToNative(data.payload);
      });
    }

    function cleanPostText(value) {
      var text = normalizeText(value)
        .replace(/https?:\\/\\/\\S+/gi, ' ')
        .replace(/www\\.\\S+/gi, ' ')
        .replace(/ELRadio 90[,.]8 FM/gi, ' ')
        .replace(/El Radio 90[,.]8 FM/gi, ' ')
        .replace(/\\bELRadio\\b/gi, ' ')
        .replace(/\\d*\\s*(Skomentuj|Komentarz|Comment|Udostępnij|Share|Lubię to|Like|Wyślij|Send)\\s*/gi, ' ')
        .replace(/\\b(Lubię to|Like|Skomentuj|Komentarz|Comment|Udostępnij|Share|Wyślij|Send|Obserwuj|Follow|Zaloguj się|Log in|Zobacz więcej|See more|Pokaż więcej|Show more)\\b/gi, ' ')
        .replace(/\\b(Polubiono przez|Liked by|Najtrafniejsze|Most relevant|Wszystkie reakcje|All reactions)\\b/gi, ' ')
        .replace(/\\d+\\s*(obserwujących|obserwujący)/gi, ' ')
        .replace(/\\d+\\s*(min\\.?|godz\\.?|dni?)\\s*temu/gi, ' ')
        .replace(/\\b(w niedzielę|w sobotę)\\b/gi, ' ');

      text = normalizeText(text);
      if (/@context|schema\\.org|SocialMediaPosting|interactionStatistic|dateCreated|dateModified/.test(text)) {
        return '';
      }
      if (text.length > 420) {
        text = normalizeText(text.slice(0, 420).replace(/\\s+\\S*$/, '')) + '...';
      }
      return text;
    }

    function getReadableText(root) {
      var clone = root.cloneNode(true);
      clone.querySelectorAll('script, style, noscript, svg, button, form, [role="button"]').forEach(function (element) {
        element.remove();
      });
      return normalizeText(clone.innerText || clone.textContent || '');
    }

    function collectStructuredPosts() {
      var output = [];

      function readImage(value) {
        if (!includeImages) {
          return '';
        }
        if (!value) {
          return '';
        }
        if (typeof value === 'string') {
          return value;
        }
        if (Array.isArray(value)) {
          for (var i = 0; i < value.length; i += 1) {
            var image = readImage(value[i]);
            if (image) {
              return image;
            }
          }
          return '';
        }
        if (typeof value === 'object') {
          return readImage(value.url || value.contentUrl || value.thumbnailUrl);
        }
        return '';
      }

      function visit(value) {
        if (!value || typeof value !== 'object') {
          return;
        }
        if (Array.isArray(value)) {
          value.forEach(visit);
          return;
        }

        var type = String(value['@type'] || value.type || '');
        var body = value.articleBody || value.text || value.description || value.name || '';
        if (/SocialMediaPosting|NewsArticle|Article/i.test(type) && body) {
          output.push({
            text: cleanPostText(String(body)),
            imageUrl: readImage(value.image || value.thumbnailUrl)
          });
        }

        Object.keys(value).forEach(function (key) {
          if (key !== 'image' && key !== 'thumbnailUrl') {
            visit(value[key]);
          }
        });
      }

      document.querySelectorAll('script[type="application/ld+json"], script[data-content-len]').forEach(function (script) {
        var raw = script.textContent || '';
        if (!raw || raw.indexOf('{') === -1) {
          return;
        }
        try {
          visit(JSON.parse(raw));
        } catch (error) {
          // Facebook sometimes emits non-JSON boot data here; DOM extraction will still run.
        }
      });

      return output.filter(function (post) {
        return post.text || post.imageUrl;
      });
    }

    function decodeFacebookJsonString(value) {
      if (!value) {
        return '';
      }

      var decoded = value;
      try {
        decoded = JSON.parse('"' + value + '"');
      } catch (error) {
        decoded = value
          .replace(/\\u([0-9a-f]{4})/gi, function (_, hex) {
            return String.fromCharCode(parseInt(hex, 16));
          })
          .replace(/\\\//g, '/')
          .replace(/\\n/g, ' ')
          .replace(/\\r/g, ' ')
          .replace(/\\t/g, ' ')
          .replace(/\\"/g, '"');
      }

      var textarea = document.createElement('textarea');
      textarea.innerHTML = decoded;
      return normalizeText(textarea.value || decoded);
    }

    function collectBootDataPosts() {
      var htmlParts = [];
      if (document.documentElement) {
        htmlParts.push(document.documentElement.innerHTML || '');
        htmlParts.push(document.documentElement.textContent || '');
      }
      document.querySelectorAll('script').forEach(function (script) {
        htmlParts.push(script.textContent || '');
      });

      var html = htmlParts.join('\\n');
      var output = [];
      var messagePattern = /"message"\\s*:\\s*\\{[^\\}]{0,3000}?"text"\\s*:\\s*"((?:\\\\.|[^"\\\\]){20,900})"/g;
      var imagePattern = /"photo_image"\\s*:\\s*\\{\\s*"uri"\\s*:\\s*"([^"]+)"/;
      var match;

      while ((match = messagePattern.exec(html)) && output.length < maxPosts * 30) {
        var text = cleanPostText(decodeFacebookJsonString(match[1]));
        if (!text || /^(Zobacz wi.?cej informacji|Strona|Ksi|Czynne|Jeszcze nie oceniono)/i.test(text)) {
          continue;
        }

        var nextMessageIndex = html.indexOf('"message"', messagePattern.lastIndex);
        var segmentEnd = nextMessageIndex > match.index ? nextMessageIndex : Math.min(html.length, match.index + 70000);
        var segment = html.slice(match.index, segmentEnd);
        var imageMatch = imagePattern.exec(segment) || imagePattern.exec(html.slice(match.index, Math.min(html.length, match.index + 70000)));

        output.push({
          text: text,
          imageUrl: imageMatch && includeImages ? decodeFacebookJsonString(imageMatch[1]) : ''
        });
      }

      return output;
    }

    function findPostImage(root) {
      if (!includeImages) {
        return '';
      }
      var images = Array.prototype.slice.call(root.querySelectorAll('img'));
      for (var i = 0; i < images.length; i += 1) {
        var image = images[i];
        var src = image.currentSrc || image.src || image.getAttribute('data-src') || image.getAttribute('src') || '';
        var rect = image.getBoundingClientRect();
        var width = image.naturalWidth || image.width || rect.width || 0;
        var height = image.naturalHeight || image.height || rect.height || 0;

        if (!src || /^data:/i.test(src)) {
          continue;
        }
        if ((width >= 140 || rect.width >= 140) && (height >= 100 || rect.height >= 100)) {
          return src;
        }
      }
      return '';
    }

    function findPostNodes() {
      var nodes = Array.prototype.slice.call(document.querySelectorAll('[role="article"], article, div[data-ft]'));
      if (nodes.length) {
        return nodes;
      }
      return Array.prototype.slice.call(document.querySelectorAll('div')).filter(function (element) {
        var text = cleanPostText(getReadableText(element));
        return text.length >= 40 && (includeImages ? !!findPostImage(element) : true);
      });
    }

    function extractPosts() {
      var posts = [];
      var seen = {};
      var seenImages = {};
      var seenText = {};
      var nodes = findPostNodes();

      function addPost(text, imageUrl) {
        if (posts.length >= maxPosts) {
          return;
        }
        var imageKey = imageUrl ? imageUrl.split('?')[0] : '';
        var textKey = text.slice(0, 110).toLowerCase();
        var key = (text.slice(0, 90) + '|' + imageUrl).toLowerCase();

        if (text.length < 24 && !imageUrl) {
          return;
        }
        if (seen[key]) {
          return;
        }
        if (textKey && seenText[textKey]) {
          return;
        }
        if (imageKey && seenImages[imageKey]) {
          return;
        }
        seen[key] = true;
        if (textKey) {
          seenText[textKey] = true;
        }
        if (imageKey) {
          seenImages[imageKey] = true;
        }
        posts.push({
          id: String(posts.length + 1) + '-' + Math.abs(key.split('').reduce(function (hash, char) {
            return ((hash << 5) - hash) + char.charCodeAt(0);
          }, 0)),
          text: text,
          imageUrl: imageUrl
        });
      }

      collectStructuredPosts().forEach(function (post) {
        addPost(post.text || '', post.imageUrl || '');
      });

      collectBootDataPosts().forEach(function (post) {
        addPost(post.text || '', post.imageUrl || '');
      });

      nodes.forEach(function (node) {
        addPost(cleanPostText(getReadableText(node)), findPostImage(node));
      });

      return posts;
    }

    function sendPosts(force) {
      var posts = extractPosts();
      if (!posts.length && !force) {
        return false;
      }
      postToNative({
        type: 'elradio-facebook-posts',
        posts: posts
      });
      return posts.length > 0;
    }

    function prepare() {
      setCompactViewport();
      installExtractorStyle();

      document.querySelectorAll('[role="dialog"], [aria-modal="true"]').forEach(function (dialog) {
        dialog.remove();
      });
      document.querySelectorAll('a').forEach(function (link) {
        var text = normalizeText(link.textContent || '');
        if (!text && link.querySelector('img')) {
          link.replaceWith.apply(link, Array.prototype.slice.call(link.childNodes));
        }
      });
      if (!includeImages) {
        document.querySelectorAll('img, picture, source').forEach(function (element) {
          element.remove();
        });
      }
    }

    function collect() {
      attempts += 1;
      prepare();
      if (!sendPosts(attempts >= 45) && attempts < 45) {
        setTimeout(collect, 850);
      }
    }

    if (!window.__elradioFacebookObserver) {
      window.__elradioFacebookObserver = new MutationObserver(function () {
        setTimeout(function () {
          sendPosts(false);
        }, 250);
      });
      window.__elradioFacebookObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    }

    collect();
    }

    boot();
  })();
  true;
`;

export function buildFacebookExtractScript(includeImages: boolean) {
  return FACEBOOK_EXTRACT_SCRIPT.replace('__ELRADIO_INCLUDE_IMAGES__', includeImages ? 'true' : 'false');
}
export type FacebookPost = {
  id: string;
  text: string;
  imageUrl?: string;
};

export type FacebookPayload = {
  type?: string;
  posts?: FacebookPost[];
};

export type FacebookFeedJson = {
  posts?: FacebookPost[];
};

export function normalizeFacebookPosts(posts: FacebookPost[] | undefined, includeImages: boolean) {
  return (posts ?? [])
    .filter((post) => post.text || post.imageUrl)
    .slice(0, MAX_FACEBOOK_POSTS)
    .map((post, index) => ({
      id: post.id || `${index + 1}-${post.text.slice(0, 24)}`,
      text: post.text,
      imageUrl: includeImages ? post.imageUrl : '',
    }));
}

function decodeFacebookCrawlerString(value: string) {
  if (!value) {
    return '';
  }

  let decoded = value;
  try {
    decoded = JSON.parse(`"${value}"`) as string;
  } catch {
    decoded = value
      .replace(/\\u([0-9a-f]{4})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\\//g, '/')
      .replace(/\\[nrt]/g, ' ')
      .replace(/\\"/g, '"');
  }

  return decoded
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanFacebookCrawlerPostText(value: string) {
  let text = value
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/www\.\S+/gi, ' ')
    .replace(/ELRadio 90[,.]8 FM/gi, ' ')
    .replace(/El Radio 90[,.]8 FM/gi, ' ')
    .replace(/ELRadio/gi, ' ')
    .replace(/\d*\s*(Skomentuj|Komentarz|Comment|Udostepnij|Udost?pnij|Share|Lubie to|Lubi? to|Like|Wyslij|Wy?lij|Send)\s*/gi, ' ')
    .replace(/(Zobacz wiecej|Zobacz wi?cej|See more|Pokaz wiecej|Poka? wi?cej|Obserwuj|Follow|Zaloguj sie|Zaloguj si?|Log in)/gi, ' ')
    .replace(/Komentowanie tego posta zostalo wylaczone\.?/gi, ' ')
    .replace(/Komentowanie tego posta zosta?o wy??czone\.?/gi, ' ')
    .replace(/\d+\s*(min\.?|godz\.?|dni?)\s*temu/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text || /^(Zobacz wiecej informacji|Zobacz wi?cej informacji|Strona|Ksiez|Ksi??|Czynne|Jeszcze nie oceniono)/i.test(text)) {
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

function makeFacebookPostId(text: string, imageUrl: string, index: number) {
  const key = `${text.slice(0, 90)}|${imageUrl}`;
  const hash = key.split('').reduce((currentHash, char) => ((currentHash << 5) - currentHash) + char.charCodeAt(0), 0);
  return `${index + 1}-${Math.abs(hash)}`;
}

export function parseFacebookCrawlerPosts(html: string, includeImages: boolean): FacebookPost[] {
  const posts: FacebookPost[] = [];
  const seenKeys = new Set<string>();
  const seenText = new Set<string>();
  const seenImages = new Set<string>();
  const messagePattern = new RegExp('"message"\\s*:\\s*\\{[^\\}]{0,3000}?"text"\\s*:\\s*"((?:\\\\.|[^"\\\\]){20,900})"', 'g');
  const imagePattern = new RegExp('"photo_image"\\s*:\\s*\\{\\s*"uri"\\s*:\\s*"([^"]+)"');
  let match: RegExpExecArray | null;
  let scanned = 0;

  const addPost = (text: string, imageUrl: string) => {
    if (posts.length >= MAX_FACEBOOK_POSTS) {
      return;
    }

    const imageKey = imageUrl ? imageUrl.split('?')[0] : '';
    const textKey = text.slice(0, 110).toLowerCase();
    const key = `${text.slice(0, 90)}|${imageUrl}`.toLowerCase();
    if (text.length < 24 || seenKeys.has(key) || seenText.has(textKey) || (imageKey && seenImages.has(imageKey) && !text)) {
      return;
    }

    seenKeys.add(key);
    seenText.add(textKey);
    if (imageKey) {
      seenImages.add(imageKey);
    }
    posts.push({ id: makeFacebookPostId(text, imageUrl, posts.length), text, imageUrl });
  };

  while ((match = messagePattern.exec(html)) && posts.length < MAX_FACEBOOK_POSTS && scanned < MAX_FACEBOOK_POSTS * 40) {
    scanned += 1;
    const text = cleanFacebookCrawlerPostText(decodeFacebookCrawlerString(match[1]));
    if (!text) {
      continue;
    }

    const nextMessageIndex = html.indexOf('"message"', messagePattern.lastIndex);
    const segmentEnd = nextMessageIndex > match.index ? nextMessageIndex : Math.min(html.length, match.index + 70000);
    const segment = html.slice(match.index, segmentEnd);
    const imageMatch = imagePattern.exec(segment);
    const imageUrl = imageMatch && includeImages ? decodeFacebookCrawlerString(imageMatch[1]) : '';
    addPost(text, imageUrl);
  }

  return posts;
}
