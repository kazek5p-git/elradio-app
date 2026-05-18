# Prywatnosc

Ten dokument opisuje, jakie dane przetwarza aplikacja El Radio Lodz 90,8 i w jakim celu. Jest to opis praktyczny dla testerow i uzytkownikow aplikacji.

## Najwazniejsze zasady

- Aplikacja nie wymaga konta.
- Aplikacja nie ma wlasnego systemu logowania.
- Ustawienia aplikacji sa zapisywane lokalnie na urzadzeniu.
- Aplikacja nie prowadzi wlasnej analityki uzytkownika.
- Aplikacja nie wysyla wiadomosci na wlasny serwer.

## Odtwarzanie radia

Do odtwarzania radia aplikacja laczy sie ze streamem El Radia:

`http://dhtk2.noip.pl:8888/elradio`

Podczas takiego polaczenia serwer streamu moze widziec standardowe dane techniczne polaczenia, takie jak adres IP, typ klienta/User-Agent, czas polaczenia i informacje potrzebne do obslugi streamu. Jest to normalne dla transmisji internetowej.

## Metadane `Teraz gramy`

Aplikacja pobiera aktualny tytul audycji albo utworu z publicznego endpointu Icecast:

`http://dhtk2.noip.pl:8888/status-json.xsl?mount=/elradio`

Zapytanie sluzy tylko do pokazania informacji `Teraz gramy`. Aplikacja nie wysyla tam dodatkowych danych poza zwyklymi danymi technicznymi polaczenia HTTP.

## Aktualnosci z Facebooka

Aplikacja pokazuje publiczne aktualnosci z profilu El Radia na Facebooku. Dane sa pobierane przez cache JSON w repozytorium oraz, w razie potrzeby, przez publiczne strony Facebooka.

Uzytkownik moze zdecydowac, czy aplikacja ma pobierac zdjecia z postow. Tekstowe aktualnosci moga dzialac bez pobierania obrazow.

Facebook moze przetwarzac dane wedlug wlasnych zasad prywatnosci, szczegolnie gdy aplikacja pobiera publiczne tresci albo obrazy z jego infrastruktury.

## Wiadomosci, bledy i propozycje

Wiadomosci do radia, zgloszenia bledow i propozycje zmian sa tworzone jako e-mail w systemowej aplikacji pocztowej uzytkownika.

Aplikacja nie wysyla tych wiadomosci samodzielnie na dodatkowy serwer. Uzytkownik widzi tresc maila przed wyslaniem i moze ja zmienic albo zrezygnowac z wysylki.

Przy zgloszeniu bledu albo propozycji aplikacja moze dolaczyc diagnostyke, jesli uzytkownik zostawi taka opcje wlaczona. Diagnostyka moze zawierac m.in. platforme, stan odtwarzania, glosnosc, tryb sieci, stan aktualnosci i aktualny tytul `Teraz gramy`.

## Ustawienia lokalne

Aplikacja zapisuje lokalnie ustawienia, takie jak:

- tryb sieci;
- pobieranie obrazow z Facebooka;
- autostart odtwarzania;
- glosnosc startowa albo ostatnia glosnosc;
- ustawienia powiadomien o aktualizacjach;
- uproszczona dostepnosc.

Te dane sa przechowywane w pamieci aplikacji na urzadzeniu i sluza tylko do zachowania preferencji uzytkownika.

## Aktualizacje aplikacji

Aplikacja sprawdza publiczny release GitHuba `latest-build`, aby wykryc dostepna aktualizacje testowa.

Na Androidzie aplikacja moze pokazac lokalne powiadomienie o aktualizacji. Nie uzywa do tego zewnetrznego serwera push. Na iOS aplikacja moze otworzyc link do release albo pliku IPA, ale nie instaluje IPA samodzielnie.

## Ograniczenia

Aplikacja korzysta z zewnetrznych uslug potrzebnych do dzialania radia i aktualnosci, w szczegolnosci Icecast, Facebook i GitHub. Te uslugi moga miec wlasne logi techniczne i wlasne zasady prywatnosci.

## Kontakt

Kontakt z radiem w aplikacji odbywa sie przez adres:

`BIURO@ELRADIO.PL`

W sprawach technicznych aplikacji najlepiej korzystac z opcji zgloszenia bledu albo propozycji zmian w ustawieniach aplikacji.
