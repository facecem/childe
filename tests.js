/* Unit-Tests – Aufruf: node tests.js */
'use strict';
const C = require('./src/core.js');

let ok = 0, fail = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) ok++;
  else { fail++; console.error('✗ ' + name + '\n    erwartet: ' + e + '\n    erhalten: ' + a); }
}
function truthy(v, name) { eq(!!v, true, name); }
function section(n) { console.log('· ' + n); }

section('Datum / Werktag / Feiertage NRW');
eq(C.easterSunday(2025), '2025-04-20', 'Ostersonntag 2025');
eq(C.easterSunday(2026), '2026-04-05', 'Ostersonntag 2026');
eq(C.easterSunday(2027), '2027-03-28', 'Ostersonntag 2027');
const f26 = C.feiertageNRW(2026);
eq(Object.keys(f26).length, 11, 'NRW hat 11 gesetzliche Feiertage');
eq(f26['2026-04-03'], 'Karfreitag', 'Karfreitag 2026');
eq(f26['2026-06-04'], 'Fronleichnam', 'Fronleichnam 2026');
eq(f26['2026-05-14'], 'Christi Himmelfahrt', 'Himmelfahrt 2026');
eq(f26['2026-11-01'], 'Allerheiligen', 'Allerheiligen');
eq(C.isWerktag('2026-09-28'), true, 'Montag ist Werktag');
eq(C.isWerktag('2026-10-03'), false, 'Tag der Dt. Einheit (Sa)');
eq(C.naechsterWerktag('2026-10-03'), '2026-10-05', 'Sa → Mo');
eq(C.naechsterWerktag('2026-12-25'), '2026-12-28', 'Weihnachten Fr → Mo');
eq(C.naechsterWerktag('2026-04-03'), '2026-04-07', 'Karfreitag → Dienstag nach Ostermontag');
eq(C.naechsterWerktag('2026-06-04'), '2026-06-05', 'Fronleichnam → Freitag');
eq(C.naechsterWerktag('2026-06-04', false), '2026-06-04', 'ohne NRW-Feiertage bleibt Do');
eq(C.addWerktage('2026-10-02', 1), '2026-10-05', '+1 Werktag Fr → Mo');
eq(C.addWerktage('2026-12-23', 3), '2026-12-29', '+3 Werktage über Weihnachten');
eq(C.addMonths('2026-01-31', 1), '2026-02-28', 'Monatsende geklemmt');
eq(C.addMonths('2024-08-31', 6), '2025-02-28', '+6 Monate geklemmt');
eq(C.diffDays('2026-01-01', '2026-03-01'), 59, 'diffDays');
eq(C.ordentlicherKuendigungstermin('2026-10-02', '2022-01-01'), '2026-12-31', '§573c Zugang bis 3. Werktag');
eq(C.ordentlicherKuendigungstermin('2026-10-06', '2022-01-01'), '2027-01-31', '§573c Zugang nach 3. Werktag');
eq(C.ordentlicherKuendigungstermin('2026-10-02', '2020-01-01'), '2027-03-31', '§573c +3 Monate ab 5 Jahren');
eq(C.ordentlicherKuendigungstermin('2026-10-02', '2010-01-01'), '2027-06-30', '§573c +6 Monate ab 8 Jahren');

section('Formatierung');
eq(C.fmtDatum('2026-03-07'), '07.03.2026', 'fmtDatum');
eq(C.parseDatum('7.3.26'), '2026-03-07', 'parseDatum kurz');
eq(C.parseDatum('07.03.2026'), '2026-03-07', 'parseDatum DE');
eq(C.parseDatum('46088'), '2026-03-07', 'parseDatum Excel-Seriennummer');
eq(C.fmtEUR(1234.5), '1.234,50 €', 'fmtEUR');
eq(C.fmtEUR(-1234567.891), '-1.234.567,89 €', 'fmtEUR negativ/Millionen');
eq(C.fmtEUR(0.1 + 0.2), '0,30 €', 'fmtEUR Rundung');
eq(C.parseBetrag('1.234,56 €'), 1234.56, 'parseBetrag DE');
eq(C.parseBetrag('1234.56'), 1234.56, 'parseBetrag Punkt');
eq(C.parseBetrag('1.234'), 1234, 'parseBetrag Tausenderpunkt');
eq(C.parseBetrag('100,00-'), -100, 'parseBetrag nachgestelltes Minus');

