// Cockpit-XP audio/symbol event IDs, verified against CockpitV2.exe 3.7.0.567
// (SHA256 6ced022ee8b8209a5818b387baee44767773f9c876c21d716e654db835d895a2).
// These are AudioIDs, not AddOn event numbers or variable xmlIndex values.
export const cockpitEvents: ReadonlyArray<{ id: number; label: string }> = [
  {
    id: 1,
    label: "Durchfahrt Start/Ziel",
  },
  {
    id: 2,
    label: "Sieger ist im Ziel",
  },
  {
    id: 3,
    label: "Einzel Rennen ist zu Ende",
  },
  {
    id: 18,
    label: "Serie Einzel Rennen ist zu Ende",
  },
  {
    id: 4,
    label: "1 Min. vor Rennende",
  },
  {
    id: 5,
    label: "30 sek. vor Rennende",
  },
  {
    id: 6,
    label: "5 Runden vor Rennende",
  },
  {
    id: 7,
    label: "2 Runden vor Rennende",
  },
  {
    id: 8,
    label: "1 Runde vor Rennende",
  },
  {
    id: 9,
    label: "Reporter während des Rennens",
  },
  {
    id: 10,
    label: "Neuer Bahnrekord",
  },
  {
    id: 11,
    label: "Neuer persönlicher Rundenrekord",
  },
  {
    id: 12,
    label: "Neuer persönlicher Rundenrekord mit diesem Fahrzeug",
  },
  {
    id: 13,
    label: "Neue schnellste Runde",
  },
  {
    id: 14,
    label: "Schnellste Runde von allen",
  },
  {
    id: 83,
    label: "Schnellste Rundenzeit von diesem Fahrzeug (absolut)",
  },
  {
    id: 15,
    label: "Neuer Slotrekord",
  },
  {
    id: 16,
    label: "Neuer persönlicher Slotrekord",
  },
  {
    id: 17,
    label: "Neuer persönlicher Slotrekord mit diesem Fahrzeug",
  },
  {
    id: 22,
    label: "Beste TopSpeed absolut",
  },
  {
    id: 23,
    label: "Beste TopSpeed persönlich",
  },
  {
    id: 24,
    label: "Beste TopSpeed persönlich mit diesem Fahrzeug",
  },
  {
    id: 28,
    label: "Tank ist auf Reserve",
  },
  {
    id: 86,
    label: "Tank ist nicht auf Reserve",
  },
  {
    id: 30,
    label: "Tank ist voll",
  },
  {
    id: 29,
    label: "Tank ist leer",
  },
  {
    id: 31,
    label: "Es wird getankt",
  },
  {
    id: 32,
    label: "Überfahrt Tanken Einfahrt",
  },
  {
    id: 33,
    label: "Überfahrt Tanken Ausfahrt",
  },
  {
    id: 34,
    label: "Boxengasse Strafe wurde ausgesprochen",
  },
  {
    id: 35,
    label: "Boxengasse Strafe ist beendet",
  },
  {
    id: 36,
    label: "Fahrer wurde disqualifiziert",
  },
  {
    id: 39,
    label: "Rundenstrafe wurde ausgesprochen",
  },
  {
    id: 84,
    label: "Rundenstrafe ist beendet",
  },
  {
    id: 38,
    label: "Zeitstrafe wurde ausgesprochen",
  },
  {
    id: 85,
    label: "Zeitstrafe ist beendet",
  },
  {
    id: 40,
    label: "Durchfahrt TopSpeed-Start",
  },
  {
    id: 41,
    label: "Überfahrt Sektor 1 - Sektor 8",
  },
  {
    id: 42,
    label: "Sicherheitsrundenzeit wurde unterschritten",
  },
  {
    id: 87,
    label: "SerienRennen: TrainingEnde-Fahrer",
  },
  {
    id: 43,
    label: "Training Start",
  },
  {
    id: 45,
    label: "Training Pause",
  },
  {
    id: 48,
    label: "Training Ende",
  },
  {
    id: 46,
    label: "Training Weiter",
  },
  {
    id: 44,
    label: "Training Abbruch",
  },
  {
    id: 47,
    label: "Training Yellowphase",
  },
  {
    id: 49,
    label: "Quali Start",
  },
  {
    id: 51,
    label: "Quali Pause",
  },
  {
    id: 53,
    label: "Quali Ende",
  },
  {
    id: 52,
    label: "Quali Weiter",
  },
  {
    id: 50,
    label: "Quali Abbruch",
  },
  {
    id: 69,
    label: "Startknopf an der CU drücken",
  },
  {
    id: 55,
    label: "Bereit machen zum Start",
  },
  {
    id: 67,
    label: "Ampel 5",
  },
  {
    id: 66,
    label: "Ampel 4",
  },
  {
    id: 65,
    label: "Ampel 3",
  },
  {
    id: 64,
    label: "Ampel 2",
  },
  {
    id: 63,
    label: "Ampel 1",
  },
  {
    id: 56,
    label: "Rennen Start",
  },
  {
    id: 71,
    label: "Rennen Start und Freigabe",
  },
  {
    id: 58,
    label: "Rennen Pause",
  },
  {
    id: 59,
    label: "Rennen Weiter",
  },
  {
    id: 72,
    label: "Rennen Weiter und Freigabe",
  },
  {
    id: 54,
    label: "Rennen Frühstart",
  },
  {
    id: 70,
    label: "Rennen Frühstart Hinweis",
  },
  {
    id: 68,
    label: "Rennen Frühstart ohne Abbruch",
  },
  {
    id: 57,
    label: "Rennen Abbruch",
  },
  {
    id: 62,
    label: "Rennen Schnellstart",
  },
  {
    id: 60,
    label: "Rennen Ende",
  },
  {
    id: 73,
    label: "Motorschaden Ein",
  },
  {
    id: 74,
    label: "Motorschaden Aus",
  },
  {
    id: 75,
    label: "Bremsschaden Ein",
  },
  {
    id: 76,
    label: "Bremsschaden Aus",
  },
  {
    id: 77,
    label: "Customer1 Ein",
  },
  {
    id: 78,
    label: "Customer1 Aus",
  },
  {
    id: 79,
    label: "Customer2 Ein",
  },
  {
    id: 80,
    label: "Customer2 Aus",
  },
  {
    id: 81,
    label: "Customer3 Ein",
  },
  {
    id: 82,
    label: "Customer3 Aus",
  },
  {
    id: 88,
    label: "Fahrer mit ID nicht angemeldet",
  },
];
