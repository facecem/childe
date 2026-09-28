/* ============================================================
 * core – Datum/Werktag/Feiertage, Formatierung, Datenmodell,
 * Migration, WV-Engine, Fachlogik (Kündigungscheck, Zahlungs-
 * verteilung, Kautionsrechnung, Raten, Import, Vorlagen-Rendering).
 * Rein funktional, läuft im Browser (window.Core) und in Node.
 * ============================================================ */
(function (root) {
  'use strict';

  const STORE_KEY = 'verwaltung_v1';
  const PROTOTYP_KEY = 'opos_assistent_v1';
  const DATA_VERSION = 1;

  /* ---------- Datum ---------- */
  const pad = n => String(n).padStart(2, '0');
  function isoFromDate(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function dateFromISO(s) { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
  function today() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function isISO(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
  function addDays(iso, n) { const d = dateFromISO(iso); d.setUTCDate(d.getUTCDate() + n); return isoFromDate(d); }
  function addMonths(iso, n) {
    const d = dateFromISO(iso); const day = d.getUTCDate();
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last)); return isoFromDate(d);
  }
  function endOfMonth(iso) { const d = dateFromISO(iso); return isoFromDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))); }
  /** Tage von a bis b (b − a) */
  function diffDays(a, b) { return Math.round((dateFromISO(b) - dateFromISO(a)) / 86400000); }
  function maxISO(a, b) { return a > b ? a : b; }

  function easterSunday(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return y + '-' + pad(month) + '-' + pad(day);
  }
  const _feiertagCache = {};
  /** Gesetzliche Feiertage NRW → { 'YYYY-MM-DD': 'Name' } */
  function feiertageNRW(y) {
    if (_feiertagCache[y]) return _feiertagCache[y];
    const e = easterSunday(y);
    const map = {};
    [[y + '-01-01', 'Neujahr'], [addDays(e, -2), 'Karfreitag'], [addDays(e, 1), 'Ostermontag'],
     [y + '-05-01', 'Tag der Arbeit'], [addDays(e, 39), 'Christi Himmelfahrt'], [addDays(e, 50), 'Pfingstmontag'],
     [addDays(e, 60), 'Fronleichnam'], [y + '-10-03', 'Tag der Deutschen Einheit'], [y + '-11-01', 'Allerheiligen'],
     [y + '-12-25', '1. Weihnachtstag'], [y + '-12-26', '2. Weihnachtstag']].forEach(([d, n]) => { map[d] = n; });
    return (_feiertagCache[y] = map);
  }
  function feiertagName(iso) { return feiertageNRW(+String(iso).slice(0, 4))[iso] || null; }
  function isWochenende(iso) { const w = dateFromISO(iso).getUTCDay(); return w === 0 || w === 6; }
  /** Werktag im Sinne der WV: Mo–Fr, kein NRW-Feiertag */
  function isWerktag(iso, nrw = true) { return !isWochenende(iso) && !(nrw && feiertagName(iso)); }
  function naechsterWerktag(iso, nrw = true) { let d = iso; while (!isWerktag(d, nrw)) d = addDays(d, 1); return d; }
  function vorherigerWerktag(iso, nrw = true) { let d = iso; while (!isWerktag(d, nrw)) d = addDays(d, -1); return d; }
  function addWerktage(iso, n, nrw = true) { let d = iso, c = 0; while (c < n) { d = addDays(d, 1); if (isWerktag(d, nrw)) c++; } return d; }

  /**
   * Termin der ordentlichen Kündigung durch den Vermieter (§ 573c Abs. 1 BGB).
   * Zugang bis zum 3. Werktag (Mo–Sa, konservativ) → Ablauf des übernächsten Monats;
   * +3 Monate nach 5 Jahren, +3 weitere nach 8 Jahren Mietdauer.
   */
  function ordentlicherKuendigungstermin(zugang, mietbeginn) {
    const ersterDesMonats = zugang.slice(0, 8) + '01';
    let d = ersterDesMonats, n = 0;
    for (;;) { if (dateFromISO(d).getUTCDay() !== 0 && !feiertagName(d)) { n++; if (n === 3) break; } d = addDays(d, 1); }
    let monate = zugang <= d ? 2 : 3;
    if (mietbeginn && isISO(mietbeginn)) {
      const dauerMonate = (dateFromISO(zugang).getUTCFullYear() - dateFromISO(mietbeginn).getUTCFullYear()) * 12 +
        (dateFromISO(zugang).getUTCMonth() - dateFromISO(mietbeginn).getUTCMonth()) - (zugang.slice(8) < mietbeginn.slice(8) ? 1 : 0);
      if (dauerMonate >= 96) monate += 6; else if (dauerMonate >= 60) monate += 3;
    }
    return endOfMonth(addMonths(ersterDesMonats, monate));
  }

  /* ---------- Formatierung ---------- */
  function fmtDatum(iso) {
    if (!iso) return '';
    const s = String(iso).slice(0, 10); const p = s.split('-');
    return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : String(iso);
  }
  function parseDatum(s) {
    if (s == null || s === '') return '';
    // +1 h: Excel-Datumswerte kommen je nach Zeitzone als 23:59:xx des Vortags an
    if (s instanceof Date && !isNaN(s)) { const x = new Date(s.getTime() + 3600e3); return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); }
    s = String(s).trim(); let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
    if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/))) { let y = +m[3]; if (y < 100) y += 2000; return y + '-' + pad(m[2]) + '-' + pad(m[1]); }
    if (/^\d{5}(\.\d+)?$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30)); d.setUTCDate(d.getUTCDate() + Math.floor(+s)); return isoFromDate(d); }
    return '';
  }
  function round2(n) { const v = Number(n) || 0; return Math.round((v + (v >= 0 ? 1e-9 : -1e-9)) * 100) / 100; }
  function fmtZahl(n) {
    const v = round2(n); const [i, f] = Math.abs(v).toFixed(2).split('.');
    return (v < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + f;
  }
  function fmtEUR(n) { return fmtZahl(n) + ' €'; }
  function parseBetrag(s) {
    if (typeof s === 'number') return round2(s);
    s = String(s == null ? '' : s).replace(/[€\s ]/g, '');
    if (!s) return 0;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const v = parseFloat(s); if (isNaN(v)) return 0;
    return round2(neg ? -Math.abs(v) : v);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function sum(arr, f) { return round2((arr || []).reduce((s, x) => s + (Number(f ? f(x) : x) || 0), 0)); }
  function b64utf8(s) {
    if (typeof Buffer !== 'undefined' && typeof window === 'undefined') return Buffer.from(String(s), 'utf8').toString('base64');
    return btoa(unescape(encodeURIComponent(String(s))));
  }

  /* ---------- Stammdaten-Helfer ---------- */
  function mieterName(m) { return m ? [m.vorname, m.nachname].filter(Boolean).join(' ') || m.firma || '(ohne Namen)' : '–'; }
  function briefanrede(m) {
    if (!m) return 'Sehr geehrte Damen und Herren,';
    if (m.anrede === 'Frau') return 'Sehr geehrte Frau ' + m.nachname + ',';
    if (m.anrede === 'Herr') return 'Sehr geehrter Herr ' + m.nachname + ',';
    if (m.anrede === 'Eheleute' || m.anrede === 'Familie') return 'Sehr geehrte ' + (m.anrede === 'Eheleute' ? 'Eheleute ' : 'Familie ') + m.nachname + ',';
    return 'Sehr geehrte Damen und Herren,';
  }

  /* ---------- Datenmodell ---------- */
  function defaultSettings() {
    return {
      firma: 'Hausverwaltung Muster GmbH', strasse: 'Musterstraße 1', plzort: '52062 Aachen', ort: 'Aachen',
      tel: '0241 000000', mail: 'info@hausverwaltung-muster.de', web: '',
      sachbearbeiter: 'Max Mustermann', unterzeichner: 'Max Mustermann', funktion: 'Geschäftsführer',
      bank: 'Sparkasse Aachen', iban: 'DE00 0000 0000 0000 0000 00', bic: 'AACSDE33XXX',
      logo: '', ibanJeEigentuemer: false,
      fristen: {
        erinnerung: 10, mahnung1: 10, mahnungLetzte: 7, abmahnung: 14, kuendigung: 14, anwalt: 14,
        angebot: 5, ausfuehrung: 10, rechnung: 14, ihMieter: 14, weiterbelastung: 14,
        kautionAbrechnungMonate: 3, auszahlung: 14, bankverbindung: 14
      },
      puffer: 3, mahngebuehr: 0, feiertageNRW: true, ratenVerzugTage: 14
    };
  }
  function emptyData() {
    return {
      version: DATA_VERSION, settings: defaultSettings(), vorlagen: {},
      objekte: [], mieter: [], kontakte: [], wv: [], verlauf: [], opos: [], ih: [], kaution: [],
      meta: { lastBackup: null, erstellt: today() }
    };
  }
  const ARRAYS = ['objekte', 'mieter', 'kontakte', 'wv', 'verlauf', 'opos', 'ih', 'kaution'];
  function normalize(d) {
    const out = emptyData();
    if (!d || typeof d !== 'object') return out;
    Object.keys(d).forEach(k => { out[k] = d[k]; });
    out.version = DATA_VERSION;
    out.settings = Object.assign(defaultSettings(), d.settings || {});
    out.settings.fristen = Object.assign(defaultSettings().fristen, (d.settings && d.settings.fristen) || {});
    ARRAYS.forEach(k => { if (!Array.isArray(out[k])) out[k] = []; });
    out.vorlagen = d.vorlagen && typeof d.vorlagen === 'object' ? d.vorlagen : {};
    out.meta = Object.assign({ lastBackup: null, erstellt: today() }, d.meta || {});
    out.opos.forEach(f => { f.posten = f.posten || []; f.raten = f.raten || []; });
    out.ih.forEach(f => { f.angebote = f.angebote || []; f.fotos = f.fotos || []; f.anfragen = f.anfragen || []; });
    out.kaution.forEach(f => { f.einbehalte = f.einbehalte || []; });
    return out;
  }

  /* ---------- Migration Prototyp (opos_assistent_v1) ---------- */
  function pick(o, keys) { for (const k of keys) if (o && o[k] != null && o[k] !== '') return o[k]; return undefined; }
  function stufeAusText(s) {
    s = String(s || '').toLowerCase();
    if (!s || s === 'neu') return 'neu';
    if (s.includes('erinner')) return 'erinnerung';
    if (s.includes('letzt')) return 'mahnungLetzte';
    if (s.includes('kündig') || s.includes('kuendig')) return 'kuendigung';
    if (s.includes('anwalt')) return 'anwalt';
    if (s.includes('erledig') || s.includes('bezahlt')) return 'erledigt';
    if (s.includes('mahn') || s === '1' || s.includes('erste')) return 'mahnung1';
    return STUFEN[s] ? s : 'neu';
  }
  function migratePrototype(old) {
    const d = emptyData();
    if (!old) return d;
    const faelle = Array.isArray(old) ? old : (pick(old, ['faelle', 'cases', 'mieter', 'eintraege', 'items']) || []);
    const s = old.settings || old.einstellungen || {};
    ['firma', 'strasse', 'plzort', 'ort', 'tel', 'sachbearbeiter', 'bank', 'iban', 'bic'].forEach(k => { if (s[k]) d.settings[k] = s[k]; });
    if (s.mail || s.email) d.settings.mail = s.mail || s.email;
    if (s.mahngebuehr != null) d.settings.mahngebuehr = parseBetrag(s.mahngebuehr);
    const objektByName = {};
    (Array.isArray(faelle) ? faelle : []).forEach(c => {
      if (!c || typeof c !== 'object') return;
      const mm = typeof c.mieter === 'object' && c.mieter ? c.mieter : c;
      let vorname = pick(mm, ['vorname']) || '', nachname = pick(mm, ['nachname']) || '';
      const voll = typeof c.mieter === 'string' ? c.mieter : pick(mm, ['name', 'mietername']);
      if (!nachname && voll) { const p = String(voll).trim().split(/\s+/); nachname = p.pop(); vorname = p.join(' '); }
      const objName = String(pick(c, ['objekt', 'objektBezeichnung', 'haus', 'liegenschaft']) || pick(mm, ['objekt']) || 'Übernommen aus Prototyp');
      let obj = objektByName[objName];
      if (!obj) { obj = { id: uid(), bezeichnung: objName, strasse: '', plzort: '', eigentuemer: '' }; objektByName[objName] = obj; d.objekte.push(obj); }
      const m = {
        id: uid(), objektId: obj.id, whg: pick(mm, ['whg', 'wohnung', 'lage']) || '',
        anrede: pick(mm, ['anrede']) || '', vorname, nachname,
        anschrift: pick(mm, ['anschrift', 'adresse']) || '', email: pick(mm, ['email', 'mail']) || '', tel: pick(mm, ['tel', 'telefon']) || '',
        mietnr: String(pick(mm, ['mietnr', 'mieternr', 'mieternummer', 'kontonr']) || ''),
        gesamtmiete: parseBetrag(pick(mm, ['gesamtmiete', 'miete', 'monatsmiete', 'warmmiete']) || 0),
        mietbeginn: parseDatum(pick(mm, ['mietbeginn'])) || '', mietende: '', kaution: parseBetrag(pick(mm, ['kaution']) || 0)
      };
      d.mieter.push(m);
      const posten = (pick(c, ['posten', 'positionen', 'offenePosten', 'items']) || []).map(p => {
        const betrag = parseBetrag(pick(p, ['betrag', 'soll', 'summe']) || 0);
        const offen = p.offen != null ? parseBetrag(p.offen) : betrag;
        const bez = String(pick(p, ['bez', 'bezeichnung', 'text', 'art']) || 'Posten');
        return { id: uid(), bez, faellig: parseDatum(pick(p, ['faellig', 'faelligkeit', 'datum', 'monat'])) || '',
          typ: p.typ === 'sonstig' || (p.typ == null && /nk|nebenkosten|betriebskosten|mahn|gebühr|schaden|kosten/i.test(bez) && !/miete/i.test(bez)) ? 'sonstig' : 'miete',
          betrag, offen };
      });
      const fall = { id: uid(), mieterId: m.id, stufe: stufeAusText(pick(c, ['stufe', 'status', 'mahnstufe'])), posten, raten: [], notiz: pick(c, ['notiz', 'bemerkung', 'notes']) || '', angelegt: today() };
      d.opos.push(fall);
      const wvDatum = parseDatum(pick(c, ['wv', 'wiedervorlage', 'wvDatum', 'wvdatum']));
      if (wvDatum) d.wv.push({ id: uid(), bereich: 'opos', refId: fall.id, datum: wvDatum, aufgabe: pick(c, ['wvText', 'wvAufgabe']) || 'Wiedervorlage (aus Prototyp übernommen)', status: 'offen', erstelltDurch: 'manuell', regel: 'migration' });
      (pick(c, ['verlauf', 'historie', 'log', 'history']) || []).forEach(v => {
        if (typeof v === 'string') d.verlauf.push({ id: uid(), bereich: 'opos', refId: fall.id, datum: today(), typ: 'notiz', text: v });
        else d.verlauf.push({ id: uid(), bereich: 'opos', refId: fall.id, datum: parseDatum(pick(v, ['datum', 'date'])) || today(), typ: v.typ || 'notiz', text: String(pick(v, ['text', 'aktion', 'beschreibung']) || '') });
      });
    });
    d.meta.migriertAus = PROTOTYP_KEY; d.meta.migriertAm = today();
    return d;
  }

  /* ---------- Fachlogik ---------- */
  const STUFEN = {
    neu: 'Neu', erinnerung: 'Zahlungserinnerung', mahnung1: '1. Mahnung', mahnungLetzte: 'Letzte Mahnung',
    kuendigung: 'Kündigung', anwalt: 'Anwalt', erledigt: 'Erledigt'
  };
  const STUFEN_REIHE = ['neu', 'erinnerung', 'mahnung1', 'mahnungLetzte', 'kuendigung', 'anwalt', 'erledigt'];
  const IH_STATUS = { gemeldet: 'Gemeldet', angefragt: 'Angebot angefragt', beauftragt: 'Beauftragt', in_arbeit: 'In Arbeit', erledigt: 'Erledigt', abgerechnet: 'Abgerechnet' };
  const IH_DRINGLICHKEIT = { notfall: 'Notfall', hoch: 'Hoch', normal: 'Normal' };
  const K_STATUS = { offen: 'Offen (Mietverhältnis läuft)', in_pruefung: 'In Prüfung', abgerechnet: 'Abgerechnet', ausgezahlt: 'Ausgezahlt' };
  const BEREICHE = { opos: 'OPOS', ih: 'Instandhaltung', kaution: 'Kaution' };

  function offenSumme(posten, typ) { return sum((posten || []).filter(p => !typ || p.typ === typ), p => p.offen); }

  /**
   * Prüfhinweis Kündigung § 543 Abs. 2 S. 1 Nr. 3 BGB (nur Mietposten):
   *  a) zwei aufeinanderfolgende Termine, Rückstand > 1 Monatsmiete (§ 569 Abs. 3 Nr. 1)
   *  b) über mehr als zwei Termine Rückstand ≥ 2 Monatsmieten
   */
  function kuendigungsCheck(posten, monatsmiete) {
    monatsmiete = round2(monatsmiete);
    const miete = (posten || []).filter(p => p.typ === 'miete' && round2(p.offen) > 0);
    const summeMiete = sum(miete, p => p.offen);
    const proMonat = {};
    miete.forEach(p => { const k = String(p.faellig || '').slice(0, 7); if (k) proMonat[k] = round2((proMonat[k] || 0) + Number(p.offen)); });
    const monate = Object.keys(proMonat).sort();
    let a = null;
    if (monatsmiete > 0) {
      for (let i = 0; i < monate.length - 1; i++) {
        if (addMonths(monate[i] + '-01', 1).slice(0, 7) !== monate[i + 1]) continue;
        const s = round2(proMonat[monate[i]] + proMonat[monate[i + 1]]);
        if (s > monatsmiete) { a = { von: monate[i], bis: monate[i + 1], summe: s }; break; }
      }
    }
    const b = monatsmiete > 0 && summeMiete >= round2(2 * monatsmiete);
    let text;
    if (!(monatsmiete > 0)) text = 'Keine Monatsmiete hinterlegt – Prüfung nicht möglich.';
    else if (a && b) text = 'Voraussetzungen Nr. 3 a) und b) scheinen erfüllt.';
    else if (a) text = 'Voraussetzung Nr. 3 a) scheint erfüllt (zwei aufeinanderfolgende Termine, Rückstand > 1 Monatsmiete).';
    else if (b) text = 'Voraussetzung Nr. 3 b) scheint erfüllt (Rückstand ≥ 2 Monatsmieten).';
    else text = 'Voraussetzungen der fristlosen Kündigung wegen Zahlungsverzugs derzeit nicht erkennbar.';
    let grund = '';
    if (b) grund = 'den Betrag von zwei Monatsmieten (' + fmtEUR(2 * monatsmiete) + ')';
    else if (a) grund = 'für die zwei aufeinanderfolgenden Termine ' + monatLabel(a.von) + ' und ' + monatLabel(a.bis) + ' den Betrag einer Monatsmiete (' + fmtEUR(monatsmiete) + ')';
    const saldoOffen = sum((posten || []).filter(p => p.saldo), p => p.offen);
    if (saldoOffen > 0) text += ' Achtung: ' + fmtEUR(saldoOffen) + ' stammen aus dem Saldo der OPOS-Liste ohne Aufschlüsselung und werden nicht als Miete gewertet – für die Prüfung die Einzelposten erfassen oder importieren.';
    return { moeglich: !!(a || b), a, b, summeMiete, monatsmiete, saldoOffen, text, grund, hinweis: 'Prüfhinweis – ersetzt keine rechtliche Prüfung.' };
  }
  function monatLabel(ym) {
    const n = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    const [y, m] = ym.split('-'); return n[+m - 1] + ' ' + y;
  }

  /** Zahlung verteilen: älteste Posten zuerst. Gibt neue Posten-Liste, Rest und Buchungen zurück. */
  function verteileZahlung(posten, betrag) {
    const list = (posten || []).map(p => Object.assign({}, p));
    let rest = round2(betrag);
    const order = list.map((p, i) => i).filter(i => round2(list[i].offen) > 0)
      .sort((x, y) => (list[x].faellig || '9999').localeCompare(list[y].faellig || '9999') || x - y);
    const buchungen = [];
    for (const i of order) {
      if (rest <= 0) break;
      const t = Math.min(rest, round2(list[i].offen));
      list[i].offen = round2(list[i].offen - t); rest = round2(rest - t);
      buchungen.push({ id: list[i].id, bez: list[i].bez, betrag: t });
    }
    return { posten: list, rest, buchungen };
  }

  /** Kaution + Zinsen − Einbehalte − NK-Einbehalt = Auszahlung */
  function kautionsabrechnung(k) {
    const kaution = round2(k.betrag), zinsen = round2(k.zinsen);
    const guthaben = round2(kaution + zinsen);
    const einbehalte = sum(k.einbehalte, e => e.betrag);
    const nkEinbehalt = round2(k.nkEinbehalt);
    const bereitsAusgezahlt = round2(k.teilauszahlung);
    const auszahlung = round2(guthaben - einbehalte - nkEinbehalt - bereitsAusgezahlt);
    return { kaution, zinsen, guthaben, einbehalte, nkEinbehalt, bereitsAusgezahlt, auszahlung, nachforderung: auszahlung < 0 ? -auszahlung : 0 };
  }
  /** Verjährung § 548 BGB: 6 Monate ab Rückgabe der Mietsache */
  function verjaehrung(k, heute = today()) {
    const basis = k.uebergabeAm || k.auszugAm;
    if (!basis) return null;
    const ende = addMonths(basis, 6);
    return { basis, ende, restTage: diffDays(heute, ende), seitUebergabe: diffDays(basis, heute) };
  }
  function kautionAmpel(k, heute = today()) {
    if (k.status === 'ausgezahlt') return 'grau';
    const v = verjaehrung(k, heute);
    if (!v) return 'grau';
    if (v.restTage < 30) return 'rot';
    if (v.seitUebergabe > 90) return 'gelb';
    return 'gruen';
  }

  function ratenplan(summe, anzahl, ersteFaellig, intervallMonate = 1) {
    const n = Math.max(1, anzahl | 0); summe = round2(summe);
    const basis = Math.floor(summe * 100 / n) / 100;
    const raten = []; let acc = 0;
    for (let i = 0; i < n; i++) {
      const betrag = i === n - 1 ? round2(summe - acc) : basis;
      acc = round2(acc + betrag);
      raten.push({ nr: i + 1, faellig: addMonths(ersteFaellig, i * intervallMonate), betrag, bezahlt: false });
    }
    return raten;
  }

  /* ---------- WV-Engine ---------- */
  /** WV nie auf Wochenende/Feiertag: auf nächsten Werktag, bei Fristsicherung (vorziehen) auf vorherigen */
  function wvDatum(data, iso, vorziehen) { const nrw = data.settings.feiertageNRW !== false; return vorziehen ? vorherigerWerktag(iso, nrw) : naechsterWerktag(iso, nrw); }
  function createWV(data, bereich, refId, datum, aufgabe, opts = {}) {
    const w = { id: uid(), bereich, refId, datum: wvDatum(data, datum, opts.vorziehen), aufgabe, status: 'offen',
      erstelltDurch: opts.erstelltDurch || 'auto', regel: opts.regel || '', erstelltAm: opts.heute || today() };
    data.wv.push(w); return w;
  }
  function completeWV(data, id, am = today()) {
    const w = data.wv.find(x => x.id === id); if (!w) return null;
    w.status = 'erledigt'; w.erledigtAm = am; return w;
  }
  function snoozeWV(data, id, tage, heute = today()) {
    const w = data.wv.find(x => x.id === id); if (!w) return null;
    w.datum = wvDatum(data, addDays(maxISO(w.datum, heute), tage)); return w;
  }
  /** Offene Auto-WV eines Falls schließen. regeln: true = alle, Array = nur diese Regeln */
  function closeWV(data, bereich, refId, regeln = true, am = today()) {
    let n = 0;
    data.wv.forEach(w => {
      if (w.bereich !== bereich || w.refId !== refId || w.status !== 'offen' || w.erstelltDurch !== 'auto') return;
      if (regeln !== true && !regeln.includes(w.regel)) return;
      w.status = 'erledigt'; w.erledigtAm = am; w.erledigtDurch = 'auto'; n++;
    });
    return n;
  }
  function offeneWV(data, bereich, refId) {
    return data.wv.filter(w => w.status === 'offen' && (!bereich || w.bereich === bereich) && (!refId || w.refId === refId))
      .sort((a, b) => a.datum.localeCompare(b.datum));
  }
  function addVerlauf(data, bereich, refId, typ, text, datum = today()) {
    const v = { id: uid(), bereich, refId, datum, typ, text }; data.verlauf.push(v); return v;
  }

  const AKTIONEN = {
    opos: {
      erinnerung: 'Zahlungserinnerung versendet', mahnung1: '1. Mahnung versendet', mahnungLetzte: 'Letzte Mahnung versendet',
      abmahnung: 'Abmahnung (unpünktliche Zahlung) versendet', kuendigung: 'Kündigung versendet', anwalt: 'An Anwalt übergeben',
      raten: 'Ratenzahlung vereinbart', erledigt: 'Fall erledigt'
    },
    ih: {
      gemeldet: 'Schaden gemeldet', angefragt: 'Angebote angefragt', beauftragt: 'Handwerker beauftragt',
      in_arbeit: 'Arbeiten begonnen', erledigt: 'Arbeiten erledigt', abgerechnet: 'Rechnung geprüft / abgerechnet'
    },
    kaution: {
      auszug: 'Auszug / Wohnungsübergabe erfasst', uebergabe: 'Wohnungsübergabe erfasst', nkEinbehalt: 'NK-Einbehalt festgelegt',
      abrechnung: 'Kautionsabrechnung versendet', ausgezahlt: 'Kaution ausgezahlt'
    }
  };

  /**
   * Regeln je Aktion (Rahmenplan § 5). Liefert { schliessen, frist, neu:[{datum, aufgabe}] }.
   * Datumsangaben sind Rohwerte; createWV schiebt auf den nächsten Werktag.
   */
  function wvRegeln(data, bereich, aktion, ctx = {}) {
    const s = data.settings, f = s.fristen, P = Number(s.puffer) || 0, h = ctx.heute || today(), nrw = s.feiertageNRW !== false;
    switch (bereich + ':' + aktion) {
      case 'opos:erinnerung': case 'opos:mahnung1': case 'opos:mahnungLetzte': case 'opos:abmahnung': {
        const frist = ctx.frist || addDays(h, Number(f[aktion]) || 10);
        return { schliessen: true, frist, neu: [{ datum: addDays(frist, P), aufgabe: 'Zahlungseingang prüfen (' + (STUFEN[aktion] || 'Abmahnung') + ', Frist ' + fmtDatum(frist) + ')' }] };
      }
      case 'opos:kuendigung': {
        const frist = ctx.frist || addDays(h, Number(f.kuendigung) || 14);
        return { schliessen: true, frist, neu: [
          { datum: frist, aufgabe: 'Räumung/Zahlung prüfen, ggf. Anwalt einschalten' },
          { datum: addDays(h, 2), aufgabe: 'Original der Kündigung per Post versendet?' }] };
      }
      case 'opos:anwalt':
        return { schliessen: true, neu: [{ datum: addDays(h, Number(f.anwalt) || 14), aufgabe: 'Sachstand beim Anwalt erfragen' }] };
      case 'opos:raten': {
        const r = ctx.raten || [];
        return { schliessen: true, neu: r.map(x => ({ datum: addDays(x.faellig, P), aufgabe: 'Rate ' + x.nr + '/' + r.length + ' (' + fmtEUR(x.betrag) + ', fällig ' + fmtDatum(x.faellig) + ') eingegangen?' })) };
      }
      case 'opos:erledigt': case 'ih:abgerechnet': case 'kaution:ausgezahlt':
        return { schliessen: true, neu: [] };
      case 'ih:gemeldet': {
        const d = ctx.dringlichkeit === 'notfall' ? h : ctx.dringlichkeit === 'hoch' ? addWerktage(h, 1, nrw) : addWerktage(h, 3, nrw);
        return { schliessen: false, neu: [{ datum: d, aufgabe: 'Handwerker anfragen' + (ctx.dringlichkeit === 'notfall' ? ' – NOTFALL' : '') }] };
      }
      case 'ih:angefragt':
        return { schliessen: ['ih:gemeldet', 'ih:angefragt'], neu: [{ datum: addDays(h, Number(f.angebot) || 5), aufgabe: 'Angebot eingegangen?' }] };
      case 'ih:beauftragt':
        return { schliessen: ['ih:gemeldet', 'ih:angefragt', 'ih:beauftragt'], neu: [{ datum: ctx.termin ? addDays(ctx.termin, 1) : addDays(h, Number(f.ausfuehrung) || 10), aufgabe: 'Ausführung prüfen' }] };
      case 'ih:in_arbeit':
        return { schliessen: false, neu: [] };
      case 'ih:erledigt':
        return { schliessen: true, neu: [{ datum: addDays(h, Number(f.rechnung) || 14), aufgabe: 'Rechnung da? Prüfen / ggf. an Mieter weiterbelasten' }] };
      case 'kaution:auszug': {
        const u = ctx.uebergabeAm || ctx.auszugAm || h;
        return { schliessen: ['kaution:auszug'], neu: [
          { datum: addDays(u, 1), aufgabe: 'Übergabeprotokoll prüfen' },
          { datum: addMonths(u, 5), vorziehen: true, aufgabe: 'Ansprüche sichern – Verjährung § 548 BGB (6 Monate) am ' + fmtDatum(addMonths(u, 6)) }] };
      }
      case 'kaution:uebergabe': {
        const u = ctx.uebergabeAm || h;
        return { schliessen: ['kaution:uebergabe'], neu: [{ datum: addMonths(u, Number(f.kautionAbrechnungMonate) || 3), aufgabe: 'Kautionsabrechnung erstellen' }] };
      }
      case 'kaution:nkEinbehalt':
        return { schliessen: ['kaution:nkEinbehalt'], neu: ctx.nkDatum ? [{ datum: ctx.nkDatum, aufgabe: 'NK-Einbehalt auflösen (Betriebskostenabrechnung)' }] : [] };
      case 'kaution:abrechnung':
        return { schliessen: ['kaution:uebergabe', 'kaution:abrechnung'], neu: [{ datum: addDays(h, Number(f.auszahlung) || 14), aufgabe: 'Auszahlung der Kaution erfolgt?' }] };
      default:
        return { schliessen: false, neu: [] };
    }
  }

  function fallListe(data, bereich) { return data[bereich]; }
  function findFall(data, bereich, id) { return (fallListe(data, bereich) || []).find(x => x.id === id); }

  /**
   * Aktion ausführen: vorherige WV schließen, neue WV anlegen, Verlauf schreiben, Status fortschreiben.
   */
  function applyAction(data, bereich, refId, aktion, ctx = {}) {
    const h = ctx.heute || today();
    const regel = wvRegeln(data, bereich, aktion, ctx);
    const geschlossen = regel.schliessen ? closeWV(data, bereich, refId, regel.schliessen, h) : 0;
    const neu = regel.neu.map(n => createWV(data, bereich, refId, n.datum, n.aufgabe, { regel: bereich + ':' + aktion, heute: h, vorziehen: n.vorziehen }));
    const fall = findFall(data, bereich, refId);
    if (fall) {
      if (bereich === 'opos' && STUFEN[aktion]) fall.stufe = aktion;
      if (bereich === 'opos' && aktion === 'abmahnung') fall.abmahnungAm = h;
      if (bereich === 'opos' && aktion === 'raten') fall.raten = ctx.raten || [];
      if (bereich === 'opos' && regel.frist) fall.frist = regel.frist;
      if (bereich === 'ih' && IH_STATUS[aktion]) fall.status = aktion;
      if (bereich === 'ih' && aktion === 'beauftragt') { fall.auftragAm = h; if (ctx.termin) fall.termin = ctx.termin; }
      if (bereich === 'kaution') {
        if (aktion === 'auszug') { fall.status = fall.status === 'offen' ? 'in_pruefung' : fall.status; }
        if (aktion === 'abrechnung') fall.status = 'abgerechnet';
        if (aktion === 'ausgezahlt') { fall.status = 'ausgezahlt'; fall.auszahlungAm = h; }
      }
    }
    const label = (AKTIONEN[bereich] && AKTIONEN[bereich][aktion]) || aktion;
    addVerlauf(data, bereich, refId, aktion, ctx.verlaufText || (label + (regel.frist ? ' (Frist ' + fmtDatum(regel.frist) + ')' : '')), h);
    return { frist: regel.frist, neu, geschlossen };
  }

  /* ---------- Vorlagen-Rendering ---------- */
  function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
  /** Textbaustein → HTML. Platzhalter {{a.b}}; Keys auf „Tabelle“ werden als HTML eingesetzt; **fett** */
  function vorlageZuHTML(tpl, ctx) {
    const parts = String(tpl || '').split(/(\{\{\s*[\w.]+\s*\}\})/);
    let html = parts.map((p, i) => {
      if (i % 2 === 0) return esc(p);
      const k = p.replace(/[{}\s]/g, ''); const v = getPath(ctx, k);
      if (v == null) return '<mark>' + esc(p) + '</mark>';
      return /Tabelle$/.test(k) ? '\u0000' + String(v).replace(/\n/g, '') + '\u0000' : esc(v);
    }).join('');
    html = html.replace(/\*\*([^*]+?)\*\*/g, '<b>$1</b>');
    return html.split(/\n[ \t]*\n/).map(par => {
      const t = par.trim(); if (!t) return '';
      if (/^\u0000[^\u0000]*\u0000$/.test(t)) return t.replace(/\u0000/g, '');
      return '<p>' + t.replace(/\u0000/g, '').replace(/\n/g, '<br>') + '</p>';
    }).join('\n');
  }
  /** Textbaustein → Klartext (E-Mail). „xyzTabelle“ wird durch „xyzListe“ ersetzt. */
  function vorlageZuText(tpl, ctx) {
    return String(tpl || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k) => {
      const v = getPath(ctx, /Tabelle$/.test(k) ? k.replace(/Tabelle$/, 'Liste') : k);
      return v == null ? m : String(v);
    }).replace(/\*\*([^*]+?)\*\*/g, '$1');
  }

  /* ---------- CSV / Import ---------- */
  function parseCSV(text) {
    text = String(text || '').replace(/^﻿/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const cnt = ch => (first.match(new RegExp('\\' + ch, 'g')) || []).length;
    const delim = [';', '\t', ','].sort((a, b) => cnt(b) - cnt(a))[0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => String(c).trim() !== ''));
  }
  const IMPORT_FELDER = {
    mietnr: { label: 'Mieternummer / Personenkonto', syn: ['mietnr', 'mieternr', 'mieternummer', 'personenkonto', 'konto', 'kontonr', 'vertragsnr', 'vertrag', 'debitor'] },
    name: { label: 'Mietername (vollständig)', syn: ['name', 'mieter', 'mietername', 'kunde', 'debitorname'] },
    vorname: { label: 'Vorname', syn: ['vorname'] },
    nachname: { label: 'Nachname', syn: ['nachname', 'familienname'] },
    objekt: { label: 'Objekt', syn: ['objekt', 'objektbezeichnung', 'liegenschaft', 'haus', 'objektnr', 'we'] },
    whg: { label: 'Wohnung / Lage', syn: ['whg', 'wohnung', 'lage', 'einheit', 'mieteinheit', 'ne'] },
    bez: { label: 'Bezeichnung / Buchungstext', syn: ['bez', 'bezeichnung', 'text', 'buchungstext', 'art', 'sollart', 'verwendungszweck'] },
    faellig: { label: 'Fälligkeit', syn: ['faellig', 'fällig', 'fälligkeit', 'faelligkeit', 'soll-datum', 'datum', 'belegdatum', 'monat'] },
    betrag: { label: 'Betrag (Soll)', syn: ['betrag', 'betrag€', 'betrageur', 'soll', 'sollbetrag', 'forderung'] },
    offen: { label: 'Offener Betrag', syn: ['offen', 'offenerbetrag', 'saldo', 'restbetrag', 'op', 'offen betrag'] },
    typ: { label: 'Typ (Miete/Sonstig)', syn: ['typ', 'kategorie', 'kostenart'] },
    miete: { label: 'Monatsmiete', syn: ['gesamtmiete', 'monatsmiete', 'miete', 'warmmiete', 'sollmiete'] },
    email: { label: 'E-Mail', syn: ['email', 'e-mail', 'mail'] }
  };
  function guessMapping(headers) {
    const norm = s => String(s || '').toLowerCase().replace(/[^a-zäöüß0-9-]/g, '');
    const map = {}; const used = new Set();
    Object.keys(IMPORT_FELDER).forEach(k => {
      for (const syn of IMPORT_FELDER[k].syn.map(norm)) {
        const idx = headers.findIndex((h, i) => !used.has(i) && norm(h) === syn);
        if (idx >= 0) { map[k] = idx; used.add(idx); break; }
      }
    });
    return map;
  }
  function typAusText(t) {
    t = String(t || '').toLowerCase();
    if (/sonst|\bnk\b|nebenkost|betriebskost|heizkost|abrechnung|nachzahlung|mahn|gebühr|gebuehr|schaden|kosten|zins/.test(t) && !/^miete|grundmiete|nettokalt|nutzungsentsch/.test(t)) return 'sonstig';
    return 'miete';
  }
  /** Offene Posten importieren. rows = Datenzeilen (ohne Kopf), mapping = {feld: spaltenIndex} */
  function importOPOS(data, rows, mapping, heute = today(), opts = {}) {
    const beruehrt = new Set();
    const stat = { mieterNeu: 0, objekteNeu: 0, faelleNeu: 0, postenNeu: 0, postenAktualisiert: 0, uebersprungen: 0 };
    const get = (r, k) => (mapping[k] != null && mapping[k] !== '' ? r[mapping[k]] : undefined);
    rows.forEach(r => {
      const betragRaw = get(r, 'betrag'), offenRaw = get(r, 'offen');
      const betrag = parseBetrag(betragRaw != null ? betragRaw : offenRaw);
      const offen = offenRaw != null ? parseBetrag(offenRaw) : betrag;
      let vorname = String(get(r, 'vorname') || '').trim(), nachname = String(get(r, 'nachname') || '').trim();
      const voll = String(get(r, 'name') || '').trim();
      if (!nachname && voll) {
        if (voll.includes(',')) { const [n, v] = voll.split(','); nachname = n.trim(); vorname = (v || '').trim(); }
        else { const p = voll.split(/\s+/); nachname = p.pop(); vorname = p.join(' '); }
      }
      const mietnr = String(get(r, 'mietnr') || '').trim();
      const fest = opts.mieterId ? data.mieter.find(x => x.id === opts.mieterId) : null;
      if (!(offen > 0) || (!fest && !mietnr && !nachname)) { stat.uebersprungen++; return; }
      const objName = String(get(r, 'objekt') || '').trim();
      let obj = objName ? data.objekte.find(o => o.bezeichnung.toLowerCase() === objName.toLowerCase()) : null;
      if (objName && !obj) { obj = { id: uid(), bezeichnung: objName, strasse: '', plzort: '', eigentuemer: '' }; data.objekte.push(obj); stat.objekteNeu++; }
      let m = fest || data.mieter.find(x => (mietnr && x.mietnr === mietnr) || (!mietnr && x.nachname === nachname && (x.vorname || '') === vorname && (!obj || x.objektId === obj.id)));
      if (!m) {
        m = { id: uid(), objektId: obj ? obj.id : '', whg: String(get(r, 'whg') || ''), anrede: '', vorname, nachname, anschrift: '', email: String(get(r, 'email') || ''), tel: '', mietnr, gesamtmiete: parseBetrag(get(r, 'miete') || 0), mietbeginn: '', mietende: '', kaution: 0 };
        data.mieter.push(m); stat.mieterNeu++;
      } else if (get(r, 'miete') && !m.gesamtmiete) m.gesamtmiete = parseBetrag(get(r, 'miete'));
      let fall = data.opos.find(f => f.mieterId === m.id && f.stufe !== 'erledigt');
      if (!fall) { fall = { id: uid(), mieterId: m.id, stufe: 'neu', posten: [], raten: [], notiz: '', angelegt: heute }; data.opos.push(fall); stat.faelleNeu++; addVerlauf(data, 'opos', fall.id, 'import', 'Fall durch Import angelegt', heute); }
      const bez = String(get(r, 'bez') || 'Offener Posten').trim();
      const faellig = parseDatum(get(r, 'faellig')) || parseDatum(get(r, 'datum')) || '';
      const typRaw = get(r, 'typ');
      const typ = typRaw != null ? (/sonst/i.test(typRaw) ? 'sonstig' : typAusText(typRaw)) : typAusText(bez);
      const dup = fall.posten.find(p => p.bez === bez && p.faellig === faellig && round2(p.betrag) === round2(betrag));
      if (dup) { if (round2(dup.offen) !== round2(offen)) { dup.offen = offen; stat.postenAktualisiert++; } }
      else { fall.posten.push({ id: uid(), bez, faellig, typ, betrag: betrag || offen, offen }); stat.postenNeu++; }
      beruehrt.add(fall);
    });
    beruehrt.forEach(saldoAbgleich);
    return stat;
  }

  /* ---------- Import OPOS-Liste (Salden je Mieter) ---------- */
  function normName(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9ÄÖÜß]/g, ''); }
  function titleCase(s) { return String(s).toLowerCase().replace(/(^|[\s\-/'(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()); }
  const FIRMA_RE = /(gmbh|mbh|\bug\b|\bag\b|\bkg\b|\bohg\b|\bgbr\b|e\.\s?v\.|gastronom|immobil|bauträger|concept|service|holding|brother|&)/i;
  /** „NACHNAME, VORNAME“ → Namensteile; Firmen bleiben unverändert */
  function nameAufteilen(raw) {
    raw = String(raw || '').trim().replace(/\s+/g, ' ');
    if (FIRMA_RE.test(raw)) return { anrede: 'Firma', vorname: '', nachname: raw };
    const i = raw.indexOf(',');
    if (i < 0) return { anrede: '', vorname: '', nachname: titleCase(raw) };
    return { anrede: '', nachname: titleCase(raw.slice(0, i).trim()), vorname: titleCase(raw.slice(i + 1).trim()) };
  }
  /** „01.03.25 - 31.07.26,“ → { von, bis } */
  function parseMietzeit(v) {
    if (v instanceof Date) return { von: parseDatum(v), bis: '' };
    const m = String(v || '').match(/(\d{1,2}\.\d{1,2}\.\d{2,4})\s*-\s*(\d{1,2}\.\d{1,2}\.\d{2,4})?/);
    return m ? { von: parseDatum(m[1]), bis: m[2] ? parseDatum(m[2]) : '' } : { von: '', bis: '' };
  }
  /** Saldo aus Zahl, „=1.2-3“, „7000 ca.“, „1400€ offen“ */
  function parseSaldo(v) {
    if (typeof v === 'number') return round2(v);
    const s = String(v == null ? '' : v).trim();
    if (/^=\s*[\d.,+\-\s]+$/.test(s)) return round2((s.slice(1).replace(/,/g, '.').match(/[+-]?\s*\d+(\.\d+)?/g) || []).reduce((a, t) => a + parseFloat(t.replace(/\s/g, '')), 0));
    const m = s.match(/-?\d[\d.]*(,\d+)?/);
    return m ? parseBetrag(m[0]) : 0;
  }
  /** WV-Angabe aus Liste: Datum, „01.09“, „WV 30.09“ → ISO (Jahr aus Stichtag) */
  function parseWV(v, stand) {
    if (v == null || v === '') return '';
    if (v instanceof Date) return parseDatum(v);
    if (typeof v === 'number') return v > 30000 && v < 80000 ? parseDatum(String(v)) : '';
    const s = String(v).trim();
    let m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    if (m) return parseDatum(m[0]);
    m = s.match(/(?:^|\bWV\s*)(\d{1,2})\.(\d{1,2})\.?(?:\s|$)/i);
    if (m && +m[1] <= 31 && +m[2] <= 12) {
      let iso = stand.slice(0, 4) + '-' + pad(m[2]) + '-' + pad(m[1]);
      if (diffDays(iso, stand) > 90) iso = addMonths(iso, 12);
      return iso;
    }
    return '';
  }
  function zellText(v) { return v instanceof Date ? fmtDatum(parseDatum(v)) : typeof v === 'number' ? fmtZahl(v) : String(v).trim(); }

  /** Blattformat erkennen: json (Rohdaten), saldo (Name/Saldo je Mieter), posten (Einzelposten) */
  function erkenneFormat(rows) {
    const erste = rows.slice(0, 12).map(r => String(r[0] == null ? '' : r[0])).join(' ');
    if (/"saldo_zeile"/.test(erste)) return { format: 'json', kopf: -1 };
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const h = rows[i].map(c => String(c == null ? '' : c).trim().toLowerCase());
      if (h.includes('name') && h.includes('saldo')) return { format: 'saldo', kopf: i };
      const g = guessMapping(rows[i]);
      if ((g.betrag != null || g.offen != null) && (g.bez != null || g.faellig != null) && (g.name != null || g.mietnr != null || g.nachname != null || g.bez != null)) return { format: 'posten', kopf: i };
    }
    return { format: 'unbekannt', kopf: 0 };
  }
  /** Titelzeile „… für NAME (Whg. 12):“ eines Posten-Blatts */
  function titelMieter(rows, kopf) {
    for (let i = 0; i < kopf; i++) {
      const m = String(rows[i][0] || '').match(/für\s+(.+?)\s*\((Whg\.?\s*[^)]*)\)/i);
      if (m) return { name: m[1].trim(), whg: m[2].replace(/\s+/g, ' ') };
    }
    return null;
  }
  /** „NAME Whg. 1 PFkt. 007 Mieter 01.03.25 - 31.07.26“ zerlegen. Das Namensfeld ist 30 Zeichen breit
   *  und kann direkt an „Whg.“ kleben („…BERTHOLDWhg. 45“, „…GASTRONOMIWEhg. 1“). */
  function zerlegeKontoName(n) {
    n = String(n || '').trim();
    const x = n.match(/^(.*?)\s*W?h?hg\.\s*(\S+)\s+PFkt\.?\s*(\S+)\s+Mieter\s+(\d{1,2}\.\d{1,2}\.\d{2,4})\s*-\s*(\d{1,2}\.\d{1,2}\.\d{2,4})?/i);
    return x ? { name: x[1].trim(), whg: 'Whg. ' + x[2], pfkt: x[3], von: parseDatum(x[4]), bis: x[5] ? parseDatum(x[5]) : '' }
      : { name: n, whg: '', pfkt: '', von: '', bis: '' };
  }
  function parseJsonBlatt(rows) {
    const text = rows.map(r => String(r[0] == null ? '' : r[0])).join('\n').replace(/\u00a0/g, ' ');
    const re = /"name"\s*:\s*"((?:[^"\\]|\\.)*)"[\s\S]*?"saldo_zeile"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    const out = []; let m;
    while ((m = re.exec(text))) {
      const n = m[1].trim(); const saldo = parseBetrag(m[2].replace(/^[^:]*:/, ''));
      out.push(Object.assign({ saldo, aktiv: null, wv: [], notizen: [] }, zerlegeKontoName(n)));
    }
    return out;
  }
  function parseSaldenBlatt(rows, kopf, stand) {
    const H = rows[kopf].map(h => String(h == null ? '' : h).trim());
    const n = H.map(h => h.toLowerCase());
    const iName = n.findIndex(h => h === 'name' || h === 'mieter');
    const iDatum = n.findIndex(h => /^(datum|mietzeit|zeitraum|mietdauer)$/.test(h));
    const iSaldo = n.indexOf('saldo');
    const iAktiv = n.indexOf('aktiv');
    const iWV = n.map((h, i) => (/^wv\b|wiedervorlage/.test(h) ? i : -1)).filter(i => i >= 0);
    const out = [];
    rows.slice(kopf + 1).forEach(r => {
      const name = String(r[iName] == null ? '' : r[iName]).trim();
      if (!/\p{L}{2}/u.test(name)) return;
      const mz = parseMietzeit(r[iDatum]);
      const kn = /PFkt\./.test(name) ? zerlegeKontoName(name) : null;
      const e = { name: kn ? kn.name : name, whg: kn ? kn.whg : '', pfkt: kn ? kn.pfkt : '', von: mz.von || (kn && kn.von) || '', bis: mz.bis || (kn && kn.bis) || '', saldo: parseSaldo(r[iSaldo]), aktiv: iAktiv >= 0 ? /^j/i.test(String(r[iAktiv] || '')) : null, wv: [], notizen: [] };
      if (r[iSaldo] != null && typeof r[iSaldo] === 'string' && !/^=/.test(r[iSaldo]) && !/^-?[\d.,]+$/.test(r[iSaldo].trim())) e.notizen.push('Saldo lt. Liste: ' + r[iSaldo]);
      r.forEach((v, c) => {
        if ([iName, iDatum, iSaldo, iAktiv].includes(c) || v == null || String(v).trim() === '') return;
        if (iWV.includes(c)) { const w = parseWV(v, stand); if (w) { e.wv.push(w); return; } }
        const t = zellText(v);
        if (typeof v === 'string') { const w = /\bWV\s*\d/i.test(v) ? parseWV(v, stand) : ''; if (w) e.wv.push(w); }
        e.notizen.push((H[c] ? H[c].replace(/\?$/, '') + ': ' : '') + t);
      });
      out.push(e);
    });
    return out;
  }
  /** Mieter zu einem Listeneintrag finden: exakter Name (+ Mietbeginn); abgeschnittene Namen (Feld 30 Zeichen)
   *  nur über den Namensanfang, wenn der kürzere Name lang genug ist und der Mieter noch nicht zugeordnet wurde. */
  function findeMieter(data, e, schonZugeordnet) {
    const k = normName(e.name);
    const kand = data.mieter.filter(m => normName(m.importName || (m.nachname + ', ' + m.vorname)) === k);
    const gleich = kand.find(m => !e.von || !m.mietbeginn || m.mietbeginn === e.von);
    if (gleich) return gleich;
    if (!e.von || k.length < 22) return null;
    return data.mieter.find(m => {
      if (m.mietbeginn !== e.von || !m.importName || (schonZugeordnet && schonZugeordnet.has(m.id))) return false;
      const n = normName(m.importName);
      return Math.min(n.length, k.length) >= 22 && (n.startsWith(k) || k.startsWith(n));
    }) || null;
  }
  /** Saldo-Posten so setzen, dass Summe offen = Saldo lt. Liste (Einzelposten gehen vor) */
  function saldoAbgleich(fall) {
    const sp = (fall.posten || []).find(p => p.saldo); if (!sp) return;
    const andere = sum(fall.posten.filter(p => p !== sp), p => p.offen);
    sp.offen = Math.max(0, round2(sp.saldoListe - andere));
  }
  /**
   * Salden importieren. eintraege: [{ name, von, bis, whg, pfkt, saldo, aktiv, wv[], notizen[] }]
   * o: { stand, blatt, objektId, mindestSaldo, ehemalige, notizen, wv, fehlendeErledigen, pruefWV, heute }
   */
  function importSalden(data, eintraege, o = {}) {
    const stand = o.stand || today(), heute = o.heute || today();
    const min = o.mindestSaldo == null ? 0.01 : o.mindestSaldo;
    const st = { mieterNeu: 0, objekteNeu: 0, faelleNeu: 0, aktualisiert: 0, unveraendert: 0, erledigt: 0, uebersprungen: 0, wvNeu: 0, summe: 0 };
    const gesehen = new Set();
    const objektFuer = e => {
      if (o.objektId) return o.objektId;
      const bez = e.pfkt ? 'PFkt. ' + e.pfkt : 'Import OPOS-Liste';
      let ob = data.objekte.find(x => x.bezeichnung === bez);
      if (!ob) { ob = { id: uid(), bezeichnung: bez, strasse: '', plzort: '', eigentuemer: '' }; data.objekte.push(ob); st.objekteNeu++; }
      return ob.id;
    };
    const quelle = '[' + fmtDatum(stand) + (o.blatt ? ' · ' + o.blatt : '') + '] ';
    // mehrere Personenkonten desselben Mieters (Wohnung, Stellplatz …) zu einem Saldo zusammenfassen
    const agg = new Map();
    eintraege.forEach(e => {
      const k = normName(e.name) + '|' + (e.von || '');
      const a = agg.get(k);
      if (!a) { agg.set(k, Object.assign({}, e, { wv: e.wv.slice(), notizen: e.notizen.slice(), konten: 1 })); return; }
      a.saldo = round2(a.saldo + e.saldo); a.konten++;
      if (e.whg && !(a.whg || '').split(', ').includes(e.whg)) a.whg = a.whg ? a.whg + ', ' + e.whg : e.whg;
      a.bis = !a.bis || !e.bis ? '' : maxISO(a.bis, e.bis);
      if (e.aktiv) a.aktiv = true;
      a.wv.push(...e.wv); e.notizen.forEach(t => { if (!a.notizen.includes(t)) a.notizen.push(t); });
    });
    Array.from(agg.values()).forEach(e => {
      if (!e.name) return;
      const ehemalig = e.aktiv === false || (e.bis && e.bis < stand);
      if (ehemalig && o.ehemalige === false) { st.uebersprungen++; return; }
      const hatSaldo = e.saldo >= min;
      let m = findeMieter(data, e, gesehen);
      if (!m && !hatSaldo) { st.uebersprungen++; return; }
      if (!m) {
        m = Object.assign({ id: uid(), objektId: objektFuer(e), whg: e.whg || '', anschrift: '', email: '', tel: '', mietnr: '', gesamtmiete: 0, mietbeginn: e.von || '', mietende: e.bis || '', kaution: 0, importName: e.name }, nameAufteilen(e.name));
        data.mieter.push(m); st.mieterNeu++;
      } else {
        if (!m.importName) m.importName = e.name;
        if (!m.mietbeginn && e.von) m.mietbeginn = e.von;
        if (e.bis && m.mietende !== e.bis) m.mietende = e.bis;
        if (!m.whg && e.whg) m.whg = e.whg;
      }
      gesehen.add(m.id);
      let fall = data.opos.find(f => f.mieterId === m.id && f.stufe !== 'erledigt');
      const fallNeu = !fall;
      if (!fall) {
        if (!hatSaldo) { st.uebersprungen++; return; }
        fall = { id: uid(), mieterId: m.id, stufe: 'neu', posten: [], raten: [], notiz: '', angelegt: heute };
        data.opos.push(fall); st.faelleNeu++;
        addVerlauf(data, 'opos', fall.id, 'import', 'Fall aus OPOS-Liste angelegt (Saldo ' + fmtEUR(e.saldo) + ', Stand ' + fmtDatum(stand) + ')', heute);
        if (o.pruefWV) createWV(data, 'opos', fall.id, heute, 'Importierten Fall prüfen – Zahlungserinnerung versenden?', { regel: 'opos:neu', heute });
      }
      const bez = 'Saldo lt. OPOS-Liste (Stand ' + fmtDatum(stand) + ')';
      let sp = fall.posten.find(p => p.saldo);
      if (!sp) {
        sp = { id: uid(), bez, faellig: stand, typ: 'sonstig', betrag: e.saldo, offen: e.saldo, saldo: true, saldoListe: e.saldo };
        fall.posten.push(sp);
        if (!fallNeu) st.aktualisiert++;
      } else if (round2(sp.saldoListe) !== round2(e.saldo)) {
        const diff = round2(e.saldo - sp.saldoListe);
        addVerlauf(data, 'opos', fall.id, 'import', 'Saldo lt. OPOS-Liste ' + fmtEUR(sp.saldoListe) + ' → ' + fmtEUR(e.saldo) + ' (' + (diff > 0 ? '+' : '') + fmtEUR(diff) + ', Stand ' + fmtDatum(stand) + ')', heute);
        Object.assign(sp, { saldoListe: e.saldo, betrag: e.saldo, bez, faellig: stand }); st.aktualisiert++;
      } else { sp.bez = bez; st.unveraendert++; }
      saldoAbgleich(fall);
      st.summe = round2(st.summe + Math.max(0, e.saldo));
      if (e.saldo <= 0 && offenSumme(fall.posten) <= 0) {
        applyAction(data, 'opos', fall.id, 'erledigt', { heute, verlaufText: 'Saldo lt. OPOS-Liste ausgeglichen (Stand ' + fmtDatum(stand) + ')' }); st.erledigt++;
        return;
      }
      if (o.notizen !== false) e.notizen.forEach(t => { if (!(fall.notiz || '').includes(t)) fall.notiz = (fall.notiz ? fall.notiz + '\n' : '') + quelle + t; });
      if (o.wv !== false) Array.from(new Set(e.wv)).forEach(w => {
        const d = wvDatum(data, w);
        if (data.wv.some(x => x.refId === fall.id && x.regel === 'import' && x.datum === d)) return;
        createWV(data, 'opos', fall.id, w, 'WV aus OPOS-Liste' + (o.blatt ? ' (' + o.blatt + ')' : '') + (e.notizen.length ? ': ' + e.notizen[e.notizen.length - 1].slice(0, 80) : ''), { erstelltDurch: 'manuell', regel: 'import', heute });
        st.wvNeu++;
      });
    });
    if (o.fehlendeErledigen) {
      data.opos.filter(f => f.stufe !== 'erledigt' && f.posten.some(p => p.saldo) && !gesehen.has(f.mieterId)).forEach(f => {
        const sp = f.posten.find(p => p.saldo); sp.saldoListe = 0; saldoAbgleich(f);
        if (offenSumme(f.posten) <= 0) { applyAction(data, 'opos', f.id, 'erledigt', { heute, verlaufText: 'Nicht mehr in der OPOS-Liste (Stand ' + fmtDatum(stand) + ') – erledigt' }); st.erledigt++; }
      });
    }
    return st;
  }

  /* ---------- E-Mail (.eml) ---------- */
  function asciiDateiname(s) {
    return String(s).replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
      .replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '_');
  }
  function wrap76(s) { return String(s).replace(/(.{76})/g, '$1\r\n'); }
  function buildEML({ to = '', cc = '', subject = '', text = '', attachments = [] }) {
    const b = '----=_Verwaltung_' + uid();
    const enc = s => '=?UTF-8?B?' + b64utf8(s) + '?=';
    const L = ['X-Unsent: 1', 'To: ' + to];
    if (cc) L.push('Cc: ' + cc);
    L.push('Subject: ' + enc(subject), 'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="' + b + '"', '',
      '--' + b, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(b64utf8(text)));
    attachments.forEach(a => {
      const n = asciiDateiname(a.name);
      L.push('--' + b, 'Content-Type: ' + (a.mime || 'application/octet-stream') + '; name="' + n + '"', 'Content-Transfer-Encoding: base64',
        'Content-Disposition: attachment; filename="' + n + '"', '', wrap76(a.base64));
    });
    L.push('--' + b + '--', '');
    return L.join('\r\n');
  }

  const Core = {
    STORE_KEY, PROTOTYP_KEY, DATA_VERSION, STUFEN, STUFEN_REIHE, IH_STATUS, IH_DRINGLICHKEIT, K_STATUS, BEREICHE, AKTIONEN, IMPORT_FELDER,
    today, isISO, addDays, addMonths, endOfMonth, diffDays, maxISO, easterSunday, feiertageNRW, feiertagName, isWochenende, isWerktag,
    naechsterWerktag, vorherigerWerktag, addWerktage, ordentlicherKuendigungstermin,
    fmtDatum, parseDatum, round2, fmtZahl, fmtEUR, parseBetrag, esc, uid, sum, b64utf8, monatLabel,
    mieterName, briefanrede,
    defaultSettings, emptyData, normalize, migratePrototype, stufeAusText,
    offenSumme, kuendigungsCheck, verteileZahlung, kautionsabrechnung, verjaehrung, kautionAmpel, ratenplan,
    wvDatum, createWV, completeWV, snoozeWV, closeWV, offeneWV, addVerlauf, wvRegeln, applyAction, findFall,
    getPath, vorlageZuHTML, vorlageZuText,
    parseCSV, guessMapping, typAusText, importOPOS, normName, nameAufteilen, parseMietzeit, parseSaldo, parseWV, erkenneFormat, titelMieter, parseJsonBlatt, parseSaldenBlatt, findeMieter, saldoAbgleich, importSalden, asciiDateiname, buildEML
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  else root.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);