section('Kündigungscheck § 543 Abs. 2 S. 1 Nr. 3 BGB');
const M = 800;
const p = (faellig, offen, typ = 'miete') => ({ bez: 'Miete', faellig, typ, betrag: offen, offen });
let k = C.kuendigungsCheck([p('2026-08-03', 800)], M);
eq(k.moeglich, false, 'eine Monatsmiete offen → nein');
k = C.kuendigungsCheck([p('2026-08-03', 400), p('2026-09-03', 400)], M);
eq(k.moeglich, false, 'zwei Termine, genau 1 Monatsmiete → nein (muss übersteigen)');
k = C.kuendigungsCheck([p('2026-08-03', 400), p('2026-09-03', 400.01)], M);
eq([k.moeglich, !!k.a, k.b], [true, true, false], 'zwei Termine > 1 Monatsmiete → Nr. 3a');
k = C.kuendigungsCheck([p('2026-06-03', 500), p('2026-08-03', 500)], M);
eq(k.moeglich, false, 'nicht aufeinanderfolgend, < 2 Mieten → nein');
k = C.kuendigungsCheck([p('2026-04-03', 400), p('2026-06-03', 600), p('2026-08-03', 600)], M);
eq([k.moeglich, !!k.a, k.b], [true, false, true], '≥ 2 Monatsmieten über längeren Zeitraum → Nr. 3b');
k = C.kuendigungsCheck([p('2026-08-03', 800), p('2026-09-03', 800, 'sonstig'), p('2026-07-01', 5000, 'sonstig')], M);
eq(k.moeglich, false, 'Sonstige Posten zählen nicht');
k = C.kuendigungsCheck([p('2026-08-03', 800)], 0);
eq(k.moeglich, false, 'ohne Monatsmiete keine Prüfung');

section('Zahlungsverteilung (älteste zuerst)');
const posten = [
  { id: 'c', bez: 'Miete 09', faellig: '2026-09-03', typ: 'miete', betrag: 800, offen: 800 },
  { id: 'a', bez: 'Miete 07', faellig: '2026-07-03', typ: 'miete', betrag: 800, offen: 300 },
  { id: 'b', bez: 'Miete 08', faellig: '2026-08-03', typ: 'miete', betrag: 800, offen: 800 }
];
let z = C.verteileZahlung(posten, 1000);
eq(z.posten.map(x => x.offen), [800, 0, 100], 'Zahlung 1000 → Juli voll, August 700');
eq(z.rest, 0, 'kein Rest');
eq(posten[1].offen, 300, 'Original unverändert');
z = C.verteileZahlung(posten, 2500);
eq([z.posten.map(x => x.offen), z.rest], [[0, 0, 0], 600], 'Überzahlung → Rest');
z = C.verteileZahlung(posten, 0.1 + 0.2);
eq(z.posten[1].offen, 299.7, 'Cent-genau');

