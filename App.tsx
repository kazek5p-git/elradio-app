import { MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { Audio, AVPlaybackStatus } from 'expo-av';
import * as MailComposer from 'expo-mail-composer';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import * as WebBrowser from 'expo-web-browser';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
const FACEBOOK_URL = 'https://www.facebook.com/people/EL-Radio/61584365428208/';
const FACEBOOK_PLUGIN_URL =
  'https://www.facebook.com/plugins/page.php?href=' +
  encodeURIComponent(FACEBOOK_URL) +
  '&tabs=timeline&width=500&height=560&small_header=false&adapt_container_width=true&hide_cover=false&show_facepile=true';
const CONTACT_EMAIL = 'BIURO@ELRADIO.PL';
const APP_RELEASES_URL = 'https://github.com/kazek5p-git/elradio-app/releases/latest';

type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export default function App() {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [volume, setVolume] = useState(0.86);
  const [message, setMessage] = useState('');
  const [updateStatus, setUpdateStatus] = useState('Sprawdzam aktualizacje aplikacji...');
  const [feedReady, setFeedReady] = useState(false);
  const todayNameDays = getNameDaysForDate(new Date());

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

  const ensureSound = async () => {
    if (soundRef.current) {
      return soundRef.current;
    }

    setPlaybackState('loading');
    const { sound } = await Audio.Sound.createAsync(
      { uri: STREAM_URL },
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
  const playHint = isPlaying ? 'Zatrzymuje odtwarzanie EL Radio' : 'Uruchamia odtwarzanie EL Radio';
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
            <View style={styles.brandRow} accessible accessibilityRole="header">
              <MaterialCommunityIcons name="radio-tower" size={32} color="#0C5C4A" />
              <View>
                <Text style={styles.brandTitle}>EL Radio</Text>
                <Text style={styles.brandSubtitle}>Radio z Łodzi</Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={playLabel}
              accessibilityHint={playHint}
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
                <MaterialCommunityIcons
                  name={isPlaying ? 'pause-circle' : 'play-circle'}
                  size={58}
                  color="#FFFFFF"
                />
              )}
              <Text style={styles.playButtonText}>{playLabel}</Text>
            </Pressable>

            <Text accessibilityLiveRegion="polite" style={styles.playbackStatus}>
              {playbackState === 'error'
                ? 'Radio chwilowo niedostępne'
                : isPlaying
                  ? 'Odtwarzanie trwa'
                  : 'Gotowe do odtwarzania'}
            </Text>

            <View style={styles.volumePanel}>
              <View style={styles.volumeHeader}>
                <MaterialCommunityIcons name="volume-high" size={24} color="#1F2933" />
                <Text style={styles.volumeLabel}>Głośność {volumePercent}%</Text>
              </View>
              <Slider
                accessibilityLabel="Głośność odtwarzacza"
                accessibilityValue={{ min: 0, max: 100, now: volumePercent, text: `${volumePercent} procent` }}
                minimumValue={0}
                maximumValue={1}
                value={volume}
                step={0.01}
                minimumTrackTintColor="#0C8C72"
                maximumTrackTintColor="#BFD3CC"
                thumbTintColor="#E25D3F"
                onValueChange={setVolume}
              />
            </View>
          </View>

          <View
            accessibilityRole="text"
            accessibilityLabel="Słuchaj nas w Łodzi na częstotliwości 90.8"
            style={styles.frequencyBand}
          >
            <Text style={styles.frequencyCaption}>Słuchaj nas w Łodzi na częstotliwości</Text>
            <Text style={styles.frequencyValue}>90.8</Text>
          </View>

          <Section icon="calendar-heart" title="Imieniny">
            <Text accessibilityLiveRegion="polite" style={styles.nameDayDate}>
              {todayNameDays.label}
            </Text>
            <Text style={styles.nameDayNames}>{todayNameDays.names.join(', ')}</Text>
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
                source={{ uri: FACEBOOK_PLUGIN_URL }}
                originWhitelist={['https://*']}
                javaScriptEnabled
                domStorageEnabled
                onLoadEnd={() => setFeedReady(true)}
                onError={() => setFeedReady(true)}
                style={styles.feed}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zaobserwuj lub polub EL Radio na Facebooku"
              onPress={openFacebook}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            >
              <MaterialCommunityIcons name="facebook" size={22} color="#0C5C4A" />
              <Text style={styles.secondaryButtonText}>Zaobserwuj lub polub</Text>
            </Pressable>
          </Section>

          <Section icon="email-fast-outline" title="Napisz do nas">
            <TextInput
              accessibilityLabel="Treść wiadomości do EL Radio"
              accessibilityHint="Wpisz treść, a aplikacja przygotuje wiadomość do wysłania"
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
              <MaterialCommunityIcons name="send" size={20} color="#FFFFFF" />
              <Text style={styles.primarySmallButtonText}>Wyślij wiadomość</Text>
            </Pressable>
          </Section>

          <Section icon="refresh" title="Aktualizacje">
            <Text accessibilityLiveRegion="polite" style={styles.updateStatus}>
              {updateStatus}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sprawdź stronę najnowszego wydania aplikacji"
              onPress={openReleases}
              style={({ pressed }) => [styles.linkButton, pressed && styles.secondaryButtonPressed]}
            >
              <Text style={styles.linkButtonText}>Najnowsze wydanie aplikacji</Text>
            </Pressable>
          </Section>

          <View accessibilityRole="summary" style={styles.aboutBand}>
            <Text style={styles.aboutTitle}>O nas</Text>
            <Text style={styles.aboutText}>EL RADIO SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ</Text>
            <Text style={styles.aboutText}>Księży Młyn 14, 90-345 Łódź</Text>
            <Text style={styles.aboutText}>e-mail: BIURO@ELRADIO.PL</Text>
            <Pressable accessibilityRole="link" onPress={openWebsite} style={styles.websiteButton}>
              <Text style={styles.websiteText}>https://elradio.pl</Text>
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
      <View style={styles.sectionTitleRow} accessible accessibilityRole="header">
        <MaterialCommunityIcons name={icon} size={25} color="#0C5C4A" />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
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
    gap: 12,
    marginBottom: 18,
  },
  brandTitle: {
    color: '#17212B',
    fontSize: 28,
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
  playbackStatus: {
    color: '#31473F',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 14,
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
    marginBottom: 4,
  },
  volumeLabel: {
    color: '#1F2933',
    fontSize: 17,
    fontWeight: '700',
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
  nameDayDate: {
    color: '#52645F',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 5,
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
  updateStatus: {
    color: '#31473F',
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '700',
  },
  linkButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    marginTop: 10,
    justifyContent: 'center',
  },
  linkButtonText: {
    color: '#0C5C4A',
    fontSize: 16,
    fontWeight: '800',
    textDecorationLine: 'underline',
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
});
