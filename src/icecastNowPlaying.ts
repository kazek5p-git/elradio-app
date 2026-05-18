const ICECAST_STATUS_JSON_URL = 'http://dhtk2.noip.pl:8888/status-json.xsl?mount=/elradio';
const NOW_PLAYING_FETCH_TIMEOUT_MS = 8000;

type IcecastSourcePayload = {
  listenurl?: unknown;
  mount?: unknown;
  server_name?: unknown;
  title?: unknown;
};

type IcecastStatusPayload = {
  icestats?: {
    source?: IcecastSourcePayload | IcecastSourcePayload[];
  };
};

function normalizeNowPlayingTitle(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }

  const title = value.replace(/\s+/g, ' ').trim();
  if (!title || title === '-' || title.toLowerCase() === 'unknown') {
    return '';
  }
  return title;
}

function normalizeIcecastText(value: unknown) {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function getElRadioIcecastSource(payload: IcecastStatusPayload) {
  const rawSources = payload.icestats?.source;
  const sources = Array.isArray(rawSources) ? rawSources : rawSources ? [rawSources] : [];
  if (!sources.length) {
    return null;
  }

  return sources.find((source) => {
    const mount = normalizeIcecastText(source.mount);
    const listenUrl = normalizeIcecastText(source.listenurl);
    const serverName = normalizeIcecastText(source.server_name);
    return mount === '/elradio' || listenUrl.includes('/elradio') || serverName === 'el radio';
  }) ?? sources[0];
}

export async function fetchNowPlayingTitle() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NOW_PLAYING_FETCH_TIMEOUT_MS);
  try {
    const separator = ICECAST_STATUS_JSON_URL.includes('?') ? '&' : '?';
    const response = await fetch(`${ICECAST_STATUS_JSON_URL}${separator}t=${Date.now()}`, {
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
        'User-Agent': 'El Radio app metadata',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Icecast HTTP ${response.status}`);
    }
    const payload = await response.json() as IcecastStatusPayload;
    return normalizeNowPlayingTitle(getElRadioIcecastSource(payload)?.title);
  } finally {
    clearTimeout(timeout);
  }
}
