# El Radio Lodz 90,8

Mobilna aplikacja Android/iOS do sluchania El Radia. Projekt jest zbudowany w Expo i React Native, ale zawiera tez wlasny plugin natywny, bo czesc zachowan nie jest dostepna bezposrednio z JavaScriptu.

## Co robi aplikacja

- Odtwarza stream `http://dhtk2.noip.pl:8888/elradio` z naglowkami Icecast i User-Agent `El Radio app`.
- Pokazuje aktualny tytul audycji/utworu z metadanych Icecast jako `Teraz gramy`.
- Udostepnia sterowanie odtwarzaniem, glosnoscia, wyjsciem audio AirPlay/Cast i wylacznikiem czasowym.
- Pokazuje imieniny z lokalnej bazy `src/nameDays.ts`.
- Pobiera aktualnosci z Facebooka przez cache JSON w repo oraz fallbacki w aplikacji.
- Obsluguje kontakt, zgloszenia bledow i propozycje zmian przez systemowy klient poczty.
- Ma ustawienia sieci, autostartu, glosnosci startowej, podpisu, kontaktu zwrotnego, prywatnosci, dostepnosci i aktualizacji.
- Publikuje prywatne buildy testowe jako rolling release `latest-build` na GitHubie.

## Dokumentacja

- [Mapa kodu](docs/code-map.md) opisuje pliki, odpowiedzialnosci i miejsca, w ktorych najczesciej robi sie zmiany.
- [Architektura](docs/architecture.md) opisuje glowne przeplywy: audio, ustawienia, Facebook, aktualizacje, natywne plugini i dostepnosc.
- [Development](docs/development.md) opisuje lokalne uruchamianie, prebuild, Androida, iOS, Maca i Sideloadly.
- [Operacje i release](docs/operations.md) opisuje GitHub Actions, rolling release, aktualizator, procedury testowe i typowe awarie.
- [Testowanie](docs/testing.md) zawiera reczna checkliste Android/iOS po zmianach i release.
- [Prywatnosc](PRIVACY.md) opisuje dane, zewnetrzne uslugi i diagnostyke aplikacji.

## Szybki start

```powershell
npm ci
npm run typecheck
npm start
```

Do zwyklej pracy nad JavaScriptem nie trzeba generowac katalogow `android/` ani `ios/`. Sa one produktem `expo prebuild` i sa ignorowane przez git.

## Najczestsze komendy

```powershell
# Kontrola TypeScriptu
npm run typecheck

# Android release APK lokalnie
npm run build:android:release

# Instalacja Androida przez adb
.\scripts\install-android-local.ps1

# Instalacja najnowszej IPA z GitHuba przez Sideloadly
.\scripts\install-ios-sideloadly-latest.ps1
```

Z poziomu katalogu nadrzednego `C:\Users\Kazek\Desktop\iOS` dziala tez wspolny skrypt:

```powershell
.\Install-ElRadio-Latest.ps1 -Platform iOS
.\Install-ElRadio-Latest.ps1 -Platform Android
.\Install-ElRadio-Latest.ps1 -Platform Both
```

## Linki dla testerow

- Release: https://github.com/kazek5p-git/elradio-app/releases/tag/latest-build
- Android APK: https://github.com/kazek5p-git/elradio-app/releases/download/latest-build/EL-Radio.apk
- iPhone IPA: https://github.com/kazek5p-git/elradio-app/releases/download/latest-build/EL-Radio-unsigned.ipa
- Metadata aktualizacji: https://github.com/kazek5p-git/elradio-app/releases/download/latest-build/EL-Radio-release.json

## Wazne zasady utrzymania

- Zmiany w natywnym Androidzie/iOS dodawaj przez `plugins/withElRadioNativeConfig.js`, nie przez reczna edycje wygenerowanych katalogow.
- Po zmianach natywnych trzeba zbudowac nowe APK/IPA. Sam JavaScript moze przejsc przez Expo Updates dopiero po pelnej konfiguracji EAS Update.
- Aktualnosci Facebooka sa najbardziej kruche, bo opieraja sie na publicznym HTML/mbasic oraz cache w `data/facebook-feed.json`.
- User-Agent streamu i metadane iOS Now Playing sa latane w `expo-av` podczas prebuilda. Po podbiciu wersji Expo trzeba sprawdzic plugin.
- `.gitattributes` pilnuje koncow linii i plikow binarnych; masowa renormalizacje rob tylko w osobnym commicie.
- Nie commituj `Builds/`, `android/`, `ios/`, `.expo/` ani lokalnych logow Sideloadly.
