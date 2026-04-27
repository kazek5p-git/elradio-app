# EL Radio

Wspólna aplikacja mobilna Android/iOS dla EL Radio zbudowana w Expo/React Native.

## Funkcje

- Odtwarzanie strumienia EL Radio z dużym przyciskiem `Odtwarzaj` / `Wstrzymaj`.
- Suwak głośności w aplikacji.
- Baner częstotliwości `90.8` dla Łodzi.
- Codziennie zmieniane imieniny z lokalnego kalendarza w aplikacji.
- Aktualne posty i przycisk obserwowania/polubienia przez osadzony moduł Facebooka.
- Formularz kontaktowy bez pokazywania adresu e-mail w sekcji formularza.
- Dane firmy na dole ekranu.
- Dostępne etykiety i role dla czytników ekranu.
- Mechanizm OTA przez `expo-updates`; po podłączeniu projektu do EAS Update aplikacja pobiera aktualizacje JS przy starcie.

## Szybki start

```powershell
npm install
npm run typecheck
npm start
```

## Android

Instalacja lokalna na podłączonym Pixelu:

```powershell
.\scripts\install-android-local.ps1
```

Skrypt buduje natywny projekt Androida przez Expo, tworzy samodzielny release APK i instaluje go przez `adb`.

## iOS

Unsigned IPA buduje workflow GitHub Actions `iOS Unsigned IPA` na macOS. Po zakończonym buildzie instalacja przez Sideloadly:

```powershell
.\scripts\install-ios-sideloadly-latest.ps1
```

Skrypt pobiera najnowszy artefakt `EL-Radio-unsigned-ipa` z GitHuba i przekazuje go do istniejącego mostka `Install-IPA-Sideloadly-Bridge.ps1`.

## GitHub Actions

- `Android APK` buduje APK i publikuje artefakt.
- `iOS Unsigned IPA` buduje unsigned IPA gotowe do Sideloadly.

## Aktualizacje

Repozytorium może pozostać prywatne. Aktualizacje JS/UX powinny iść przez EAS Update po wykonaniu:

```powershell
npx eas update:configure
```

Natywne zmiany wymagają nowego APK/IPA i instalacji przez skrypty albo dystrybucję TestFlight/App Store.
