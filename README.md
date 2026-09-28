# Mane Immo Hub – Verwaltungs-Assistent

Lokales Werkzeug für die Sachbearbeitung in der Hausverwaltung: **OPOS/Mahnwesen · Instandhaltung · Kaution**
mit automatischen Wiedervorlagen (WV), Schreiben als PDF/Word/E-Mail-Entwurf und einer zentralen WV-Liste.

## Benutzung

1. [`dist/Verwaltungs-Assistent.html`](dist/Verwaltungs-Assistent.html) herunterladen.
2. Per Doppelklick in Edge oder Chrome öffnen. Es ist keine Installation und kein Server nötig.
3. Unter **Einstellungen** Briefkopf, Bankverbindung, Unterzeichner und Fristen eintragen.
   Wer erst ausprobieren will, klickt auf **Demo laden** (fiktive Mieter).

Die Daten liegen ausschließlich im Browser (`localStorage`, Schlüssel `verwaltung_v1`) und verlassen den PC nicht.
Aus dem Internet werden nur die Bibliotheken für PDF (html2pdf.js) und Excel (SheetJS) geladen, und zwar erst bei Bedarf.
**Wöchentlich ein Backup exportieren** (Einstellungen → Backup). Das Tool erinnert daran.

Daten aus dem Prototyp (`opos_assistent_v1`) werden beim ersten Start automatisch übernommen. Der alte Datenstand bleibt dabei unverändert.

## Funktionen

