# Testowanie aplikacji

Ten dokument jest reczna checklista po zmianach. Projekt nie ma jeszcze testow automatycznych UI, wiec po release trzeba sprawdzac najwazniejsze przeplywy na prawdziwych urzadzeniach.

## Minimalna kontrola przed commitem

```powershell
npm run typecheck
git diff --check
git status --short
```

Jesli zmiana dotyczy tylko dokumentacji, typecheck zwykle wystarczy. Jesli zmiana dotyczy `App.tsx`, audio, ustawien, aktualizatora albo pluginu natywnego, zbuduj i zainstaluj paczke na odpowiedniej platformie.

## Android

Uruchom na Pixelu z TalkBackiem przynajmniej:

1. Start aplikacji bez crasha.
2. Przycisk `Odtwarzaj` uruchamia stream.
3. Przycisk `Wstrzymaj` zatrzymuje stream.
4. Status polaczenia nie dubluje zbednych komunikatow.
5. `Teraz gramy` pojawia sie, gdy Icecast zwraca tytul.
6. Regulator glosnosci ma jeden fokus TalkBacka: `Glosnosc, X procent, suwak`.
7. Gest/przycisk w gore na regulatorze podglasnia, a w dol scisza.
8. Nie ma osobnego kolejnego fokusu na samym `X procent`.
9. Przycisk Cast/audio otwiera systemowy wybor trasy albo ustawienia Cast/Bluetooth.
10. Aktualnosci Facebooka laduja teksty i obrazy zgodnie z ustawieniem pobierania obrazow.
11. Ustawienia otwieraja sie jako osobne okno/modal.
12. Aktualizator znajduje release `latest-build`.

Po instalacji z release sprawdz pakiet:

```powershell
adb devices
adb -s <serial> shell dumpsys package pl.elradio.app | Select-String -Pattern 'versionName|versionCode|lastUpdateTime'
```

## iOS

Uruchom na iPhonie z VoiceOverem przynajmniej:

1. Start aplikacji bez crasha.
2. Przycisk `Odtwarzaj` uruchamia stream.
3. Odtwarzanie dziala po zablokowaniu ekranu.
4. Systemowy player pokazuje informacje El Radia.
5. `Teraz gramy` pojawia sie, gdy Icecast zwraca tytul.
6. Przycisk AirPlay otwiera systemowy wybor trasy audio.
7. Aktualnosci Facebooka laduja posty.
8. Ustawienia otwieraja sie jako modal, a pierwszy element pozwala wrocic.
9. VoiceOver nie czyta zbednych podpowiedzi ani zduplikowanych wartosci.

## Facebook

Po zmianie parsera albo wygladu aktualnosci:

1. Uruchom `node scripts/update-facebook-feed.mjs`.
2. Sprawdz diff `data/facebook-feed.json`.
3. Sprawdz widok aktualnosci na Androidzie.
4. Sprawdz widok aktualnosci na iOS.
5. Sprawdz tryb z wylaczonym pobieraniem obrazow.
6. Upewnij sie, ze nie ma pustych lub powtarzajacych sie linkow.

## Aktualizator

Po zmianach release albo aktualizatora:

1. Sprawdz, czy `latest-build` ma `EL-Radio.apk`, `EL-Radio-unsigned.ipa` i `EL-Radio-release.json`.
2. Na Androidzie sprawdz, czy aplikacja wykrywa nowy build i otwiera pobieranie APK.
3. Na iOS sprawdz, czy aplikacja nie obiecuje automatycznej instalacji IPA, tylko prowadzi do pobrania/release.
4. Jesli commit byl platformowy, sprawdz czy uzyto poprawnej flagi `[android-only]` albo `[ios-only]`.

## Kiedy testowac obie platformy

Testuj Android i iOS, gdy zmiana dotyczy:

- `App.tsx` poza bardzo waskim blokiem platformowym;
- ustawien;
- audio;
- aktualizatora;
- Facebooka;
- prywatnosci i formularzy mailowych;
- pluginu natywnego `plugins/withElRadioNativeConfig.js`.

Test jednej platformy wystarczy, gdy zmiana jest jednoznacznie ograniczona do Androida albo iOS i commit ma odpowiednia flage builda.
