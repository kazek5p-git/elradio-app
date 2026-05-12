# Architektura aplikacji

El Radio to aplikacja Expo/React Native z jednym glownym ekranem i kilkoma modalami. Wiekszosc logiki mieszka w `App.tsx`; natywne roznice Android/iOS sa dopinane przez plugin Expo `plugins/withElRadioNativeConfig.js` podczas prebuilda.

## Warstwy

1. UI React Native: przyciski, suwaki, listy postow, modale ustawien i formularzy.
2. Logika aplikacji w `App.tsx`: odtwarzanie, ustawienia, siec, Facebook, aktualizacje, diagnostyka.
3. Integracje Expo: `expo-av`, `expo-file-system`, `expo-intent-launcher`, `expo-mail-composer`, `expo-notifications`, `expo-web-browser`, `expo-updates`.
4. Plugin natywny: patchuje wygenerowane projekty Android/iOS i tworzy modul `ElRadioAudioRoutes`.
5. GitHub Actions: buduje rolling release i odswieza cache Facebooka.

## Odtwarzanie audio

Stream jest zdefiniowany w `STREAM_URL`, a naglowki w `STREAM_HEADERS`. Aplikacja wysyla `Icy-MetaData: 1` i `User-Agent: El Radio app`.

Glowny obiekt audio to `Audio.Sound` z `expo-av`, trzymany w `soundRef`. Przeplyw jest nastepujacy:

1. `Audio.setAudioModeAsync` wlacza odtwarzanie w tle i odtwarzanie w trybie cichym na iOS.
2. `ensureSound` tworzy `Audio.Sound.createAsync`, ale nie startuje go od razu.
3. `startPlayback` sprawdza ograniczenia sieci, tworzy sound, startuje `playAsync` i ustawia stan.
4. `onPlaybackStatusUpdate` zamienia status Expo AV na lokalny `playbackState` i tekst statusu.
5. Przy bledzie, jesli uzytkownik nadal chce sluchac, `scheduleReconnect` ponawia polaczenie z opoznieniami z `RETRY_DELAYS_MS`.
6. `togglePlayback` przelacza odtwarzanie i pauze.

Glosnosc jest lokalna dla odtwarzacza, nie systemowa. Wartosci sa w zakresie `0..1`, a UI pokazuje procenty. Dla czytnikow ekranu suwak jest elementem `adjustable`.

## AirPlay i Cast

Przycisk wyjscia audio jest pod glownym przyciskiem `Odtwarzaj`. W JavaScripcie wywoluje `ElRadioAudioRoutes.openAudioRoutePicker()`.

Plugin generuje natywne moduly:

- iOS: Objective-C `ElRadioAudioRoutes.m` tworzy ukryty `AVRoutePickerView` i programowo naciska jego przycisk. To otwiera systemowy panel AirPlay.
- Android: Kotlin `ElRadioAudioRoutesModule.kt` otwiera `Settings.ACTION_CAST_SETTINGS`, a jesli to sie nie uda, przechodzi do ustawien Bluetooth.

Androidowy wariant nie jest pelnym Google Cast SDK. To lekki systemowy panel Cast/wyjsc audio, dzieki czemu aplikacja nie rosnie o ciezka integracje Google Cast.

## Ustawienia

Ustawienia sa w `AsyncStorage` pod kluczem `@elradio/settings/v1`. Typem zrodlowym jest `AppSettings`, a wartosci domyslne sa w `DEFAULT_SETTINGS`.

Kazdy odczyt i zapis przechodzi przez `normalizeStoredSettings`. To jest wazne, bo starsza instalacja moze miec tylko czesc pol. Gdy dodajesz nowe ustawienie:

1. Dodaj pole w `AppSettings`.
2. Dodaj wartosc w `DEFAULT_SETTINGS`.
3. Upewnij sie, ze `normalizeStoredSettings` zwraca sensowna wartosc dla starych danych.
4. Dodaj UI w ustawieniach.
5. Sprawdz, czy diagnostyka w `buildDiagnosticsText` powinna je raportowac.

## Siec i dane komorkowe

`@react-native-community/netinfo` wykrywa typ polaczenia. Jesli `settings.networkMode` to `wifiOnly`, aplikacja blokuje start odtwarzania oraz wstrzymuje aktualnosci Facebooka na danych komorkowych albo przy braku polaczenia.

Zdjecia z Facebooka maja osobne ustawienie `downloadFacebookImages`. Uzytkownik moze zostawic tekstowe aktualnosci bez pobierania obrazow.

## Aktualnosci Facebooka

Sa trzy mechanizmy, bo Facebook nie udostepnia stabilnego prostego feedu dla tej aplikacji:

