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
eq(res.frist, '2026-10-05', 'Erinnerung Frist +7');
eq(d.wv.map(w => [w.datum, w.status]), [['2026-10-06', 'offen']], 'WV = Frist + 1 Tag Puffer');
eq(d.opos[0].stufe, 'erinnerung', 'Stufe fortgeschrieben');
res = C.applyAction(d, 'opos', 'o1', 'mahnung1', { heute: '2026-10-12' });
eq(d.wv.filter(w => w.status === 'offen').length, 1, 'Mahnung schließt vorherige WV');
eq(d.wv[0].status, 'erledigt', 'alte WV erledigt');
d.wv.push({ id: 'man', bereich: 'opos', refId: 'o1', datum: '2026-10-20', aufgabe: 'manuell', status: 'offen', erstelltDurch: 'manuell' });
C.applyAction(d, 'opos', 'o1', 'kuendigung', { heute: '2026-11-02' });
const offen = C.offeneWV(d, 'opos', 'o1');
eq(offen.map(w => [w.datum, w.aufgabe.slice(0, 14)]), [['2026-11-03', 'Original der K'], ['2026-11-16', 'Räumung/Zahlun'], ['2026-10-20', 'manuell']].sort((a, b) => a[0].localeCompare(b[0])), 'Kündigung: Frist + „Original per Post“ +1, manuelle WV bleibt');
C.applyAction(d, 'opos', 'o1', 'anwalt', { heute: '2026-11-20' });
eq(C.offeneWV(d, 'opos', 'o1').filter(w => w.erstelltDurch === 'auto').map(w => w.datum), ['2026-11-27'], 'Anwalt +7');
d = testData();
C.applyAction(d, 'opos', 'o1', 'raten', { heute: '2026-09-28', raten: C.ratenplan(900, 3, '2026-10-15') });
eq(C.offeneWV(d, 'opos', 'o1').map(w => w.datum), ['2026-10-16', '2026-11-16', '2026-12-16'], 'je Rate Fälligkeit + 1 Tag');

d = testData();
C.applyAction(d, 'ih', 'i1', 'gemeldet', { heute: '2026-10-02', dringlichkeit: 'notfall' });
eq(C.offeneWV(d, 'ih', 'i1')[0].datum, '2026-10-02', 'IH Notfall: heute');
d = testData();
C.applyAction(d, 'ih', 'i1', 'gemeldet', { heute: '2026-10-02', dringlichkeit: 'hoch' });
eq(C.offeneWV(d, 'ih', 'i1')[0].datum, '2026-10-02', 'IH hoch: sofort');
d = testData();
C.applyAction(d, 'ih', 'i1', 'gemeldet', { heute: '2026-10-01', dringlichkeit: 'normal' });
eq(C.offeneWV(d, 'ih', 'i1')[0].datum, '2026-10-02', 'IH normal: +1 Werktag');
C.applyAction(d, 'ih', 'i1', 'angefragt', { heute: '2026-10-06' });
eq(C.offeneWV(d, 'ih', 'i1').map(w => [w.datum, w.aufgabe]), [['2026-10-09', 'Angebot eingegangen?']], 'Angefragt +3, schließt „Handwerker anfragen“');
C.applyAction(d, 'ih', 'i1', 'beauftragt', { heute: '2026-10-12', termin: '2026-10-22' });
eq(C.offeneWV(d, 'ih', 'i1').map(w => w.datum), ['2026-10-23'], 'Beauftragt: Termin +1');
eq(d.ih[0].status, 'beauftragt', 'IH-Status fortgeschrieben');
C.applyAction(d, 'ih', 'i1', 'erledigt', { heute: '2026-10-23' });
eq(C.offeneWV(d, 'ih', 'i1').map(w => w.datum), ['2026-10-30'], 'Erledigt +7 Rechnung');
C.applyAction(d, 'ih', 'i1', 'abgerechnet', { heute: '2026-11-06' });
eq(C.offeneWV(d, 'ih', 'i1').length, 0, 'Abgerechnet schließt alles');

d = testData();
C.applyAction(d, 'kaution', 'k1', 'auszug', { heute: '2026-09-30', auszugAm: '2026-09-30', uebergabeAm: '2026-09-30' });
C.applyAction(d, 'kaution', 'k1', 'uebergabe', { heute: '2026-09-30', uebergabeAm: '2026-09-30' });
eq(C.offeneWV(d, 'kaution', 'k1').map(w => [w.datum, w.aufgabe.slice(0, 20)]),
  [['2026-10-01', 'Übergabeprotokoll pr'], ['2026-10-14', 'Kaution: Schäden/Kos'], ['2026-11-30', 'Kautionsabrechnung e'], ['2027-02-26', 'Ansprüche sichern – ']],
  'Auszug: +1 Protokoll, +14 Kosten ermitteln, +2 Mon. Abrechnung, +5 Mon. Verjährung (So 28.02. → vorgezogen auf Fr)');
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
eq([C.plusEinheit('2026-10-01', 2, 'werktage'), C.plusEinheit('2026-10-01', 2, 'wochen'), C.plusEinheit('2026-01-31', 1, 'monate'), C.plusEinheit('2026-10-01', 4)],
  ['2026-10-05', '2026-10-15', '2026-02-28', '2026-10-05'], 'plusEinheit Werktage/Wochen/Monate/Tage');
