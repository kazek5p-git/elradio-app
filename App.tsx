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

const APP_DISPLAY_NAME = 'El Radio Łódź 90,8';
const STREAM_URL = 'http://dhtk2.noip.pl:8888/elradio';
const STREAM_HEADERS = {
  'Icy-MetaData': '1',
  'User-Agent': 'El Radio app',
};
const FACEBOOK_PAGE_ID = '61584365428208';
const FACEBOOK_URL = `https://www.facebook.com/profile.php?id=${FACEBOOK_PAGE_ID}`;
const FACEBOOK_FEED_URL = `https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(
  FACEBOOK_URL,
)}&tabs=timeline&width=500&height=900&small_header=true&adapt_container_width=true&hide_cover=true&show_facepile=false`;
const CONTACT_EMAIL = 'BIURO@ELRADIO.PL';
const APP_RELEASES_URL = 'https://github.com/kazek5p-git/elradio-app/releases/latest';
const RETRY_DELAYS_MS = [3000, 7000, 15000, 30000];
const MAX_FACEBOOK_POSTS = 4;
const VOLUME_TICKS = Array.from({ length: 7 }, (_, index) => index);
const SETTINGS_STORAGE_KEY = '@elradio/settings/v1';
const DEFAULT_START_VOLUME = 0.86;
const PRIVACY_TEXT =
  'Aplikacja nie wymaga konta i nie ma własnego systemu logowania. Ustawienia, podpis i kontakt zwrotny są zapisywane tylko lokalnie na tym urządzeniu.\n\n' +
  'Do odtwarzania radia aplikacja łączy się ze streamem EL Radio. Do aktualności pobiera publiczne posty z profilu EL Radio na Facebooku. Facebook może przetwarzać dane zgodnie z własnymi zasadami.\n\n' +
  'Wiadomości i zgłoszenia problemu są wysyłane przez aplikację pocztową wybraną w systemie. Aplikacja nie wysyła ich samodzielnie na żaden dodatkowy serwer.\n\n' +
  'Dane diagnostyczne trafiają do treści maila tylko wtedy, gdy samodzielnie wybierzesz „Zgłoś problem” i wyślesz wiadomość.';
const FACEBOOK_EXTRACT_SCRIPT = `
  (function () {
    var attempts = 0;
    var maxPosts = 4;

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
      style.textContent = [
        'button, form, a[role="button"], [role="button"], .pluginConnectButton, .UFILikeLink, .UFICommentLink, .UFIShareLink, ._42ft { display: none !important; }',
        '[aria-label*="Skomentuj"], [aria-label*="Comment"], [aria-label*="Komentarz"], [aria-label*="Lubię to"], [aria-label*="Like"], [aria-label*="Udostępnij"], [aria-label*="Share"], [aria-label*="Wyślij"], [aria-label*="Send"], [aria-label*="Follow"], [aria-label*="Obserwuj"] { display: none !important; }'
      ].join('\\n');
      document.head.appendChild(style);
    }

    function normalizeText(value) {
      return (value || '').replace(/\\s+/g, ' ').trim();
    }

    function cleanPostText(value) {
      var text = normalizeText(value)
        .replace(/https?:\\/\\/\\S+/gi, ' ')
        .replace(/www\\.\\S+/gi, ' ')
        .replace(/ELRadio 90[,.]8 FM/gi, ' ')
        .replace(/El Radio 90[,.]8 FM/gi, ' ')
        .replace(/\\bELRadio\\b/gi, ' ')
        .replace(/\\d*\\s*(Skomentuj|Komentarz|Comment|Udostępnij|Share|Lubię to|Like|Wyślij|Send)\\s*/gi, ' ')
        .replace(/\\b(Lubię to|Like|Skomentuj|Komentarz|Comment|Udostępnij|Share|Wyślij|Send|Obserwuj|Follow|Zaloguj się|Log in)\\b/gi, ' ')
        .replace(/\\d+\\s*(obserwujących|obserwujący)/gi, ' ')
        .replace(/\\d+\\s*(min\\.|godz\\.|dni?)\\s*temu/gi, ' ')
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

    function findPostImage(root) {
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
        return text.length >= 40 && !!findPostImage(element);
      });
    }

    function extractPosts() {
      var posts = [];
      var seen = {};
      var seenImages = {};
      var seenText = {};
      var nodes = findPostNodes();

      nodes.forEach(function (node) {
        if (posts.length >= maxPosts) {
          return;
        }
        var text = cleanPostText(getReadableText(node));
        var imageUrl = findPostImage(node);
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
      });

      return posts;
    }

    function sendPosts(force) {
      var posts = extractPosts();
      if (!posts.length && !force) {
        return false;
      }
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'elradio-facebook-posts',
          posts: posts
        }));
      }
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
    }

    function collect() {
      attempts += 1;
      prepare();
      if (!sendPosts(attempts >= 20) && attempts < 20) {
        setTimeout(collect, 650);
      }
    }

    collect();
  })();
  true;
`;
const VOLUME_STEP = 0.05;

