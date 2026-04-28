import { MaterialCommunityIcons } from '@expo/vector-icons';
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
  Text,
  TextInput,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';

import { getNameDaysForDate } from './src/nameDays';

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
const FACEBOOK_FEED_SCRIPT = `
  (function () {
    var attempts = 0;

    function setCompactViewport() {
      var viewport = document.querySelector('meta[name="viewport"]');
      if (!viewport) {
        viewport = document.createElement('meta');
        viewport.setAttribute('name', 'viewport');
        document.head.appendChild(viewport);
      }
      viewport.setAttribute('content', 'width=500, initial-scale=1, maximum-scale=1, user-scalable=no');
    }

    function installCompactStyle() {
      if (document.getElementById('elradio-compact-facebook')) {
        return;
      }

      var style = document.createElement('style');
      style.id = 'elradio-compact-facebook';
      style.textContent = [
        'html, body { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; background: #fff !important; overflow-x: hidden !important; overflow-y: auto !important; -webkit-text-size-adjust: 80% !important; }',
        'body, body * { max-width: 100% !important; box-sizing: border-box !important; font-size: 13px !important; line-height: 1.22 !important; }',
        'div, span, p, a { white-space: normal !important; overflow-wrap: anywhere !important; word-break: break-word !important; }',
        'img, video, iframe { max-width: 100% !important; height: auto !important; }',
        '[role="article"], article { margin: 0 0 8px 0 !important; padding: 6px 8px !important; border-bottom: 1px solid #e5e7eb !important; }',
        '[role="article"], article, div[data-ft] { overflow: hidden !important; }',
        '[role="article"] div, article div { margin-top: 2px !important; margin-bottom: 2px !important; }',
        'button, form, a[role="button"], [role="button"], .pluginConnectButton, .UFILikeLink, .UFICommentLink, .UFIShareLink, ._42ft { display: none !important; }',
        '[aria-label*="Skomentuj"], [aria-label*="Comment"], [aria-label*="Komentarz"] { display: none !important; }',
        '[aria-label*="Lubię to"], [aria-label*="Like"], [aria-label*="Komentarz"], [aria-label*="Comment"], [aria-label*="Udostępnij"], [aria-label*="Share"], [aria-label*="Wyślij"], [aria-label*="Send"], [aria-label*="Follow"], [aria-label*="Obserwuj"] { display: none !important; }'
      ].join('\\n');
      document.head.appendChild(style);
    }

    function compactRepeatedLinks() {
      var seen = {};
      var noiseLabels = /^(el radio|elradio 90[,.]8 fm|elradio\\.pl|lubię to|like|komentarz|comment|udostępnij|share|wyślij|send|obserwuj|follow|zaloguj się|log in|znajdź nas na facebooku)$/i;

      document.querySelectorAll('a').forEach(function (link) {
        var text = (link.textContent || '').replace(/\\s+/g, ' ').trim();
        var href = (link.getAttribute('href') || '').split('?')[0];
        var key = (text.toLowerCase() + '|' + href).trim();

        if (!text && !link.querySelector('img')) {
          link.remove();
          return;
        }

        if (!text && link.querySelector('img')) {
          link.replaceWith.apply(link, Array.prototype.slice.call(link.childNodes));
          return;
        }

        if (noiseLabels.test(text)) {
          link.remove();
          return;
        }

        if (seen[key]) {
          link.remove();
          return;
        }

        seen[key] = true;
        link.removeAttribute('href');
        link.removeAttribute('role');
        link.removeAttribute('aria-label');
        link.setAttribute('tabindex', '-1');
        link.style.pointerEvents = 'none';
      });

      document.querySelectorAll('br').forEach(function (lineBreak) {
        lineBreak.remove();
      });
    }

    function removeRepeatedStationLabels() {
      var noiseText = /^(elradio 90[,.]8 fm|el radio 90[,.]8 fm|skomentuj|komentarz|comment|znajdź nas na facebooku|\\d+\\s*(obserwujących|obserwujący)|\\d+\\s*(min\\.|godz\\.|dni?)\\s*temu|w niedzielę|w sobotę)$/i;

      document.querySelectorAll('a, span, strong, h1, h2, h3, h4, div').forEach(function (element) {
        var text = (element.textContent || '').replace(/\\s+/g, ' ').trim();
        if (text && text.length < 48 && noiseText.test(text)) {
          if (/^(skomentuj|komentarz|comment)$/i.test(text) && element.parentElement) {
            element.parentElement.remove();
            return;
          }
          element.remove();
        }
      });

      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      var textNodes = [];
      while (walker.nextNode()) {
        var nodeText = (walker.currentNode.nodeValue || '').replace(/\\s+/g, ' ').trim();
        if (nodeText && nodeText.length < 48 && noiseText.test(nodeText)) {
          textNodes.push(walker.currentNode);
        }
      }
      textNodes.forEach(function (node) {
        var parent = node.parentElement;
        if (parent && parent.childNodes.length <= 1) {
          parent.remove();
          return;
        }
        node.nodeValue = '';
      });
    }

    function compactLargeMedia() {
      document.querySelectorAll('img').forEach(function (image) {
        var rect = image.getBoundingClientRect();
        var width = image.naturalWidth || image.width || 0;
        var height = image.naturalHeight || image.height || 0;

        if (rect.width < 140 && rect.height < 140) {
          if (width >= 140 || height >= 140) {
            image.remove();
          }
          return;
        }

        image.style.display = 'block';
        image.style.width = '100%';
        image.style.maxHeight = '210px';
        image.style.objectFit = 'cover';
      });
    }

    function showPostsFirst() {
      attempts += 1;
      setCompactViewport();
      installCompactStyle();
      var closeButtons = document.querySelectorAll(
        '[aria-label="Close"], [aria-label="Zamknij"], [aria-label*="Zamkn"], [role="button"][aria-label*="close"], [role="button"][aria-label*="Close"]'
      );
      closeButtons.forEach(function (button) {
        try {
          button.click();
        } catch (error) {}
      });

      document.querySelectorAll('[role="dialog"], [aria-modal="true"]').forEach(function (dialog) {
        dialog.remove();
      });
      document.documentElement.style.overflow = 'auto';
      document.body.style.overflow = 'auto';

      var firstPost = document.querySelector('[role="article"], article, div[data-ft]');
      if (firstPost) {
        firstPost.scrollIntoView({ block: 'start' });
      }

      compactRepeatedLinks();
      removeRepeatedStationLabels();
      compactLargeMedia();
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;

      if (attempts < 18) {
        setTimeout(showPostsFirst, 600);
      }
    }

    showPostsFirst();
  })();
  true;
`;
const VOLUME_STEP = 0.05;