d = testData(); const w2 = C.createWV(d, 'opos', 'o1', '2026-10-01', 'y');
C.snoozeWV(d, w2.id, 1, '2026-09-28', 'werktage'); eq(w2.datum, '2026-10-02', 'snooze +1 Werktag');
C.snoozeWV(d, w2.id, 1, '2026-09-28'); eq(w2.datum, '2026-10-05', 'snooze +1 Tag → Sa 03.10. Feiertag → Mo');
C.setWVDatum(d, w2.id, '2026-12-25'); eq(w2.datum, '2026-12-28', 'festes Datum → Werktag');
eq(C.normalize({ settings: { ui: { wvButtons: [2, 5] } } }).settings.ui.tabs.length, 6, 'UI-Einstellungen mit Standard ergänzt');

section('E-Mail-Mahnung');
const mp = [p('2026-08-03', 800), p('2026-09-03', 800), p('2026-07-03', 0), p('2026-06-01', 50, 'sonstig')];
eq(C.monateText(mp), 'August und September 2026', 'Monatstext zwei Monate');
eq(C.monateText([p('2025-12-03', 1), p('2026-01-03', 1), p('2026-02-03', 1)]), 'Dezember 2025, Januar 2026 und Februar 2026', 'Monatstext über Jahreswechsel');
eq(C.monateText([p('2026-09-03', 800)]), 'September 2026', 'Monatstext ein Monat');
d = testData();
C.applyAction(d, 'opos', 'o1', 'emailMahnung', { heute: '2026-09-28', abmahnung: true });
eq([d.opos[0].stufe, d.opos[0].abmahnungAm, C.offeneWV(d, 'opos', 'o1').map(w => w.datum)], ['mahnung1', '2026-09-28', ['2026-10-06']], 'E-Mail-Mahnung: Frist +5 (03.10. Feiertag → 05.10.), WV +1');
truthy(/Sauren/.test(C.normalize({}).settings.email.signatur), 'Signatur-Standard');

section('Telefonliste (PDF) → Adressbuch');
const T = (x, y, s) => ({ x, y, s });
const seite1 = [T(38, 830, 'Telefonliste gültig ab: 28.09.2026'), T(42, 811, 'Objekt Nr.'), T(89, 811, '120500'), T(123, 811, 'BEISPIELWEG 5'), T(70, 797, 'DE'), T(93, 797, '52074'), T(123, 797, 'Aachen'),
  T(39, 780, 'Herr'), T(259, 780, 'PFkt:'), T(292, 780, '007'), T(332, 780, 'Mieter'),
  T(39, 767, 'Paul Probe'), T(259, 767, 'Whg.:'), T(292, 767, '0003'), T(332, 767, '1. OG rechts'),
  T(259, 755, 'AdrNr'), T(293, 755, '130001'), T(332, 755, 'PROBE, PAUL'),
  T(39, 729, 'Beispielweg 5'), T(39, 715, '52074'), T(80, 715, 'Aachen'), T(196, 703, 'paul@example.org'), T(196, 690, 'p.probe@example.org'),
  T(259, 670, 'PFkt:'), T(292, 670, '007'), T(332, 670, 'Mieter'),
  T(39, 657, 'Anna Muster'), T(259, 657, 'Whg.:'), T(292, 657, '0004'), T(332, 657, 'DG'),
  T(39, 645, 'Ben Muster'), T(259, 645, 'AdrNr'), T(293, 645, '130002'), T(332, 645, 'MUSTER, ANNA BEN'),
  T(77, 16, 'Druck'), T(132, 16, '28.09.2026'), T(515, 16, '1')];
const seite2 = [T(38, 830, 'Telefonliste gültig ab: 28.09.2026'), T(42, 811, 'Objekt Nr.'), T(89, 811, '120500'), T(123, 811, 'BEISPIELWEG 5'), T(70, 797, 'DE'), T(93, 797, '52074'), T(123, 797, 'Aachen'),
  T(39, 782, 'Neuer Weg 1'), T(39, 768, 'DE 50129 Bergheim'), T(196, 755, 'muster@example.org')];
const tl = C.parseTelefonliste([seite1, seite2]);
eq([tl.stand, tl.objekte.length, tl.objekte[0].plzort, tl.personen.length], ['2026-09-28', 1, '52074 Aachen', 2], 'Telefonliste: Stand, Objekt (Seitenkopf wiederholt), Personen');
eq(tl.personen[0], { objektNr: '120500', pfkt: '007', whg: '0003', adrNr: '130001', rolle: 'Mieter', lage: '1. OG rechts', importName: 'PROBE, PAUL', anrede: 'Herr', name: 'Paul Probe', strasse: 'Beispielweg 5', plzort: '52074 Aachen', emails: ['paul@example.org', 'p.probe@example.org'] }, 'Person mit zwei E-Mails, PLZ/Ort getrennt');
eq([tl.personen[1].name, tl.personen[1].strasse, tl.personen[1].plzort, tl.personen[1].emails], ['Anna Muster und Ben Muster', 'Neuer Weg 1', '50129 Bergheim', ['muster@example.org']], 'Block über Seitenumbruch, zwei Namen, Länderkürzel');
d = C.emptyData(); let sT;
d.mieter.push({ id: 'mm', importName: 'PROBE, PAUL', nachname: 'Probe', vorname: 'Paul', whg: 'Whg. 3', objektId: 'pl', email: '' }); d.objekte.push({ id: 'pl', bezeichnung: 'Import OPOS-Liste' });
d.mieter.push({ id: 'm2', importName: 'MUSTER, ANNA BEN', nachname: 'Muster', vorname: 'Anna', objektId: 'pl', email: 'eigene@example.org', emailQuelle: 'manuell' });
sT = C.importTelefonliste(d, tl, { heute: '2026-09-28' });
eq([sT.neu, sT.mieterVerknuepft, sT.emailsNeu, sT.objektZugeordnet], [2, 2, 1, 2], 'Import: verknüpft, E-Mail übernommen, Objekt zugeordnet');
eq([d.mieter[0].email, d.mieter[0].adrNr, d.mieter[0].anrede, d.mieter[1].email], ['paul@example.org; p.probe@example.org', '130001', 'Herr', 'eigene@example.org'], 'E-Mails aus Liste, manuelle E-Mail bleibt');
eq(d.objekte.map(o => o.bezeichnung), ['Beispielweg 5'], 'Platzhalter-Objekt aufgeräumt, echtes Objekt angelegt');
tl.personen[0].emails = ['neu@example.org']; tl.personen.pop();
sT = C.importTelefonliste(d, tl, { heute: '2026-10-28' });
eq([sT.geaendert, sT.entfernt, d.mieter[0].email], [1, 1, 'neu@example.org'], 'Folgemonat: Änderung erkannt, fehlender Eintrag markiert, E-Mail aktualisiert');
eq(C.emailsZuMieter(d, { importName: 'PROBE, PAUL' }), 'neu@example.org', 'E-Mail-Suche über Adressbuch');

