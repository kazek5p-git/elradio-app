export type NetworkMode = 'wifiAndCellular' | 'wifiOnly';
export type StartupVolumeMode = 'fixed' | 'last';

export type AppSettings = {
  networkMode: NetworkMode;
  downloadFacebookImages: boolean;
  appUpdateNotifications: boolean;
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
  defaultMessageType?: string;
};

export const SETTINGS_STORAGE_KEY = '@elradio/settings/v1';
export const DEFAULT_START_VOLUME = 0.86;

export const DEFAULT_SETTINGS: AppSettings = {
  networkMode: 'wifiAndCellular',
  downloadFacebookImages: true,
  appUpdateNotifications: true,
  autoPlayOnLaunch: false,
  startupVolumeMode: 'fixed',
  startVolume: DEFAULT_START_VOLUME,
  lastVolume: DEFAULT_START_VOLUME,
  simplifiedAccessibility: false,
};

export function clampVolumeValue(nextVolume: number) {
  if (!Number.isFinite(nextVolume)) {
    return DEFAULT_START_VOLUME;
  }
  return Math.min(1, Math.max(0, Number(nextVolume.toFixed(2))));
}

export function normalizeStoredSettings(value: unknown): AppSettings {
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
    appUpdateNotifications: stored.appUpdateNotifications !== false,
    autoPlayOnLaunch: stored.autoPlayOnLaunch === true,
    startupVolumeMode: stored.startupVolumeMode === 'last' ? 'last' : 'fixed',
    startVolume: clampVolumeValue(typeof stored.startVolume === 'number' ? stored.startVolume : DEFAULT_START_VOLUME),
    lastVolume: clampVolumeValue(typeof stored.lastVolume === 'number' ? stored.lastVolume : DEFAULT_START_VOLUME),
    simplifiedAccessibility: stored.simplifiedAccessibility === true,
  };
}
