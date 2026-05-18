import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { Audio, AVPlaybackStatus } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as MailComposer from 'expo-mail-composer';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
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
  NativeModules,
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

import { APP_DISPLAY_NAME, CONTACT_EMAIL, PRIVACY_TEXT, STREAM_HEADERS, STREAM_URL } from './src/radioConfig';
import {
  MESSAGE_TYPE_OPTIONS,
  getFeedbackCopy,
  getMessageTypeOption,
  type FeedbackKind,
  type MessageType,
} from './src/contactForms';
import {
  DEBUG_FACEBOOK_FEED,
  FACEBOOK_CRAWLER_URL,
  FACEBOOK_CRAWLER_USER_AGENT,
  FACEBOOK_FEED_JSON_URL,
  FACEBOOK_FEED_URL,
  FACEBOOK_URL,
  FACEBOOK_WEBVIEW_USER_AGENT,
  buildFacebookExtractScript,
  normalizeFacebookPosts,
  parseFacebookCrawlerPosts,
  type FacebookFeedJson,
  type FacebookPayload,
  type FacebookPost,
} from './src/facebookFeed';
import { fetchNowPlayingTitle } from './src/icecastNowPlaying';
import { getNameDaysForDate } from './src/nameDays';
import {
  ANDROID_APK_MIME_TYPE,
  ANDROID_GRANT_READ_URI_PERMISSION_FLAG,
  APP_ANDROID_APK_NAME,
  APP_RELEASE_PAGE_URL,
  APP_UPDATE_NOTIFICATION_SETTINGS_LABEL,
  buildUpdateStatusText,
  dismissAndroidAppUpdateNotification,
  getPlatformUpdateAssetName,
  getPlatformUpdateDownloadLabel,
  getPlatformUpdateFallbackUrl,
  prepareAndroidUpdateNotificationChannel,
  readAppUpdateNotificationPayload,
  readDirectAppUpdateInfo,
  showAndroidAppUpdateNotification as scheduleAndroidAppUpdateNotification,
  type DirectAppUpdateInfo,
} from './src/appUpdates';
import {
  DEFAULT_SETTINGS,
  DEFAULT_START_VOLUME,
  SETTINGS_STORAGE_KEY,
  clampVolumeValue,
  normalizeStoredSettings,
  type AppSettings,
} from './src/settings';

type AudioRoutesNativeModule = {
  openAudioRoutePicker?: () => Promise<boolean>;
};

const ElRadioAudioRoutes = NativeModules.ElRadioAudioRoutes as AudioRoutesNativeModule | undefined;
const AUDIO_ROUTE_BUTTON_LABEL = Platform.select({ ios: 'AirPlay', android: 'Cast', default: 'Wyjście audio' }) ?? 'Wyjście audio';
const AUDIO_ROUTE_ACCESSIBILITY_LABEL =
  Platform.select({ ios: 'AirPlay audio', android: 'Google Cast audio', default: 'Wyjście audio' }) ?? 'Wyjście audio';

const NOW_PLAYING_REFRESH_MS = 20000;
const RETRY_DELAYS_MS = [3000, 7000, 15000, 30000];
const VOLUME_TICKS = Array.from({ length: 7 }, (_, index) => index);
const SLEEP_TIMER_OPTIONS = [15, 30, 60] as const;
const SLEEP_TIMER_SELECT_OPTIONS: Array<SelectionOption<SleepTimerOptionId>> = [
  { id: '15', label: '15 minut' },
  { id: '30', label: '30 minut' },
  { id: '60', label: '60 minut' },
  { id: 'off', label: 'Wyłączony' },
];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    priority: Notifications.AndroidNotificationPriority.DEFAULT,
  }),
});

const VOLUME_STEP = 0.05;

type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
type FacebookFeedState = 'loading' | 'ready' | 'error';
type SleepTimerOptionId = 'off' | '15' | '30' | '60';

type SelectionOption<T extends string> = {
  id: T;
  label: string;
  accessibilityLabel?: string;
};