section('OPOS-Liste (PDF)');
const O = (x, y, s, w) => ({ x, y, s, w: w || s.length * 4.5 });
const op1 = [O(38, 578, 'Offene Postenliste (OPOS F‰lligkeit zum : 30.09.26)'), O(40, 565, 'Objekt-Nr. 19400 BEISPIELSTRA', 190), O(230, 565, 'flE 1, 52062, Aachen'), O(430, 565, 'Auswertung zum 30.09.2026'),
  O(42, 546, 'Debitor'), O(87, 546, '700100 PROBE, PAUL'), O(297, 546, 'Whg.'), O(357, 546, '8'), O(369, 546, 'PFkt.'), O(415, 546, '007 Mieter'), O(666, 546, '01.12.25 -'),
  O(297, 530, 'Lage'), O(327, 529, 'EG links'),
  O(64, 468, '03.08.26'), O(141, 468, '9'), O(153, 468, '820'), O(187, 468, 'Grundmiete 08/26 |PROBE'), O(424, 468, '800,00'), O(573, 468, '03.08.26'), O(624, 468, '58'),
  O(46, 455, '1'), O(64, 455, '14.08.26'), O(132, 455, '507'), O(153, 455, '820'), O(187, 455, 'Mahnl.08/26 AA 802-999/Mahngeb'), O(433, 455, '5,00'), O(573, 455, '16.08.26'), O(624, 455, '45'),
  O(64, 443, '02.09.26'), O(137, 443, '19'), O(153, 443, '822'), O(187, 443, 'Diff. Garagen-Erl', 76), O(263, 443, 'ˆse'), O(424, 443, '60,00'), O(573, 443, '01.09.26'), O(628, 443, '29'),
  O(76, 20, 'Druckdatum :'), O(132, 20, '11.09.2026')];
const op2 = [O(38, 578, 'Offene Postenliste'), O(40, 565, 'Objekt-Nr. 19400 BEISPIELSTRA', 190), O(230, 565, 'flE 1, 52062, Aachen'),
  O(42, 546, 'Debitor'), O(87, 546, '700100 PROBE, PAUL'), O(297, 546, 'Whg.'), O(357, 546, '8'), O(369, 546, 'PFkt.'), O(415, 546, '007 Mieter'), O(666, 546, '01.12.25 -'),
  O(64, 480, '05.09.26'), O(141, 480, '5'), O(153, 480, '820'), O(187, 480, 'Zahlung'), O(501, 480, '300,00'), O(573, 480, '05.09.26'),
  O(310, 351, 'Summe PKto:'), O(429, 350, '865,00'), O(496, 350, '300,00'), O(568, 350, '565,00 S'), O(692, 350, '5,00'), O(746, 350, '565,00 S')];
const opl = C.parseOposPdf([op1, op2]);
eq([opl.stand, opl.druck, opl.konten.length], ['2026-09-30', '2026-09-11', 1], 'OPOS-PDF: Stand, Druckdatum, Konto über Seitenumbruch');
const kk = opl.konten[0];
eq([kk.objektNr, kk.objektStrasse, kk.objektPlzOrt, kk.debitor, kk.name, kk.whg, kk.lage, kk.von], ['19400', 'BEISPIELSTRAßE 1', '52062 Aachen', '700100', 'PROBE, PAUL', '8', 'EG links', '2025-12-01'], 'Kopf, Debitor, Umlaute/ß repariert');
eq(kk.posten.map(p => [p.text, p.typ, p.betrag, p.faellig, p.mst]), [['Grundmiete 08/26', 'miete', 800, '2026-08-03', 0], ['Mahnl.08/26 AA 802-999/Mahngeb', 'sonstig', 5, '2026-08-16', 1], ['Diff. Garagen-Erlöse', 'miete', 60, '2026-09-01', 0], ['Zahlung', 'gutschrift', -300, '2026-09-05', 0]], 'Posten mit Typ, Betrag, Mahnstufe');
eq([kk.saldo, kk.summe.saldo, kk.kontrolle], [565, 565, true], 'Kontrolle gegen „Summe PKto“');
eq(C.nettoPosten(kk.posten.map(p => ({ ...p, offen: p.betrag, bez: p.text }))).map(p => [p.bez, p.offen]), [['Grundmiete 08/26', 500], ['Mahnl.08/26 AA 802-999/Mahngeb', 5], ['Diff. Garagen-Erlöse', 60]], 'Gutschrift mit ältesten Posten verrechnet');
d = C.emptyData(); let sO;
d.mieter.push({ id: 'mx', importName: 'PROBE, PAUL', nachname: 'Probe', vorname: 'Paul', mietbeginn: '2025-12-01', objektId: '' });
d.opos.push({ id: 'fx', mieterId: 'mx', stufe: 'mahnung1', posten: [{ id: 's', saldo: true, saldoListe: 900, offen: 900, betrag: 900, bez: 'Saldo' }, { id: 'man', bez: 'Schlüssel', offen: 20, betrag: 20, typ: 'sonstig' }], raten: [] });
sO = C.importOposPdf(d, opl, { heute: '2026-09-28' });
eq([sO.faelleNeu, sO.aktualisiert, sO.posten, d.mieter[0].mietnr, d.objekte[0].nr], [0, 1, 4, '700100', '19400'], 'Import: bestehender Fall, Debitor-Nr übernommen, Objekt angelegt');
eq([d.opos[0].posten.length, C.offenSumme(d.opos[0].posten)], [5, 585], 'Saldo-Posten ersetzt, manueller Posten bleibt');
sO = C.importOposPdf(d, opl, { heute: '2026-10-28' });
eq([sO.aktualisiert, sO.unveraendert, d.opos[0].posten.length], [0, 1, 5], 'erneutes Einlesen: keine Doppelungen');
eq(C.monateText(d.opos[0].posten), 'August und September 2026', 'Mietmonate nach Verrechnung');
eq([d.mieter[0].gesamtmiete, d.mieter[0].mieteGeschaetzt], [800, true], 'Monatsmiete aus vollen Mietposten geschätzt (ohne „Diff.“)');

