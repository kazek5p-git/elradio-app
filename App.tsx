import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { Audio, AVPlaybackStatus } from 'expo-av';
import * as MailComposer from 'expo-mail-composer';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import * as WebBrowser from 'expo-web-browser';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  type AccessibilityActionEvent,
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  StatusBar as RNStatusBar,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { getNameDaysForDate } from './src/nameDays';

declare const process: { env?: Record<string, string | undefined> };

const APP_DISPLAY_NAME = 'El Radio Łódź 90,8';
const STREAM_URL = 'http://dhtk2.noip.pl:8888/elradio';
const STREAM_HEADERS = {
  'Icy-MetaData': '1',
  'User-Agent': 'El Radio app',
};
const FACEBOOK_PAGE_ID = '61584365428208';
const FACEBOOK_URL = `https://www.facebook.com/people/ELRadio-908-FM/${FACEBOOK_PAGE_ID}/`;
const FACEBOOK_PLUGIN_URL = `https://www.facebook.com/profile.php?id=${FACEBOOK_PAGE_ID}`;
const FACEBOOK_CRAWLER_URL = 'https://mbasic.facebook.com/943822595472447';
const FACEBOOK_FEED_JSON_URL = 'https://raw.githubusercontent.com/kazek5p-git/elradio-app/main/data/facebook-feed.json';
const FACEBOOK_FEED_URL = `https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(
  FACEBOOK_PLUGIN_URL,
)}&tabs=timeline&width=500&height=900&small_header=true&adapt_container_width=true&hide_cover=true&show_facepile=false`;
const CONTACT_EMAIL = 'BIURO@ELRADIO.PL';
const APP_RELEASES_URL = 'https://github.com/kazek5p-git/elradio-app/releases/latest';
const RETRY_DELAYS_MS = [3000, 7000, 15000, 30000];
const MAX_FACEBOOK_POSTS = 4;
const VOLUME_TICKS = Array.from({ length: 7 }, (_, index) => index);
const SLEEP_TIMER_OPTIONS = [15, 30, 60] as const;
const SLEEP_TIMER_SELECT_OPTIONS: Array<SelectionOption<SleepTimerOptionId>> = [
  { id: '15', label: '15 minut' },
  { id: '30', label: '30 minut' },
  { id: '60', label: '60 minut' },
  { id: 'off', label: 'Wyłączony' },
];
const SETTINGS_STORAGE_KEY = '@elradio/settings/v1';
const DEFAULT_START_VOLUME = 0.86;
const FACEBOOK_CRAWLER_USER_AGENT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const FACEBOOK_WEBVIEW_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36';
const DEBUG_FACEBOOK_FEED = typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_ELRADIO_DEBUG_FACEBOOK === '1';
const PRIVACY_TEXT =
  'Aplikacja nie wymaga konta i nie ma własnego systemu logowania. Ustawienia są zapisywane lokalnie na tym urządzeniu.\n\n' +
  'Do odtwarzania radia aplikacja łączy się ze streamem EL Radio. Do aktualności pobiera publiczne posty z profilu EL Radio na Facebooku. Zdjęcia w kartach postów są pobierane przez aplikację tylko wtedy, gdy włączysz je w ustawieniach. Facebook może przetwarzać dane zgodnie z własnymi zasadami.\n\n' +
  'Wiadomości, zgłoszenia błędów i propozycje są wysyłane przez aplikację pocztową wybraną w systemie. Aplikacja nie wysyła ich samodzielnie na żaden dodatkowy serwer.\n\n' +
  'Dane diagnostyczne trafiają do treści maila tylko wtedy, gdy samodzielnie wybierzesz zgłoszenie błędu lub propozycji i zostawisz włączoną opcję dołączenia diagnostyki.';
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
const VOLUME_STEP = 0.05;

type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
type FacebookFeedState = 'loading' | 'ready' | 'error';
type NetworkMode = 'wifiAndCellular' | 'wifiOnly';
type StartupVolumeMode = 'fixed' | 'last';
type MessageType = 'general' | 'greetings' | 'song' | 'city' | 'technical';
type FeedbackKind = 'bug' | 'suggestion';
type SleepTimerOptionId = 'off' | '15' | '30' | '60';

type SelectionOption<T extends string> = {
  id: T;
  label: string;
  accessibilityLabel?: string;
};

type AppSettings = {
  networkMode: NetworkMode;
  downloadFacebookImages: boolean;
  autoPlayOnLaunch: boolean;
  startupVolumeMode: StartupVolumeMode;
  startVolume: number;
  lastVolume: number;
  simplifiedAccessibility: boolean;
};

type StoredAppSettings = Partial<AppSettings> & {
  reduceDataUsage?: boolean;
  messageSignature?: string;
  replyContact?: string;
  defaultMessageType?: MessageType;
};

const DEFAULT_SETTINGS: AppSettings = {
  networkMode: 'wifiAndCellular',
  downloadFacebookImages: true,
  autoPlayOnLaunch: false,
  startupVolumeMode: 'fixed',
  startVolume: DEFAULT_START_VOLUME,
  lastVolume: DEFAULT_START_VOLUME,
  simplifiedAccessibility: false,
};

const MESSAGE_TYPE_OPTIONS: Array<{
  id: MessageType;
  label: string;
  subject: string;
  placeholder: string;
}> = [
  {
    id: 'general',
    label: 'Ogólna',
    subject: 'Wiadomość z aplikacji EL Radio',
    placeholder: 'Wpisz swoją wiadomość',
  },
  {
    id: 'greetings',
    label: 'Pozdrowienia',
    subject: 'Pozdrowienia z aplikacji EL Radio',
    placeholder: 'Napisz, kogo chcesz pozdrowić',
  },
  {
    id: 'song',
    label: 'Utwór',
    subject: 'Prośba o utwór z aplikacji EL Radio',
    placeholder: 'Podaj wykonawcę, tytuł utworu i ewentualnie dedykację',
  },
  {
    id: 'city',
    label: 'Info z miasta',
    subject: 'Informacja z Łodzi z aplikacji EL Radio',
    placeholder: 'Napisz krótką informację z miasta',
  },
  {
    id: 'technical',
    label: 'Techniczna',
    subject: 'Wiadomość techniczna z aplikacji EL Radio',
    placeholder: 'Opisz sprawę techniczną',
  },
];

function getMessageTypeOption(messageType: MessageType) {
  return MESSAGE_TYPE_OPTIONS.find((option) => option.id === messageType) ?? MESSAGE_TYPE_OPTIONS[0];
}

const FEEDBACK_COPY: Record<FeedbackKind, {
  title: string;
  messageLabel: string;
  placeholder: string;
  subject: string;
}> = {
  bug: {
    title: 'Zgłoś błąd',
    messageLabel: 'Opis błędu',
    placeholder: 'Opisz, co nie działa i co robiłeś przed wystąpieniem problemu.',
    subject: 'Błąd w aplikacji El Radio',
  },
  suggestion: {
    title: 'Wyślij propozycję',
    messageLabel: 'Treść propozycji',
    placeholder: 'Napisz, co warto dodać albo zmienić w aplikacji.',
    subject: 'Propozycja do aplikacji El Radio',
  },
};

function getFeedbackCopy(kind: FeedbackKind) {
  return FEEDBACK_COPY[kind];
}

function clampVolumeValue(nextVolume: number) {
  if (!Number.isFinite(nextVolume)) {
    return DEFAULT_START_VOLUME;
  }
  return Math.min(1, Math.max(0, Number(nextVolume.toFixed(2))));
}

function normalizeStoredSettings(value: unknown): AppSettings {
  const stored = value && typeof value === 'object' ? (value as StoredAppSettings) : {};
  const downloadFacebookImages =
    typeof stored.downloadFacebookImages === 'boolean'
      ? stored.downloadFacebookImages
      : stored.reduceDataUsage === true
        ? false
        : DEFAULT_SETTINGS.downloadFacebookImages;

  return {
    networkMode: stored.networkMode === 'wifiOnly' ? 'wifiOnly' : 'wifiAndCellular',
    downloadFacebookImages,
    autoPlayOnLaunch: stored.autoPlayOnLaunch === true,
    startupVolumeMode: stored.startupVolumeMode === 'last' ? 'last' : 'fixed',
    startVolume: clampVolumeValue(typeof stored.startVolume === 'number' ? stored.startVolume : DEFAULT_START_VOLUME),
    lastVolume: clampVolumeValue(typeof stored.lastVolume === 'number' ? stored.lastVolume : DEFAULT_START_VOLUME),
    simplifiedAccessibility: stored.simplifiedAccessibility === true,
  };
}

