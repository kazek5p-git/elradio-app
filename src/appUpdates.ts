import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

declare const process: { env: Record<string, string | undefined> };

const APP_RELEASE_TAG = 'latest-build';
const APP_RELEASE_REPOSITORY = 'kazek5p-git/elradio-app';
const APP_RELEASE_API_URL = `https://api.github.com/repos/${APP_RELEASE_REPOSITORY}/releases/tags/${APP_RELEASE_TAG}`;
export const APP_ANDROID_APK_NAME = 'EL-Radio.apk';
const APP_IOS_IPA_NAME = 'EL-Radio-unsigned.ipa';
const APP_RELEASE_METADATA_NAME = 'EL-Radio-release.json';
const APP_UPDATE_NOTIFICATION_CHANNEL_ID = 'app-updates';
const APP_UPDATE_NOTIFICATION_ID = 'elradio-app-update';
const APP_UPDATE_NOTIFICATION_KIND = 'app-update';
const APP_UPDATE_NOTIFICATION_STORAGE_KEY = '@elradio/appUpdateNotification/v1';
const APP_ANDROID_DOWNLOAD_URL = `https://github.com/${APP_RELEASE_REPOSITORY}/releases/download/${APP_RELEASE_TAG}/${APP_ANDROID_APK_NAME}`;
const APP_IOS_DOWNLOAD_URL = `https://github.com/${APP_RELEASE_REPOSITORY}/releases/download/${APP_RELEASE_TAG}/${APP_IOS_IPA_NAME}`;
const APP_BUILD_SHA = (process.env.EXPO_PUBLIC_ELRADIO_BUILD_SHA ?? '').trim();
const APP_BUILD_TIME = (process.env.EXPO_PUBLIC_ELRADIO_BUILD_TIME ?? '').trim();

export const APP_RELEASE_PAGE_URL = `https://github.com/${APP_RELEASE_REPOSITORY}/releases/tag/${APP_RELEASE_TAG}`;
export const ANDROID_APK_MIME_TYPE = 'application/vnd.android.package-archive';
export const ANDROID_GRANT_READ_URI_PERMISSION_FLAG = 1;
export const APP_UPDATE_NOTIFICATION_SETTINGS_LABEL = ['Powiadomienia', 'o', 'aktualizacjach'].join(' ');

type AppUpdateComparison = 'newer' | 'current' | 'unknown';

type AppReleaseAsset = {
  name?: string;
  browser_download_url?: string;
  updated_at?: string;
};

type AppReleasePayload = {
  html_url?: string;
  updated_at?: string;
  published_at?: string;
  assets?: AppReleaseAsset[];
};

type AppReleaseMetadata = {
  commit?: string;
  buildTime?: string;
  version?: string;
};

export type DirectAppUpdateInfo = {
  assetName: string;
  downloadUrl: string;
  releasePageUrl: string;
  remoteBuildTime?: string;
  remoteCommit?: string;
  comparison: AppUpdateComparison;
};

export type AppUpdateNotificationPayload = {
  kind: typeof APP_UPDATE_NOTIFICATION_KIND;
  assetName: string;
  downloadUrl: string;
  releasePageUrl: string;
  remoteBuildTime?: string;
  remoteCommit?: string;
};

export function getPlatformUpdateAssetName() {
  return Platform.OS === 'ios' ? APP_IOS_IPA_NAME : APP_ANDROID_APK_NAME;
}

export function getPlatformUpdateFallbackUrl() {
  if (Platform.OS === 'ios') {
    return APP_IOS_DOWNLOAD_URL;
  }
  if (Platform.OS === 'android') {
    return APP_ANDROID_DOWNLOAD_URL;
  }
  return APP_RELEASE_PAGE_URL;
}

export function getPlatformUpdateDownloadLabel() {
  if (Platform.OS === 'ios') {
    return 'Pobierz IPA';
  }
  if (Platform.OS === 'android') {
    return 'Pobierz APK';
  }
  return 'Pobierz';
}