section('Instandhaltungsliste (Excel)');
eq([C.kwMontag(40, 2026), C.kwMontag(1, 2027)], ['2026-09-28', '2027-01-04'], 'Montag der Kalenderwoche');
eq([C.parseTermin('KW 41', '2026-09-28').datum, C.parseTermin('23.09.2026 | 24.09', '2026-09-01').datum, C.parseTermin('andere Angebote einholen', '2026-09-28')], ['2026-10-05', '2026-09-23', { datum: '', text: 'andere Angebote einholen' }], 'Termin: KW, Datum mit Zusatz, Freitext');
eq([C.parseWV('21.Sep.', '2026-09-10'), C.parseWV('17.09. Alimi', '2026-09-10')], ['2026-09-21', '2026-09-17'], 'WV mit Monatsname und Zusatztext');
const ihRows = [[null, 'KW12', 'Objekt', 'SB', 'Aufgabe', 'benötigtes Material ', 'Termin', 'Mieter + Tel Nr.', 'nächster Schritt', 'WV', 'Besonderheiten'],
  [null, null, 'Musterweg 12, 2.OG links', 'Cem', 'Rollos instandsetzen\nMotor prüfen', 'Motor', new Date(2026, 9, 1), 'A+', 'Termin bestätigen', '30.09. Firma X', 'Schlüssel beim HM'],
  [null, null, 'BR51 Büroeinheit', 'Fais', 'Büroeinheit herstellen', null, 'KW 41', 'B', null, 'anrufen', null],
  [null, null, null, null, null, null, null, null, null, null, null]];
const ihE = C.parseIhListe(ihRows, '2026-09-28', [226, 227, 228, 229]);
eq(ihE.map(e => [e.zeile, e.objektText, e.sb, e.titel, e.prio, e.schritt, e.termin.datum, e.wv, e.wvText]),
  [[227, 'Musterweg 12, 2.OG links', 'Cem', 'Rollos instandsetzen', 'A+', 'Termin bestätigen', '2026-10-01', '2026-09-30', 'Firma X'], [228, 'BR51 Büroeinheit', 'Fais', 'Büroeinheit herstellen', 'B', '', '2026-10-05', '', 'anrufen']], 'Liste: Spalten, Prio aus „Mieter“-Spalte, Termin, WV mit Text');
d = C.emptyData(); d.objekte.push({ id: 'ob1', bezeichnung: 'Musterweg 10 - 14', strasse: 'Musterweg 10 - 14' }, { id: 'ob2', bezeichnung: 'Jakobstraße 25 A/B', strasse: 'Jakobstraße 25 A/B' });
eq([C.objektFinden(d, 'Musterweg 12, 2.OG links').id, C.objektFinden(d, 'Jakobstraße 25a, Keller').id, C.objektFinden(d, 'Musterweg 30'), C.objektFinden(d, 'BR51 Büroeinheit')], ['ob1', 'ob2', null, null], 'Objekt über Straße + Hausnummer(nbereich)');
let sI = C.importIhListe(d, ihE, { stand: '2026-09-28', heute: '2026-09-28', blatt: 'TO DO' });
eq([sI.neu, sI.wvNeu, sI.ohneObjekt, d.ih[0].objektId, d.ih[0].status, d.ih[0].dringlichkeit], [2, 4, 1, 'ob1', 'beauftragt', 'hoch'], 'Import: Aufgaben, WV + Termin-WV, Objekt, Status, Prio → Dringlichkeit');
sI = C.importIhListe(d, ihE, { stand: '2026-09-29', heute: '2026-09-29' });
eq([sI.neu, sI.unveraendert, sI.wvNeu], [0, 2, 0], 'erneut einlesen: keine Doppelungen');
const ihE2 = C.parseIhListe([ihRows[0], ihRows[1].map((c, i) => (i === 8 ? 'Firma anrufen' : c))], '2026-09-28');
sI = C.importIhListe(d, ihE2, { stand: '2026-10-01', heute: '2026-10-01' });
eq([sI.geaendert, sI.erledigt, d.ih[0].naechsterSchritt, d.ih[1].status], [1, 1, 'Firma anrufen', 'erledigt'], 'Änderung übernommen, ausgeblendete Aufgabe erledigt');
eq(C.offeneWV(d, 'ih', d.ih[1].id).length, 0, 'WV der erledigten Aufgabe geschlossen');

