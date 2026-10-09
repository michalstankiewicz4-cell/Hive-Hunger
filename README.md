# Rój

Gra przeglądarkowa 3D: rój (stado) sam szuka najbliższej materii i zjada planetę zbudowaną z wokseli. Kliknięcie (stuknięcie) wskazuje mu cel — rój powoli tam płynie, a potem znów działa sam. Gdy zostaną resztki, planeta się rozsypuje i pojawia się następna.

Rój zachowuje się jak stado ptaków (boids): osobniki trzymają dystans od siebie, lecą w tę samą stronę co sąsiedzi i trzymają się grupy. Każdy leci ze stałą, identyczną prędkością.

Jedzenie jest celowe: przy materii każdy osobnik rezerwuje własny woksel (kąsek), leci w niego, ląduje i wygryza go, a potem wybiera następny. Jeden woksel je tylko jeden osobnik — wspólne kąski pojawiają się dopiero, gdy na planecie zostaje mniej wokseli niż osobników. W przelocie osobniki nie gryzą; o materię się nie odbijają i nie przenikają przez nią, tylko ślizgają się po powierzchni. Cel roju przesuwa się dalej, gdy w okolicy nie ma już wolnych wokseli.

Sterowanie:
- klik / stuknięcie — wskaż cel roju
- prawy przycisk myszy / dwa palce — obrót kamery
- kółko — przybliżenie
- panel w prawym górnym rogu — liczba osobników, prędkość, siła (promień krateru), odstęp i spójność stada, na żywo

## Uruchomienie

Kod używa modułów ES, więc trzeba go serwować przez HTTP (otwarcie `index.html` z dysku nie zadziała):

```bash
npx serve .
# albo
python -m http.server
```

Three.js r128 ładowany jest z CDN (cdnjs).

## Struktura

```
index.html
css/style.css
js/
  main.js               punkt wejścia
  config.js             wszystkie parametry gry i suwaków
  core/Leader.js        „mózg” roju: samodzielne szukanie materii + polecenia z kliknięcia
  three/Game3D.js       scena, kamera, sterowanie, pętla gry
  three/VoxelPlanet.js  planeta z wokseli + atmosfera
  three/Swarm3D.js      stado (boids) z kolizjami
  three/Debris3D.js     odłamki
  three/Space3D.js      niebo (mgławice + gwiazdy)
  ui/Hud.js             licznik planety i podpowiedzi
  ui/ControlPanel.js    suwaki
  utils/noise.js        szum 3D / fBm
  utils/terrain.js      kolory terenu
  utils/space.js        kolory mgławic i gwiazd
```