| Bereich | Inhalt |
|---|---|
| **Pflicht: nächster Schritt + WV** | Jeder offene Vorgang (OPOS, Instandhaltung, Kaution) braucht einen nächsten Schritt **und** eine offene WV, sonst wird er mit ⚑ markiert: Kachel und Liste im Dashboard, ⚑ in den Listen (Filter „ohne Schritt / WV“), Banner im Vorgang. Beim Abhaken der **letzten** WV fragt das Tool „Wie geht es weiter?“ (nächster Schritt + WV, Vorgang abschließen oder bewusst ⚑ geflaggt lassen). Aktionen wie Mahnung oder Beauftragung setzen den nächsten Schritt automatisch |
| **Dashboard** | Kacheln für überfällige WV, heute, 7 Tage, je Bereich, Rückstand gesamt und Kautionen mit Verjährung < 30 Tage. Eine WV-Liste über alle Bereiche, filterbar nach Zeitraum, Bereich und Objekt, mit Schnell-Buttons **+1 +2 +3 +4** (anpassbar) und **+…** für eine freie Anzahl an Tagen, Werktagen, Wochen oder Monaten bzw. ein festes Datum, dazu „erledigt“ und „erledigt + neue WV“. Tagesliste drucken, WV-Liste als Excel |
| **OPOS** | Stufen Neu → Zahlungserinnerung → 1. Mahnung → Letzte Mahnung → Kündigung → Anwalt → Erledigt, dazu Abmahnung als Nebenpfad. Kündigungscheck nach § 543 Abs. 2 S. 1 Nr. 3 BGB (Prüfhinweis). Zahlungen werden auf die ältesten Posten zuerst verrechnet. Ratenzahlung mit einer WV je Rate. **Mahnlauf** für mehrere Fälle auf einmal. **OPOS-Liste einlesen** (siehe unten) |
| **✉ Mahnen** | Knopf in der OPOS-Liste und im Fall: öffnet Outlook mit Empfänger (E-Mail des Mieters), Betreff und fertigem Mahntext (offene Mietmonate, Betrag, Frist, optional Abmahnung wegen verspäteter Zahlungen) samt Signatur. Der Text ist vorher noch änderbar. Danach „als versendet verbuchen?“ legt Verlauf und WV an. Text, Signatur, CC und Versandweg (Outlook direkt oder .eml) sind in den Einstellungen änderbar |
| **Adressbuch** | Kontakte → „Mieter & Eigentümer“: **Telefonliste (PDF)** aus der Verwaltungssoftware einlesen (Objekt, Whg/Lage, Name, Anschrift, E-Mails, AdrNr). Monatlich neu einlesen: Änderungen und nicht mehr enthaltene Personen werden markiert. OPOS-Mieter werden über Name und Wohnung verknüpft und bekommen E-Mail, Anrede und das richtige Objekt. So füllt ✉ Mahnen den Empfänger automatisch aus. Selbst eingetragene E-Mails werden nie überschrieben |
| **Instandhaltungsliste** | Instandhaltung → „⇪ Instandhaltungsliste einlesen“: die bestehende Excel-TO-DO-Liste (Objekt · SB · Aufgabe · Material · Termin · Mieter/Prio · nächster Schritt · WV · Besonderheiten). **Ausgeblendete Zeilen werden ignoriert** (gilt für alle Excel-Importe). WV („16.09.“, „21.Sep.“, „17.09. Alimi“, Datum) und Termine („KW 40“, Datum) werden Wiedervorlagen. Objekte werden über Straße und Hausnummer(nbereich) zugeordnet. Erneutes Einlesen gleicht ab: Änderungen landen im Verlauf, nicht mehr sichtbare Aufgaben gelten als erledigt. Filter nach SB und Objekt, Export im gleichen Spaltenformat. **„⇄ In Excel eintragen“**: WV und nächste Schritte aus dem Tool zurück in die verbundene Excel-Datei schreiben. Es werden nur diese Zellen geändert, Formatierung und ausgeblendete Zeilen bleiben. Vorher wird geprüft, ob die Zeile noch passt und niemand die Zelle zwischenzeitlich geändert hat. Mit Rückgängig. Edge/Chrome schreiben direkt in die Datei, andere Browser liefern eine aktualisierte Kopie |
| **Instandhaltung** | Schadensaufnahme mit Fotos (Drag & Drop, komprimiert). Anfrage an bis zu 3 Handwerker, je ein E-Mail-Entwurf mit Fotos. Angebotsvergleich, Auftrag, Terminankündigung nach § 555a BGB, Rechnung, Weiterbelastung an den Mieter (landet auf Wunsch direkt als offener Posten im OPOS). Liste als Excel (ein Blatt je Objekt) oder PNG |
| **Kaution** | Rechner: Kaution + Zinsen − Einbehalte − NK-Einbehalt = Auszahlung. Fristen-Ampel und Verjährung nach § 548 BGB. Schreiben: Abrechnung, Anforderung der Bankverbindung, Teilauszahlung. Auszahlungsliste als Excel für die Buchhaltung |
| **Schreiben** | Briefrahmen nach DIN 5008, Calibri 11 pt. Vorschau ist direkt bearbeitbar. Export als PDF, Word, Druck oder **PDF + E-Mail-Entwurf** (`.eml` mit `X-Unsent: 1`, öffnet in Outlook als Entwurf). Ohne Internet: Word + `mailto:` + Text in der Zwischenablage. Danach fragt das Tool „als versendet verbuchen?“ und legt Verlauf und WV an |
| **Vorlagen** | Alle Textbausteine sind unter Einstellungen editierbar (Platzhalter wie `{{mieter.nachname}}`, `{{frist}}`, `{{postenTabelle}}`), mit Live-Vorschau und „auf Standard zurücksetzen“ |
| **Anpassen** | Einstellungen → Anpassen: „Ich bin (SB)“ (Standard Cem: Dashboard und Instandhaltung zeigen nur eigene Aufgaben/WV, umschaltbar auf „alle“), WV-Schnell-Buttons (Werte und Einheit), Standard-Abstand für neue WV, Vorschlagsliste für WV-Aufgaben, Gewerke-Liste, sichtbare Bereiche, Dashboard-Kacheln und Startfilter, Startansicht, Warnschwelle für die Kautionsverjährung, Akzent- und Kopffarbe, Schriftgröße, kompakte Tabellen |
| **Komfort** | Globale Suche (<kbd>Strg</kbd>+<kbd>K</kbd> oder <kbd>/</kbd>), <kbd>Alt</kbd>+<kbd>1</kbd>…<kbd>7</kbd> für die Bereiche, <kbd>Alt</kbd>+<kbd>N</kbd> für einen neuen Eintrag, <kbd>Esc</kbd> für zurück |