section('In Excel-Liste zurückschreiben');
const sx = '<worksheet><sheetData><row r="1"><c r="C1" t="s"><v>0</v></c><c r="E1" t="s"><v>1</v></c><c r="J1" t="s"><v>2</v></c></row>' +
  '<row r="2" spans="1:11"><c r="C2" s="5" t="s"><v>3</v></c><c r="E2" s="5" t="s"><v>4</v></c><c r="I2" s="6" t="s"><v>5</v></c><c r="J2" s="9"><v>46282</v></c></row>' +
  '<row r="3"><c r="C3" t="s"><v>6</v></c><c r="E3" t="s"><v>7</v></c><c r="K3" s="2"/></row></sheetData></worksheet>';
const sstx = C.sstLesen('<sst><si><t>Objekt</t></si><si><t>Aufgabe</t></si><si><t>WV</t></si><si><t>Musterweg 12</t></si><si><t>Rollos &amp; Motor</t></si><si><t>Angebot holen</t></si><si><t>BR51</t></si><si><r><t>Büro</t></r><r><t>einheit</t></r></si></sst>');
eq(sstx[4] + '|' + sstx[7], 'Rollos & Motor|Büroeinheit', 'Shared Strings inkl. Rich Text');
const stx = '<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="10"><xf numFmtId="0"/><xf numFmtId="0"/><xf numFmtId="0"/><xf numFmtId="0"/><xf numFmtId="0"/><xf numFmtId="0"/><xf numFmtId="0"/><xf numFmtId="0"/><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>';
eq(C.datumsStil(sx, stx, 'J'), '9', 'Datumsstil der WV-Spalte gefunden');
const sp = { objekt: 2, aufgabe: 4, wv: 9, schritt: 8 };
const fa = { listenKey: C.normName('Musterweg 12').slice(0, 30) + '|' + C.normName('Rollos & Motor').slice(0, 40), listenZeile: 5, listenSpalten: sp, listeWVDatum: C.parseDatum('46282'), listeSchritt: 'Angebot holen' };
const fb = { listenKey: 'BR51|' + C.normName('Büroeinheit'), listenZeile: 3, listenSpalten: sp, listeWVDatum: '', listeSchritt: '', wvText: 'anrufen' };
eq([C.listenZeileFinden(sx, sstx, fa), C.listenZeileFinden(sx, sstx, fb)], [2, 3], 'Zeile gefunden (auch wenn gemerkte Zeile verrutscht ist)');
const rx = C.excelBlattAktualisieren(sx, sstx, stx, [{ f: fa, wv: '2026-10-05', schritt: 'Firma X anrufen' }, { f: fb, wv: '2026-10-07', schritt: null }]);
eq([rx.ok.length, rx.fehlt.length, rx.konflikt.length], [2, 0, 0], 'zwei Aufgaben geschrieben');
eq(C.zeileLesen(rx.sheet, 2, sstx), { 2: 'Musterweg 12', 4: 'Rollos & Motor', 8: 'Firma X anrufen', 9: String(C.datumSerial('2026-10-05')) }, 'Zeile 2: Datum als Excel-Datum, Schritt als Text');
truthy(rx.sheet.includes('<c r="J2" s="9"><v>46300</v></c>') && rx.sheet.includes('<c r="I2" s="6" t="inlineStr">'), 'Zellstile bleiben erhalten');
eq(C.zeileLesen(rx.sheet, 3, sstx)[9], '07.10.2026 anrufen', 'Zusatztext bleibt: „07.10.2026 anrufen“, Zelle eingefügt');
truthy(/<c r="E3"[^>]*>.*<\/c><c r="J3".*<c r="K3"/.test(rx.sheet), 'neue Zelle in richtiger Spaltenreihenfolge');
const rk = C.excelBlattAktualisieren(C.zelleSetzen(sx, 'J2', { text: '01.12.' }), sstx, stx, [{ f: fa, wv: '2026-10-05', schritt: null }]);
eq([rk.ok.length, rk.konflikt.length, rk.konflikt[0].inExcel], [0, 1, '01.12.'], 'in Excel von Hand geändert → nicht überschrieben');

section('Kürzerer WV-Takt (Umstellung alter Daten)');
const altT = C.emptyData(); altT.meta.takt = 1;
Object.assign(altT.settings.fristen, { erinnerung: 10, anwalt: 14, angebot: 21 }); altT.settings.puffer = 3; altT.settings.ui.neuWvTage = 7;
altT.wv.push({ id: 'a', bereich: 'opos', refId: 'x', datum: '2026-10-12', aufgabe: 'Zahlungseingang prüfen (Zahlungserinnerung, Frist 08.10.2026)', status: 'offen', erstelltDurch: 'auto', regel: 'opos:erinnerung', erstelltAm: '2026-09-28' },
  { id: 'b', bereich: 'opos', refId: 'x', datum: '2026-10-12', aufgabe: 'Sachstand beim Anwalt erfragen', status: 'offen', erstelltDurch: 'auto', regel: 'opos:anwalt', erstelltAm: '2026-09-28' },
  { id: 'c', bereich: 'opos', refId: 'x', datum: '2026-10-01', aufgabe: 'manuell', status: 'offen', erstelltDurch: 'manuell', erstelltAm: '2026-09-28' });