section('Kautionsrechnung');
let kr = C.kautionsabrechnung({ betrag: 2400, zinsen: 12.34, einbehalte: [{ grund: 'Reinigung', betrag: 150 }, { grund: 'Schlüssel', betrag: 85.5 }], nkEinbehalt: 300 });
eq([kr.guthaben, kr.einbehalte, kr.auszahlung, kr.nachforderung], [2412.34, 235.5, 1876.84, 0], 'Kaution + Zinsen − Einbehalte − NK');
kr = C.kautionsabrechnung({ betrag: 1000, zinsen: 0, einbehalte: [{ betrag: 1200 }], nkEinbehalt: 0 });
eq([kr.auszahlung, kr.nachforderung], [-200, 200], 'Nachforderung bei Überschuss Einbehalte');
kr = C.kautionsabrechnung({ betrag: 1000, zinsen: 0, einbehalte: [], nkEinbehalt: 200, teilauszahlung: 800 });
eq(kr.auszahlung, 0, 'Teilauszahlung berücksichtigt');
const vj = C.verjaehrung({ uebergabeAm: '2026-03-31' }, '2026-09-15');
eq([vj.ende, vj.restTage], ['2026-09-30', 15], 'Verjährung § 548: 6 Monate ab Rückgabe');
eq(C.kautionAmpel({ uebergabeAm: '2026-03-31', status: 'in_pruefung' }, '2026-09-15'), 'rot', 'Ampel rot < 30 Tage');

section('Raten');
const r = C.ratenplan(1000, 3, '2026-10-15');
eq(r.map(x => x.betrag), [333.33, 333.33, 333.34], 'Raten Cent-Ausgleich in letzter Rate');
eq(r.map(x => x.faellig), ['2026-10-15', '2026-11-15', '2026-12-15'], 'Raten monatlich');

section('WV-Engine');
function testData() {
  const d = C.emptyData();
  d.mieter.push({ id: 'm1', nachname: 'Test', gesamtmiete: 800 });
  d.opos.push({ id: 'o1', mieterId: 'm1', stufe: 'neu', posten: [], raten: [] });
  d.ih.push({ id: 'i1', status: 'gemeldet', dringlichkeit: 'normal', angebote: [] });
  d.kaution.push({ id: 'k1', mieterId: 'm1', status: 'offen', einbehalte: [] });
  return d;
}
let d = testData();
let res = C.applyAction(d, 'opos', 'o1', 'erinnerung', { heute: '2026-09-28' });
eq(res.frist, '2026-10-08', 'Erinnerung Frist +10');
eq(d.wv.map(w => [w.datum, w.status]), [['2026-10-12', 'offen']], 'WV = Frist + 3 Puffer → Werktag (So → Mo)');
eq(d.opos[0].stufe, 'erinnerung', 'Stufe fortgeschrieben');
res = C.applyAction(d, 'opos', 'o1', 'mahnung1', { heute: '2026-10-12' });
eq(d.wv.filter(w => w.status === 'offen').length, 1, 'Mahnung schließt vorherige WV');
eq(d.wv[0].status, 'erledigt', 'alte WV erledigt');
d.wv.push({ id: 'man', bereich: 'opos', refId: 'o1', datum: '2026-10-20', aufgabe: 'manuell', status: 'offen', erstelltDurch: 'manuell' });
C.applyAction(d, 'opos', 'o1', 'kuendigung', { heute: '2026-11-02' });
const offen = C.offeneWV(d, 'opos', 'o1');
eq(offen.map(w => [w.datum, w.aufgabe.slice(0, 14)]), [['2026-11-04', 'Original der K'], ['2026-11-16', 'Räumung/Zahlun'], ['2026-10-20', 'manuell']].sort((a, b) => a[0].localeCompare(b[0])), 'Kündigung: Frist + „Original per Post“ +2, manuelle WV bleibt');
C.applyAction(d, 'opos', 'o1', 'anwalt', { heute: '2026-11-20' });
eq(C.offeneWV(d, 'opos', 'o1').filter(w => w.erstelltDurch === 'auto').map(w => w.datum), ['2026-12-04'], 'Anwalt +14');
d = testData();
C.applyAction(d, 'opos', 'o1', 'raten', { heute: '2026-09-28', raten: C.ratenplan(900, 3, '2026-10-15') });
eq(C.offeneWV(d, 'opos', 'o1').map(w => w.datum), ['2026-10-19', '2026-11-18', '2026-12-18'], 'je Rate Fälligkeit + Puffer (Werktag)');