### OPOS-Liste einlesen

OPOS → **⇪ OPOS-Liste einlesen**. Die PDF oder Excel-Datei auswählen. Das Format erkennt das Tool selbst:

| Format | Aussehen | Ergebnis |
|---|---|---|
| **OPOS-Liste (PDF)**, empfohlen | „Offene Postenliste“ aus der Verwaltungssoftware: je Debitor alle offenen Posten mit Buchungstext, Soll/Haben, Fälligkeit, Mahnstufe und „Summe PKto“ | Jeder Posten landet einzeln im Fall. Die Summe jedes Kontos wird gegen „Summe PKto“ geprüft. Der Fall zeigt, woraus sich die Schulden zusammensetzen (Miete, Vorauszahlungen, Abrechnungen, Mahngebühren, Gutschriften), mit Tagen überfällig. ✉ Mahnen listet die Posten in der Mail auf, auswählbar per Häkchen. Die Monatsmiete für den Kündigungscheck wird aus den Posten geschätzt, Gutschriften werden verrechnet |
| **Rohdaten** aus der Verwaltungssoftware | `"name": "NAME Whg. 1 PFkt. 007 Mieter 01.03.25 -"`, `"saldo_zeile": "Summe PKto: 1.234,56"` | je Mieter ein Fall mit dem Saldo. Wohnung und Mietzeit werden übernommen, mehrere Konten (Wohnung + Stellplatz) zusammengefasst |
| **Saldenliste** | Spalten `Name` · `Datum` (Mietzeit „01.03.25 - 31.07.26,“) · `Saldo`, optional `WV`, `Aktiv` und beliebige Notizspalten | wie oben. WV-Daten (auch „01.09“ oder „WV 30.09“) werden zu Wiedervorlagen, Notizspalten zur Fall-Notiz. Formeln wie `=1500-200` werden ausgerechnet |
| **Einzelposten** | `Datum` · `Buchungstext` · `Betrag` · `Fälligkeit`, optional mit Titelzeile „… für NAME (Whg. 12):“ | Einzelposten für einen Mieter. Miete oder Sonstiges wird am Buchungstext erkannt. Danach funktionieren Kündigungscheck und die Postentabelle in Mahnungen |

Die Liste kann **jeden Monat erneut eingelesen** werden. Bekannte Mieter werden am Namen und Mietbeginn erkannt, auch wenn der Name auf 30 Zeichen abgeschnitten ist. Geänderte Salden landen mit Differenz im Verlauf. WV und Notizen werden nicht doppelt angelegt. Wer möchte, lässt Fälle, die nicht mehr in der Liste stehen, automatisch als erledigt markieren.
Ein Saldo ist nicht nach Miete und Sonstigem aufgeschlüsselt. Er zählt deshalb nicht für den Kündigungscheck, bis die Einzelposten eingelesen sind.

### WV-Regeln (Kernstück, kurzer Takt)

WV landen nie auf einem Wochenende oder NRW-Feiertag: Sie rutschen auf den nächsten Werktag. Die Verjährungs-WV wird stattdessen auf den *vorherigen* Werktag vorgezogen. Zahlungsfristen in Schreiben liegen immer auf einem Werktag.
Alle Abstände sind unter Einstellungen → Fristen & Regeln änderbar. Standard ist ein **Puffer von 1 Tag** nach Fristablauf.