const nV = C.taktUmstellen(altT, '2026-09-28');
eq([altT.settings.fristen.erinnerung, altT.settings.fristen.anwalt, altT.settings.fristen.angebot, altT.settings.puffer, altT.settings.ui.neuWvTage], [7, 7, 21, 1, 2], 'Standardwerte umgestellt, eigene Werte (21) bleiben');
eq([nV, altT.wv.map(w => w.datum)], [2, ['2026-10-09', '2026-10-05', '2026-10-01']], 'offene Auto-WV vorgezogen (Frist + 1, Anwalt +7), manuelle bleibt');

section('Pflicht: nächster Schritt + WV');
d = testData();
eq(C.geflaggt(d).map(x => [x.bereich, x.ohneSchritt, x.ohneWV]), [['opos', true, true], ['ih', true, true], ['kaution', true, true]], 'neue Vorgänge ohne Schritt/WV sind geflaggt');
C.applyAction(d, 'opos', 'o1', 'erinnerung', { heute: '2026-09-28' });
eq([d.opos[0].naechsterSchritt.slice(0, 26), C.vorgangPruefen(d, 'opos', d.opos[0]).geflaggt], ['Zahlungseingang prüfen (Za', false], 'Aktion setzt nächsten Schritt aus der WV');
const wS = C.schrittSetzen(d, 'kaution', 'k1', 'Bankverbindung anfordern', '2026-10-03', { heute: '2026-09-28' });
eq([wS.datum, d.kaution[0].naechsterSchritt, C.vorgangPruefen(d, 'kaution', d.kaution[0]).geflaggt], ['2026-10-05', 'Bankverbindung anfordern', false], 'Schritt + WV setzen (WV auf Werktag)');
C.schrittSetzen(d, 'kaution', 'k1', 'Abrechnung', '2026-10-10', { erledigeWV: wS.id, heute: '2026-10-01' });
eq([wS.status, C.offeneWV(d, 'kaution', 'k1').length], ['erledigt', 1], 'dabei alte WV erledigt');
d.ih[0].naechsterSchritt = 'Handwerker anrufen';
eq(C.vorgangPruefen(d, 'ih', d.ih[0]), { ohneWV: true, ohneSchritt: false, geflaggt: true }, 'Schritt ohne WV bleibt geflaggt');
C.applyAction(d, 'opos', 'o1', 'erledigt', { heute: '2026-10-02' });
eq([d.opos[0].naechsterSchritt, C.vorgangPruefen(d, 'opos', d.opos[0]).geflaggt], ['', false], 'erledigter Vorgang ist nie geflaggt');
const dm = C.normalize({ settings: {}, opos: [{ id: 'z', mieterId: 'm', stufe: 'neu', posten: [] }], wv: [{ id: 'w', bereich: 'opos', refId: 'z', datum: '2026-10-01', aufgabe: 'Mieter anrufen', status: 'offen', erstelltDurch: 'manuell' }], meta: { takt: 2 } });
eq([dm.opos[0].naechsterSchritt, dm.settings.ui.kacheln[0]], ['Mieter anrufen', 'flag'], 'Umstellung: Schritt aus offener WV, ⚑-Kachel');

section('Excel: Termin und neue Zeilen');
const sx2 = '<worksheet><dimension ref="A1:K3"/><sheetData><row r="1"><c r="C1" t="s"><v>0</v></c><c r="E1" t="s"><v>1</v></c><c r="J1" t="s"><v>2</v></c></row>' +
  '<row r="2"><c r="C2" s="5" t="s"><v>3</v></c><c r="D2" s="7" t="inlineStr"><is><t>Cem</t></is></c><c r="E2" s="5" t="s"><v>4</v></c><c r="G2" s="9"><v>46291</v></c><c r="I2" s="6" t="s"><v>5</v></c><c r="J2" s="9"><v>46282</v></c></row><row r="3" hidden="1"/></sheetData></worksheet>';
const spT = { objekt: 2, sb: 3, aufgabe: 4, termin: 6, schritt: 8, wv: 9 };
const fT = { listenKey: C.ihListenSchluessel('Musterweg 12', 'Rollos & Motor'), listenZeile: 2, listenSpalten: spT, listeWVDatum: C.parseDatum('46282'), listeSchritt: 'Angebot holen', listeTerminDatum: C.parseDatum('46291') };
const rT = C.excelBlattAktualisieren(sx2, sstx, stx, [{ f: fT, wv: null, schritt: null, termin: '2026-10-08' }]);
eq([rT.ok.length, C.zeileLesen(rT.sheet, 2, sstx)[6]], [1, String(C.datumSerial('2026-10-08'))], 'Termin verschoben → Termin-Spalte als Datum');
const neuW = { objekt: 'Beispielweg 5, Keller', sb: 'Cem', aufgabe: 'Kellertür klemmt', schritt: 'Schreiner anrufen', wv: '2026-10-02', termin: '', prio: '' };
const rN = C.excelBlattAktualisieren(sx2, sstx, stx, [{ f: {}, neu: true, blatt: 'x', spalten: spT, werte: neuW }]);
eq([rN.ok[0].zeile, C.zeileLesen(rN.sheet, 4, sstx)], [4, { 2: 'Beispielweg 5, Keller', 3: 'Cem', 4: 'Kellertür klemmt', 8: 'Schreiner anrufen', 9: String(C.datumSerial('2026-10-02')) }], 'neue Zeile am Ende mit allen Werten');
truthy(rN.sheet.includes('<dimension ref="A1:K4"/>') && /<row r="4"><c r="C4" s="5"/.test(rN.sheet) && rN.sheet.includes('<c r="J4" s="9">'), 'Stile übernommen, Bereich erweitert');
const dN = C.emptyData(); dN.ih.push({ id: 'l', quelle: 'ih-liste', listenSpalten: spT, listenBlatt: 'TO DO', status: 'gemeldet' }, { id: 'n', titel: 'Kellertür klemmt', objektText: 'Keller', status: 'gemeldet', sb: 'Cem', naechsterSchritt: 'Schreiner anrufen' });
C.createWV(dN, 'ih', 'n', '2026-10-02', 'Schreiner anrufen', { erstelltDurch: 'manuell' });
const aN = C.excelAenderungen(dN);
eq(aN.map(a => [!!a.neu, a.blatt, a.werte && a.werte.wv]), [[true, 'TO DO', '2026-10-02']], 'im Tool angelegte Aufgabe wird als neue Zeile angeboten');
C.excelGeschrieben([Object.assign(aN[0], { zeile: 377 })]);
eq([dN.ih[1].quelle, dN.ih[1].listenZeile, C.excelAenderungen(dN).length], ['ih-liste', 377, 0], 'danach Listen-Aufgabe, keine offenen Änderungen');