d = testData();
C.applyAction(d, 'ih', 'i1', 'gemeldet', { heute: '2026-10-02', dringlichkeit: 'notfall' });
eq(C.offeneWV(d, 'ih', 'i1')[0].datum, '2026-10-02', 'IH Notfall: heute');
d = testData();
C.applyAction(d, 'ih', 'i1', 'gemeldet', { heute: '2026-10-02', dringlichkeit: 'hoch' });
eq(C.offeneWV(d, 'ih', 'i1')[0].datum, '2026-10-05', 'IH hoch: +1 Werktag (Fr → Mo, 03.10. Feiertag)');
d = testData();
C.applyAction(d, 'ih', 'i1', 'gemeldet', { heute: '2026-10-01', dringlichkeit: 'normal' });
eq(C.offeneWV(d, 'ih', 'i1')[0].datum, '2026-10-06', 'IH normal: +3 Werktage');
C.applyAction(d, 'ih', 'i1', 'angefragt', { heute: '2026-10-06' });
eq(C.offeneWV(d, 'ih', 'i1').map(w => [w.datum, w.aufgabe]), [['2026-10-12', 'Angebot eingegangen?']], 'Angefragt +5, schließt „Handwerker anfragen“');
C.applyAction(d, 'ih', 'i1', 'beauftragt', { heute: '2026-10-12', termin: '2026-10-22' });
eq(C.offeneWV(d, 'ih', 'i1').map(w => w.datum), ['2026-10-23'], 'Beauftragt: Termin +1');
eq(d.ih[0].status, 'beauftragt', 'IH-Status fortgeschrieben');
C.applyAction(d, 'ih', 'i1', 'erledigt', { heute: '2026-10-23' });
eq(C.offeneWV(d, 'ih', 'i1').map(w => w.datum), ['2026-11-06'], 'Erledigt +14 Rechnung');
C.applyAction(d, 'ih', 'i1', 'abgerechnet', { heute: '2026-11-06' });
eq(C.offeneWV(d, 'ih', 'i1').length, 0, 'Abgerechnet schließt alles');

d = testData();
C.applyAction(d, 'kaution', 'k1', 'auszug', { heute: '2026-09-30', auszugAm: '2026-09-30', uebergabeAm: '2026-09-30' });
C.applyAction(d, 'kaution', 'k1', 'uebergabe', { heute: '2026-09-30', uebergabeAm: '2026-09-30' });
eq(C.offeneWV(d, 'kaution', 'k1').map(w => [w.datum, w.aufgabe.slice(0, 20)]),
  [['2026-10-01', 'Übergabeprotokoll pr'], ['2026-12-30', 'Kautionsabrechnung e'], ['2027-02-26', 'Ansprüche sichern – ']],
  'Auszug: +1 Protokoll, +3 Mon. Abrechnung, +5 Mon. Verjährung (So 28.02. → vorgezogen auf Fr)');
eq(d.kaution[0].status, 'in_pruefung', 'Kaution in Prüfung');
C.applyAction(d, 'kaution', 'k1', 'abrechnung', { heute: '2026-12-30' });
const kOffen = C.offeneWV(d, 'kaution', 'k1').map(w => w.aufgabe.slice(0, 20));
eq(kOffen.includes('Kautionsabrechnung e'), false, 'Abrechnung schließt „Abrechnung erstellen“');
eq(kOffen.includes('Ansprüche sichern – '), true, 'Verjährungs-WV bleibt offen');
eq(d.kaution[0].status, 'abgerechnet', 'Status abgerechnet');
eq(d.verlauf.length, 3, 'Verlauf je Aktion');

d = testData();
const w = C.createWV(d, 'opos', 'o1', '2026-10-03', 'x', { erstelltDurch: 'manuell' });
eq(w.datum, '2026-10-05', 'createWV nie auf Feiertag/Wochenende');
C.snoozeWV(d, w.id, 3, '2026-09-28');
eq(w.datum, '2026-10-08', 'snooze +3 ab WV-Datum');
C.snoozeWV(d, w.id, 7, '2026-12-01');
eq(w.datum, '2026-12-08', 'snooze überfällig: ab heute');

