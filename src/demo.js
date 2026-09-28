/* ============================================================
 * Demo-Daten (fiktiv) – „Demo laden“ in den Einstellungen
 * ============================================================ */
(function (root) {
  'use strict';
  const C = root.Core, App = root.App;

  App.demoDaten = function () {
    const d = C.emptyData(); const t = C.today();
    const ago = n => C.addDays(t, -n);
    const monat = n => C.addMonths(t.slice(0, 8) + '01', -n);
    const faellig = n => C.addWerktage(C.addDays(monat(n), -1), 3, false);
    d.meta.lastBackup = null;
    const obj = [
      { id: 'o1', bezeichnung: 'Musterweg 12', strasse: 'Musterweg 12', plzort: '52062 Aachen', eigentuemer: 'Erbengemeinschaft Beispiel', iban: '' },
      { id: 'o2', bezeichnung: 'Beispielstraße 5', strasse: 'Beispielstraße 5', plzort: '52064 Aachen', eigentuemer: 'Probe Immobilien GbR', iban: '' },
      { id: 'o3', bezeichnung: 'Am Testhang 3', strasse: 'Am Testhang 3', plzort: '52066 Aachen', eigentuemer: 'WEG Am Testhang 3', iban: '' }
    ];
    d.objekte = obj;
    const M = (id, objektId, whg, anrede, vorname, nachname, miete, beginn, extra = {}) => Object.assign({
      id, objektId, whg, anrede, vorname, nachname, anschrift: '', email: nachname.toLowerCase().replace(/[^a-z]/g, '') + '@example.org', tel: '0241 99' + id.slice(1).padStart(4, '0'),
      mietnr: '10' + id.slice(1).padStart(3, '0'), gesamtmiete: miete, mietbeginn: beginn, mietende: '', kaution: Math.round(miete * 2.4 / 10) * 10
    }, extra);
    d.mieter = [
      M('m1', 'o1', 'EG links', 'Frau', 'Anna', 'Beispiel', 780, '2019-04-01'),
      M('m2', 'o1', 'EG rechts', 'Herr', 'Bernd', 'Probe', 695, '2021-08-01'),
      M('m3', 'o1', '1. OG links', 'Eheleute', 'Clara und Dirk', 'Test', 920, '2012-01-01'),
      M('m4', 'o1', '1. OG rechts', 'Frau', 'Elif', 'Muster', 640, '2023-03-01'),
      M('m5', 'o2', 'EG', 'Herr', 'Frank', 'Fiktiv', 1050, '2017-06-01'),
      M('m6', 'o2', '1. OG', 'Frau', 'Greta', 'Demo', 830, '2020-10-01'),
      M('m7', 'o2', '2. OG', 'Herr', 'Hakan', 'Erfunden', 870, '2022-02-01'),
      M('m8', 'o2', 'DG', 'Frau', 'Ines', 'Platzhalter', 560, '2024-05-01', { email: '' }),
      M('m9', 'o3', 'Whg 1', 'Herr', 'Jonas', 'Schema', 720, '2018-09-01'),
      M('m10', 'o3', 'Whg 2', 'Frau', 'Katrin', 'Vorlage', 760, '2016-11-01'),
      M('m11', 'o3', 'Whg 3', 'Herr', 'Lukas', 'Entwurf', 810, '2015-01-01', { mietende: ago(20) }),
      M('m12', 'o3', 'Whg 4', 'Frau', 'Mara', 'Skizze', 690, '2020-01-01', { mietende: ago(150) })
    ];
    d.kontakte = [
      { id: 'k1', typ: 'handwerker', firma: 'Sanitär Wasserfest GmbH', gewerk: ['Sanitär', 'Heizung'], ansprechpartner: 'Herr Rohr', tel: '0241 111111', email: 'info@wasserfest.example', anschrift: 'Hauptstr. 1\n52062 Aachen', notiz: 'Notdienst 24h' },
      { id: 'k2', typ: 'handwerker', firma: 'Haustechnik Warm & Co.', gewerk: ['Heizung', 'Sanitär'], ansprechpartner: 'Frau Kessel', tel: '0241 222222', email: 'service@warm.example', anschrift: '', notiz: '' },
      { id: 'k3', typ: 'handwerker', firma: 'Rohrblitz Aachen', gewerk: ['Rohrreinigung', 'Sanitär'], ansprechpartner: '', tel: '0241 333333', email: 'auftrag@rohrblitz.example', anschrift: '', notiz: '' },
      { id: 'k4', typ: 'handwerker', firma: 'Elektro Funke', gewerk: ['Elektro'], ansprechpartner: 'Herr Funke', tel: '0241 444444', email: 'funke@elektro.example', anschrift: '', notiz: '' },
      { id: 'k5', typ: 'handwerker', firma: 'Malerbetrieb Farbenfroh', gewerk: ['Maler', 'Bodenleger'], ansprechpartner: '', tel: '0241 555555', email: 'post@farbenfroh.example', anschrift: '', notiz: '' },
      { id: 'k6', typ: 'handwerker', firma: 'Dachdeckerei Ziegel', gewerk: ['Dach'], ansprechpartner: '', tel: '0241 666666', email: 'info@ziegel.example', anschrift: '', notiz: '' },
      { id: 'k7', typ: 'anwalt', firma: 'Kanzlei Recht & Ordnung', gewerk: [], ansprechpartner: 'RAin Paragraf', tel: '0241 777777', email: 'kanzlei@recht.example', anschrift: 'Theaterstr. 9\n52062 Aachen', notiz: 'Mietrecht' }
    ];
    const P = (bez, n, betrag, offen = betrag, typ = 'miete') => ({ id: C.uid(), bez, faellig: faellig(n), typ, betrag, offen });
    const miete = (m, n, offen) => P('Miete ' + C.monatLabel(monat(n).slice(0, 7)), n, m.gesamtmiete, offen == null ? m.gesamtmiete : offen);
    const mm = id => d.mieter.find(x => x.id === id);
    const F = (id, mid, posten, notiz = '') => { const f = { id, mieterId: mid, stufe: 'neu', posten, raten: [], notiz, angelegt: ago(60) }; d.opos.push(f); return f; };
    const act = (b, id, a, tageZurueck, ctx = {}) => C.applyAction(d, b, id, a, Object.assign({ heute: ago(tageZurueck) }, ctx));

    // OPOS – 10 Fälle in verschiedenen Stufen
    F('f1', 'm1', [miete(mm('m1'), 0)]); C.createWV(d, 'opos', 'f1', t, 'Offene Posten prüfen – Zahlungserinnerung versenden?', { regel: 'opos:neu' });
    F('f2', 'm2', [miete(mm('m2'), 1, 295), miete(mm('m2'), 0)]); act('opos', 'f2', 'erinnerung', 16);
    F('f3', 'm3', [miete(mm('m3'), 2, 420), miete(mm('m3'), 1), miete(mm('m3'), 0)]); act('opos', 'f3', 'erinnerung', 40); act('opos', 'f3', 'mahnung1', 14);
    F('f4', 'm4', [P('Nebenkostennachzahlung', 2, 318.4, 318.4, 'sonstig')]); act('opos', 'f4', 'erinnerung', 12);
    F('f5', 'm5', [miete(mm('m5'), 2), miete(mm('m5'), 1), miete(mm('m5'), 0)], 'Mieter telefonisch nicht erreichbar.'); act('opos', 'f5', 'erinnerung', 60); act('opos', 'f5', 'mahnung1', 45); act('opos', 'f5', 'mahnungLetzte', 12);
    F('f6', 'm6', [miete(mm('m6'), 0, 130)]); C.createWV(d, 'opos', 'f6', ago(1), 'Offene Posten prüfen – Zahlungserinnerung versenden?', { regel: 'opos:neu' });
    const f7 = F('f7', 'm7', [miete(mm('m7'), 3), miete(mm('m7'), 2), miete(mm('m7'), 1), miete(mm('m7'), 0)]);
    act('opos', 'f7', 'erinnerung', 90); act('opos', 'f7', 'mahnung1', 70); act('opos', 'f7', 'mahnungLetzte', 50); act('opos', 'f7', 'kuendigung', 30); f7.anwaltId = 'k7'; act('opos', 'f7', 'anwalt', 15, { verlaufText: 'An Anwalt übergeben: Kanzlei Recht & Ordnung' });
    F('f8', 'm8', [miete(mm('m8'), 0)]); C.createWV(d, 'opos', 'f8', t, 'Offene Posten prüfen – Zahlungserinnerung versenden?', { regel: 'opos:neu' });
    const f9 = F('f9', 'm9', [miete(mm('m9'), 2, 360), miete(mm('m9'), 1), P('Mahnkosten', 1, 0, 0, 'sonstig')]); act('opos', 'f9', 'erinnerung', 50); act('opos', 'f9', 'mahnung1', 35);
    const raten = C.ratenplan(1080, 3, C.addDays(t, -10)); raten[0].bezahlt = true; act('opos', 'f9', 'raten', 20, { raten });
    d.wv.filter(w => w.refId === 'f9' && w.aufgabe.startsWith('Rate 1/')).forEach(w => { w.status = 'erledigt'; w.erledigtAm = ago(5); });
    f9.posten = C.verteileZahlung(f9.posten, 360).posten;
    F('f10', 'm10', [miete(mm('m10'), 1), miete(mm('m10'), 0)]); act('opos', 'f10', 'abmahnung', 30); act('opos', 'f10', 'erinnerung', 3);

    // Instandhaltung
    const IH = (id, objektId, mieterId, titel, beschreibung, gemeldet, dr, gewerk, extra = {}) => {
      const f = Object.assign({ id, objektId, mieterId, titel, beschreibung, gemeldetAm: ago(gemeldet), dringlichkeit: dr, status: 'gemeldet', gewerk, verursacher: 'unklar', angebote: [], anfragen: [], fotos: [] }, extra);
      d.ih.push(f); act('ih', id, 'gemeldet', gemeldet, { dringlichkeit: dr, verlaufText: 'Schaden gemeldet (' + C.IH_DRINGLICHKEIT[dr] + ')' }); return f;
    };
    IH('i1', 'o1', 'm4', 'Tropfender Wasserhahn Küche', 'Mieterin meldet tropfenden Einhebelmischer in der Küche, seit ca. einer Woche.', 2, 'normal', 'Sanitär');
    const i2 = IH('i2', 'o2', 'm6', 'Heizung Wohnzimmer kalt', 'Heizkörper im Wohnzimmer wird nicht warm, andere Räume ok. Entlüften hat nicht geholfen.', 9, 'hoch', 'Heizung');
    i2.anfragen = [{ kontaktId: 'k1', datum: ago(8) }, { kontaktId: 'k2', datum: ago(8) }]; i2.angebote = [{ kontaktId: 'k2', betrag: 285.6, datum: ago(4), nr: 'A-2231' }];
    act('ih', 'i2', 'angefragt', 8, { verlaufText: 'Angebote angefragt bei: Sanitär Wasserfest GmbH, Haustechnik Warm & Co.' });
    const i3 = IH('i3', 'o3', '', 'Dachrinne undicht (Rückseite)', 'Dachrinne an der Gebäuderückseite tropft bei Regen auf den Balkon Whg 2.', 30, 'normal', 'Dach');
    i3.angebote = [{ kontaktId: 'k6', betrag: 640, datum: ago(20), nr: '' }]; act('ih', 'i3', 'angefragt', 26);
    i3.handwerkerId = 'k6'; i3.auftragssumme = 640; act('ih', 'i3', 'beauftragt', 18, { termin: ago(3), verlaufText: 'Beauftragt: Dachdeckerei Ziegel (640,00 €)' });
    const i4 = IH('i4', 'o1', 'm2', 'Abfluss Bad verstopft', 'Waschbecken und Dusche laufen nicht ab. Laut Handwerker Hygieneartikel im Abfluss.', 25, 'hoch', 'Rohrreinigung', { verursacher: 'mieter' });
    i4.handwerkerId = 'k3'; i4.auftragssumme = 180; act('ih', 'i4', 'beauftragt', 24, { termin: ago(23) }); i4.erledigtAm = ago(22); act('ih', 'i4', 'erledigt', 22);
    i4.rechnung = { nr: 'RB-5520', datum: ago(15), betrag: 214.2, geprueft: true };

    // Kaution
    const K = (id, mid, betrag, extra = {}) => { const k = Object.assign({ id, mieterId: mid, betrag, art: 'konto', anlagekonto: 'Kautionskonto ' + mid.toUpperCase(), zinsen: 0, status: 'offen', einbehalte: [], nkEinbehalt: 0, auszahlungIban: '' }, extra); d.kaution.push(k); return k; };
    K('k1', 'm1', mm('m1').kaution, { zinsen: 4.12 });
    const k2 = K('k2', 'm11', mm('m11').kaution, { zinsen: 18.35, auszugAm: ago(20), uebergabeAm: ago(19), auszahlungIban: 'DE02 1234 5678 9012 3456 78' });
    act('kaution', 'k2', 'auszug', 19, { auszugAm: k2.auszugAm, uebergabeAm: k2.uebergabeAm }); act('kaution', 'k2', 'uebergabe', 19, { uebergabeAm: k2.uebergabeAm });
    k2.einbehalte = [{ grund: 'Reinigung der Wohnung', betrag: 180 }];
    const k3 = K('k3', 'm12', mm('m12').kaution, { zinsen: 9.8, auszugAm: ago(160), uebergabeAm: ago(158), nkEinbehalt: 250, nkDatum: C.addDays(t, 60) });
    act('kaution', 'k3', 'auszug', 158, { auszugAm: k3.auszugAm, uebergabeAm: k3.uebergabeAm }); act('kaution', 'k3', 'uebergabe', 158, { uebergabeAm: k3.uebergabeAm });
    k3.einbehalte = [{ grund: 'Schönheitsreparaturen (Kostenvoranschlag)', betrag: 620 }, { grund: 'fehlende Schlüssel', betrag: 85 }];
    act('kaution', 'k3', 'nkEinbehalt', 60, { nkDatum: k3.nkDatum });
    return d;
  };
})(window);