section('Neuer Schritt ersetzt die WV (Excel bekommt die neue WV)');
const dE = C.emptyData();
dE.ih.push({ id: 'e', quelle: 'ih-liste', listenSpalten: { objekt: 2, aufgabe: 4, wv: 9, schritt: 8, termin: 6 }, listenBlatt: 'TO DO', status: 'gemeldet', listeWVDatum: '2026-09-17', listeWVBasis: '2026-09-17', listeSchritt: 'Angebot holen', naechsterSchritt: 'Angebot holen' });
C.createWV(dE, 'ih', 'e', '2026-09-17', 'Angebot holen', { erstelltDurch: 'manuell', regel: 'ih-liste' });
C.createWV(dE, 'ih', 'e', '2026-10-06', 'Termin: …', { erstelltDurch: 'manuell', regel: 'ih-liste-termin' });
C.schrittSetzen(dE, 'ih', 'e', 'Firma Alimi anrufen', '2026-10-01', { heute: '2026-09-29' });
eq(C.offeneWV(dE, 'ih', 'e').map(w => [w.datum, w.regel || '']), [['2026-10-01', ''], ['2026-10-06', 'ih-liste-termin']], 'alte Listen-WV ersetzt, Termin-WV bleibt');
eq(C.excelAenderungen(dE).map(a => [a.wv, a.schritt]), [['2026-10-01', 'Firma Alimi anrufen']], 'Excel bekommt WV und Schritt');
const dK = testData(); C.applyAction(dK, 'kaution', 'k1', 'auszug', { heute: '2026-09-30', uebergabeAm: '2026-09-30' });
C.schrittSetzen(dK, 'kaution', 'k1', 'Bankverbindung anfordern', '2026-10-05', { heute: '2026-09-30' });
truthy(C.offeneWV(dK, 'kaution', 'k1').some(w => /Verjährung/.test(w.aufgabe)), 'Verjährungs-WV wird nie ersetzt');

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

section('Import OPOS-Liste (Salden)');
eq(C.parseMietzeit('01.03.25 - 31.07.26,'), { von: '2025-03-01', bis: '2026-07-31' }, 'Mietzeit von–bis');
eq(C.parseMietzeit('15.12.23 -,'), { von: '2023-12-15', bis: '' }, 'Mietzeit offen');
eq([C.parseSaldo(1234.5), C.parseSaldo('=16752.82-8376.41'), C.parseSaldo('7000 ca.'), C.parseSaldo('1400€ offen'), C.parseSaldo('=1922-255-510')], [1234.5, 8376.41, 7000, 1400, 1157], 'Saldo aus Zahl/Formel/Text');
eq([C.parseWV('01.09', '2026-08-15'), C.parseWV('WV 30.09', '2026-09-01'), C.parseWV('05.01', '2026-12-20'), C.parseWV(2029, '2026-06-30'), C.parseWV('mahnen', '2026-06-30')],
  ['2026-09-01', '2026-09-30', '2027-01-05', '', ''], 'WV-Angaben ohne Jahr');
eq(C.nameAufteilen('MUSTERMANN, ERIKA'), { anrede: '', nachname: 'Mustermann', vorname: 'Erika' }, 'Name „NACHNAME, VORNAME“');
eq(C.nameAufteilen('BEISPIEL BAU GMBH, HERR X').anrede, 'Firma', 'Firma erkannt');
const jsonRows = ['[', '  {', '    "name": "MUSTERMANN, ERIKA BEISPIELHAFTWhg. 7 PFkt. 007 Mieter 01.03.25 -",', '    "saldo_zeile": "Summe PKto: 1.234,50"', '  },',
  '  {', '"name": "MUSTERMANN, ERIKA BEISPIELHAFTWhg. 70 PFkt. 007 Mieter 01.03.25 -",', '"saldo_zeile": "Summe PKto: 100,00"', '},',
  '{', '"name": "PROBE, PAUL Whg. 3 PFkt. 007 Mieter 01.01.20 - 31.05.26",', '"saldo_zeile": "Summe PKto: 50,00"', '}', ']'].map(x => [x]);