type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
type FacebookFeedState = 'loading' | 'ready' | 'error';
type NetworkMode = 'wifiAndCellular' | 'wifiOnly';

type AppSettings = {
  networkMode: NetworkMode;
  autoPlayOnLaunch: boolean;
  startVolume: number;
  messageSignature: string;
  replyContact: string;
};

const DEFAULT_SETTINGS: AppSettings = {
  networkMode: 'wifiAndCellular',
  autoPlayOnLaunch: false,
  startVolume: DEFAULT_START_VOLUME,
  messageSignature: '',
  replyContact: '',
};

function clampVolumeValue(nextVolume: number) {
  if (!Number.isFinite(nextVolume)) {
    return DEFAULT_START_VOLUME;
  }
  return Math.min(1, Math.max(0, Number(nextVolume.toFixed(2))));
}

function normalizeStoredSettings(value: unknown): AppSettings {
  const stored = value && typeof value === 'object' ? (value as Partial<AppSettings>) : {};
  return {
    networkMode: stored.networkMode === 'wifiOnly' ? 'wifiOnly' : 'wifiAndCellular',
    autoPlayOnLaunch: stored.autoPlayOnLaunch === true,
    startVolume: clampVolumeValue(typeof stored.startVolume === 'number' ? stored.startVolume : DEFAULT_START_VOLUME),
    messageSignature: typeof stored.messageSignature === 'string' ? stored.messageSignature : '',
    replyContact: typeof stored.replyContact === 'string' ? stored.replyContact : '',
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

export default function App() {
  const soundRef = useRef<Audio.Sound | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);
  const userWantsPlaybackRef = useRef(false);
  const autoPlayedOnLaunchRef = useRef(false);
  const networkBlockAlertShownRef = useRef(false);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [connectionStatus, setConnectionStatus] = useState('Radio nie gra.');
  const [volume, setVolume] = useState(DEFAULT_START_VOLUME);
  const [message, setMessage] = useState('');
  const [updateStatus, setUpdateStatus] = useState('Sprawdzam aktualizacje aplikacji...');
  const [facebookPosts, setFacebookPosts] = useState<FacebookPost[]>([]);
  const [facebookFeedState, setFacebookFeedState] = useState<FacebookFeedState>('loading');
  const [volumeTrackWidth, setVolumeTrackWidth] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const today = new Date();
  const todayNameDays = getNameDaysForDate(today);
  const todayLabel = `${todayNameDays.label} ${today.getFullYear()}`;

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        const nextSettings = normalizeStoredSettings(JSON.parse(stored));
        setSettings(nextSettings);
        setVolume(nextSettings.startVolume);
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
      soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, []);

  useEffect(() => {
    soundRef.current?.setVolumeAsync(volume).catch(() => undefined);
  }, [volume]);

  const clearRetryTimer = () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
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

  useEffect(() => {
    if (!settingsLoaded || autoPlayedOnLaunchRef.current || !settings.autoPlayOnLaunch) {
      return;
    }

    autoPlayedOnLaunchRef.current = true;
    void startPlayback();
  }, [settingsLoaded, settings.autoPlayOnLaunch]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((networkState) => {
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

    const subject = 'Wiadomość z aplikacji EL Radio';
    const signature = settings.messageSignature.trim() || 'Wysłano z aplikacji EL Radio';
    const replyContact = settings.replyContact.trim();
    const body = [
      trimmed,
      '',
      '--',
      replyContact ? `Kontakt zwrotny: ${replyContact}` : '',
      signature,
    ].filter(Boolean).join('\n');
    const sent = await openMailComposer(subject, body);
    if (sent) {
      setMessage('');
    }
  };

  const sendProblemReport = async () => {
    const subject = 'Problem z aplikacją El Radio';
    const body = [
      'Opisz problem:',
      '',
      '',
      '--',
      'Dane diagnostyczne:',
      `System: ${Platform.OS} ${Platform.Version}`,
      `Stan odtwarzania: ${connectionStatus}`,
      `Głośność: ${volumePercent}%`,
      `Data: ${new Date().toISOString()}`,
      `Aplikacja: ${APP_DISPLAY_NAME}`,
    ].join('\n');

    await openMailComposer(subject, body);
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

  const handleFacebookMessage = (event: WebViewMessageEvent) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as FacebookPayload;
      if (payload.type !== 'elradio-facebook-posts') {
        return;
      }

      const posts = (payload.posts ?? [])
        .filter((post) => post.text || post.imageUrl)
        .slice(0, MAX_FACEBOOK_POSTS)
        .map((post, index) => ({
          id: post.id || `${index + 1}-${post.text.slice(0, 24)}`,
          text: post.text,
          imageUrl: post.imageUrl,
        }));

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={styles.keyboardContainer}
      >
        <ScrollView
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
          </View>

          <View
            accessibilityRole="text"
            accessibilityLabel="Słuchaj nas w Łodzi na częstotliwości 90 i 8"
            style={styles.frequencyBand}
          >
            <Text style={styles.frequencyCaption}>Słuchaj nas w Łodzi na częstotliwości</Text>
            <Text style={styles.frequencyValue}>90.8</Text>
          </View>

          <Section icon="calendar-heart" title={`Dziś jest: ${todayLabel}`}>
            <View
              accessible
              accessibilityLabel={`Imieniny: ${todayNameDays.names.join(', ')}`}
            >
              <Text style={styles.nameDayNames}>{todayNameDays.names.join(', ')}</Text>
            </View>
          </Section>

          <Section icon="facebook" title="Aktualności z Facebooka">
            <View style={styles.newsList}>
              {facebookFeedState === 'loading' && (
                <View style={styles.facebookStatusCard}>
                  <ActivityIndicator color="#0C8C72" />
                  <Text style={styles.facebookStatusText}>Ładuję posty z Facebooka...</Text>
                </View>
              )}
              {facebookFeedState === 'error' && (
                <View style={styles.facebookStatusCard}>
                  <Icon name="alert-circle-outline" size={24} color="#E25D3F" />
                  <Text style={styles.facebookStatusText}>
                    Nie udało się pobrać postów. Otwórz profil EL Radio na Facebooku.
                  </Text>
                </View>
              )}
              {facebookPosts.map((post) => (
                <View
                  key={post.id}
                  accessible
                  accessibilityLabel={`Post z Facebooka. ${post.text || 'Zdjęcie z profilu EL Radio.'}`}
                  style={styles.facebookPostCard}
                >
                  {post.imageUrl ? (
                    <Image
                      source={{ uri: post.imageUrl }}
                      style={styles.facebookPostImage}
                      resizeMode="cover"
                      accessible={false}
                      accessibilityIgnoresInvertColors
                    />
                  ) : null}
                  {post.text ? <Text style={styles.facebookPostText}>{post.text}</Text> : null}
                </View>
              ))}
              <WebView
                accessible={false}
                focusable={false}
                importantForAccessibility="no-hide-descendants"
                source={{ uri: FACEBOOK_FEED_URL }}
                originWhitelist={['https://*']}
                javaScriptEnabled
                domStorageEnabled
                sharedCookiesEnabled
                thirdPartyCookiesEnabled
                setSupportMultipleWindows={false}
                textZoom={82}
                injectedJavaScript={FACEBOOK_EXTRACT_SCRIPT}
                injectedJavaScriptBeforeContentLoaded={FACEBOOK_EXTRACT_SCRIPT}
                onMessage={handleFacebookMessage}
                onError={() => setFacebookFeedState('error')}
                style={styles.facebookLoader}
              />
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

          <Section icon="email-fast-outline" title="Napisz do nas">
            <TextInput
              accessibilityLabel="Treść wiadomości do EL Radio"
              multiline
              textAlignVertical="top"
              value={message}
              onChangeText={setMessage}
              placeholder="Wpisz swoją wiadomość"
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
              accessibilityLabel="Zgłoś problem z aplikacją"
              onPress={sendProblemReport}
              style={({ pressed }) => [styles.reportButton, pressed && styles.secondaryButtonPressed]}
            >
              <Icon name="bug-outline" size={20} color="#0C5C4A" />
              <Text style={styles.reportButtonText}>Zgłoś problem</Text>
            </Pressable>
          </Section>

          <View style={styles.aboutBand}>
            <Text style={styles.aboutTitle}>O nas</Text>
            <Text style={styles.aboutText}>El Radio Łódź 90,8</Text>
            <Text style={styles.aboutText}>EL RADIO SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ</Text>
            <Text style={styles.aboutText}>Księży Młyn 14 90-345 Łódź</Text>
            <Text style={styles.aboutText}>e-mail: BIURO@ELRADIO.PL</Text>
            <Pressable accessibilityRole="link" onPress={openWebsite} style={styles.websiteButton}>
              <Text style={styles.websiteText}>https://elradio.pl</Text>
            </Pressable>
          </View>

          <View style={styles.settingsFooter}>
            {settingsOpen ? (
              <View style={styles.settingsPanel}>
                <View style={styles.settingsTitleRow} accessible accessibilityRole="header" accessibilityLabel="Ustawienia">
                  <Icon name="cog" size={24} color="#0C5C4A" />
                  <Text style={styles.settingsTitle}>Ustawienia</Text>
                </View>

                <View style={styles.settingGroup}>
                  <Text style={styles.settingGroupTitle}>Dane i sieć</Text>
                  <Text style={styles.settingDescription}>
                    Stream radia i zdjęcia z Facebooka pobierają dane z internetu. Włącz tylko Wi-Fi, jeśli nie chcesz
                    odtwarzać przez dane komórkowe.
                  </Text>
                  <SettingsSwitchRow
                    label="Tylko Wi-Fi"
                    description="Na wykrytych danych komórkowych radio nie wystartuje."
                    value={settings.networkMode === 'wifiOnly'}
                    onValueChange={(value) => updateSettings({ networkMode: value ? 'wifiOnly' : 'wifiAndCellular' })}
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
                </View>

                <View style={styles.settingGroup}>
                  <Text style={styles.settingGroupTitle}>Wiadomości</Text>
                  <Text style={styles.settingInputLabel}>Podpis</Text>
                  <TextInput
                    accessibilityLabel="Podpis do wiadomości"
                    value={settings.messageSignature}
                    onChangeText={(value) => updateSettings({ messageSignature: value })}
                    placeholder="Np. Imię albo podpis słuchacza"
                    placeholderTextColor="#6B7280"
                    multiline
                    textAlignVertical="top"
                    style={styles.settingsTextInput}
                  />
                  <Text style={styles.settingInputLabel}>Kontakt zwrotny</Text>
                  <TextInput
                    accessibilityLabel="Kontakt zwrotny do wiadomości"
                    value={settings.replyContact}
                    onChangeText={(value) => updateSettings({ replyContact: value })}
                    placeholder="Telefon albo e-mail"
                    placeholderTextColor="#6B7280"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    style={styles.settingsTextInput}
                  />
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

                <View style={styles.settingGroupLast}>
                  <Text style={styles.settingGroupTitle}>Prywatność</Text>
                  <Text style={styles.privacyText}>{PRIVACY_TEXT}</Text>
                </View>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={settingsOpen ? 'Zamknij ustawienia' : 'Ustawienia'}
              accessibilityState={{ expanded: settingsOpen }}
              onPress={toggleSettingsPanel}
              style={({ pressed }) => [styles.settingsButton, pressed && styles.secondaryButtonPressed]}
            >
              <Icon name={settingsOpen ? 'close' : 'cog'} size={20} color="#0C5C4A" />
              <Text style={styles.settingsButtonText}>{settingsOpen ? 'Zamknij' : 'Ustawienia'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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

type SettingsSwitchRowProps = {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
};

function SettingsSwitchRow({ label, description, value, onValueChange }: SettingsSwitchRowProps) {
  return (
    <View style={styles.settingsSwitchRow}>
      <View style={styles.settingsSwitchText}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingDescription}>{description}</Text>
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
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) + 18 : 18,
    paddingBottom: 22,
    backgroundColor: '#EAF4EF',
    borderBottomColor: '#CEE0D8',
    borderBottomWidth: 1,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginBottom: 18,
  },
  brandLogo: {
    width: 112,
    height: 42,
  },
  brandText: {
    flex: 1,
  },
  brandTitle: {
    color: '#17212B',
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '800',
    flexShrink: 1,
  },
  playButton: {
    minHeight: 112,
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
    fontSize: 32,
    fontWeight: '800',
  },
  playbackStatusRow: {
    minHeight: 38,
    marginTop: 12,
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
    marginTop: 18,
    padding: 16,
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
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#AFC9BF',
    backgroundColor: '#F4F7F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  volumeTrackTouch: {
    flex: 1,
    height: 52,
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
    paddingVertical: 21,
    borderBottomColor: '#DCE6E1',
    borderBottomWidth: 1,
    backgroundColor: '#F6F8F7',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#17212B',
    fontSize: 22,
    fontWeight: '800',
  },
  nameDayNames: {
    color: '#17212B',
    fontSize: 25,
    lineHeight: 32,
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
  facebookPostText: {
    color: '#1F2933',
    fontSize: 16,
    lineHeight: 23,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  facebookLoader: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
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
  messageInput: {
    minHeight: 150,
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
    paddingVertical: 24,
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
    paddingVertical: 15,
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
    marginBottom: 7,
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
    marginTop: 12,
    minHeight: 54,
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