type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export default function App() {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [volume, setVolume] = useState(0.86);
  const [message, setMessage] = useState('');
  const [updateStatus, setUpdateStatus] = useState('Sprawdzam aktualizacje aplikacji...');
  const [feedReady, setFeedReady] = useState(false);
  const [volumeTrackWidth, setVolumeTrackWidth] = useState(1);
  const today = new Date();
  const todayNameDays = getNameDaysForDate(today);
  const todayLabel = `${todayNameDays.label} ${today.getFullYear()}`;

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

    checkForOtaUpdate();

    return () => {
      soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, []);

  useEffect(() => {
    soundRef.current?.setVolumeAsync(volume).catch(() => undefined);
  }, [volume]);

  const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if (status.error) {
        setPlaybackState('error');
      }
      return;
    }

    setPlaybackState(status.isPlaying ? 'playing' : 'paused');
  };

  const clampVolume = (nextVolume: number) => Math.min(1, Math.max(0, Number(nextVolume.toFixed(2))));

  const setPlayerVolume = (nextVolume: number) => {
    setVolume(clampVolume(nextVolume));
  };

  const adjustVolume = (delta: number) => {
    setVolume((currentVolume) => clampVolume(currentVolume + delta));
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

  const togglePlayback = async () => {
    try {
      const sound = await ensureSound();
      const status = await sound.getStatusAsync();
      if (status.isLoaded && status.isPlaying) {
        await sound.pauseAsync();
        setPlaybackState('paused');
      } else {
        await sound.playAsync();
        setPlaybackState('playing');
      }
    } catch {
      setPlaybackState('error');
      Alert.alert('Nie można odtworzyć radia', 'Sprawdź internet i spróbuj ponownie.');
    }
  };

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

  const sendMessage = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      Alert.alert('Wpisz treść wiadomości', 'Pole wiadomości nie może być puste.');
      return;
    }

    const subject = 'Wiadomość z aplikacji EL Radio';
    const body = `${trimmed}\n\n--\nWysłano z aplikacji EL Radio`;

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
      setMessage('');
    } catch {
      Alert.alert('Nie można otworzyć poczty', 'Spróbuj wysłać wiadomość później.');
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

  const isPlaying = playbackState === 'playing';
  const isLoading = playbackState === 'loading';
  const playLabel = isPlaying ? 'Wstrzymaj' : 'Odtwarzaj';
  const volumePercent = Math.round(volume * 100);

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
            <View style={styles.brandRow} accessible accessibilityRole="header" accessibilityLabel="El Radio app Łódź">
              <Image
                source={require('./assets/elradio-logo.png')}
                style={styles.brandLogo}
                resizeMode="contain"
                accessible={false}
                accessibilityIgnoresInvertColors
              />
              <View>
                <Text style={styles.brandTitle}>El Radio app</Text>
                <Text style={styles.brandSubtitle}>Łódź</Text>
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
            <View style={styles.feedShell}>
              {!feedReady && (
                <View style={styles.feedLoading}>
                  <ActivityIndicator color="#0C8C72" />
                  <Text style={styles.feedLoadingText}>Ładuję posty...</Text>
                </View>
              )}
              <WebView
                accessibilityLabel="Aktualne posty EL Radio z Facebooka"
                source={{ uri: FACEBOOK_FEED_URL }}
                originWhitelist={['https://*']}
                javaScriptEnabled
                domStorageEnabled
                sharedCookiesEnabled
                thirdPartyCookiesEnabled
                setSupportMultipleWindows={false}
                textZoom={82}
                injectedJavaScript={FACEBOOK_FEED_SCRIPT}
                injectedJavaScriptBeforeContentLoaded={FACEBOOK_FEED_SCRIPT}
                onLoadEnd={() => setFeedReady(true)}
                onError={() => setFeedReady(true)}
                style={styles.feed}
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
          </Section>

          <View style={styles.aboutBand}>
            <Text style={styles.aboutTitle}>O nas</Text>
            <Text style={styles.aboutText}>EL RADIO SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ</Text>
            <Text style={styles.aboutText}>Księży Młyn 14 90-345 Łódź</Text>
            <Text style={styles.aboutText}>e-mail: BIURO@ELRADIO.PL</Text>
            <Pressable accessibilityRole="link" onPress={openWebsite} style={styles.websiteButton}>
              <Text style={styles.websiteText}>https://elradio.pl</Text>
            </Pressable>
          </View>

          <View style={styles.updateFooter}>
            <Text accessibilityLiveRegion="polite" style={styles.updateStatus}>
              {updateStatus}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Aktualizacja aplikacji"
              accessibilityValue={{ text: updateStatus }}
              onPress={openReleases}
              style={({ pressed }) => [styles.updateButton, pressed && styles.secondaryButtonPressed]}
            >
              <Icon name="refresh" size={19} color="#0C5C4A" />
              <Text style={styles.updateButtonText}>Aktualizacja aplikacji</Text>
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
  brandTitle: {
    color: '#17212B',
    fontSize: 25,
    lineHeight: 29,
    fontWeight: '800',
  },
  brandSubtitle: {
    color: '#476058',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 2,
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
  volumePanel: {
    marginTop: 18,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderColor: '#D4E4DD',
    borderWidth: 1,
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
    gap: 10,
    marginTop: 4,
  },
  volumeStepButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#AFC9BF',
    backgroundColor: '#F6F8F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  volumeTrackTouch: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  volumeTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: '#DDEAE5',
    overflow: 'visible',
  },
  volumeTrackFill: {
    height: 5,
    borderRadius: 999,
    backgroundColor: '#0C8C72',
  },
  volumeThumb: {
    position: 'absolute',
    top: -13,
    width: 31,
    height: 31,
    marginLeft: -15,
    borderRadius: 16,
    backgroundColor: '#E25D3F',
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
  feedShell: {
    height: 470,
    overflow: 'hidden',
    borderRadius: 8,
    borderColor: '#D4E4DD',
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
  },
  feed: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  feedLoading: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  feedLoadingText: {
    color: '#31473F',
    fontWeight: '700',
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
  updateFooter: {
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
    backgroundColor: '#F6F8F7',
  },
  updateStatus: {
    color: '#52645F',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    maxWidth: 260,
    textAlign: 'right',
    marginBottom: 6,
  },
  updateButton: {
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
  updateButtonText: {
    color: '#0C5C4A',
    fontSize: 14,
    fontWeight: '800',
  },
});
