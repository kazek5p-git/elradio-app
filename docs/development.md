# Development

Ten dokument opisuje lokalna prace nad aplikacja. Zaklada Windows jako glowne srodowisko robocze i Maca jako srodowisko do iOS.

## Wymagania

Podstawowe:

- Node.js 22 i npm;
- Git;
- GitHub CLI `gh` zalogowany do repo `kazek5p-git/elradio-app`;
- Expo CLI uruchamiany przez `npx expo`;
- TypeScript przez `npm run typecheck`.

Android:

- Java 21;
- Android SDK i `adb` w PATH;
- podlaczony telefon z wlaczonym USB debuggingiem albo emulator;
- na Windowsie dziala lokalny build APK.

iOS:

- macOS z Xcode;
- CocoaPods w PATH (`/opt/homebrew/bin/pod` na Macu uzywanym w tym workspace);
- dla Sideloadly na Windowsie: istniejacy mostek `C:\Users\Kazek\Desktop\iOS\Install-IPA-Sideloadly-Bridge.ps1`.

## Instalacja zaleznosci

```powershell
npm ci
```

Uzywaj `npm ci` w CI i po wiekszych zmianach lockfile. `npm install` jest dopuszczalne przy dodawaniu paczek, ale po takiej zmianie sprawdz `package-lock.json`.

## Podstawowa kontrola

```powershell
npm run typecheck
```

To jest minimalny test po zmianie TypeScriptu. Projekt nie ma jeszcze osobnego zestawu testow jednostkowych, wiec typecheck jest podstawowa bramka jakosci.

## Uruchomienie Metro

```powershell
npm start
```

To uruchamia `expo start`. Przy natywnych zmianach sam Metro nie wystarczy, bo aplikacja musi byc zbudowana ponownie.

## Android lokalnie

Pelny lokalny build i instalacja na jedynym podlaczonym urzadzeniu:

```powershell
.\scripts\install-android-local.ps1
```

Z konkretnym urzadzeniem:

```powershell
.\scripts\install-android-local.ps1 -DeviceSerial <serial>
```

Bez przebudowy, jesli APK juz istnieje:

```powershell
.\scripts\install-android-local.ps1 -SkipBuild
```

Sam release build:

```powershell
npm run build:android:release
```

Skrypt wykonuje `expo prebuild --platform android`, a potem `gradlew :app:assembleRelease`.

## iOS lokalnie na Macu

Na Windowsie `expo prebuild --platform ios` nie wygeneruje projektu iOS. Do iOS uzywaj Maca.

Typowa sekwencja na Macu:

```bash
cd ~/elradio-app
export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
npm ci
npm run typecheck
npx expo prebuild --platform ios --clean
cd ios
pod install
```

Build unsigned app pod urzadzenie:

```bash
cd ~/elradio-app
xcodebuild \
  -workspace ios/ElRadiod908.xcworkspace \
  -scheme ElRadiod908 \
  -configuration Release \
  -sdk iphoneos \
  -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY= \
  build
```

Nazwa workspace/scheme wynika z Expo i moze sie zmienic po zmianie nazwy aplikacji. Workflow wyszukuje je automatycznie, dlatego w razie watpliwosci podejrzyj `.github/workflows/ios-unsigned.yml`.

## Instalacja iOS przez Sideloadly

Z katalogu projektu:

```powershell
.\scripts\install-ios-sideloadly-latest.ps1
```

Z katalogu `C:\Users\Kazek\Desktop\iOS`:

```powershell
.\Install-ElRadio-Latest.ps1 -Platform iOS
```

Skrypt najpierw probuje pobrac `EL-Radio-unsigned.ipa` z release `latest-build`. Jesli release nie jest dostepny, szuka najnowszego udanego artefaktu workflow `iOS Unsigned IPA`.

Logi Sideloadly trafiaja do `C:\Users\Kazek\Desktop\iOS\logs`.

## Prebuild i katalogi natywne

`android/` i `ios/` sa generowane. Regula utrzymania:

- zmiana jednorazowo do debugowania moze byc zrobiona w wygenerowanym katalogu;
- zmiana, ktora ma zostac w projekcie, musi trafic do `app.json`, zaleznosci npm albo `plugins/withElRadioNativeConfig.js`.

Po zmianie pluginu sprawdz:

```powershell
npx expo prebuild --platform android --clean
npm run typecheck
```

Dla iOS sprawdz to samo na Macu:

```bash
npx expo prebuild --platform ios --clean
pod install
xcodebuild ... build
```

## Zmienne srodowiskowe

Workflow ustawiaja:

- `EXPO_PUBLIC_ELRADIO_BUILD_SHA` - commit builda;
- `EXPO_PUBLIC_ELRADIO_BUILD_TIME` - czas builda UTC.

Aplikacja uzywa ich do porownywania aktualizacji z `EL-Radio-release.json`.

Debug feedu Facebooka:

```powershell
$env:EXPO_PUBLIC_ELRADIO_DEBUG_FACEBOOK='1'
npm start
```

W trybie debug aplikacja moze pokazac dodatkowe informacje o sposobie pobrania feedu.

## Praca z Facebook feed

Reczne odswiezenie cache:

```powershell
node scripts/update-facebook-feed.mjs
```

Jesli skrypt pobierze nowe posty, zmieni `data/facebook-feed.json`. Workflow robi to automatycznie co 30 minut i commitnie zmiane, jesli feed sie zmienil.

## Git i konce linii

Repo ma plik `.gitattributes`, ktory utrzymuje przewidywalne konce linii miedzy Windowsem, macOS, Linuxem i GitHub Actions.

- Pliki tekstowe i zrodlowe sa zapisywane w repo jako LF.
- Skrypty Windows `.ps1`, `.bat` i `.cmd` maja w working tree uzywac CRLF.
- APK, IPA, obrazy, archiwa, keystore i provisioning profiles sa oznaczone jako binarne.

Nie uruchamiaj `git add --renormalize .` przy zwyklych poprawkach. Jesli kiedys trzeba bedzie przeliczyc cale repo wedlug `.gitattributes`, zrob to jako osobny commit bez zmian funkcjonalnych.

## Minimalna kontrola przed commitem

```powershell
npm run typecheck
git diff --check
git status --short
```

Jesli zmiana dotyczy Androida:

```powershell
npx expo prebuild --platform android --clean
cd android
.\gradlew.bat :app:compileReleaseKotlin
```

Jesli zmiana dotyczy iOS albo pluginu natywnego, wykonaj dodatkowy build na Macu albo uruchom workflow `iOS Unsigned IPA`.

## Typowe lokalne problemy

- `npm` nie jest w PATH na Macu przez SSH: ustaw `PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH`.
- CocoaPods narzeka na encoding: ustaw `LANG=en_US.UTF-8` i `LC_ALL=en_US.UTF-8`.
- Gradle nie moze skasowac `classes.jar`: zatrzymaj demony `gradlew --stop` i ponow build.
- Sideloadly zostawia `sideloadlydaemon.log`: po instalacji mozna przeniesc go do `C:\Users\Kazek\Desktop\iOS\logs`, ale tylko gdy proces Sideloadly juz nie trzyma pliku.