section('Vorlagen');
const html = C.vorlageZuHTML('Hallo {{m.name}},\n\n{{postenTabelle}}\n\nSumme **{{s}}** <x>\nZeile {{fehlt}}', { m: { name: 'A & B' }, postenTabelle: '<table>\n<tr><td>1</td></tr></table>', s: '1,00 €' });
eq(html, '<p>Hallo A &amp; B,</p>\n<table><tr><td>1</td></tr></table>\n<p>Summe <b>1,00 €</b> &lt;x&gt;<br>Zeile <mark>{{fehlt}}</mark></p>', 'vorlageZuHTML');
eq(C.vorlageZuText('Summe {{s}}\n{{postenTabelle}}', { s: 'x', postenListe: '- a' }), 'Summe x\n- a', 'vorlageZuText mit Liste');

section('Import');
const rows = C.parseCSV('﻿Mieternr;Name;Objekt;Buchungstext;Fällig;Offen\n1001;"Müller, Anna";Haus A;Miete 08/2026;03.08.2026;"800,00"\n1001;"Müller, Anna";Haus A;NK-Nachzahlung;15.08.2026;120,50\n1002;Kurt Schulz;Haus A;Miete;03.09.2026;0\n');
eq(rows.length, 4, 'CSV Zeilen');
const map = C.guessMapping(rows[0]);
eq(map, { mietnr: 0, name: 1, objekt: 2, bez: 3, faellig: 4, offen: 5 }, 'Spalten-Mapping erraten');
d = C.emptyData();
let st = C.importOPOS(d, rows.slice(1), map, '2026-09-28');
eq([st.mieterNeu, st.faelleNeu, st.postenNeu, st.uebersprungen], [1, 1, 2, 1], 'Import Statistik');
eq(d.mieter[0].vorname + ' ' + d.mieter[0].nachname, 'Anna Müller', 'Name „Nachname, Vorname“');
eq(d.opos[0].posten.map(x => x.typ), ['miete', 'sonstig'], 'Typ aus Buchungstext');
st = C.importOPOS(d, rows.slice(1), map, '2026-09-28');
eq([st.postenNeu, st.postenAktualisiert], [0, 0], 'Import idempotent');

section('Migration Prototyp');
const alt = { settings: { firma: 'HV Alt', email: 'a@b.de' }, faelle: [{ name: 'Erika Mustermann', objekt: 'Haus B', miete: '750,00', stufe: '1. Mahnung', wv: '2026-10-01', posten: [{ bezeichnung: 'Miete 09/2026', datum: '03.09.2026', betrag: '750,00' }], verlauf: [{ datum: '2026-09-10', text: 'Erinnerung raus' }] }] };
const mig = C.normalize(C.migratePrototype(alt));
eq([mig.settings.firma, mig.settings.mail], ['HV Alt', 'a@b.de'], 'Einstellungen übernommen');
eq([mig.mieter[0].vorname, mig.mieter[0].nachname, mig.mieter[0].gesamtmiete], ['Erika', 'Mustermann', 750], 'Mieter übernommen');
eq(mig.opos[0].stufe, 'mahnung1', 'Stufe übernommen');
eq(mig.opos[0].posten[0].offen, 750, 'Posten übernommen');
eq(mig.wv.length, 1, 'WV als eigene Tabelle');
eq(mig.verlauf.length, 1, 'Verlauf übernommen');
eq(C.normalize(null).version, 1, 'normalize leer');

section('E-Mail');
const eml = C.buildEML({ to: 'x@y.de', subject: 'Mahnung Müller', text: 'Hallo', attachments: [{ name: 'Mahnung Müller.pdf', mime: 'application/pdf', base64: 'QUJD' }] });
truthy(eml.startsWith('X-Unsent: 1\r\n'), 'EML X-Unsent');
truthy(eml.includes('filename="Mahnung_Mueller.pdf"'), 'EML Anhang ASCII-Name');
truthy(eml.includes('=?UTF-8?B?'), 'EML Betreff kodiert');

console.log('\n' + ok + ' bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