eq(C.erkenneFormat(jsonRows).format, 'json', 'Format Rohdaten erkannt');
const je = C.parseJsonBlatt(jsonRows);
eq(je.map(e => [e.name, e.whg, e.pfkt, e.von, e.bis, e.saldo]), [['MUSTERMANN, ERIKA BEISPIELHAFT', 'Whg. 7', '007', '2025-03-01', '', 1234.5], ['MUSTERMANN, ERIKA BEISPIELHAFT', 'Whg. 70', '007', '2025-03-01', '', 100], ['PROBE, PAUL', 'Whg. 3', '007', '2020-01-01', '2026-05-31', 50]], 'Rohdaten zerlegt (Name klebt an „Whg.“)');
const saldoRows = [['Name', 'Datum', 'Saldo', 'WV', null, 'gemahnt?'], ['MUSTERMANN, ERIKA BEISPIELHAFT', '01.03.25 -,', '=1500-165.5', '15.07', 'Rate angeboten', 'ja'], ['PROBE, PAUL', '01.01.20 - 31.05.26,', 50, null, null, null], ['NEU, NINA', '01.02.26 -,', 3, null, null, null]];
const fs0 = C.erkenneFormat(saldoRows); eq([fs0.format, fs0.kopf], ['saldo', 0], 'Format Saldenliste erkannt');
const se = C.parseSaldenBlatt(saldoRows, 0, '2026-06-30');
eq([se[0].saldo, se[0].wv, se[0].notizen], [1334.5, ['2026-07-15'], ['Rate angeboten', 'gemahnt: ja']], 'Saldenliste: Formel, WV, Notizen');
d = C.emptyData();
st = C.importSalden(d, je, { stand: '2026-06-30', heute: '2026-07-01' });
eq([st.mieterNeu, st.faelleNeu, st.objekteNeu], [2, 2, 1], 'Rohdaten: Konten je Mieter zusammengefasst');
const fMu = d.opos.find(f => d.mieter.find(m => m.id === f.mieterId).nachname === 'Mustermann');
eq([C.offenSumme(fMu.posten), d.mieter[0].whg, d.mieter[0].vorname], [1334.5, 'Whg. 7, Whg. 70', 'Erika Beispielhaft'], 'Saldo summiert, Wohnungen gesammelt');
st = C.importSalden(d, se, { stand: '2026-06-30', blatt: 'Juni', heute: '2026-07-01', mindestSaldo: 10 });
eq([st.mieterNeu, st.unveraendert, st.uebersprungen, st.wvNeu], [0, 2, 1, 1], 'Saldenliste erkennt Mieter aus Rohdaten, Kleinstbetrag übersprungen');
eq(fMu.notiz, '[30.06.2026 · Juni] Rate angeboten\n[30.06.2026 · Juni] gemahnt: ja', 'Notizen übernommen');
st = C.importSalden(d, se, { stand: '2026-06-30', blatt: 'Juni', heute: '2026-07-01', mindestSaldo: 10 });
eq([st.wvNeu, fMu.notiz.split('\n').length], [0, 2], 'erneutes Einlesen: keine doppelten WV/Notizen');
const se2 = C.parseSaldenBlatt([saldoRows[0], ['MUSTERMANN, ERIKA BEISPIELHAFT', '01.03.25 -,', 900, null, null, null]], 0, '2026-07-31');
st = C.importSalden(d, se2, { stand: '2026-07-31', heute: '2026-08-01', fehlendeErledigen: true });
eq([st.aktualisiert, st.erledigt, C.offenSumme(fMu.posten)], [1, 1, 900], 'Folgemonat: Saldo aktualisiert, fehlender Fall erledigt');
truthy(d.verlauf.some(v => v.refId === fMu.id && /1\.334,50 € → 900,00 €/.test(v.text)), 'Saldo-Änderung im Verlauf');
fMu.posten.push({ id: 'x', bez: 'Miete 07/2026', faellig: '2026-07-03', typ: 'miete', betrag: 400, offen: 400 }); C.saldoAbgleich(fMu);
eq(C.offenSumme(fMu.posten), 900, 'Einzelposten + Saldo-Posten = Listensaldo');
truthy(/Saldo der OPOS-Liste/.test(C.kuendigungsCheck(fMu.posten, 400).text), 'Kündigungscheck weist auf Saldo ohne Aufschlüsselung hin');
const postenRows = [['Hier die offenen Forderungen aus der OPOS-Liste für Mustermann, Erika (Whg. 7):'], ['Datum', 'Buchungstext', 'Betrag (€)', 'Fälligkeit'], [new Date(2026, 5, 1), 'Diff. Grundmiete', 170, new Date(2026, 5, 1)], [new Date(2026, 0, 1), 'BK-Abrechnung 2025', 80, new Date(2026, 0, 15)]];
const fp = C.erkenneFormat(postenRows); eq([fp.format, fp.kopf], ['posten', 1], 'Format Einzelposten mit Titelzeile');
eq(C.titelMieter(postenRows, 1), { name: 'Mustermann, Erika', whg: 'Whg. 7' }, 'Mieter aus Titelzeile');
eq(C.guessMapping(postenRows[1]), { bez: 1, faellig: 3, betrag: 2 }, 'Fälligkeit vor Datum bevorzugt');

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


section('Excel: Datum behält Zellfarbe');
{
  const styles = '<styleSheet><numFmts count="1"><numFmt numFmtId="165" formatCode="d\\-mmm"/></numFmts><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="165" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>';
  const ctx = { styles, cache: {} };
  eq(C.stilAlsDatum(ctx, '1', '1'), '1', 'Datumszelle behält eigenen Stil');
  const neu = C.stilAlsDatum(ctx, '2', '1');
  eq(neu, '3', 'Textzelle → neuer Stil angehängt');
  truthy(ctx.styles.includes('<xf numFmtId="165" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1"/></cellXfs>'), 'Füllung/Rahmen übernommen, Datumsformat der Spalte');
  truthy(ctx.styles.includes('<cellXfs count="4">'), 'cellXfs count erhöht');
  eq(C.stilAlsDatum(ctx, '2', '1'), '3', 'Stil wird wiederverwendet');
}

console.log('\n' + ok + ' bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
