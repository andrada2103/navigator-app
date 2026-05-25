# navigator-app
Aplicație web pentru rutare urbană în municipiul Brașov, bazată pe algoritmul A* și date reale din OpenStreetMap și GTFS (transport public).

##Descriere

Proiectul implementează un sistem de navigație urbană care generează rute folosind un graf rutier real, construit cu Python (OSMnx + NetworkX). Sunt disponibile mai multe tipuri de rutare (distanță, timp, echilibrată), precum și rutare multimodală (mers pe jos + transport public).

Aplicația este dezvoltată full-stack (frontend + backend + procesare date) și include și o variantă mobilă (WebView Android) pentru demonstrare.

##Funcționalități principale

Căutare locații (geocoding)

Rutare cu algoritmul A* pe graf real
rută cea mai scurtă (distanță)
rută cea mai rapidă (timp)
rută echilibrată (distanță + timp + siguranță - bazată pe tipul drumului)
Rutare pentru mers pe jos și bicicletă
Rutare multimodală (autobuz + mers pe jos)
suport pentru rute directe sau cu un schimb
integrare GTFS (date reale RATBV)
Sistem de favorite (localStorage + bază de date)
Istoric hibrid (guest + user autentificat)
Sistem meteo (vreme curentă + prognoză)
Simulare blocaje rutiere (drumuri evitate de algoritm)
Afișare puncte de interes (POI)
Versiune mobilă (WebView Android)
##Tehnologii utilizate

Frontend

HTML, CSS, JavaScript (modular)
Leaflet (hărți)
Backend

PHP (API REST)
MySQL (persistență date)
Algoritmică și procesare date

Python
OSMnx (generare graf rutier)
NetworkX (algoritmi pe graf)
Date

OpenStreetMap
GTFS (transport public Brașov)
##Arhitectură

Graful rutier este generat offline în Python și exportat în format JSON
Backend-ul PHP încarcă graful și rulează algoritmul A*
Pentru rute în afara Brașovului se folosește fallback către OSRM
Datele GTFS sunt importate în baza de date și utilizate pentru rutare multimodală
##Instalare și rulare

Clonează repository-ul
Configurează fișierul .env pe baza .env.example
Rulează aplicația folosind un server local (ex: XAMPP)
Accesează aplicația în browser
Rulează scriptul Python pentru regenerarea grafului:
python generate_brasov_graph.py

##Testare

Proiectul include teste funcționale pentru:

validări frontend
algoritm A*
euristică
rutare multimodală
fallback OSRM
Testele sunt orientate pe verificarea funcționalității componentelor principale.

##Limitări

Rutarea pe graf propriu este disponibilă doar pentru municipiul Brașov (din motive de dimensiune și performanță)
Pentru alte zone se folosește OSRM
Aplicația mobilă este bazată pe WebView, nu nativă
Testarea nu este complet automatizată (proiect de tip prototip)
##Observații

Acest proiect este realizat ca lucrare de licență și reprezintă un prototip funcțional. Accentul a fost pus pe algoritmică, integrarea datelor reale și demonstrarea conceptului.
