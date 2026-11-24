# Windows-Testbuild

Erstelle nach Änderungen an RBS Studio eine startbare Windows-EXE mit `npm run desktop:build -- -Portable`. Der Befehl legt die EXE im Repository unter `release/RBS Studio.exe` ab. Verlinke diese Datei in der Abschlussnachricht. `npm run build` baut das Web-Frontend, das Tauri in die EXE einbindet.

