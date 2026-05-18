# Mapa kodu

Ten dokument opisuje, gdzie w repozytorium znajduje sie najwazniejsza logika. Jest pisany z perspektywy osoby, ktora ma szybko znalezc wlasciwe miejsce do poprawki.

## Struktura repozytorium

| Sciezka | Rola |
| --- | --- |
| `App.tsx` | Glowna aplikacja: stan odtwarzacza, efekty, modale, render glownego ekranu i style. |
| `src/radioConfig.ts` | Nazwa aplikacji, kontakt, URL streamu, naglowki streamu i tekst prywatnosci. |
| `src/settings.ts` | Typ ustawien, wartosci domyslne, klucz AsyncStorage i normalizacja starych danych. |
| `src/appUpdates.ts` | Odczyt rolling release z GitHuba, porownanie wersji oraz lokalne powiadomienia Androida. |
| `src/facebookFeed.ts` | URL-e Facebooka, WebView extract script, typy postow, normalizacja i parser mbasic. |
| `src/contactForms.ts` | Tematy, etykiety i placeholdery formularza kontaktu oraz feedbacku. |
| `src/icecastNowPlaying.ts` | Pobieranie i czyszczenie metadanych Icecast dla sekcji `Teraz gramy`. |
| `src/nameDays.ts` | Lokalna baza imienin i funkcja `getNameDaysForDate`. |
| `assets/` | Ikony, splash i logo radia. |
| `data/facebook-feed.json` | Cache publicznych postow z Facebooka, aktualizowany przez GitHub Actions. |
| `scripts/install-android-local.ps1` | Lokalny build i instalacja APK na Androidzie przez `adb`. |
| `scripts/install-ios-sideloadly-latest.ps1` | Pobranie najnowszej IPA z release albo artefaktu workflow i instalacja przez mostek Sideloadly. |
| `scripts/publish-github-release.ps1` | Starszy/manualny skrypt publikacji APK pod tagiem wersji. Rolling release jest obecnie obslugiwany glownie przez GitHub Actions. |
| `scripts/update-facebook-feed.mjs` | Pobieranie i czyszczenie postow Facebooka do `data/facebook-feed.json`. |
| `plugins/withElRadioNativeConfig.js` | Plugin Expo tworzacy natywne poprawki Android/iOS przy `expo prebuild`. |
| `.github/workflows/` | Automatyczne buildy APK/IPA, smoke test i cykliczna aktualizacja Facebook feed. |

Katalogi `android/` i `ios/` sa generowane przez Expo prebuild. Nie traktuj ich jako zrodla prawdy, chyba ze celowo debugujesz lokalny build.

## `App.tsx` w praktyce

`App.tsx` nadal jest najwiekszym plikiem UI, ale czesc logiki pomocniczej jest juz wydzielona:

- Stale konfiguracyjne radia sa w `src/radioConfig.ts`.
- Ustawienia i migracja danych sa w `src/settings.ts`.
- Aktualizator, metadata release i powiadomienia Androida sa w `src/appUpdates.ts`.
- Metadane `Teraz gramy`: polling w `App.tsx`, pobieranie/parsing w `src/icecastNowPlaying.ts`.
- Funkcje pomocnicze Facebooka: normalizacja postow, czyszczenie linkow, dekodowanie HTML/JSON, parser mbasic i skrypt WebView sa w `src/facebookFeed.ts`.
- Teksty formularzy kontaktowych i feedbacku sa w `src/contactForms.ts`.
- Komponent `App`: stan Reacta, refy, efekty, logika odtwarzania, formularze, ustawienia i render glownego ekranu.
- Male komponenty UI pod koniec pliku: `Section`, `SelectButton`, `SelectionModal`, `SettingsSwitchRow`, `Icon`.
- `StyleSheet.create`: pelne style aplikacji.

## Najczestsze miejsca zmian

| Zadanie | Gdzie szukac |
| --- | --- |
| Zmiana URL streamu albo User-Agent | `src/radioConfig.ts`, `plugins/withElRadioNativeConfig.js` |
| Zmiana metadanych `Teraz gramy` | `ICECAST_STATUS_JSON_URL`, `fetchNowPlayingTitle`, UI `nowPlayingRow` |
| Zmiana wygladu glownego odtwarzacza | JSX w `App`, sekcja `playerBand`, style `playButton`, `volumePanel`, `audioRouteButton` |
| Zmiana glosnosci i TalkBack/VoiceOver | `volume`, `handleVolumeAccessibilityAction`, style `volume*` |
| Zmiana ustawien | `src/settings.ts`, ekran ustawien w JSX |
| Zmiana formularza kontaktowego | `src/contactForms.ts`, `sendCurrentMessage`, modal kontaktu |
| Zmiana zgloszen bledow/propozycji | `src/contactForms.ts`, `openFeedbackForm`, `submitFeedback`, `buildDiagnosticsText` |
| Zmiana aktualnosci Facebooka | `src/facebookFeed.ts`, `scripts/update-facebook-feed.mjs`, `data/facebook-feed.json` |
| Zmiana aktualizatora | `src/appUpdates.ts`, `checkForDirectAppUpdate`, `openAppUpdateDownload`, workflow `Android APK` i `iOS Unsigned IPA` |
| Zmiana AirPlay/Cast | `openAudioRoutePicker`, przycisk w `playerBand`, plugin `withElRadioNativeConfig.js` |
| Zmiana imienin | `src/nameDays.ts` |
| Zmiana nazwy aplikacji | `src/radioConfig.ts`, `app.json`, ewentualnie teksty w release/buildach |

## Zasady bezpiecznej edycji

- Najpierw uruchom `npm run typecheck` po zmianie TypeScriptu.
- Po zmianie pluginu natywnego uruchom przynajmniej `npx expo prebuild --platform android --clean` i build Androida. Dla iOS pelna weryfikacja wymaga Maca.
- Nie poprawiaj wygenerowanych plikow w `android/` i `ios/`, jesli poprawka ma przetrwac kolejny prebuild.
- Zmiany w parserze Facebooka testuj z wlaczonym fallbackiem cache, bo Facebook potrafi zmienic HTML bez ostrzezenia.
- Zmiany w ustawieniach musza przejsc przez `normalizeStoredSettings`, inaczej starsze instalacje moga miec niepelne dane w AsyncStorage.
- Przy zmianach dostepnosci sprawdz, czy tekst etykiety nie dubluje tego, co VoiceOver/TalkBack i tak przeczyta z widocznego tekstu.
