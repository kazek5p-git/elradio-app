# Operacje i release

Ten dokument opisuje, jak utrzymywac buildy testowe, aktualizator i feed Facebooka.

## Kanaly dystrybucji

Obecny kanal testowy to rolling release na GitHubie:

- tag: `latest-build`;
- release page: https://github.com/kazek5p-git/elradio-app/releases/tag/latest-build;
- Android: `EL-Radio.apk`;
- iOS: `EL-Radio-unsigned.ipa`;
- metadata: `EL-Radio-release.json`.

Release jest prywatnym/technicznym kanalem dla testerow. Nie jest to App Store ani Google Play.

## GitHub Actions

### Android APK

Workflow: `.github/workflows/android-apk.yml`

Uruchamia sie przy pushu na `main`, tagach `v*` i recznie przez `workflow_dispatch`.

Glowne kroki:

1. `npm ci`.
2. Ustawienie `EXPO_PUBLIC_ELRADIO_BUILD_SHA` i `EXPO_PUBLIC_ELRADIO_BUILD_TIME`.
3. `npx expo prebuild --platform android --clean`.
4. `./gradlew :app:assembleRelease`.
5. Skopiowanie APK do `dist/EL-Radio.apk`.
6. Wygenerowanie `dist/EL-Radio-release.json`.
7. Upload assetow do release `latest-build` z `--clobber`.

### iOS Unsigned IPA

Workflow: `.github/workflows/ios-unsigned.yml`

Uruchamia sie przy pushu na `main` i recznie.

Glowne kroki:

1. `npm ci`.
2. Ustawienie metadanych builda.
3. `npx expo prebuild --platform ios --clean`.
4. `xcodebuild` bez podpisu kodu.
5. Spakowanie `.app` do `EL-Radio-unsigned.ipa`.
6. Upload IPA i metadata do `latest-build`.

### Update Facebook Feed

Workflow: `.github/workflows/update-facebook-feed.yml`

Uruchamia sie co 30 minut i recznie. Wykonuje `node scripts/update-facebook-feed.mjs`, a potem commitnie `data/facebook-feed.json`, jesli feed sie zmienil.

### iOS Simulator Smoke

Workflow: `.github/workflows/ios-simulator-smoke.yml`

Uruchamiany recznie. Buduje aplikacje pod iOS Simulator, instaluje ja, robi screenshot home, otwiera `elradio://news` i robi screenshot aktualnosci.

To jest dobra kontrola po zmianach UI, Facebooka albo deep linkow.

## Standardowy release po zmianach

Lokalnie sprawdz `npm run typecheck` i `git diff --check`, potem zrob commit i push na `main`.

Po pushu na `main` poczekaj na workflow Android i iOS. Oba powinny zakonczyc sie zielonym statusem i nadpisac assety w release `latest-build`.

Minimalna kontrola po release:

1. Otworz release page i sprawdz, czy widac nowe czasy uploadu assetow.
2. Pobierz APK i sprawdz, czy plik nie ma rozmiaru 0 B.
3. Pobierz IPA i sprawdz, czy archiwum otwiera sie poprawnie.
4. Zainstaluj APK na Pixelu.
5. Zainstaluj IPA przez Sideloadly na iPhonie.
6. Uruchom aplikacje, wlacz radio, otworz aktualnosci i ustawienia.

## Aktualizator w aplikacji

Aplikacja sprawdza release `latest-build` przez GitHub API. Logika jest w `App.tsx` przy stalych `GITHUB_RELEASE_API_URL`, `UPDATE_CHECK_INTERVAL_MS` i funkcjach `checkForDirectAppUpdate` oraz `openAppUpdateDownload`.

Android:

- aktualizator szuka assetu `EL-Radio.apk`;
- jesli wersja z release jest nowsza od lokalnej, aplikacja pokazuje komunikat i otwiera pobieranie APK;
- uzytkownik musi potwierdzic instalacje systemowym instalatorem Androida.

iOS:

- aktualizator szuka assetu `EL-Radio-unsigned.ipa`;
- aplikacja nie instaluje IPA sama, bo iOS wymaga podpisania lub Sideloadly;
- przycisk aktualizacji powinien otwierac release albo bezposredni link do IPA, zeby tester mogl zainstalowac plik swoim narzedziem.

Po zmianach aktualizatora sprawdz osobno Android i iOS. Na Androidzie najwazniejsze jest, czy APK pobiera sie z poprawnego URL. Na iOS najwazniejsze jest, czy link prowadzi do aktualnego release i czy komunikat nie sugeruje automatycznej instalacji, ktorej system nie pozwala wykonac.

## Instalacja lokalna

### Android

Skrypt: `scripts/install-android-local.ps1`

Skrypt instaluje APK przez `adb`. Przed uzyciem upewnij sie, ze Pixel jest widoczny w `adb devices` i ze poprzedni build nie jest w trakcie instalacji.

Najczestsza komenda:

`powershell -ExecutionPolicy Bypass -File scripts/install-android-local.ps1`

Po instalacji sprawdz:

- odtwarzanie streamu;
- User-Agent w bocie Icecast, powinien zawierac `El Radio app`;
- suwak glosnosci z TalkBackiem;
- posty i zdjecia Facebooka;
- Cast/audio route button.

### iOS przez Sideloadly

Skrypt: `scripts/install-ios-sideloadly-latest.ps1`

Skrypt pobiera najnowsze `EL-Radio-unsigned.ipa` z GitHuba i uruchamia instalacje przez Sideloadly/bridge z folderu `C:\Users\Kazek\Desktop\iOS`.

Najczestsza komenda:

`powershell -ExecutionPolicy Bypass -File scripts/install-ios-sideloadly-latest.ps1`

Po instalacji sprawdz:

- czy aplikacja startuje bez crasha;
- czy dziala odtwarzanie w tle;
- czy w systemowym playerze widac `Odtwarzanie El Radio`;
- czy przycisk AirPlay otwiera systemowy wybor trasy audio;
- czy Facebook laduje posty i obrazy;
- czy ustawienia otwieraja sie jako osobne okno/modal, a nie jako rozwiniecie glownego ekranu.

## Feed Facebooka

Aplikacja nie renderuje pelnego profilu Facebooka. Uzywa uproszczonego JSON-a w `data/facebook-feed.json`, ktory jest aktualizowany przez `scripts/update-facebook-feed.mjs` i workflow `update-facebook-feed.yml`.

Zasady utrzymania:

- zrodlem aktualnosci ma pozostac Facebook El Radia;
- w aplikacji pokazujemy krotkie, zwarte wpisy;
- parser powinien usuwac powtarzajace sie linki, puste linki i tekst techniczny Facebooka;
- obrazy sa opcjonalne i moga byc wylaczane ustawieniem pobierania obrazow przez dane komorkowe;
- gdy Facebook zmieni HTML, najpierw popraw `scripts/update-facebook-feed.mjs`, potem sprawdz `data/facebook-feed.json`.

Kontrola po zmianie feedu:

1. Uruchom `node scripts/update-facebook-feed.mjs`.
2. Sprawdz diff `data/facebook-feed.json`.
3. Otworz aplikacje na Androidzie i iOS.
4. Sprawdz widok aktualnosci z wlaczonymi i wylaczonymi obrazami.

Jesli na iOS posty sie nie laduja, sprawdz najpierw, czy aplikacja ma dostep do aktualnego JSON-a, a dopiero potem debuguj rendering. Wczesniej problem czesto wygladal jak blad UI, mimo ze przyczyna byla w danych lub w pobieraniu z sieci.

## Typowe awarie i szybka diagnoza

### GitHub release pokazuje Page not found

Najczestsze przyczyny:

- release albo repo jest prywatne;
- asset jeszcze sie nie wgral;
- workflow zakonczyl sie bledem przed uploadem;
- link prowadzi do innego tagu niz `latest-build`.

Sprawdz Actions, potem release page. Jesli upload assetu zwrocil blad 502, zwykle wystarczy ponowic workflow.

### Android nadal wysyla `yourApplicationName`

To oznacza, ze patch User-Agent nie trafil do aktualnego builda albo aplikacja uzywa starego APK. Sprawdz `plugins/withElRadioNativeConfig.js`, wykonaj czysty `prebuild` i zainstaluj nowy APK. W bocie Icecast powinien pojawic sie `El Radio app`.

### iOS nie pokazuje poprawnego playera systemowego

Sprawdz plugin natywny i wygenerowany kod iOS po `expo prebuild`. Metadane Now Playing sa ustawiane natywnie, a tekst powinien mowic o odtwarzaniu El Radia, nie o domyslnym tytule Expo AV.

### AirPlay albo Cast nie otwiera wyboru trasy audio

Sprawdz wygenerowany natywny modul z pluginu. Na iOS przycisk powinien wywolac systemowy picker AirPlay. Na Androidzie powinien uzywac analogicznego systemowego wyboru trasy audio, jesli urzadzenie i wersja systemu to wspieraja.

### Sideloadly nie instaluje IPA

Sprawdz, czy iPhone jest odblokowany i zaufany dla komputera, czy Apple ID w Sideloadly jest aktualne, oraz czy pobrany IPA pochodzi z aktualnego release. Logi i diagnostyke trzymaj w `C:\Users\Kazek\Desktop\iOS\Sideloadly\Diagnostics`.

### Build iOS sypie sie na CocoaPods albo kodowaniu

Na Macu najpierw sprawdz `npm ci`, `npx expo prebuild --platform ios --clean` i `pod install` w katalogu `ios`. Jezeli problem dotyczy polskich znakow w skryptach albo plikach, trzymaj nowe pliki techniczne w UTF-8 i unikaj mieszania kodowan.

### Aplikacja jest za duza

Najpierw sprawdz, czy do repo albo paczki nie trafily katalogi buildow, cache, stare IPA/APK, logi lub screenshoty. W projekcie powinny zostac tylko zrodla, skrypty i potrzebne assety. Buildy dystrybucyjne powinny byc artefaktami GitHub Actions albo plikami release, nie plikami wersjonowanymi w repo.