function parseTimestamp(value?: string) {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatUpdateTimestamp(value?: string) {
  const timestamp = parseTimestamp(value);
  if (!timestamp) {
    return '';
  }
  return new Intl.DateTimeFormat('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function compareAppUpdate(remoteCommit?: string, remoteBuildTime?: string): AppUpdateComparison {
  if (remoteCommit && APP_BUILD_SHA) {
    return remoteCommit === APP_BUILD_SHA ? 'current' : 'newer';
  }

  const remoteTimestamp = parseTimestamp(remoteBuildTime);
  const localTimestamp = parseTimestamp(APP_BUILD_TIME);
  if (remoteTimestamp && localTimestamp) {
    return remoteTimestamp > localTimestamp + 60_000 ? 'newer' : 'current';
  }

  return 'unknown';
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json, application/json',
        'Cache-Control': 'no-cache',
        'User-Agent': 'El Radio app updater',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function readDirectAppUpdateInfo(): Promise<DirectAppUpdateInfo> {
  const release = await fetchJsonWithTimeout<AppReleasePayload>(`${APP_RELEASE_API_URL}?t=${Date.now()}`);
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const platformAssetName = getPlatformUpdateAssetName();
  const platformAsset = assets.find((asset) => asset.name === platformAssetName);
  const metadataAsset = assets.find((asset) => asset.name === APP_RELEASE_METADATA_NAME);
  const metadataUrl = metadataAsset?.browser_download_url;
  const metadata = metadataUrl
    ? await fetchJsonWithTimeout<AppReleaseMetadata>(`${metadataUrl}?t=${Date.now()}`).catch(() => null)
    : null;
  const remoteBuildTime = metadata?.buildTime ?? platformAsset?.updated_at ?? release.updated_at ?? release.published_at;

  return {
    assetName: platformAssetName,
    downloadUrl: platformAsset?.browser_download_url ?? getPlatformUpdateFallbackUrl(),
    releasePageUrl: release.html_url ?? APP_RELEASE_PAGE_URL,
    remoteBuildTime,
    remoteCommit: metadata?.commit,
    comparison: compareAppUpdate(metadata?.commit, remoteBuildTime),
  };
}

export function buildUpdateStatusText(info: DirectAppUpdateInfo) {
  const dateLabel = formatUpdateTimestamp(info.remoteBuildTime);
  if (info.comparison === 'newer') {
    return dateLabel
      ? `Dostępna jest nowa wersja z ${dateLabel}.`
      : 'Dostępna jest nowa wersja aplikacji.';
  }
  if (info.comparison === 'current') {
    return 'Masz najnowszą wersję aplikacji.';
  }
  return dateLabel
    ? `Najnowsza paczka z ${dateLabel} jest gotowa do pobrania.`
    : 'Najnowsza paczka jest gotowa do pobrania.';
}

function getAppUpdateNotificationKey(info: DirectAppUpdateInfo) {
  return info.remoteCommit ?? info.remoteBuildTime ?? info.assetName;
}

export function readAppUpdateNotificationPayload(data: Record<string, unknown>): AppUpdateNotificationPayload | null {
  if (
    data.kind !== APP_UPDATE_NOTIFICATION_KIND ||
    typeof data.assetName !== 'string' ||
    typeof data.downloadUrl !== 'string' ||
    typeof data.releasePageUrl !== 'string'
  ) {
    return null;
  }

  return {
    kind: APP_UPDATE_NOTIFICATION_KIND,
    assetName: data.assetName,
    downloadUrl: data.downloadUrl,
    releasePageUrl: data.releasePageUrl,
    remoteBuildTime: typeof data.remoteBuildTime === 'string' ? data.remoteBuildTime : undefined,
    remoteCommit: typeof data.remoteCommit === 'string' ? data.remoteCommit : undefined,
  };
}

export async function prepareAndroidUpdateNotificationChannel() {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(APP_UPDATE_NOTIFICATION_CHANNEL_ID, {
    name: 'Aktualizacje aplikacji',
    description: 'Powiadomienia o nowych wersjach aplikacji El Radio.',
    importance: Notifications.AndroidImportance.DEFAULT,
    enableVibrate: false,
    showBadge: false,
    sound: null,
    lightColor: '#0C8C72',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  }).catch(() => undefined);
}

export async function ensureAndroidUpdateNotificationPermission(requestPermission: boolean) {
  if (Platform.OS !== 'android') {
    return false;
  }

  await prepareAndroidUpdateNotificationChannel();
  let permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted && requestPermission && permissions.canAskAgain) {
    permissions = await Notifications.requestPermissionsAsync();
  }

  return permissions.granted;
}

export async function dismissAndroidAppUpdateNotification() {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.dismissAllNotificationsAsync().catch(() => undefined);
  await AsyncStorage.removeItem(APP_UPDATE_NOTIFICATION_STORAGE_KEY).catch(() => undefined);
}

export async function showAndroidAppUpdateNotification(
  updateInfo: DirectAppUpdateInfo,
  skipIfAlreadySent: boolean,
  enabled: boolean,
) {
  if (Platform.OS !== 'android' || !enabled) {
    return false;
  }

  try {
    const notificationKey = getAppUpdateNotificationKey(updateInfo);
    if (skipIfAlreadySent) {
      const lastNotificationKey = await AsyncStorage.getItem(APP_UPDATE_NOTIFICATION_STORAGE_KEY);
      if (lastNotificationKey === notificationKey) {
        return true;
      }
    }

    const hasPermission = await ensureAndroidUpdateNotificationPermission(true);
    if (!hasPermission) {
      return false;
    }

    await Notifications.dismissAllNotificationsAsync().catch(() => undefined);
    await Notifications.scheduleNotificationAsync({
      identifier: APP_UPDATE_NOTIFICATION_ID,
      content: {
        title: 'Dostępna aktualizacja El Radio',
        body: 'Dotknij, aby pobrać najnowszy APK.',
        data: {
          kind: APP_UPDATE_NOTIFICATION_KIND,
          assetName: updateInfo.assetName,
          downloadUrl: updateInfo.downloadUrl,
          releasePageUrl: updateInfo.releasePageUrl,
          remoteBuildTime: updateInfo.remoteBuildTime,
          remoteCommit: updateInfo.remoteCommit,
        },
        sound: false,
        priority: Notifications.AndroidNotificationPriority.DEFAULT,
        color: '#0C8C72',
        autoDismiss: true,
      },
      trigger: { channelId: APP_UPDATE_NOTIFICATION_CHANNEL_ID },
    });
    await AsyncStorage.setItem(APP_UPDATE_NOTIFICATION_STORAGE_KEY, notificationKey);
    return true;
  } catch {
    return false;
  }
}