1. `data/facebook-feed.json` w repo jest podstawowym cachem. Aktualizuje go workflow `Update Facebook Feed` przez `scripts/update-facebook-feed.mjs`.
2. iOS najpierw pobiera JSON z GitHuba, a gdy to zawiedzie, probuje pobrac i sparsowac `mbasic.facebook.com`.
3. Android dodatkowo ma ukryty `WebView` z Facebook Page Plugin i wstrzykniety `FACEBOOK_EXTRACT_SCRIPT`, ktory wyciaga zwarte posty.

Posty przechodza przez normalizacje i czyszczenie linkow, reakcji, powtorzen i nadmiarowego tekstu. Limit w aplikacji to `MAX_FACEBOOK_POSTS`.

Najbardziej kruche elementy to selektory/regexy HTML Facebooka oraz publiczny dostep do mbasic. Przy awarii feedu najpierw sprawdz workflow `Update Facebook Feed`, potem `data/facebook-feed.json`, a dopiero potem parser w aplikacji.

## Kontakt i feedback

Zwykle wiadomosci do radia oraz zgloszenia bledow/propozycji ida przez `expo-mail-composer`. Aplikacja nie wysyla ich na wlasny serwer.

Diagnostyka dla feedbacku jest tekstowa i dobrowolna. Zawiera m.in. platforme, stan odtwarzania, glosnosc, tryb sieci, wersje/build i fragment informacji o Facebooku. Nie nalezy dodawac do niej danych wrazliwych bez wyraznej potrzeby.

## Aktualizator aplikacji

Aplikacja sprawdza rolling release `latest-build` przez GitHub API. Metadata sa w `EL-Radio-release.json` i zawieraja commit, czas builda, wersje oraz URL assetow.

Porownanie nowosci opiera sie glownie na `EXPO_PUBLIC_ELRADIO_BUILD_SHA` i `EXPO_PUBLIC_ELRADIO_BUILD_TIME`, ktore workflow wpisuje do srodowiska podczas builda.

Na Androidzie aplikacja moze pobrac APK i otworzyc instalator systemowy przez `expo-intent-launcher`. Na iOS unsigned IPA nie instaluje sie bezposrednio z aplikacji; aplikacja moze otworzyc link do pobrania/release, a instalacja idzie przez Sideloadly albo inny kanal testowy.

Android ma tez lokalne powiadomienia o aktualizacji przez `expo-notifications`. Nie ma zewnetrznego push servera.

## Plugin natywny

`plugins/withElRadioNativeConfig.js` robi kilka rzeczy przy prebuildzie:

- ustawia Android release architectures na `armeabi-v7a,arm64-v8a`;
- wlacza cleartext traffic dla HTTP streamu;
- patchuje `expo-av` na Androidzie, zeby ExoPlayer wysylal `User-Agent: El Radio app` zamiast `yourApplicationName`;
- patchuje `expo-av` na iOS, zeby Now Playing pokazalo `Odtwarzanie El Radio`;
- dodaje `UIBackgroundModes=audio` i wyjatek ATS dla `dhtk2.noip.pl`;
- generuje natywny modul AirPlay/Cast;
- dopina `MediaPlayer.framework` i `AVKit.framework` do projektu iOS.

To jest swiadomie scentralizowane w pluginie, bo katalogi `android/` i `ios/` sa kasowane przy `expo prebuild --clean`.

## Deep linki

Aplikacja ma scheme `elradio`. Obecnie obslugiwane sa warianty:

- `elradio://settings` - otwiera ustawienia;
- `elradio://news` albo `elradio://facebook` - przewija do aktualnosci;
- `elradio://refresh` - odswieza feed Facebooka.

Workflow `iOS Simulator Smoke` uzywa `elradio://news` do zrobienia screenshotu sekcji aktualnosci.

## Dostepnosc

Projekt jest projektowany pod VoiceOver i TalkBack. Najwazniejsze zasady:

- duzy przycisk odtwarzania ma role `button` i krotka etykiete;
- glosnosc jest `adjustable`, aby gesty czytnika ekranu zmienialy wartosc;
- dekoracyjne ikony sa ukryte przed czytnikami;
- ukryty WebView Facebooka nie jest elementem dostepnosci;
- teksty pomocnicze sa ograniczane, bo nadmiar podpowiedzi przeszkadza uzytkownikom czytnikow.

Po zmianach UI warto sprawdzic przynajmniej TalkBack na Androidzie i VoiceOver na iPhonie, szczegolnie kolejnosc fokusu.

## Znane kompromisy

- Pelny Chromecast wymagalby Google Cast SDK i prawdopodobnie zwiekszylby rozmiar aplikacji.
- Aktualnosci Facebooka sa zalezne od publicznego HTML i cache w repo.
- Patchowanie `expo-av` jest wrazliwe na aktualizacje Expo; po update zaleznosci trzeba zweryfikowac anchor tekstowy w pluginie.
- iOS unsigned IPA wymaga Sideloadly/TestFlight/App Store; aplikacja sama nie zainstaluje IPA.