type FacebookPost = {
  id: string;
  text: string;
  imageUrl?: string;
};

type FacebookPayload = {
  type?: string;
  posts?: FacebookPost[];
};

type FacebookFeedJson = {
  posts?: FacebookPost[];
};

function normalizeFacebookPosts(posts: FacebookPost[] | undefined, includeImages: boolean) {
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

function parseFacebookCrawlerPosts(html: string, includeImages: boolean): FacebookPost[] {
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

export default function App() {
  const soundRef = useRef<Audio.Sound | null>(null);
  const facebookWebViewRef = useRef<WebView>(null);
  const facebookFetchRequestRef = useRef(0);
  const mainScrollRef = useRef<ScrollView>(null);
  const newsSectionYRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);
  const userWantsPlaybackRef = useRef(false);
  const autoPlayedOnLaunchRef = useRef(false);
  const networkBlockAlertShownRef = useRef(false);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [connectionStatus, setConnectionStatus] = useState('Radio nie gra.');
  const [volume, setVolume] = useState(DEFAULT_START_VOLUME);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<MessageType>('general');
  const [updateStatus, setUpdateStatus] = useState('Sprawdzam aktualizacje aplikacji...');
  const [facebookPosts, setFacebookPosts] = useState<FacebookPost[]>([]);
  const [facebookFeedState, setFacebookFeedState] = useState<FacebookFeedState>('loading');
  const [facebookDebug, setFacebookDebug] = useState('');
  const [facebookWebViewKey, setFacebookWebViewKey] = useState(0);
  const [volumeTrackWidth, setVolumeTrackWidth] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [messageTypeSelectorOpen, setMessageTypeSelectorOpen] = useState(false);
  const [sleepTimerSelectorOpen, setSleepTimerSelectorOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackKind, setFeedbackKind] = useState<FeedbackKind>('bug');
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackContact, setFeedbackContact] = useState('');
  const [feedbackIncludeDiagnostics, setFeedbackIncludeDiagnostics] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isCellularNetwork, setIsCellularNetwork] = useState(false);
  const [sleepTimerEndsAt, setSleepTimerEndsAt] = useState<number | null>(null);
  const [sleepTimerDurationMinutes, setSleepTimerDurationMinutes] = useState<number | null>(null);
  const today = new Date();
  const todayNameDays = getNameDaysForDate(today);
  const todayLabel = `${todayNameDays.label} ${today.getFullYear()}`;

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        const nextSettings = normalizeStoredSettings(JSON.parse(stored));
        setSettings(nextSettings);
        setVolume(nextSettings.startupVolumeMode === 'last' ? nextSettings.lastVolume : nextSettings.startVolume);
      }
    } catch {
      // Defaults are safe if stored settings cannot be read.
    } finally {
      setSettingsLoaded(true);
    }
  };

  const updateSettings = (updates: Partial<AppSettings>) => {
    setSettings((currentSettings) => {
      const nextSettings = normalizeStoredSettings({ ...currentSettings, ...updates });
      AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings)).catch(() => undefined);
      return nextSettings;
    });
  };

  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    }).catch(() => {
      setPlaybackState('error');
    });

    void loadSettings();
    checkForOtaUpdate();

    return () => {
      clearRetryTimer();
      clearSleepTimer();
      soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, []);

  useEffect(() => {
    soundRef.current?.setVolumeAsync(volume).catch(() => undefined);
  }, [volume]);

  useEffect(() => {
    if (!settingsLoaded || Math.abs(settings.lastVolume - volume) < 0.005) {
      return;
    }

    updateSettings({ lastVolume: volume });
  }, [settingsLoaded, settings.lastVolume, volume]);

  const clearRetryTimer = () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  const clearSleepTimer = () => {
    if (sleepTimerRef.current) {
      clearTimeout(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }
    setSleepTimerEndsAt(null);
    setSleepTimerDurationMinutes(null);
  };

  const unloadCurrentSound = async () => {
    const sound = soundRef.current;
    soundRef.current = null;
    await sound?.unloadAsync().catch(() => undefined);
  };

  const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if (status.error) {
        setPlaybackState('error');
        void unloadCurrentSound();
        if (userWantsPlaybackRef.current) {
          scheduleReconnect();
        } else {
          setConnectionStatus('Nie udało się odtworzyć radia.');
        }
      }
      return;
    }

    if (status.isPlaying) {
      retryAttemptRef.current = 0;
      setPlaybackState('playing');
      setConnectionStatus('Odtwarzanie El Radio.');
      return;
    }

    if (status.isBuffering) {
      setPlaybackState('loading');
      setConnectionStatus('Łączenie ze streamem...');
      return;
    }

    setPlaybackState(userWantsPlaybackRef.current ? 'loading' : 'paused');
    setConnectionStatus(userWantsPlaybackRef.current ? 'Czekam na stream...' : 'Radio jest wstrzymane.');
  };

  const setPlayerVolume = (nextVolume: number) => {
    setVolume(clampVolumeValue(nextVolume));
  };

  const adjustVolume = (delta: number) => {
    setVolume((currentVolume) => clampVolumeValue(currentVolume + delta));
  };

  const adjustStartVolume = (delta: number) => {
    const nextVolume = clampVolumeValue(settings.startVolume + delta);
    setVolume(nextVolume);
    updateSettings({ startVolume: nextVolume });
  };

  const handleVolumeAccessibilityAction = (event: AccessibilityActionEvent) => {
    const androidVolumeStep = Platform.OS === 'android' ? -VOLUME_STEP : VOLUME_STEP;

    switch (event.nativeEvent.actionName) {
      case 'increment':
        adjustVolume(androidVolumeStep);
        break;
      case 'decrement':
        adjustVolume(-androidVolumeStep);
        break;
      default:
        break;
    }
  };

  const handleVolumeTrackPress = (locationX: number) => {
    setPlayerVolume(locationX / volumeTrackWidth);
  };

  const ensureSound = async () => {
    if (soundRef.current) {
      return soundRef.current;
    }

    setPlaybackState('loading');
    setConnectionStatus('Łączenie ze streamem...');
    const { sound } = await Audio.Sound.createAsync(
      { uri: STREAM_URL, headers: STREAM_HEADERS },
      {
        shouldPlay: false,
        volume,
      },
      onPlaybackStatusUpdate,
    );
    soundRef.current = sound;
    return sound;
  };

  const scheduleReconnect = () => {
    if (!userWantsPlaybackRef.current) {
      return;
    }

    const delay = RETRY_DELAYS_MS[Math.min(retryAttemptRef.current, RETRY_DELAYS_MS.length - 1)];
    retryAttemptRef.current += 1;
    clearRetryTimer();
    setPlaybackState('loading');
    setConnectionStatus(`Połączenie przerwane. Ponawiam za ${Math.round(delay / 1000)} sekund.`);
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      void startPlayback(true);
    }, delay);
  };

  const shouldBlockPlaybackForNetwork = async (showAlert = true) => {
    if (settings.networkMode !== 'wifiOnly') {
      return false;
    }

    const networkState = await NetInfo.fetch();
    const blocksPlayback = networkState.type === 'cellular' || networkState.isConnected === false;
    if (!blocksPlayback) {
      return false;
    }

    userWantsPlaybackRef.current = false;
    clearRetryTimer();
    setPlaybackState('paused');
    setConnectionStatus('Odtwarzanie zatrzymane. W ustawieniach wybrano tylko Wi-Fi.');
    if (showAlert) {
      Alert.alert(
        'Odtwarzanie tylko przez Wi-Fi',
        'Aplikacja nie włączy streamu przez dane komórkowe. Połącz się z Wi-Fi albo zmień ustawienie transmisji danych.',
      );
    }
    return true;
  };

  const startPlayback = async (isRetry = false) => {
    try {
      if (await shouldBlockPlaybackForNetwork(!isRetry)) {
        return;
      }

      clearRetryTimer();
      userWantsPlaybackRef.current = true;
      setPlaybackState('loading');
      setConnectionStatus(isRetry ? 'Ponawiam połączenie ze streamem...' : 'Łączenie ze streamem...');
      const sound = await ensureSound();
      await sound.playAsync();
      retryAttemptRef.current = 0;
      setPlaybackState('playing');
      setConnectionStatus('Odtwarzanie El Radio.');
    } catch {
      await unloadCurrentSound();
      setPlaybackState('error');
      scheduleReconnect();
    }
  };

  const pausePlayback = async () => {
    userWantsPlaybackRef.current = false;
    retryAttemptRef.current = 0;
    clearRetryTimer();

    try {
      await soundRef.current?.pauseAsync();
    } catch {
      // Playback may already be unavailable; the visible state is enough here.
    } finally {
      setPlaybackState('paused');
      setConnectionStatus('Radio jest wstrzymane.');
    }
  };

  const togglePlayback = async () => {
    if (isPlaying) {
      await pausePlayback();
      return;
    }

    await startPlayback();
  };

  const enableSleepTimer = (minutes: number) => {
    if (sleepTimerRef.current) {
      clearTimeout(sleepTimerRef.current);
    }

    const endsAt = Date.now() + minutes * 60 * 1000;
    setSleepTimerEndsAt(endsAt);
    setSleepTimerDurationMinutes(minutes);
    sleepTimerRef.current = setTimeout(() => {
      sleepTimerRef.current = null;
      setSleepTimerEndsAt(null);
      setSleepTimerDurationMinutes(null);
      void pausePlayback().then(() => {
        setConnectionStatus('Wyłącznik czasowy zatrzymał odtwarzanie.');
      });
    }, minutes * 60 * 1000);
  };

  useEffect(() => {
    if (!settingsLoaded || autoPlayedOnLaunchRef.current || !settings.autoPlayOnLaunch) {
      return;
    }

    autoPlayedOnLaunchRef.current = true;
    void startPlayback();
  }, [settingsLoaded, settings.autoPlayOnLaunch]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((networkState) => {
      setIsCellularNetwork(networkState.type === 'cellular');

      if (networkState.type !== 'cellular') {
        networkBlockAlertShownRef.current = false;
      }

      if (
        settings.networkMode === 'wifiOnly' &&
        networkState.type === 'cellular' &&
        userWantsPlaybackRef.current
      ) {
        if (!networkBlockAlertShownRef.current) {
          networkBlockAlertShownRef.current = true;
          Alert.alert(
            'Przełączono na dane komórkowe',
            'Odtwarzanie zostało zatrzymane, bo w ustawieniach wybrano tylko Wi-Fi.',
          );
        }
        void pausePlayback().then(() => {
          setConnectionStatus('Odtwarzanie zatrzymane. W ustawieniach wybrano tylko Wi-Fi.');
        });
      }
    });

    return unsubscribe;
  }, [settings.networkMode]);

  const checkForOtaUpdate = async () => {
    if (__DEV__) {
      setUpdateStatus('Tryb testowy. Aktualizacje OTA działają w zbudowanej aplikacji.');
      return;
    }

    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        setUpdateStatus('Pobieram nową wersję aplikacji...');
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
        return;
      }
      setUpdateStatus('Aplikacja jest aktualna.');
    } catch {
      setUpdateStatus('Aktualizacje zostaną sprawdzone ponownie później.');
    }
  };

  const openMailComposer = async (subject: string, body: string) => {
    try {
      const available = await MailComposer.isAvailableAsync();
      if (available) {
        await MailComposer.composeAsync({
          recipients: [CONTACT_EMAIL],
          subject,
          body,
        });
      } else {
        await Linking.openURL(
          `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
        );
      }
      return true;
    } catch {
      Alert.alert('Nie można otworzyć poczty', 'Spróbuj wysłać wiadomość później.');
      return false;
    }
  };

  const sendMessage = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      Alert.alert('Wpisz treść wiadomości', 'Pole wiadomości nie może być puste.');
      return;
    }

    const subject = getMessageTypeOption(messageType).subject;
    const body = [
      trimmed,
      '',
      '--',
      'Wysłano z aplikacji EL Radio',
    ].filter(Boolean).join('\n');
    const sent = await openMailComposer(subject, body);
    if (sent) {
      setMessage('');
    }
  };

  const buildDiagnosticsText = () => [
    `Aplikacja: ${APP_DISPLAY_NAME}`,
    `System: ${Platform.OS} ${Platform.Version}`,
    `Stan odtwarzania: ${connectionStatus}`,
    `Głośność: ${Math.round(volume * 100)}%`,
    `Tryb sieci: ${settings.networkMode === 'wifiOnly' ? 'tylko Wi-Fi' : 'Wi-Fi i dane komórkowe'}`,
    `Wykryta sieć: ${isCellularNetwork ? 'dane komórkowe' : 'Wi-Fi albo inna sieć'}`,
    `Zdjęcia z Facebooka: ${settings.downloadFacebookImages ? 'włączone' : 'wyłączone'}`,
    `Aktualności z Facebooka: ${facebookFeedState}, posty: ${facebookPosts.length}`,
    `Uproszczona dostępność: ${settings.simplifiedAccessibility ? 'tak' : 'nie'}`,
    `Data: ${new Date().toISOString()}`,
  ].join('\n');

  const openFeedbackForm = (kind: FeedbackKind) => {
    setFeedbackKind(kind);
    setFeedbackText('');
    setFeedbackContact('');
    setFeedbackIncludeDiagnostics(true);
    setSettingsOpen(false);
    setFeedbackOpen(true);
  };

  const closeFeedbackForm = () => {
    setFeedbackOpen(false);
  };

  const sendFeedbackReport = async () => {
    const trimmed = feedbackText.trim();
    const contact = feedbackContact.trim();
    const feedbackCopy = getFeedbackCopy(feedbackKind);

    if (!trimmed) {
      Alert.alert('Uzupełnij zgłoszenie', 'Opis nie może być pusty.');
      return;
    }

    const body = [
      `Typ zgłoszenia: ${feedbackCopy.title}`,
      '',
      feedbackCopy.messageLabel,
      trimmed,
      '',
      contact ? `Kontakt zwrotny: ${contact}` : 'Kontakt zwrotny: nie podano',
      '',
      '--',
      feedbackIncludeDiagnostics
        ? `Diagnostyka aplikacji:\n${buildDiagnosticsText()}`
        : 'Diagnostyka aplikacji: użytkownik nie dołączył.',
    ].join('\n');

    const sent = await openMailComposer(feedbackCopy.subject, body);
    if (sent) {
      setFeedbackText('');
      setFeedbackContact('');
      setFeedbackOpen(false);
    }
  };

  const openFacebook = async () => {
    await WebBrowser.openBrowserAsync(FACEBOOK_URL);
  };

  const openWebsite = async () => {
    await WebBrowser.openBrowserAsync('https://elradio.pl');
  };

  const openReleases = async () => {
    await WebBrowser.openBrowserAsync(APP_RELEASES_URL);
  };

  const selectMessageType = (nextMessageType: MessageType) => {
    setMessageType(nextMessageType);
    setMessageTypeSelectorOpen(false);
  };

  const selectSleepTimerOption = (optionId: SleepTimerOptionId) => {
    setSleepTimerSelectorOpen(false);
    if (optionId === 'off') {
      clearSleepTimer();
      return;
    }

    enableSleepTimer(Number(optionId));
  };

  const refreshFacebookFeed = () => {
    setFacebookPosts([]);
    setFacebookDebug('');
    setFacebookFeedState('loading');
    setFacebookWebViewKey((currentKey) => currentKey + 1);
  };

  const scrollToNews = () => {
    mainScrollRef.current?.scrollTo({
      y: Math.max(0, newsSectionYRef.current - 12),
      animated: false,
    });
  };

  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) {
        return;
      }

      const normalizedUrl = url.toLowerCase();
      if (normalizedUrl.includes('settings')) {
        setSettingsOpen(true);
      }
      if (normalizedUrl.includes('news') || normalizedUrl.includes('facebook')) {
        setTimeout(scrollToNews, 350);
      }
      if (normalizedUrl.includes('refresh')) {
        refreshFacebookFeed();
      }
    };

    Linking.getInitialURL().then(handleUrl).catch(() => undefined);
    const subscription = Linking.addEventListener('url', (event) => handleUrl(event.url));
    return () => subscription.remove();
  }, []);

  const handleFacebookMessage = (event: WebViewMessageEvent) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as FacebookPayload;
      if (payload.type !== 'elradio-facebook-posts') {
        return;
      }

      const posts = normalizeFacebookPosts(payload.posts, settings.downloadFacebookImages);

      setFacebookPosts(posts);
      setFacebookFeedState(posts.length ? 'ready' : 'error');
    } catch {
      setFacebookFeedState('error');
    }
  };

  const toggleSettingsPanel = () => {
    if (settingsOpen) {
      setSettingsOpen(false);
      return;
    }

    setSettingsOpen(true);
  };

  const isPlaying = playbackState === 'playing';
  const isLoading = playbackState === 'loading';
  const playLabel = isPlaying ? 'Wstrzymaj' : 'Odtwarzaj';
  const volumePercent = Math.round(volume * 100);
  const startVolumePercent = Math.round(settings.startVolume * 100);
  const lastVolumePercent = Math.round(settings.lastVolume * 100);
  const messageTypeOption = getMessageTypeOption(messageType);
  const facebookBlockedByNetwork = settings.networkMode === 'wifiOnly' && isCellularNetwork;
  const showFacebookImages = settings.downloadFacebookImages;
  const facebookWebViewUrl = Platform.OS === 'ios' ? FACEBOOK_CRAWLER_URL : FACEBOOK_FEED_URL;
  const facebookUserAgent = Platform.OS === 'ios' ? FACEBOOK_CRAWLER_USER_AGENT : FACEBOOK_WEBVIEW_USER_AGENT;
  const facebookExtractScript = FACEBOOK_EXTRACT_SCRIPT.replace(
    '__ELRADIO_INCLUDE_IMAGES__',
    settings.downloadFacebookImages ? 'true' : 'false',
  );
  const feedbackCopy = getFeedbackCopy(feedbackKind);
  const feedbackDiagnosticsText = buildDiagnosticsText();
  const sleepTimerMinutesLeft = sleepTimerEndsAt
    ? Math.max(1, Math.ceil((sleepTimerEndsAt - Date.now()) / 60000))
    : null;
  const sleepTimerLabel = sleepTimerMinutesLeft ? `Za ${sleepTimerMinutesLeft} min` : 'Wyłączony';
  const selectedSleepTimerOption = sleepTimerDurationMinutes
    ? (String(sleepTimerDurationMinutes) as SleepTimerOptionId)
    : 'off';

  useEffect(() => {
    if (Platform.OS !== 'ios' || facebookBlockedByNetwork) {
      return undefined;
    }

    let cancelled = false;
    const requestId = facebookFetchRequestRef.current + 1;
    facebookFetchRequestRef.current = requestId;

    const loadJsonPosts = async () => {
      const response = await fetch(`${FACEBOOK_FEED_JSON_URL}?refresh=${facebookWebViewKey}`, { cache: 'no-store' });
      const payload = await response.json() as FacebookFeedJson;
      const posts = normalizeFacebookPosts(payload.posts, settings.downloadFacebookImages);
      if (!response.ok || !posts.length) {
        throw new Error(`json ${response.status}, posty ${posts.length}`);
      }
      return { posts, debug: `json ${response.status}, posty ${posts.length}` };
    };

    const loadCrawlerPosts = async () => {
      const response = await fetch(FACEBOOK_CRAWLER_URL, {
        headers: {
          'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8',
          'User-Agent': FACEBOOK_CRAWLER_USER_AGENT,
        },
      });
      const html = await response.text();
      const posts = parseFacebookCrawlerPosts(html, settings.downloadFacebookImages);
      if (!response.ok || !posts.length) {
        throw new Error(
          `fetch ${response.status}, html ${html.length}, message ${html.includes('message') ? 'tak' : 'nie'}, elporter ${html.toLowerCase().includes('elporter') ? 'tak' : 'nie'}, posty ${posts.length}`,
        );
      }
      return { posts, debug: `fetch ${response.status}, posty ${posts.length}` };
    };

    const loadPosts = async () => {
      try {
        let result;
        try {
          result = await loadJsonPosts();
        } catch {
          result = await loadCrawlerPosts();
        }
        if (cancelled || facebookFetchRequestRef.current !== requestId) {
          return;
        }
        if (DEBUG_FACEBOOK_FEED) {
          setFacebookDebug(result.debug);
        }
        setFacebookPosts(result.posts);
        setFacebookFeedState('ready');
      } catch (error) {
        if (!cancelled && facebookFetchRequestRef.current === requestId) {
          if (DEBUG_FACEBOOK_FEED) {
            setFacebookDebug(error instanceof Error ? error.message : 'fetch error');
          }
          setFacebookFeedState('error');
        }
      }
    };

    void loadPosts();
    return () => {
      cancelled = true;
    };
  }, [facebookBlockedByNetwork, facebookWebViewKey, settings.downloadFacebookImages]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={styles.keyboardContainer}
      >
        <ScrollView
          ref={mainScrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.playerBand}>
            <View style={styles.brandRow} accessible accessibilityRole="header" accessibilityLabel={APP_DISPLAY_NAME}>
              <Image
                source={require('./assets/elradio-logo.png')}
                style={styles.brandLogo}
                resizeMode="contain"
                accessible={false}
                accessibilityIgnoresInvertColors
              />
              <View style={styles.brandText}>
                <Text style={styles.brandTitle}>{APP_DISPLAY_NAME}</Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={playLabel}
              disabled={isLoading}
              onPress={togglePlayback}
              style={({ pressed }) => [
                styles.playButton,
                pressed && styles.playButtonPressed,
                isPlaying && styles.pauseButton,
              ]}
            >
              {isLoading ? (
                <ActivityIndicator size="large" color="#FFFFFF" />
              ) : (
                <Icon name={isPlaying ? 'pause-circle' : 'play-circle'} size={58} color="#FFFFFF" />
              )}
              <Text style={styles.playButtonText}>{playLabel}</Text>
            </Pressable>
            {playbackState !== 'idle' ? (
              <View
                accessible
                accessibilityLiveRegion="polite"
                accessibilityLabel={connectionStatus}
                style={styles.playbackStatusRow}
              >
                <Icon
                  name={isPlaying ? 'radio-tower' : isLoading ? 'sync' : playbackState === 'error' ? 'wifi-alert' : 'radio'}
                  size={20}
                  color={isPlaying ? '#0C5C4A' : playbackState === 'error' ? '#E25D3F' : '#476058'}
                />
                <Text style={styles.playbackStatusText}>{connectionStatus}</Text>
              </View>
            ) : null}

            <View style={styles.volumePanel}>
              <View
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel="Głośność"
                accessibilityValue={{ min: 0, max: 100, now: volumePercent, text: `${volumePercent} procent` }}
                accessibilityActions={[
                  { name: 'increment', label: Platform.OS === 'android' ? 'Ciszej' : 'Głośniej' },
                  { name: 'decrement', label: Platform.OS === 'android' ? 'Głośniej' : 'Ciszej' },
                ]}
                onAccessibilityAction={handleVolumeAccessibilityAction}
                style={styles.volumeHeader}
              >
                <Icon name="volume-high" size={24} color="#1F2933" />
                <Text style={styles.volumeLabel}>Głośność</Text>
                <Text style={styles.volumeValue}>{volumePercent}%</Text>
              </View>
              <View style={styles.volumeControls}>
                <Pressable
                  accessible={false}
                  focusable={false}
                  importantForAccessibility="no-hide-descendants"
                  onPress={() => adjustVolume(-VOLUME_STEP)}
                  style={({ pressed }) => [styles.volumeStepButton, pressed && styles.secondaryButtonPressed]}
                >
                  <Icon name="minus" size={24} color="#0C5C4A" />
                </Pressable>
                <Pressable
                  accessible={false}
                  focusable={false}
                  importantForAccessibility="no-hide-descendants"
                  onLayout={(event) => setVolumeTrackWidth(Math.max(1, event.nativeEvent.layout.width))}
                  onPress={(event) => handleVolumeTrackPress(event.nativeEvent.locationX)}
                  style={styles.volumeTrackTouch}
                >
                  <View style={styles.volumeTrack}>
                    <View pointerEvents="none" style={styles.volumeTicks}>
                      {VOLUME_TICKS.map((tick) => (
                        <View key={tick} style={styles.volumeTick} />
                      ))}
                    </View>
                    <View style={[styles.volumeTrackFill, { width: `${volumePercent}%` }]} />
                    <View style={[styles.volumeThumb, { left: `${volumePercent}%` }]} />
                  </View>
                </Pressable>
                <Pressable
                  accessible={false}
                  focusable={false}
                  importantForAccessibility="no-hide-descendants"
                  onPress={() => adjustVolume(VOLUME_STEP)}
                  style={({ pressed }) => [styles.volumeStepButton, pressed && styles.secondaryButtonPressed]}
                >
                  <Icon name="plus" size={24} color="#0C5C4A" />
                </Pressable>
              </View>
            </View>

            <View style={styles.sleepTimerPanel}>
              <SelectButton
                label="Wyłącznik czasowy"
                value={sleepTimerLabel}
                icon="timer-outline"
                accessibilityLabel={`Wyłącznik czasowy: ${sleepTimerLabel}`}
                onPress={() => setSleepTimerSelectorOpen(true)}
              />
            </View>

          </View>


          <Section icon="calendar-heart" title={`Dziś jest: ${todayLabel}`}>
            <View
              accessible
              accessibilityLabel={`Imieniny: ${todayNameDays.names.join(', ')}`}
            >
              <Text style={styles.nameDayNames}>{todayNameDays.names.join(', ')}</Text>
            </View>
          </Section>

          <View onLayout={(event) => {
            newsSectionYRef.current = event.nativeEvent.layout.y;
          }}>
            <Section icon="facebook" title="Aktualności z Facebooka">
              <View style={styles.newsList}>
              {facebookBlockedByNetwork && (
                <View style={styles.facebookStatusCard}>
                  <Icon name="wifi-off" size={24} color="#E25D3F" />
                  <Text style={styles.facebookStatusText}>
                    Aktualności są wstrzymane, bo w ustawieniach wybrano tylko Wi-Fi.
                  </Text>
                </View>
              )}
              {!facebookBlockedByNetwork && facebookFeedState === 'loading' && (
                <View style={styles.facebookStatusCard}>
                  <ActivityIndicator color="#0C8C72" />
                  <Text style={styles.facebookStatusText}>Ładuję posty z Facebooka...</Text>
                </View>
              )}
              {!facebookBlockedByNetwork && facebookFeedState === 'error' && (
                <View style={styles.facebookStatusCard}>
                  <Icon name="alert-circle-outline" size={24} color="#E25D3F" />
                  <Text style={styles.facebookStatusText}>
                    Nie udało się pobrać postów. Otwórz profil EL Radio na Facebooku.
                  </Text>
                  {DEBUG_FACEBOOK_FEED && facebookDebug ? (
                    <Text style={styles.facebookDebugText}>{facebookDebug}</Text>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Spróbuj ponownie pobrać posty z Facebooka"
                    onPress={refreshFacebookFeed}
                    style={({ pressed }) => [styles.retryButton, pressed && styles.secondaryButtonPressed]}
                  >
                    <Text style={styles.retryButtonText}>Spróbuj ponownie</Text>
                  </Pressable>
                </View>
              )}
              {!facebookBlockedByNetwork && facebookPosts.map((post) => (
                <View
                  key={post.id}
                  accessible
                  accessibilityLabel={
                    settings.simplifiedAccessibility
                      ? post.text || 'Zdjęcie'
                      : `Post z Facebooka. ${post.text || 'Zdjęcie z profilu EL Radio.'}`
                  }
                  style={styles.facebookPostCard}
                >
                  {post.imageUrl && showFacebookImages ? (
                    <Image
                      source={{ uri: post.imageUrl, headers: { 'User-Agent': facebookUserAgent } }}
                      style={styles.facebookPostImage}
                      resizeMode="cover"
                      accessible={false}
                      accessibilityIgnoresInvertColors
                    />
                  ) : null}
                  {post.imageUrl && !showFacebookImages ? (
                    <Text style={styles.facebookImageHiddenText}>
                      Zdjęcie pominięte zgodnie z ustawieniem użytkownika.
                    </Text>
                  ) : null}
                  {post.text ? <Text style={styles.facebookPostText}>{post.text}</Text> : null}
                </View>
              ))}
              {!facebookBlockedByNetwork && Platform.OS !== 'ios' ? (
                <WebView
                  key={`${facebookWebViewKey}-${settings.downloadFacebookImages ? 'images' : 'text'}`}
                  ref={facebookWebViewRef}
                  accessible={false}
                  focusable={false}
                  importantForAccessibility="no-hide-descendants"
                  source={{
                    uri: facebookWebViewUrl,
                    headers: {
                      'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8',
                      'User-Agent': facebookUserAgent,
                    },
                  }}
                  originWhitelist={['https://*']}
                  javaScriptEnabled
                  domStorageEnabled
                  sharedCookiesEnabled
                  thirdPartyCookiesEnabled
                  setSupportMultipleWindows={false}
                  userAgent={facebookUserAgent}
                  textZoom={82}
                  injectedJavaScript={facebookExtractScript}
                  injectedJavaScriptBeforeContentLoaded={facebookExtractScript}
                  injectedJavaScriptForMainFrameOnly={false}
                  injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
                  onLoadProgress={(event) => {
                    if (event.nativeEvent.progress >= 0.35) {
                      facebookWebViewRef.current?.injectJavaScript(facebookExtractScript);
                    }
                  }}
                  onLoadEnd={() => facebookWebViewRef.current?.injectJavaScript(facebookExtractScript)}
                  onMessage={handleFacebookMessage}
                  onError={() => setFacebookFeedState('error')}
                  onHttpError={() => setFacebookFeedState('error')}
                  pointerEvents={'none'}
                  style={styles.facebookLoader}
                />
              ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Facebook EL Radio"
                onPress={openFacebook}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
              >
                <Icon name="facebook" size={22} color="#0C5C4A" />
                <Text style={styles.secondaryButtonText}>Zaobserwuj lub polub</Text>
              </Pressable>
            </Section>
          </View>

          <Section icon="email-fast-outline" title="Napisz do nas">
            <SelectButton
              label="Temat wiadomości"
              value={messageTypeOption.label}
              icon="format-list-bulleted"
              accessibilityLabel={`Temat wiadomości: ${messageTypeOption.label}`}
              onPress={() => setMessageTypeSelectorOpen(true)}
            />
            <TextInput
              accessibilityLabel="Treść wiadomości do EL Radio"
              multiline
              textAlignVertical="top"
              value={message}
              onChangeText={setMessage}
              placeholder={messageTypeOption.placeholder}
              placeholderTextColor="#6B7280"
              style={styles.messageInput}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Wyślij wiadomość do EL Radio"
              onPress={sendMessage}
              style={({ pressed }) => [styles.primarySmallButton, pressed && styles.primarySmallButtonPressed]}
            >
              <Icon name="send" size={20} color="#FFFFFF" />
              <Text style={styles.primarySmallButtonText}>Wyślij wiadomość</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zgłoś błąd w aplikacji"
              onPress={() => openFeedbackForm('bug')}
              style={({ pressed }) => [styles.reportButton, pressed && styles.secondaryButtonPressed]}
            >
              <Icon name="bug-outline" size={20} color="#0C5C4A" />
              <Text style={styles.reportButtonText}>Zgłoś błąd</Text>
            </Pressable>
          </Section>

          <View style={styles.aboutBand}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="O nas"
              onPress={() => setAboutOpen(true)}
              style={({ pressed }) => [styles.aboutButton, pressed && styles.secondaryButtonPressed]}
            >
              <Icon name="information-outline" size={22} color="#F6C95C" />
              <Text style={styles.aboutButtonText}>O nas</Text>
              <Icon name="chevron-right" size={24} color="#F6C95C" />
            </Pressable>
          </View>

          <View style={styles.settingsFooter}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ustawienia"
              onPress={toggleSettingsPanel}
              style={({ pressed }) => [styles.settingsButton, pressed && styles.secondaryButtonPressed]}
            >
              <Icon name="cog" size={20} color="#0C5C4A" />
              <Text style={styles.settingsButtonText}>Ustawienia</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal
        visible={settingsOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setSettingsOpen(false)}
      >
        <SafeAreaView style={styles.settingsScreen}>
          <StatusBar style="dark" />
          <KeyboardAvoidingView
            behavior={Platform.select({ ios: 'padding', android: undefined })}
            style={styles.settingsKeyboardContainer}
          >
            <View style={styles.settingsScreenHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Wróć"
                onPress={() => setSettingsOpen(false)}
                style={({ pressed }) => [styles.settingsBackButton, pressed && styles.secondaryButtonPressed]}
              >
                <Icon name="chevron-left" size={28} color="#0C5C4A" />
                <Text style={styles.settingsBackButtonText}>Wróć</Text>
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.settingsScreenContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.settingGroup}>
                <Text style={styles.settingGroupTitle}>Dane i sieć</Text>
                <SettingsSwitchRow
                  label="Tylko Wi-Fi"
                  description="Na wykrytych danych komórkowych radio i aktualności nie wystartują."
                  value={settings.networkMode === 'wifiOnly'}
                  onValueChange={(value) => updateSettings({ networkMode: value ? 'wifiOnly' : 'wifiAndCellular' })}
                />
                <SettingsSwitchRow
                  label="Pobieraj zdjęcia z Facebooka"
                  description="Gdy wyłączysz tę opcję, aktualności zostaną tekstowe i bez obrazów w kartach postów."
                  value={settings.downloadFacebookImages}
                  onValueChange={(value) => updateSettings({ downloadFacebookImages: value })}
                />
              </View>

              <View style={styles.settingGroup}>
                <Text style={styles.settingGroupTitle}>Start aplikacji</Text>
                <SettingsSwitchRow
                  label="Włącz odtwarzanie po uruchomieniu"
                  description="Po otwarciu aplikacji radio uruchomi się automatycznie."
                  value={settings.autoPlayOnLaunch}
                  onValueChange={(value) => updateSettings({ autoPlayOnLaunch: value })}
                />
                <SettingsSwitchRow
                  label="Startuj z ostatnią głośnością"
                  description={`Ostatnio zapamiętana głośność: ${lastVolumePercent} procent.`}
                  value={settings.startupVolumeMode === 'last'}
                  onValueChange={(value) => updateSettings({ startupVolumeMode: value ? 'last' : 'fixed' })}
                />
                {settings.startupVolumeMode === 'fixed' ? (
                  <View
                    accessible
                    accessibilityRole="adjustable"
                    accessibilityLabel="Głośność startowa"
                    accessibilityValue={{ min: 0, max: 100, now: startVolumePercent, text: `${startVolumePercent} procent` }}
                    accessibilityActions={[
                      { name: 'increment', label: 'Głośniej' },
                      { name: 'decrement', label: 'Ciszej' },
                    ]}
                    onAccessibilityAction={(event) => {
                      if (event.nativeEvent.actionName === 'increment') {
                        adjustStartVolume(VOLUME_STEP);
                      }
                      if (event.nativeEvent.actionName === 'decrement') {
                        adjustStartVolume(-VOLUME_STEP);
                      }
                    }}
                    style={styles.startVolumeBox}
                  >
                    <Text style={styles.settingLabel}>Głośność startowa</Text>
                    <View style={styles.startVolumeControls}>
                      <Pressable
                        accessible={false}
                        focusable={false}
                        importantForAccessibility="no-hide-descendants"
                        onPress={() => adjustStartVolume(-VOLUME_STEP)}
                        style={({ pressed }) => [styles.settingsStepButton, pressed && styles.secondaryButtonPressed]}
                      >
                        <Icon name="minus" size={22} color="#0C5C4A" />
                      </Pressable>
                      <Text style={styles.startVolumeValue}>{startVolumePercent}%</Text>
                      <Pressable
                        accessible={false}
                        focusable={false}
                        importantForAccessibility="no-hide-descendants"
                        onPress={() => adjustStartVolume(VOLUME_STEP)}
                        style={({ pressed }) => [styles.settingsStepButton, pressed && styles.secondaryButtonPressed]}
                      >
                        <Icon name="plus" size={22} color="#0C5C4A" />
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>

              <View style={styles.settingGroup}>
                <Text style={styles.settingGroupTitle}>Aktualizacja aplikacji</Text>
                <Text accessibilityLiveRegion="polite" style={styles.settingDescription}>
                  {updateStatus}
                </Text>
                <View style={styles.settingButtonRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Sprawdź aktualizacje aplikacji"
                    onPress={checkForOtaUpdate}
                    style={({ pressed }) => [styles.settingsActionButton, pressed && styles.secondaryButtonPressed]}
                  >
                    <Icon name="refresh" size={19} color="#0C5C4A" />
                    <Text style={styles.settingsActionButtonText}>Sprawdź</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel="Otwórz stronę aktualizacji aplikacji"
                    onPress={openReleases}
                    style={({ pressed }) => [styles.settingsActionButton, pressed && styles.secondaryButtonPressed]}
                  >
                    <Icon name="download" size={19} color="#0C5C4A" />
                    <Text style={styles.settingsActionButtonText}>Pobierz</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.settingGroup}>
                <Text style={styles.settingGroupTitle}>Błędy i propozycje</Text>
                <View style={styles.settingButtonRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Zgłoś błąd w aplikacji"
                    onPress={() => openFeedbackForm('bug')}
                    style={({ pressed }) => [styles.settingsActionButton, pressed && styles.secondaryButtonPressed]}
                  >
                    <Icon name="bug-outline" size={19} color="#0C5C4A" />
                    <Text style={styles.settingsActionButtonText}>Zgłoś błąd</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Wyślij propozycję do aplikacji"
                    onPress={() => openFeedbackForm('suggestion')}
                    style={({ pressed }) => [styles.settingsActionButton, pressed && styles.secondaryButtonPressed]}
                  >
                    <Icon name="lightbulb-on-outline" size={19} color="#0C5C4A" />
                    <Text style={styles.settingsActionButtonText}>Propozycja</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.settingGroup}>
                <Text style={styles.settingGroupTitle}>Dostępność</Text>
                <SettingsSwitchRow
                  label="Prostsze opisy dla czytnika"
                  description="Posty i elementy pomocnicze mają krótsze etykiety."
                  value={settings.simplifiedAccessibility}
                  onValueChange={(value) => updateSettings({ simplifiedAccessibility: value })}
                />
              </View>

              <View style={styles.settingGroupLast}>
                <Text style={styles.settingGroupTitle}>Prywatność</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Pokaż informacje o prywatności"
                  onPress={() => setPrivacyOpen(true)}
                  style={({ pressed }) => [styles.settingsActionButton, styles.singleSettingsActionButton, pressed && styles.secondaryButtonPressed]}
                >
                  <Icon name="shield-account-outline" size={19} color="#0C5C4A" />
                  <Text style={styles.settingsActionButtonText}>Pokaż</Text>
                </Pressable>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
      <Modal
        visible={feedbackOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeFeedbackForm}
      >
        <SafeAreaView style={styles.settingsScreen}>
          <StatusBar style="dark" />
          <KeyboardAvoidingView
            behavior={Platform.select({ ios: 'padding', android: undefined })}
            style={styles.settingsKeyboardContainer}
          >
            <View style={styles.settingsScreenHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Wróć"
                onPress={closeFeedbackForm}
                style={({ pressed }) => [styles.settingsBackButton, pressed && styles.secondaryButtonPressed]}
              >
                <Icon name="chevron-left" size={28} color="#0C5C4A" />
                <Text style={styles.settingsBackButtonText}>Wróć</Text>
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.settingsScreenContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.settingGroup}>
                <Text style={styles.settingGroupTitle}>{feedbackCopy.title}</Text>
                <Text style={styles.settingDescription}>
                  Opis trafi do wiadomości e-mail. Kontakt zwrotny jest opcjonalny i nie zapisuje się w ustawieniach.
                </Text>
                <Text style={styles.settingInputLabel}>{feedbackCopy.messageLabel}</Text>
                <TextInput
                  accessibilityLabel={feedbackCopy.messageLabel}
                  multiline
                  textAlignVertical="top"
                  value={feedbackText}
                  onChangeText={setFeedbackText}
                  placeholder={feedbackCopy.placeholder}
                  placeholderTextColor="#6B7280"
                  style={[styles.settingsTextInput, styles.feedbackTextInput]}
                />
                <Text style={styles.settingInputLabel}>Kontakt zwrotny opcjonalnie</Text>
                <TextInput
                  accessibilityLabel="Kontakt zwrotny do zgłoszenia"
                  value={feedbackContact}
                  onChangeText={setFeedbackContact}
                  placeholder="Telefon albo e-mail"
                  placeholderTextColor="#6B7280"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={styles.settingsTextInput}
                />
              </View>

              <View style={styles.settingGroup}>
                <Text style={styles.settingGroupTitle}>Diagnostyka</Text>
                <SettingsSwitchRow
                  label="Dołącz diagnostykę"
                  description="Możesz sprawdzić poniżej, jakie dane zostaną wpisane do maila."
                  value={feedbackIncludeDiagnostics}
                  onValueChange={setFeedbackIncludeDiagnostics}
                />
                {feedbackIncludeDiagnostics ? (
                  <Text selectable style={styles.diagnosticsPreview}>
                    {feedbackDiagnosticsText}
                  </Text>
                ) : null}
              </View>

              <View style={styles.settingGroupLast}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Wyślij zgłoszenie"
                  onPress={sendFeedbackReport}
                  style={({ pressed }) => [styles.feedbackSendButton, pressed && styles.primarySmallButtonPressed]}
                >
                  <Icon name="send" size={20} color="#FFFFFF" />
                  <Text style={styles.primarySmallButtonText}>Wyślij zgłoszenie</Text>
                </Pressable>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
      <SelectionModal
        visible={messageTypeSelectorOpen}
        title="Temat wiadomości"
        options={MESSAGE_TYPE_OPTIONS.map((option) => ({ id: option.id, label: option.label }))}
        selectedId={messageType}
        onSelect={selectMessageType}
        onClose={() => setMessageTypeSelectorOpen(false)}
      />
      <SelectionModal
        visible={sleepTimerSelectorOpen}
        title="Wyłącznik czasowy"
        options={SLEEP_TIMER_SELECT_OPTIONS}
        selectedId={selectedSleepTimerOption}
        onSelect={selectSleepTimerOption}
        onClose={() => setSleepTimerSelectorOpen(false)}
      />
      <Modal
        visible={aboutOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setAboutOpen(false)}
      >
        <SafeAreaView style={styles.settingsScreen}>
          <StatusBar style="dark" />
          <View style={styles.settingsScreenHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Wróć"
              onPress={() => setAboutOpen(false)}
              style={({ pressed }) => [styles.settingsBackButton, pressed && styles.secondaryButtonPressed]}
            >
              <Icon name="chevron-left" size={28} color="#0C5C4A" />
              <Text style={styles.settingsBackButtonText}>Wróć</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.settingsScreenContent} showsVerticalScrollIndicator={false}>
            <View style={styles.settingGroupLast}>
              <Text style={styles.settingGroupTitle}>O nas</Text>
              <Text style={styles.aboutModalText}>El Radio Łódź 90,8</Text>
              <Text style={styles.aboutModalText}>EL RADIO SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ</Text>
              <Text style={styles.aboutModalText}>Księży Młyn 14 90-345 Łódź</Text>
              <Text style={styles.aboutModalText}>e-mail: BIURO@ELRADIO.PL</Text>
              <Pressable accessibilityRole="link" onPress={openWebsite} style={styles.websiteButton}>
                <Text style={styles.websiteTextDark}>https://elradio.pl</Text>
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <Modal
        visible={privacyOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setPrivacyOpen(false)}
      >
        <SafeAreaView style={styles.settingsScreen}>
          <StatusBar style="dark" />
          <View style={styles.settingsScreenHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Wróć"
              onPress={() => setPrivacyOpen(false)}
              style={({ pressed }) => [styles.settingsBackButton, pressed && styles.secondaryButtonPressed]}
            >
              <Icon name="chevron-left" size={28} color="#0C5C4A" />
              <Text style={styles.settingsBackButtonText}>Wróć</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.settingsScreenContent} showsVerticalScrollIndicator={false}>
            <View style={styles.settingGroupLast}>
              <Text style={styles.settingGroupTitle}>Prywatność</Text>
              <Text style={styles.privacyText}>{PRIVACY_TEXT}</Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

type SectionProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  children: ReactNode;
};

function Section({ icon, title, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionTitleRow} accessible accessibilityRole="header" accessibilityLabel={title}>
        <Icon name={icon} size={25} color="#0C5C4A" />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

type SelectButtonProps = {
  label: string;
  value: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  accessibilityLabel?: string;
  onPress: () => void;
};

function SelectButton({ label, value, icon, accessibilityLabel, onPress }: SelectButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${label}: ${value}`}
      onPress={onPress}
      style={({ pressed }) => [styles.selectButton, pressed && styles.secondaryButtonPressed]}
    >
      {icon ? <Icon name={icon} size={22} color="#0C5C4A" /> : null}
      <View style={styles.selectButtonText}>
        <Text style={styles.selectButtonLabel}>{label}</Text>
        <Text style={styles.selectButtonValue}>{value}</Text>
      </View>
      <Icon name="chevron-down" size={24} color="#0C5C4A" />
    </Pressable>
  );
}

type SelectionModalProps<T extends string> = {
  visible: boolean;
  title: string;
  options: Array<SelectionOption<T>>;
  selectedId: T;
  onSelect: (id: T) => void;
  onClose: () => void;
};

function SelectionModal<T extends string>({
  visible,
  title,
  options,
  selectedId,
  onSelect,
  onClose,
}: SelectionModalProps<T>) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.settingsScreen}>
        <StatusBar style="dark" />
        <View style={styles.settingsScreenHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Wróć"
            onPress={onClose}
            style={({ pressed }) => [styles.settingsBackButton, pressed && styles.secondaryButtonPressed]}
          >
            <Icon name="chevron-left" size={28} color="#0C5C4A" />
            <Text style={styles.settingsBackButtonText}>Wróć</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.settingsScreenContent} showsVerticalScrollIndicator={false}>
          <View style={styles.settingGroupLast}>
            <Text style={styles.settingGroupTitle}>{title}</Text>
            <View style={styles.selectionList}>
              {options.map((option) => {
                const selected = option.id === selectedId;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="button"
                    accessibilityLabel={option.accessibilityLabel ?? option.label}
                    accessibilityState={{ selected }}
                    onPress={() => onSelect(option.id)}
                    style={({ pressed }) => [
                      styles.selectionOption,
                      selected && styles.selectionOptionSelected,
                      pressed && styles.secondaryButtonPressed,
                    ]}
                  >
                    <Text style={[styles.selectionOptionText, selected && styles.selectionOptionTextSelected]}>
                      {option.label}
                    </Text>
                    {selected ? <Icon name="check" size={22} color="#FFFFFF" /> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

type SettingsSwitchRowProps = {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
};

function SettingsSwitchRow({ label, value, onValueChange }: SettingsSwitchRowProps) {
  return (
    <View style={styles.settingsSwitchRow}>
      <View style={styles.settingsSwitchText}>
        <Text style={styles.settingLabel}>{label}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#C7D6D0', true: '#A7D8CB' }}
        thumbColor={value ? '#0C8C72' : '#FFFFFF'}
      />
    </View>
  );
}

type IconProps = {
  name: keyof typeof MaterialCommunityIcons.glyphMap;
  size: number;
  color: string;
};

function Icon({ name, size, color }: IconProps) {
  return (
    <MaterialCommunityIcons
      name={name}
      size={size}
      color={color}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F8F7',
  },
  keyboardContainer: {
    flex: 1,
  },
  content: {
    paddingBottom: 34,
  },
  playerBand: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) + 12 : 12,
    paddingBottom: 14,
    backgroundColor: '#EAF4EF',
    borderBottomColor: '#CEE0D8',
    borderBottomWidth: 1,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginBottom: 10,
  },
  brandLogo: {
    width: 96,
    height: 36,
  },
  brandText: {
    flex: 1,
  },
  brandTitle: {
    color: '#17212B',
    fontSize: 21,
    lineHeight: 25,
    fontWeight: '800',
    flexShrink: 1,
  },
  playButton: {
    minHeight: 78,
    borderRadius: 8,
    backgroundColor: '#0C8C72',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 18,
    shadowColor: '#0A4F40',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 5,
  },
  pauseButton: {
    backgroundColor: '#E25D3F',
  },
  playButtonPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.92,
  },
  playButtonText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
  },
  playbackStatusRow: {
    minHeight: 34,
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: '#F4F7F5',
    borderColor: '#CEE0D8',
    borderWidth: 1,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
  },
  playbackStatusText: {
    color: '#31473F',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    flex: 1,
  },
  volumePanel: {
    marginTop: 10,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderColor: '#BFD3CC',
    borderWidth: 1,
    shadowColor: '#0A4F40',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  volumeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
  },
  volumeLabel: {
    color: '#1F2933',
    fontSize: 17,
    fontWeight: '700',
  },
  volumeValue: {
    color: '#0C5C4A',
    fontSize: 18,
    fontWeight: '900',
    marginLeft: 'auto',
  },
  volumeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  volumeStepButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#AFC9BF',
    backgroundColor: '#F4F7F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  volumeTrackTouch: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  volumeTrack: {
    height: 13,
    borderRadius: 999,
    backgroundColor: '#E6EFEA',
    borderColor: '#C5D8D0',
    borderWidth: 1,
    overflow: 'visible',
    justifyContent: 'center',
  },
  volumeTrackFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    height: 11,
    borderRadius: 999,
    backgroundColor: '#F6C95C',
  },
  volumeTicks: {
    position: 'absolute',
    left: 7,
    right: 7,
    top: -6,
    bottom: -6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  volumeTick: {
    width: 2,
    height: 21,
    borderRadius: 2,
    backgroundColor: '#7B928A',
    opacity: 0.45,
  },
  volumeThumb: {
    position: 'absolute',
    top: -13,
    width: 37,
    height: 37,
    marginLeft: -18,
    borderRadius: 19,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    backgroundColor: '#0C8C72',
    shadowColor: '#0A4F40',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 7,
    elevation: 4,
  },
  sleepTimerPanel: {
    marginTop: 10,
  },
  sleepTimerHeader: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sleepTimerTitle: {
    flex: 1,
    color: '#1F2933',
    fontSize: 16,
    fontWeight: '800',
  },
  sleepTimerValue: {
    color: '#0C5C4A',
    fontSize: 15,
    fontWeight: '900',
  },
  sleepTimerButtons: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sleepTimerButton: {
    minHeight: 42,
    minWidth: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#AFC9BF',
    backgroundColor: '#F4F7F5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  sleepTimerOffButton: {
    backgroundColor: '#FFF7E2',
    borderColor: '#E3C46C',
  },
  sleepTimerButtonText: {
    color: '#0C5C4A',
    fontSize: 15,
    fontWeight: '900',
  },
  frequencyBand: {
    backgroundColor: '#1F2933',
    paddingHorizontal: 20,
    paddingVertical: 20,
    alignItems: 'center',
  },
  frequencyCaption: {
    color: '#F4F7F5',
    fontSize: 18,
    textAlign: 'center',
    fontWeight: '700',
  },
  frequencyValue: {
    color: '#F6C95C',
    fontSize: 54,
    lineHeight: 60,
    fontWeight: '900',
    marginTop: 3,
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomColor: '#DCE6E1',
    borderBottomWidth: 1,
    backgroundColor: '#F6F8F7',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  sectionTitle: {
    color: '#17212B',
    fontSize: 20,
    fontWeight: '800',
  },
  nameDayNames: {
    color: '#17212B',
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '800',
  },
  newsList: {
    gap: 12,
  },
  facebookStatusCard: {
    minHeight: 92,
    borderRadius: 8,
    borderColor: '#D4E4DD',
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: 10,
  },
  facebookStatusText: {
    color: '#31473F',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    textAlign: 'center',
  },
  facebookDebugText: {
    color: '#52645F',
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
  },
  facebookPostCard: {
    overflow: 'hidden',
    borderRadius: 8,
    borderColor: '#D4E4DD',
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
  },
  facebookPostImage: {
    width: '100%',
    height: 205,
    backgroundColor: '#DCE6E1',
  },
  facebookImageHiddenText: {
    color: '#52645F',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  facebookPostText: {
    color: '#1F2933',
    fontSize: 16,
    lineHeight: 23,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  facebookLoader: {
    position: 'absolute',
    left: Platform.OS === 'ios' ? 0 : -1200,
    top: 0,
    width: 500,
    height: 900,
    opacity: Platform.OS === 'ios' ? 0.01 : 0,
  },
  retryButton: {
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#AFC9BF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  retryButtonText: {
    color: '#0C5C4A',
    fontSize: 14,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 52,
    marginTop: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#AFC9BF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  secondaryButtonPressed: {
    opacity: 0.78,
  },
  secondaryButtonText: {
    color: '#0C5C4A',
    fontSize: 17,
    fontWeight: '800',
  },
  messageTypeLabel: {
    color: '#1F2933',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 8,
  },
  messageTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  messageTypeButton: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#AFC9BF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  messageTypeButtonSelected: {
    borderColor: '#0C8C72',
    backgroundColor: '#0C8C72',
  },
  messageTypeButtonText: {
    color: '#0C5C4A',
    fontSize: 14,
    fontWeight: '900',
  },
  messageTypeButtonTextSelected: {
    color: '#FFFFFF',
  },
  messageInput: {
    minHeight: 112,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFD3CC',
    backgroundColor: '#FFFFFF',
    color: '#17212B',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: 17,
    lineHeight: 24,
  },
  primarySmallButton: {
    minHeight: 52,
    marginTop: 13,
    borderRadius: 8,
    backgroundColor: '#0C8C72',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  primarySmallButtonPressed: {
    opacity: 0.86,
  },
  primarySmallButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  reportButton: {
    minHeight: 48,
    marginTop: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#AFC9BF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  reportButtonText: {
    color: '#0C5C4A',
    fontSize: 16,
    fontWeight: '800',
  },
  aboutBand: {
    backgroundColor: '#17212B',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  aboutButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  aboutButtonText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  aboutTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 10,
  },
  aboutText: {
    color: '#E9F0EC',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  websiteButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    minHeight: 38,
    justifyContent: 'center',
  },
  websiteText: {
    color: '#F6C95C',
    fontSize: 16,
    fontWeight: '800',
  },
  websiteTextDark: {
    color: '#0C5C4A',
    fontSize: 16,
    fontWeight: '900',
  },
  aboutModalText: {
    color: '#31473F',
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '700',
    marginTop: 8,
  },
  settingsScreen: {
    flex: 1,
    backgroundColor: '#F6F8F7',
  },
  settingsKeyboardContainer: {
    flex: 1,
  },
  settingsScreenHeader: {
    minHeight: Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) + 62 : 62,
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 0 : 0,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    borderBottomColor: '#CEE0D8',
    borderBottomWidth: 1,
    backgroundColor: '#EAF4EF',
  },
  settingsBackButton: {
    minWidth: 112,
    height: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#AFC9BF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingLeft: 10,
    paddingRight: 14,
  },
  settingsBackButtonText: {
    color: '#0C5C4A',
    fontSize: 18,
    fontWeight: '900',
  },
  settingsScreenContent: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 34,
  },
  settingsFooter: {
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
    backgroundColor: '#F6F8F7',
  },
  settingsPanel: {
    alignSelf: 'stretch',
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFD3CC',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  settingsTitleRow: {
    minHeight: 56,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#EAF4EF',
    borderBottomWidth: 1,
    borderBottomColor: '#D4E4DD',
  },
  settingsTitle: {
    color: '#17212B',
    fontSize: 20,
    fontWeight: '900',
  },
  settingGroup: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#DCE6E1',
  },
  settingGroupLast: {
    paddingHorizontal: 14,
    paddingVertical: 15,
  },
  settingGroupTitle: {
    color: '#17212B',
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
    marginBottom: 4,
  },
  settingLabel: {
    color: '#1F2933',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
  },
  settingDescription: {
    color: '#52645F',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  settingsSwitchRow: {
    marginTop: 6,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingsSwitchText: {
    flex: 1,
  },
  startVolumeBox: {
    marginTop: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D4E4DD',
    padding: 12,
    backgroundColor: '#F6F8F7',
  },
  startVolumeControls: {
    marginTop: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  settingsStepButton: {
    width: 46,
    height: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#AFC9BF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startVolumeValue: {
    flex: 1,
    textAlign: 'center',
    color: '#0C5C4A',
    fontSize: 22,
    fontWeight: '900',
  },
  settingInputLabel: {
    marginTop: 10,
    marginBottom: 6,
    color: '#1F2933',
    fontSize: 15,
    fontWeight: '800',
  },
  settingsTextInput: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFD3CC',
    backgroundColor: '#FFFFFF',
    color: '#17212B',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    lineHeight: 22,
  },
  feedbackTextInput: {
    minHeight: 150,
  },
  diagnosticsPreview: {
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D4E4DD',
    backgroundColor: '#FFFFFF',
    color: '#31473F',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  settingButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  settingsActionButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#AFC9BF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 10,
  },
  settingsActionButtonText: {
    color: '#0C5C4A',
    fontSize: 15,
    fontWeight: '800',
  },
  feedbackSendButton: {
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: '#0C8C72',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  selectButton: {
    minHeight: 54,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#AFC9BF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectButtonText: {
    flex: 1,
  },
  selectButtonLabel: {
    color: '#52645F',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
  },
  selectButtonValue: {
    color: '#17212B',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
  },
  selectionList: {
    gap: 8,
    marginTop: 6,
  },
  selectionOption: {
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#AFC9BF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
  },
  selectionOptionSelected: {
    borderColor: '#0C8C72',
    backgroundColor: '#0C8C72',
  },
  selectionOptionText: {
    color: '#0C5C4A',
    fontSize: 17,
    fontWeight: '900',
  },
  selectionOptionTextSelected: {
    color: '#FFFFFF',
  },
  singleSettingsActionButton: {
    marginTop: 6,
  },
  privacyText: {
    color: '#31473F',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },
  settingsButton: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#AFC9BF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 12,
  },
  settingsButtonText: {
    color: '#0C5C4A',
    fontSize: 14,
    fontWeight: '800',
  },
});