| Bereich | Auslöser | WV |
|---|---|---|
| OPOS | Erinnerung / 1. Mahnung / Abmahnung (Frist 7 T), letzte Mahnung (5 T), ✉ E-Mail-Mahnung (5 T) | Frist + 1 Tag: „Zahlungseingang prüfen“ |
| OPOS | Kündigung | +1 Tag „Original per Post versendet?“, Räumungsfrist „Räumung/Zahlung prüfen“ |
| OPOS | Anwalt / Ratenzahlung | +7 Tage „Sachstand Anwalt“ / je Rate Fälligkeit + 1 Tag |
| IH | Schaden gemeldet | Notfall und hoch: heute, normal: nächster Werktag „Handwerker anfragen“ |
| IH | Angefragt / beauftragt / erledigt | +3 Tage „Angebot?“, Termin +1 Tag (ohne Termin +5) „Ausführung prüfen“, +7 Tage „Rechnung prüfen“ |
| Kaution | Auszug/Übergabe | +1 Tag Protokoll, +14 Tage „Schäden/Kosten ermitteln“, +2 Monate „Abrechnung erstellen“, **+5 Monate Verjährung § 548 BGB** |
| Kaution | Abrechnung | +7 Tage „Auszahlung erfolgt?“ |

Neue manuelle WV werden standardmäßig in 2 Tagen vorgeschlagen, dazu die Schnell-Buttons +1 bis +4 und +… .
Bestehende Daten wurden beim ersten Start einmalig umgestellt: Alte Standardabstände wurden verkürzt, offene automatische WV vorgezogen. Eigene Werte bleiben unverändert.

Eine neue Aktion schließt die vorherigen automatischen WV des Falls. Manuelle WV bleiben stehen.

## Entwicklung

```bash
node build.js    # bündelt src/ → dist/Verwaltungs-Assistent.html (keine Abhängigkeiten)
node tests.js    # Unit-Tests: Datum/Werktag/Feiertage, Kündigungscheck, Kaution, Zahlungsverteilung, WV-Engine, OPOS-Import, Migration
```

```
src/core.js      Store-Modell, Migration, Datum/Werktag/Feiertage NRW, Formatierung, WV-Engine, Fachlogik (auch in Node testbar)
src/docs.js      Textbausteine, Briefrahmen DIN 5008, PDF/Word/Druck/EML, Excel-Export/-Import
src/ui.js        App-Rahmen, Dialoge, Dokument-Vorschau, Dashboard, Stammdaten, Kontakte, Einstellungen, Suche
src/opos.js      Modul OPOS
src/ih.js        Modul Instandhaltung
src/kaution.js   Modul Kaution
src/demo.js      Demo-Daten
```

Nach jeder Änderung in `src/` einmal `node build.js` ausführen und `dist/` mit einchecken.

## Offene Punkte aus dem Rahmenplan (§ 10)

Das Tool deckt alle fünf Punkte schon ab, sie brauchen aber noch deine Angaben oder Entscheidung:

1. **Export der OPOS-Liste:** erledigt. Rohdaten („PFkt.“/„Summe PKto“), Saldenlisten und Einzelposten werden automatisch erkannt (siehe oben).
2. **IBAN:** Standard ist die Verwaltungs-IBAN. Optional „IBAN je Eigentümer“ aktivieren, dann gilt die IBAN aus dem jeweiligen Objekt.
3. **Briefkopf:** Adresse und Telefon in den Einstellungen eintragen. Ein Logo kann dort hochgeladen werden.
4. **Unterzeichner:** Name und Funktion für Kündigungen und Vereinbarungen stehen in den Einstellungen.
5. **Excel-WV-Liste:** Das Tool kann sie ersetzen. Für eine Übergangszeit lässt sich die WV-Liste jederzeit als Excel exportieren.

Noch nicht umgesetzt: die Übersetzung DE↔BS für den Hausmeister (laut Plan „später“) und ein `.docx`-Export (Plan: optional).

> Hinweis: Schreiben und Kündigungscheck sind Arbeitshilfen und ersetzen keine rechtliche Prüfung im Einzelfall.