export default function App() {
  const soundRef = useRef<Audio.Sound | null>(null);
  const facebookWebViewRef = useRef<WebView>(null);
  const facebookFetchRequestRef = useRef(0);
  const nowPlayingRequestRef = useRef(0);
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
  const [nowPlayingTitle, setNowPlayingTitle] = useState('');
  const [volume, setVolume] = useState(DEFAULT_START_VOLUME);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<MessageType>('general');
  const [updateStatus, setUpdateStatus] = useState('Sprawdzam aktualizacje aplikacji...');
  const [isCheckingAppUpdate, setIsCheckingAppUpdate] = useState(false);
  const [isDownloadingAppUpdate, setIsDownloadingAppUpdate] = useState(false);
  const [directAppUpdateInfo, setDirectAppUpdateInfo] = useState<DirectAppUpdateInfo | null>(null);
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
  const [contactOpen, setContactOpen] = useState(false);
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
      if (updates.appUpdateNotifications === false) {
        dismissAndroidAppUpdateNotification().catch(() => undefined);
      }
      return nextSettings;
    });
  };

  const setAppUpdateNotificationsEnabled = (value: boolean) => {
    updateSettings({ appUpdateNotifications: value });
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
    void prepareAndroidUpdateNotificationChannel();

    return () => {
      clearRetryTimer();
      clearSleepTimer();
      soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }

    checkForDirectAppUpdate(false);
  }, [settingsLoaded]);

  useEffect(() => {
    soundRef.current?.setVolumeAsync(volume).catch(() => undefined);
  }, [volume]);

  // Poll Icecast only while playback is active, so the app does not spend data when idle.
  useEffect(() => {
    const shouldPollNowPlaying =
      (playbackState === 'playing' || playbackState === 'loading') &&
      !(settings.networkMode === 'wifiOnly' && isCellularNetwork);

    if (!shouldPollNowPlaying) {
      setNowPlayingTitle('');
      return undefined;
    }

    let cancelled = false;
    const loadNowPlaying = async () => {
      const requestId = nowPlayingRequestRef.current + 1;
      nowPlayingRequestRef.current = requestId;
      try {
        const title = await fetchNowPlayingTitle();
        if (!cancelled && nowPlayingRequestRef.current === requestId) {
          setNowPlayingTitle(title);
        }
      } catch {
        // Keep the last visible title when Icecast metadata is briefly unavailable.
      }
    };

    void loadNowPlaying();
    const interval = setInterval(loadNowPlaying, NOW_PLAYING_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [playbackState, settings.networkMode, isCellularNetwork]);

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
    switch (event.nativeEvent.actionName) {
      case 'increment':
        adjustVolume(VOLUME_STEP);
        break;
      case 'decrement':
        adjustVolume(-VOLUME_STEP);
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

  const showAndroidAppUpdateNotification = async (updateInfo: DirectAppUpdateInfo, skipIfAlreadySent: boolean) => {
    return scheduleAndroidAppUpdateNotification(updateInfo, skipIfAlreadySent, settings.appUpdateNotifications);
  };

  const checkForDirectAppUpdate = async (manual: boolean) => {
    if (isCheckingAppUpdate) {
      return;
    }

    setIsCheckingAppUpdate(true);
    setUpdateStatus('Sprawdzam najnowszą paczkę aplikacji...');
    try {
      const updateInfo = await readDirectAppUpdateInfo();
      setDirectAppUpdateInfo(updateInfo);
      setUpdateStatus(buildUpdateStatusText(updateInfo));

      if (updateInfo.comparison === 'newer') {
        const notificationHandled = await showAndroidAppUpdateNotification(updateInfo, !manual);
        if (manual || !notificationHandled || Platform.OS !== 'android') {
          Alert.alert(
            'Dostępna aktualizacja',
            'Możesz pobrać najnowszą wersję aplikacji bezpośrednio z GitHuba.',
            [
              { text: 'Później', style: 'cancel' },
              { text: getPlatformUpdateDownloadLabel(), onPress: () => openAppUpdateDownload(updateInfo) },
            ],
          );
        }
      } else if (manual && updateInfo.comparison === 'unknown') {
        Alert.alert(
          'Paczka jest dostępna',
          'Nie mogę porównać numeru tej instalacji, ale mogę otworzyć najnowszy plik z GitHuba.',
          [
            { text: 'Anuluj', style: 'cancel' },
            { text: getPlatformUpdateDownloadLabel(), onPress: () => openAppUpdateDownload(updateInfo) },
          ],
        );
      } else if (updateInfo.comparison === 'current') {
        await dismissAndroidAppUpdateNotification();
      }
    } catch {
      setUpdateStatus('Nie udało się teraz sprawdzić aktualizacji.');
    } finally {
      setIsCheckingAppUpdate(false);
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
      setContactOpen(false);
    }
  };

  const buildDiagnosticsText = () => [
    `Aplikacja: ${APP_DISPLAY_NAME}`,
    `System: ${Platform.OS} ${Platform.Version}`,
    `Stan odtwarzania: ${connectionStatus}`,
    `Teraz gramy: ${nowPlayingTitle || 'brak danych'}`,
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

  const openAppUpdateDownloadLink = async (downloadUrl: string, releasePageUrl: string) => {
    try {
      await Linking.openURL(downloadUrl);
    } catch {
      await WebBrowser.openBrowserAsync(releasePageUrl);
    }
  };

  const openAndroidAppInstaller = async (downloadUrl: string, releasePageUrl: string) => {
    if (!FileSystem.cacheDirectory) {
      await openAppUpdateDownloadLink(downloadUrl, releasePageUrl);
      return;
    }

    setIsDownloadingAppUpdate(true);
    setUpdateStatus('Pobieram aktualizację aplikacji...');
    try {
      const fileUri = `${FileSystem.cacheDirectory}${APP_ANDROID_APK_NAME}`;
      const download = await FileSystem.downloadAsync(downloadUrl, fileUri, {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (download.status < 200 || download.status >= 300) {
        throw new Error(`HTTP ${download.status}`);
      }

      const contentUri = await FileSystem.getContentUriAsync(download.uri);
      setUpdateStatus('Aktualizacja pobrana. Otwieram instalator Androida...');
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        type: ANDROID_APK_MIME_TYPE,
        flags: ANDROID_GRANT_READ_URI_PERMISSION_FLAG,
      });
    } catch {
      setUpdateStatus('Nie udało się otworzyć instalatora. Otwieram pobieranie w przeglądarce.');
      await openAppUpdateDownloadLink(downloadUrl, releasePageUrl);
    } finally {
      setIsDownloadingAppUpdate(false);
    }
  };

  const openAppUpdateDownload = async (updateInfo: DirectAppUpdateInfo | null = directAppUpdateInfo) => {
    const downloadUrl = updateInfo?.downloadUrl ?? getPlatformUpdateFallbackUrl();
    const releasePageUrl = updateInfo?.releasePageUrl ?? APP_RELEASE_PAGE_URL;
    if (Platform.OS === 'android') {
      if (isDownloadingAppUpdate) {
        return;
      }
      await openAndroidAppInstaller(downloadUrl, releasePageUrl);
      return;
    }

    await openAppUpdateDownloadLink(downloadUrl, releasePageUrl);
  };

  const handleAppUpdateNotificationResponse = (response: Notifications.NotificationResponse) => {
    const payload = readAppUpdateNotificationPayload(response.notification.request.content.data ?? {});
    if (!payload) {
      return;
    }

    Notifications.clearLastNotificationResponse();
    Notifications.dismissAllNotificationsAsync().catch(() => undefined);
    const updateInfo: DirectAppUpdateInfo = {
      assetName: payload.assetName,
      downloadUrl: payload.downloadUrl,
      releasePageUrl: payload.releasePageUrl,
      remoteBuildTime: payload.remoteBuildTime,
      remoteCommit: payload.remoteCommit,
      comparison: 'newer',
    };
    setDirectAppUpdateInfo(updateInfo);
    setUpdateStatus(buildUpdateStatusText(updateInfo));
    void openAppUpdateDownload(updateInfo);
  };

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }

    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse) {
      handleAppUpdateNotificationResponse(lastResponse);
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(handleAppUpdateNotificationResponse);
    return () => subscription.remove();
  }, []);

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

  const openAudioRoutePicker = async () => {
    if (!ElRadioAudioRoutes?.openAudioRoutePicker) {
      Alert.alert('Wyjście audio', 'Ta wersja aplikacji nie ma jeszcze natywnego wyboru wyjścia audio.');
      return;
    }

    try {
      await ElRadioAudioRoutes.openAudioRoutePicker();
    } catch {
      Alert.alert('Wyjście audio', 'Nie udało się otworzyć wyboru wyjścia audio w systemie.');
    }
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
  const showNowPlayingTitle = Boolean(nowPlayingTitle && (isPlaying || isLoading));
  const volumePercent = Math.round(volume * 100);
  const startVolumePercent = Math.round(settings.startVolume * 100);
  const lastVolumePercent = Math.round(settings.lastVolume * 100);
  const messageTypeOption = getMessageTypeOption(messageType);
  const facebookBlockedByNetwork = settings.networkMode === 'wifiOnly' && isCellularNetwork;
  const showFacebookImages = settings.downloadFacebookImages;
  const facebookWebViewUrl = Platform.OS === 'ios' ? FACEBOOK_CRAWLER_URL : FACEBOOK_FEED_URL;
  const facebookUserAgent = Platform.OS === 'ios' ? FACEBOOK_CRAWLER_USER_AGENT : FACEBOOK_WEBVIEW_USER_AGENT;
  const facebookExtractScript = buildFacebookExtractScript(settings.downloadFacebookImages);
  const feedbackCopy = getFeedbackCopy(feedbackKind);
  const feedbackDiagnosticsText = buildDiagnosticsText();
  const sleepTimerMinutesLeft = sleepTimerEndsAt
    ? Math.max(1, Math.ceil((sleepTimerEndsAt - Date.now()) / 60000))
    : null;
  const sleepTimerLabel = sleepTimerMinutesLeft ? `Za ${sleepTimerMinutesLeft} min` : 'Wyłączony';
  const selectedSleepTimerOption = sleepTimerDurationMinutes
    ? (String(sleepTimerDurationMinutes) as SleepTimerOptionId)
    : 'off';

  // iOS uses the committed JSON cache first; the crawler is a fallback for stale or missing feed data.
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={AUDIO_ROUTE_ACCESSIBILITY_LABEL}
              onPress={openAudioRoutePicker}
              style={({ pressed }) => [styles.audioRouteButton, pressed && styles.secondaryButtonPressed]}
            >
              <Icon name="cast-audio" size={23} color="#0C5C4A" />
              <Text style={styles.audioRouteButtonText}>{AUDIO_ROUTE_BUTTON_LABEL}</Text>
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

            {showNowPlayingTitle ? (
              <View
                accessible
                accessibilityLiveRegion={'polite'}
                accessibilityLabel={`Teraz gramy: ${nowPlayingTitle}`}
                style={styles.nowPlayingRow}
              >
                <Icon name={'music-note'} size={22} color={'#F6C95C'} />
                <Text style={styles.nowPlayingText} numberOfLines={2}>
                  <Text style={styles.nowPlayingPrefix}>Teraz gramy: </Text>
                  {nowPlayingTitle}
                </Text>
              </View>
            ) : null}

            <View style={styles.volumePanel}>
              <View
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel="Głośność"
                accessibilityValue={{ min: 0, max: 100, now: volumePercent, text: `${volumePercent} procent` }}
                accessibilityActions={[
                  { name: 'increment', label: 'Głośniej' },
                  { name: 'decrement', label: 'Ciszej' },
                ]}
                onAccessibilityAction={handleVolumeAccessibilityAction}
                style={styles.volumeHeader}
              >
                <Icon name="volume-high" size={24} color="#1F2933" />
                <Text accessible={false} importantForAccessibility={'no'} style={styles.volumeLabel}>Głośność</Text>
                <Text accessible={false} importantForAccessibility={'no'} style={styles.volumeValue}>{volumePercent}%</Text>
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

            <View style={styles.playerActionRow}>
              <View style={styles.playerActionSelect}>
                <SelectButton
                label="Wyłącznik czasowy"
                value={sleepTimerLabel}
                icon="timer-outline"
                accessibilityLabel={`Wyłącznik czasowy: ${sleepTimerLabel}`}
                onPress={() => setSleepTimerSelectorOpen(true)}
                />
              </View>
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

          <View style={styles.contactBand}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Napisz do nas"
              onPress={() => setContactOpen(true)}
              style={({ pressed }) => [styles.contactButton, pressed && styles.secondaryButtonPressed]}
            >
              <Icon name="email-fast-outline" size={22} color="#0C5C4A" />
              <Text style={styles.contactButtonText}>Napisz do nas</Text>
              <Icon name="chevron-right" size={24} color="#0C5C4A" />
            </Pressable>
          </View>

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
                    <Text accessible={false} importantForAccessibility={'no'} style={styles.settingLabel}>Głośność startowa</Text>
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
                      <Text accessible={false} importantForAccessibility={'no'} style={styles.startVolumeValue}>{startVolumePercent}%</Text>
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
                {Platform.OS === 'android' ? (
                  <SettingsSwitchRow
                    label={APP_UPDATE_NOTIFICATION_SETTINGS_LABEL}
                    value={settings.appUpdateNotifications}
                    onValueChange={setAppUpdateNotificationsEnabled}
                  />
                ) : null}
                <Text accessibilityLiveRegion="polite" style={styles.settingDescription}>
                  {updateStatus}
                </Text>
                <View style={styles.settingButtonRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Sprawdź aktualizacje aplikacji"
                    accessibilityState={{ disabled: isCheckingAppUpdate || isDownloadingAppUpdate }}
                    disabled={isCheckingAppUpdate || isDownloadingAppUpdate}
                    onPress={() => checkForDirectAppUpdate(true)}
                    style={({ pressed }) => [
                      styles.settingsActionButton,
                      (isCheckingAppUpdate || isDownloadingAppUpdate) && styles.settingsActionButtonDisabled,
                      pressed && styles.secondaryButtonPressed,
                    ]}
                  >
                    {isCheckingAppUpdate ? (
                      <ActivityIndicator size="small" color="#0C5C4A" />
                    ) : (
                      <Icon name="refresh" size={19} color="#0C5C4A" />
                    )}
                    <Text style={styles.settingsActionButtonText}>{isCheckingAppUpdate ? 'Sprawdzam' : 'Sprawdź'}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Pobierz aktualizację aplikacji: ${getPlatformUpdateAssetName()}`}
                    accessibilityState={{ disabled: isDownloadingAppUpdate }}
                    disabled={isDownloadingAppUpdate}
                    onPress={() => openAppUpdateDownload()}
                    style={({ pressed }) => [
                      styles.settingsActionButton,
                      isDownloadingAppUpdate && styles.settingsActionButtonDisabled,
                      pressed && styles.secondaryButtonPressed,
                    ]}
                  >
                    {isDownloadingAppUpdate ? (
                      <ActivityIndicator size="small" color="#0C5C4A" />
                    ) : (
                      <Icon name="download" size={19} color="#0C5C4A" />
                    )}
                    <Text style={styles.settingsActionButtonText}>
                      {isDownloadingAppUpdate ? 'Pobieram' : getPlatformUpdateDownloadLabel()}
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.settingGroup}>
                <Text style={styles.settingGroupTitle}>Błędy i propozycje</Text>
                <View style={styles.settingButtonRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Zgłoś błąd"
                    onPress={() => openFeedbackForm('bug')}
                    style={({ pressed }) => [styles.settingsActionButton, pressed && styles.secondaryButtonPressed]}
                  >
                    <Icon name="bug-outline" size={19} color="#0C5C4A" />
                    <Text style={styles.settingsActionButtonText}>Zgłoś błąd</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Wyślij propozycję zmian"
                    onPress={() => openFeedbackForm('suggestion')}
                    style={({ pressed }) => [styles.settingsActionButton, pressed && styles.secondaryButtonPressed]}
                  >
                    <Icon name="lightbulb-on-outline" size={19} color="#0C5C4A" />
                    <Text style={styles.settingsActionButtonText}>Wyślij propozycję zmian</Text>
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
        visible={contactOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setContactOpen(false)}
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
                onPress={() => setContactOpen(false)}
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
              <View style={styles.settingGroupLast}>
                <Text style={styles.settingGroupTitle}>Napisz do nas</Text>
                <SelectButton
                  label="Temat wiadomości"
                  value={messageTypeOption.label}
                  icon="format-list-bulleted"
                  accessibilityLabel={`Temat wiadomości: ${messageTypeOption.label}`}
                  onPress={() => setMessageTypeSelectorOpen(true)}
                />
                <Text style={styles.settingInputLabel}>Treść</Text>
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
  nowPlayingRow: {
    minHeight: 48,
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: '#17212B',
    borderLeftWidth: 4,
    borderLeftColor: '#F6C95C',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  nowPlayingText: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    flex: 1,
  },
  nowPlayingPrefix: {
    color: '#F6C95C',
    fontWeight: '900',
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
  playerActionRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  playerActionSelect: {
    flex: 1,
    minWidth: 0,
  },
  audioRouteButton: {
    marginTop: 8,
    alignSelf: 'flex-end',
    minHeight: 54,
    minWidth: 104,
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
  audioRouteButtonText: {
    color: '#0C5C4A',
    fontSize: 15,
    fontWeight: '900',
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
  contactBand: {
    backgroundColor: '#F4F7F5',
    borderTopWidth: 1,
    borderTopColor: '#DCE6E1',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  contactButton: {
    minHeight: 56,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#AFC9BF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
  },
  contactButtonText: {
    flex: 1,
    color: '#17212B',
    fontSize: 18,
    fontWeight: '900',
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
  settingsActionButtonDisabled: {
    opacity: 0.62,
  },
  settingsActionButtonText: {
    color: '#0C5C4A',
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '800',
    flexShrink: 1,
    textAlign: 'center',
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
