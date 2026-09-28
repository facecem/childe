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
        kautionAbrechnungMonate: 3, auszahlung: 14, bankverbindung: 14, emailMahnung: 7
      },
      puffer: 3, mahngebuehr: 0, feiertageNRW: true, ratenVerzugTage: 14,
      email: defaultEmail(),
      ui: defaultUI()
    };
  }
  /** E-Mail-Mahnung: Versandweg und Signatur */
  function defaultEmail() {
    return {
      methode: 'mailto', abmahnungStandard: true, cc: '',
      signatur: 'Mit freundlichen Grüßen\n\ni.A. H. Sahin\n\nHausverwaltung Dr. Marcel M. Sauren\nBrüsseler Ring 51\n52074 Aachen\n\nAchtung!\nTermine vor Ort nur nach vorheriger Vereinbarung.\n\n' +
        'Telefonzeiten:\nMo.   10:00-11:30 / 15:00-18:00\nDi.   10:00-11:30 / 15:00-18:00\nMi.   15:00-18:00\nDo.   10:00-11:30 / 15:00-18:00\nFr.   10:00-11:30 / 15:00-18:00\n\n' +
        'Tel:   0241 7755-023\nMail-to: hausverwaltung2@haus-ac.de\n\n' +
        'Diese E-Mail könnte vertrauliche und/oder rechtlich geschützte Informationen enthalten. Wenn Sie nicht der richtige Adressat sind oder diese E-Mail irrtümlich erhalten haben, informieren Sie bitte sofort den Absender und vernichten Sie diese Mail. Das unerlaubte Kopieren sowie die unbefugte Weitergabe dieser Mail sind nicht gestattet.'
    };
  }
  /** Offene Mietmonate als Text: „August 2026“, „Juli und August 2026“, „Juni, Juli und August 2026“ */
  function monateText(posten) {
    const ym = Array.from(new Set(nettoPosten(posten).filter(p => p.typ === 'miete' && round2(p.offen) > 0 && p.faellig).map(p => p.faellig.slice(0, 7)))).sort();
    if (!ym.length) return '';
    const jahre = new Set(ym.map(x => x.slice(0, 4)));
    const labels = ym.map(x => jahre.size === 1 ? monatLabel(x).split(' ')[0] : monatLabel(x));
    const txt = labels.length === 1 ? labels[0] : labels.slice(0, -1).join(', ') + ' und ' + labels[labels.length - 1];
    return jahre.size === 1 ? txt + ' ' + ym[0].slice(0, 4) : txt;
  }
  /** Anpassbare Oberfläche (Einstellungen → Anpassen) */
  function defaultUI() {
    return {
      wvButtons: [1, 2, 3, 4], wvEinheit: 'tage', neuWvTage: 7,
      wvAufgaben: ['Zahlungseingang prüfen', 'Rückruf Mieter', 'Rückmeldung Handwerker?', 'Mit Chef besprechen', 'Unterlagen angefordert – eingegangen?', 'Anwalt: Sachstand'],
      startTab: 'dashboard', dashZeit: 'faellig', tabs: ['dashboard', 'opos', 'ih', 'kaution', 'stamm', 'kontakte'],
      kacheln: ['ueber', 'heute', 'w7', 'opos', 'ih', 'kaution', 'rueck', 'verj'],
      akzent: '#1f5fa8', kopf: '#15385f', schrift: 14.5, kompakt: false, verjaehrungWarnTage: 30,
      gewerke: ['Sanitär', 'Heizung', 'Elektro', 'Dach', 'Maler', 'Schreiner/Tischler', 'Schlüsseldienst', 'Glaser', 'Rohrreinigung',
        'Schädlingsbekämpfung', 'Fenster/Türen', 'Bodenleger', 'Garten', 'Reinigung', 'Aufzug', 'Sonstiges']
    };
  }
  const WV_EINHEITEN = { tage: 'Tage', werktage: 'Werktage', wochen: 'Wochen', monate: 'Monate' };
  /** Datum um n Einheiten verschieben */
  function plusEinheit(iso, n, einheit = 'tage', nrw = true) {
    n = Number(n) || 0;
    if (einheit === 'werktage') return addWerktage(iso, n, nrw);
    if (einheit === 'wochen') return addDays(iso, n * 7);
    if (einheit === 'monate') return addMonths(iso, n);
    return addDays(iso, n);
  }
  function emptyData() {
    return {
      version: DATA_VERSION, settings: defaultSettings(), vorlagen: {},
      objekte: [], mieter: [], kontakte: [], adressbuch: [], wv: [], verlauf: [], opos: [], ih: [], kaution: [],
      meta: { lastBackup: null, erstellt: today() }
    };
  }
  const ARRAYS = ['objekte', 'mieter', 'kontakte', 'adressbuch', 'wv', 'verlauf', 'opos', 'ih', 'kaution'];
  function normalize(d) {
    const out = emptyData();
    if (!d || typeof d !== 'object') return out;
    Object.keys(d).forEach(k => { out[k] = d[k]; });
    out.version = DATA_VERSION;
    out.settings = Object.assign(defaultSettings(), d.settings || {});
    out.settings.fristen = Object.assign(defaultSettings().fristen, (d.settings && d.settings.fristen) || {});
    out.settings.ui = Object.assign(defaultUI(), (d.settings && d.settings.ui) || {});
    out.settings.email = Object.assign(defaultEmail(), (d.settings && d.settings.email) || {});
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
    const miete = nettoPosten(posten).filter(p => p.typ === 'miete' && round2(p.offen) > 0);
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
  function kautionAmpel(k, heute = today(), warnTage = 30) {
    if (k.status === 'ausgezahlt') return 'grau';
    const v = verjaehrung(k, heute);
    if (!v) return 'grau';
    if (v.restTage < warnTage) return 'rot';
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
  /** WV verschieben: ab WV-Datum (bzw. heute, falls überfällig) um n Tage/Werktage/Wochen/Monate */
  function snoozeWV(data, id, n, heute = today(), einheit = 'tage') {
    const w = data.wv.find(x => x.id === id); if (!w) return null;
    w.datum = wvDatum(data, plusEinheit(maxISO(w.datum, heute), n, einheit, data.settings.feiertageNRW !== false)); return w;
  }
  function setWVDatum(data, id, iso) { const w = data.wv.find(x => x.id === id); if (!w) return null; w.datum = wvDatum(data, iso); return w; }
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
      raten: 'Ratenzahlung vereinbart', erledigt: 'Fall erledigt', emailMahnung: 'Mahnung per E-Mail versendet'
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
      case 'opos:emailMahnung': {
        const frist = ctx.frist || addDays(h, Number(f.emailMahnung) || 7);
        return { schliessen: true, frist, neu: [{ datum: addDays(frist, P), aufgabe: 'Zahlungseingang prüfen (E-Mail-Mahnung' + (ctx.abmahnung ? ' + Abmahnung' : '') + ', Frist ' + fmtDatum(frist) + ')' }] };
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
      if (bereich === 'opos' && (aktion === 'abmahnung' || (aktion === 'emailMahnung' && ctx.abmahnung))) fall.abmahnungAm = h;
      if (bereich === 'opos' && aktion === 'emailMahnung' && ['neu', 'erinnerung'].includes(fall.stufe)) fall.stufe = 'mahnung1';
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
      else { fall.posten.push({ id: uid(), bez, faellig, typ, betrag: betrag || offen, offen, quelle: 'import' }); stat.postenNeu++; }
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
    const mn = s.match(/(\d{1,2})\.\s*(Jan|Feb|Mär|Mrz|Mar|Apr|Mai|May|Jun|Jul|Aug|Sep|Okt|Oct|Nov|Dez|Dec)[a-zä]*\.?/i);
    if (mn) {
      const nr = { jan: 1, feb: 2, mär: 3, mrz: 3, mar: 3, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, dez: 12, dec: 12 }[mn[2].toLowerCase()];
      let iso = stand.slice(0, 4) + '-' + pad(nr) + '-' + pad(mn[1]);
      if (diffDays(iso, stand) > 90) iso = addMonths(iso, 12);
      return iso;
    }
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
      const bez = 'Import OPOS-Liste';
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
    if ((data.adressbuch || []).length) Object.assign(st, adressbuchVerknuepfen(data));
    return st;
  }

  /* ---------- Telefonliste (PDF) → Adressbuch ---------- */
  const ANREDE_RE = /^(herrn?|frau|firma|eheleute|familie|herr und frau|frau und herr|herren|damen)$/i;
  /**
   * Telefonliste aus der Verwaltungssoftware zerlegen.
   * pages: [[{ x, y, s }]] (Textstücke je Seite, y von unten). Spalten: links Anrede/Name/Anschrift,
   * Mitte E-Mail, dann PFkt/Whg/AdrNr, rechts Rolle/Lage/„NACHNAME, VORNAME“.
   */
  function parseTelefonliste(pages) {
    const out = { stand: '', objekte: [], personen: [] };
    let obj = null, p = null, objOrt = false;
    const fertig = () => {
      if (!p) return;
      const L = p._links; let i = -1;
      L.forEach((t, k) => { if (/^([A-Z]{1,3}[\s-]+)?\d{4,5}\s+\S/.test(t)) i = k; });
      let namen = L;
      if (i >= 0) {
        p.plzort = L[i].replace(/^(D|DE)[\s-]+/, '');
        const hatStr = i >= 1 && /\d/.test(L[i - 1]) && !(i === 1 && ANREDE_RE.test(L[0]));
        p.strasse = hatStr ? L[i - 1] : '';
        namen = L.slice(0, hatStr ? i - 1 : i);
      }
      if (namen.length && ANREDE_RE.test(namen[0])) p.anrede = namen.shift().replace(/^Herrn$/i, 'Herr');
      p.name = namen.join(' und ');
      delete p._links;
      if (p.adrNr || p.importName) out.personen.push(p);
      p = null;
    };
    pages.forEach(items => {
      const zeilen = [];
      items.filter(it => String(it.s).trim() && it.y > 25).sort((a, b) => b.y - a.y || a.x - b.x).forEach(it => {
        const z = zeilen.find(r => Math.abs(r.y - it.y) <= 2);
        if (z) z.c.push(it); else zeilen.push({ y: it.y, c: [it] });
      });
      zeilen.forEach(z => {
        const c = z.c.sort((a, b) => a.x - b.x).map(it => ({ x: it.x, s: String(it.s).trim() }));
        const text = c.map(k => k.s).join(' ');
        const st = text.match(/gültig ab:?\s*(\d{1,2}\.\d{1,2}\.\d{2,4})/i);
        if (st) { out.stand = parseDatum(st[1]); return; }
        if (/^Objekt\s*Nr\.?$/i.test(c[0].s) && c[1]) {
          const nr = c[1].s;
          if (!obj || obj.nr !== nr) { fertig(); obj = { nr, strasse: c.slice(2).map(k => k.s).join(' '), plzort: '' }; out.objekte.push(obj); objOrt = 'neu'; }
          else objOrt = 'wiederholt'; // Seitenkopf wiederholt das Objekt – Block läuft weiter
          return;
        }
        if (objOrt && /^[A-Z]{1,3}$/.test(c[0].s) && c[0].x < 90) { if (objOrt === 'neu') obj.plzort = c.slice(1).map(k => k.s).join(' '); objOrt = false; return; }
        objOrt = false;
        const mitte = c.filter(k => k.x >= 250 && k.x < 325), rechts = c.filter(k => k.x >= 325).map(k => k.s).join(' ');
        const label = (mitte[0] || {}).s || '', wert = mitte.slice(1).map(k => k.s).join(' ');
        if (/^PFkt/i.test(label)) {
          fertig();
          p = { objektNr: obj ? obj.nr : '', pfkt: wert, whg: '', adrNr: '', rolle: rechts, lage: '', importName: '', anrede: '', name: '', strasse: '', plzort: '', emails: [], _links: [] };
        } else if (p && /^Whg/i.test(label)) { p.whg = wert; p.lage = rechts; }
        else if (p && /^AdrNr/i.test(label)) { p.adrNr = wert; p.importName = rechts; }
        if (!p) return;
        const links = c.filter(k => k.x < 180).map(k => k.s).join(' ').replace(/\s+/g, ' ').trim();
        if (links) p._links.push(links);
        c.filter(k => k.x >= 180 && k.x < 250).forEach(k => String(k.s).split(/[;,\s]+/).filter(m => /@/.test(m)).forEach(m => { if (!p.emails.includes(m)) p.emails.push(m); }));
      });
    });
    fertig();
    return out;
  }
  /** Abgeschnittene 30-Zeichen-Namensfelder vergleichen: gemeinsamer Anfang bis auf die letzten 2 Zeichen */
  function namensfeldGleich(a, b) {
    const n = Math.min(a.length, b.length); if (n < 20) return false;
    let i = 0; while (i < n && a[i] === b[i]) i++;
    return i >= n - 2;
  }
  const PLATZHALTER_OBJEKT = /^(PFkt\.|Import OPOS-Liste)/;
  function whgNr(s) { const m = String(s || '').match(/\d+/); return m ? String(+m[0]) : ''; }
  /** Telefonliste ins Adressbuch übernehmen (Schlüssel AdrNr). Nicht mehr enthaltene Einträge werden markiert, nicht gelöscht. */
  function importTelefonliste(data, liste, o = {}) {
    const heute = o.heute || today(), stand = liste.stand || heute;
    const st = { neu: 0, geaendert: 0, unveraendert: 0, entfernt: 0, objekteNeu: 0, mieterVerknuepft: 0, emailsNeu: 0, objektZugeordnet: 0 };
    data.adressbuch = data.adressbuch || [];
    const objByNr = {};
    liste.objekte.forEach(lo => {
      let ob = data.objekte.find(x => x.nr === lo.nr);
      const bez = titleCase(lo.strasse).replace(/\bStr\.?(\s|$)/g, 'Str.$1');
      if (!ob) { ob = { id: uid(), nr: lo.nr, bezeichnung: bez, strasse: bez, plzort: lo.plzort, eigentuemer: '' }; data.objekte.push(ob); st.objekteNeu++; }
      else { if (!ob.strasse) ob.strasse = bez; if (!ob.plzort) ob.plzort = lo.plzort; }
      objByNr[lo.nr] = ob;
    });
    const gesehen = new Set();
    liste.personen.forEach(lp => {
      const key = lp.adrNr || (lp.objektNr + '|' + lp.whg + '|' + lp.importName);
      gesehen.add(key);
      const eintrag = { key, adrNr: lp.adrNr, objektNr: lp.objektNr, objektId: (objByNr[lp.objektNr] || {}).id || '', pfkt: lp.pfkt, whg: lp.whg, lage: lp.lage, rolle: lp.rolle,
        anrede: lp.anrede, name: lp.name, importName: lp.importName, strasse: lp.strasse, plzort: lp.plzort, emails: lp.emails.slice() };
      const alt = data.adressbuch.find(a => a.key === key);
      if (!alt) { data.adressbuch.push(Object.assign(eintrag, { stand, seit: stand, aktiv: true, aenderung: 'neu' })); st.neu++; return; }
      const diff = ['emails', 'strasse', 'plzort', 'name', 'lage', 'rolle', 'whg'].filter(k => JSON.stringify(alt[k]) !== JSON.stringify(eintrag[k]));
      Object.assign(alt, eintrag, { stand, aktiv: true, aenderung: diff.length ? 'geändert: ' + diff.join(', ') : '' });
      if (diff.length) st.geaendert++; else st.unveraendert++;
    });
    data.adressbuch.forEach(a => { if (!gesehen.has(a.key) && a.aktiv !== false) { a.aktiv = false; a.aenderung = 'nicht mehr in Liste (' + fmtDatum(stand) + ')'; st.entfernt++; } });
    data.meta.telefonlisteStand = stand;
    Object.assign(st, adressbuchVerknuepfen(data));
    return st;
  }
  /** Adressbuch-Eintrag zu einem Mieter: Name (30-Zeichen-Feld), bei mehreren Treffern Wohnungsnummer */
  function adresseZuMieter(data, m) {
    if (!m) return null;
    const k = normName(m.importName || (m.nachname + ', ' + m.vorname));
    if (!k) return null;
    let kand = (data.adressbuch || []).filter(a => a.aktiv !== false && /mieter/i.test(a.rolle || 'mieter') && normName(a.importName) === k);
    if (!kand.length && k.length >= 20) kand = (data.adressbuch || []).filter(a => a.aktiv !== false && namensfeldGleich(normName(a.importName), k));
    if (m.adrNr) { const x = kand.find(a => a.adrNr === m.adrNr); if (x) return x; }
    if (kand.length > 1 && m.whg) { const nrs = String(m.whg).split(',').map(whgNr); const x = kand.find(a => nrs.includes(whgNr(a.whg))); if (x) return x; }
    return kand[0] || null;
  }
  function emailsZuMieter(data, m) {
    if (m && m.email) return m.email;
    const a = adresseZuMieter(data, m);
    return a && a.emails.length ? a.emails.join('; ') : '';
  }
  /** Mieter mit Adressbuch abgleichen: E-Mail, Anschrift, Anrede und Objekt ergänzen (manuelle E-Mails bleiben) */
  function adressbuchVerknuepfen(data) {
    const st = { mieterVerknuepft: 0, emailsNeu: 0, objektZugeordnet: 0 };
    data.mieter.forEach(m => {
      const a = adresseZuMieter(data, m); if (!a) return;
      st.mieterVerknuepft++;
      m.adrNr = a.adrNr;
      const mails = a.emails.join('; ');
      if (mails && (!m.email || m.emailQuelle === 'telefonliste') && m.email !== mails) { m.email = mails; m.emailQuelle = 'telefonliste'; st.emailsNeu++; }
      if (!m.anrede && a.anrede && m.anrede !== 'Firma') m.anrede = a.anrede;
      const ob = data.objekte.find(o => o.id === a.objektId);
      const aktObj = data.objekte.find(o => o.id === m.objektId);
      if (ob && (!aktObj || PLATZHALTER_OBJEKT.test(aktObj.bezeichnung))) { m.objektId = ob.id; st.objektZugeordnet++; }
      const wohntImObjekt = ob && normName(a.strasse).startsWith(normName(ob.strasse).slice(0, 8));
      if (!m.anschrift && a.strasse && !wohntImObjekt) m.anschrift = a.strasse + '\n' + a.plzort;
      if (!m.whg || /^Whg\. \d+$/.test(m.whg)) m.whg = a.lage ? a.lage.replace(/\s*-\s*$/, '') + ' (Whg. ' + whgNr(a.whg) + ')' : m.whg;
    });
    // leere Platzhalter-Objekte aufräumen
    data.objekte = data.objekte.filter(o => !PLATZHALTER_OBJEKT.test(o.bezeichnung) || data.mieter.some(m => m.objektId === o.id) || data.ih.some(f => f.objektId === o.id));
    return st;
  }

  /* ---------- OPOS-Liste (PDF, Einzelposten je Debitor) ---------- */
  /** Umlaute der PDF-Ausgabe reparieren (‰ ä, ˆ ö, ¸ ü, ‹ Ü, ÷ Ö, „fl“ zwischen Großbuchstaben ß) */
  function pdfUmlaute(t) {
    return String(t || '').replace(/‰/g, 'ä').replace(/ˆ/g, 'ö').replace(/¸/g, 'ü').replace(/‹/g, 'Ü').replace(/÷/g, 'Ö').replace(/Ä/g, 'Ä')
      .replace(/([A-ZÄÖÜ])\s?fl\s?([A-ZÄÖÜ])/g, '$1ß$2');
  }
  /** Textstücke einer Zeile zusammensetzen: aneinanderstoßende Stücke ohne Leerzeichen */
  function zeileText(items) {
    let out = '', ende = null;
    items.forEach(it => { if (ende != null) out += (it.x - ende > 1.5 ? ' ' : ''); out += it.s; ende = it.x + (it.w || it.s.length * 4.5); });
    return pdfUmlaute(out.replace(/\s+/g, ' ').trim());
  }
  function pdfZeilen(items, minY = 30) {
    const z = [];
    items.filter(it => String(it.s).trim() && it.y > minY).sort((a, b) => b.y - a.y || a.x - b.x).forEach(it => {
      const r = z.find(q => Math.abs(q.y - it.y) <= 2);
      if (r) r.c.push(it); else z.push({ y: it.y, c: [it] });
    });
    z.forEach(r => r.c.sort((a, b) => a.x - b.x));
    return z;
  }
  const BETRAG_RE = /^-?[\d.]+,\d\d$/;
  function typAusBuchung(text, aa) {
    const t = String(text || '').toLowerCase();
    if (/mahn|zins|abrechn|kaution|gebühr|gebuehr|kosten|schaden|gericht|anwalt/.test(t)) return 'sonstig';
    if (/^82[0-5]$/.test(String(aa))) return 'miete';
    return typAusText(t);
  }
  /**
   * OPOS-Liste (PDF) zerlegen. pages: [[{ x, y, s, w }]]
   * Kopf: „Objekt-Nr. 19400 STRASSE, PLZ, Ort“, „Auswertung zum …“; je Debitor: Kopfzeile, Posten, „Summe PKto“.
   */
  function parseOposPdf(pages) {
    const out = { stand: '', druck: '', konten: [] };
    let obj = { nr: '', strasse: '', plzort: '' }, k = null;
    const inBereich = (c, a, b) => c.filter(it => it.x >= a && it.x < b);
    pages.forEach(items => {
      items.forEach(it => { it.s = pdfUmlaute(it.s); });
      const fuss = items.find(it => /Druckdatum/.test(it.s));
      if (fuss) { const d = items.find(it => Math.abs(it.y - fuss.y) < 2 && /^\d{2}\.\d{2}\.\d{4}$/.test(it.s.trim())); if (d) out.druck = parseDatum(d.s.trim()); }
      pdfZeilen(items).forEach(z => {
        const c = z.c, text = zeileText(c);
        let m;
        if ((m = text.match(/Auswertung zum\s*(\d{1,2}\.\d{1,2}\.\d{2,4})/))) out.stand = parseDatum(m[1]);
        if ((m = text.match(/Objekt-Nr\.\s*(\S+)\s+(.*?)(?:\s+Auswertung zum.*)?$/))) {
          const teile = m[2].split(/,\s*/);
          obj = { nr: m[1], strasse: teile[0] || '', plzort: teile.slice(1).join(' ').trim() };
          return;
        }
        if (/^Debitor/.test(c[0].s)) {
          const kopf = zeileText(inBereich(c, 80, 295)).match(/^(\d+)\s+(.*)$/) || [];
          const deb = kopf[1] || '';
          if (k && k.debitor === deb && !k.summe) return; // Seitenumbruch: Block läuft weiter
          const zeit = parseMietzeit(zeileText(inBereich(c, 640, 900)));
          const mitte = zeileText(inBereich(c, 295, 640));
          k = { objektNr: obj.nr, objektStrasse: obj.strasse, objektPlzOrt: obj.plzort, debitor: deb, name: (kopf[2] || '').trim(),
            whg: ((mitte.match(/Whg\.\s*(\S+)/) || [])[1] || ''), pfkt: ((mitte.match(/PFkt\.\s*(\d+)/) || [])[1] || ''), rolle: ((mitte.match(/PFkt\.\s*\d+\s+(.*)$/) || [])[1] || '').trim(),
            von: zeit.von, bis: zeit.bis, lage: '', posten: [], summe: null };
          out.konten.push(k);
          return;
        }
        if (!k) return;
        if (/^Lage\b/.test(zeileText(inBereich(c, 290, 330))) || (c[0].x > 290 && c[0].x < 300 && c[0].s === 'Lage')) { k.lage = zeileText(inBereich(c, 320, 640)); return; }
        if (/Summe PKto/.test(text)) {
          const sm = { soll: 0, haben: 0, saldo: 0, mahnkosten: 0, gesamt: 0 };
          c.filter(it => /^-?[\d.]+,\d\d(\s*[HS])?$/.test(it.s.trim())).forEach(it => {
            const v = parseBetrag(it.s.replace(/[HS]/, '')) * (/H\s*$/.test(it.s) ? -1 : 1);
            const f = it.x < 475 ? 'soll' : it.x < 540 ? 'haben' : it.x < 640 ? 'saldo' : it.x < 720 ? 'mahnkosten' : 'gesamt';
            sm[f] = f === 'soll' || f === 'haben' ? Math.abs(v) : v;
          });
          k.summe = sm;
          return;
        }
        const bu = c.find(it => it.x >= 55 && it.x < 110 && /^\d{2}\.\d{2}\.\d{2,4}$/.test(it.s.trim()));
        const aa = c.find(it => it.x >= 148 && it.x < 170 && /^\d{3}$/.test(it.s.trim()));
        if (bu && aa) {
          const betr = x0 => inBereich(c, x0[0], x0[1]).map(it => it.s.trim()).find(v => BETRAG_RE.test(v));
          const soll = parseBetrag(betr([395, 475]) || 0), haben = parseBetrag(betr([475, 532]) || 0);
          const fae = c.find(it => it.x >= 565 && it.x < 610 && /^\d{2}\.\d{2}\.\d{2,4}$/.test(it.s.trim()));
          const ausg = c.find(it => it.x >= 640 && it.x < 690 && /^\d{2}\.\d{2}\.\d{2,4}$/.test(it.s.trim()));
          const tage = c.find(it => it.x >= 610 && it.x < 640 && /^-?\d+$/.test(it.s.trim()));
          const mst = c.find(it => it.x < 55 && /^\d$/.test(it.s.trim()));
          const bez = zeileText(inBereich(c, 180, 395)).replace(/\s*\|.*$/, '');
          k.posten.push({ mst: mst ? +mst.s : 0, budatum: parseDatum(bu.s.trim()), beleg: zeileText(inBereich(c, 110, 148)), aa: aa.s.trim(), text: bez,
            soll, haben, betrag: round2(soll - haben), faellig: fae ? parseDatum(fae.s.trim()) : parseDatum(bu.s.trim()), tage: tage ? +tage.s : null,
            ausgeglichen: ausg ? parseDatum(ausg.s.trim()) : '', typ: haben > 0 && !soll ? 'gutschrift' : typAusBuchung(bez, aa.s.trim()) });
        }
      });
    });
    out.konten.forEach(x => {
      x.saldo = sum(x.posten, p => p.betrag);
      x.kontrolle = x.summe ? round2(x.saldo) === round2(x.summe.saldo) : null;
    });
    return out;
  }
  /** Monatsmiete aus vollen Mietposten eines Monats schätzen (Grundmiete + Vorauszahlungen, ohne „Diff.“-Posten) */
  function monatsmieteSchaetzen(posten) {
    const proMonat = {};
    (posten || []).filter(p => p.typ === 'miete' && p.soll > 0 && !/^diff/i.test(p.text || p.bez || '')).forEach(p => { const k = (p.faellig || '').slice(0, 7); proMonat[k] = round2((proMonat[k] || 0) + p.soll); });
    const werte = Object.keys(proMonat).sort().map(k => proMonat[k]);
    return werte.length ? werte[werte.length - 1] : 0;
  }
  /** Offene Posten nach Verrechnung von Gutschriften/Zahlungen (negativ) mit den ältesten Forderungen */
  function nettoPosten(posten) {
    const plus = (posten || []).filter(p => round2(p.offen) > 0);
    const gut = -sum((posten || []).filter(p => round2(p.offen) < 0), p => p.offen);
    return gut > 0 ? verteileZahlung(plus, gut).posten.filter(p => round2(p.offen) > 0) : plus;
  }
  /** OPOS-Liste (PDF) übernehmen: Posten je Fall werden durch die Liste ersetzt (manuell erfasste bleiben) */
  function importOposPdf(data, liste, o = {}) {
    const heute = o.heute || today(), stand = liste.stand || liste.druck || heute;
    const min = o.mindestSaldo == null ? 0.01 : o.mindestSaldo;
    const st = { konten: liste.konten.length, faelleNeu: 0, mieterNeu: 0, objekteNeu: 0, aktualisiert: 0, unveraendert: 0, erledigt: 0, guthaben: 0, posten: 0, kontrolleFehler: [], uebersprungen: 0, summe: 0 };
    const gesehen = new Set(), objekteInListe = new Set();
    liste.konten.forEach(kt => {
      let ob = data.objekte.find(x => x.nr === kt.objektNr);
      if (!ob && kt.objektNr) {
        const bez = titleCase(kt.objektStrasse);
        ob = { id: uid(), nr: kt.objektNr, bezeichnung: bez, strasse: bez, plzort: kt.objektPlzOrt, eigentuemer: '' }; data.objekte.push(ob); st.objekteNeu++;
      }
      if (ob) objekteInListe.add(ob.id);
      if (kt.kontrolle === false) st.kontrolleFehler.push(kt.debitor + ' ' + kt.name);
      let m = data.mieter.find(x => x.mietnr && x.mietnr === kt.debitor) || findeMieter(data, { name: kt.name, von: kt.von }, gesehen);
      if (!m) {
        const k2 = normName(kt.name);
        m = data.mieter.find(x => !gesehen.has(x.id) && (!kt.von || !x.mietbeginn || x.mietbeginn === kt.von) && namensfeldGleich(normName(x.importName || ''), k2)) || null;
      }
      if (!m && !(kt.saldo >= min)) { st.uebersprungen++; return; }
      if (!m) {
        m = Object.assign({ id: uid(), objektId: ob ? ob.id : '', whg: '', anschrift: '', email: '', tel: '', mietnr: kt.debitor, gesamtmiete: 0, mietbeginn: kt.von, mietende: kt.bis, kaution: 0, importName: kt.name }, nameAufteilen(kt.name));
        data.mieter.push(m); st.mieterNeu++;
      }
      gesehen.add(m.id);
      m.mietnr = kt.debitor; if (!m.importName) m.importName = kt.name;
      if (kt.von && !m.mietbeginn) m.mietbeginn = kt.von;
      if (kt.bis !== undefined && (kt.bis || m.mietende)) m.mietende = kt.bis || m.mietende;
      const akt = data.objekte.find(x => x.id === m.objektId);
      if (ob && (!akt || PLATZHALTER_OBJEKT.test(akt.bezeichnung))) m.objektId = ob.id;
      if ((!m.whg || /^Whg\. [\d, Whg.]+$/.test(m.whg)) && (kt.lage || kt.whg)) m.whg = (kt.lage ? kt.lage + ' ' : '') + '(Whg. ' + kt.whg + ')';
      let fall = data.opos.find(f => f.mieterId === m.id && f.stufe !== 'erledigt');
      if (!fall) {
        if (!(kt.saldo >= min)) { if (kt.saldo < 0) st.guthaben++; else st.uebersprungen++; return; }
        fall = { id: uid(), mieterId: m.id, stufe: 'neu', posten: [], raten: [], notiz: '', angelegt: heute };
        data.opos.push(fall); st.faelleNeu++;
        if (o.pruefWV) createWV(data, 'opos', fall.id, heute, 'Importierten Fall prüfen – Mahnen?', { regel: 'opos:neu', heute });
      }
      const vorher = offenSumme(fall.posten);
      fall.posten = fall.posten.filter(p => !p.saldo && !p.quelle);
      kt.posten.forEach(p => fall.posten.push({ id: uid(), bez: p.text, faellig: p.faellig, budatum: p.budatum, beleg: p.beleg, aa: p.aa, mst: p.mst, tage: p.tage,
        typ: p.typ, betrag: p.betrag, offen: p.betrag, quelle: 'opos-pdf' }));
      fall.oposStand = stand; fall.mahnstufeListe = Math.max(0, ...kt.posten.map(p => p.mst || 0));
      if (!(m.gesamtmiete > 0) || m.mieteGeschaetzt) { const mm = monatsmieteSchaetzen(kt.posten); if (mm > 0) { m.gesamtmiete = mm; m.mieteGeschaetzt = true; } }
      st.posten += kt.posten.length;
      const nachher = offenSumme(fall.posten);
      st.summe = round2(st.summe + Math.max(0, nachher));
      if (round2(vorher) !== round2(nachher)) {
        addVerlauf(data, 'opos', fall.id, 'import', 'OPOS-Liste (Stand ' + fmtDatum(stand) + ') eingelesen: ' + kt.posten.length + ' Posten, offen ' + fmtEUR(vorher) + ' → ' + fmtEUR(nachher), heute);
        st.aktualisiert++;
      } else st.unveraendert++;
      if (nachher <= 0) {
        applyAction(data, 'opos', fall.id, 'erledigt', { heute, verlaufText: nachher < 0 ? 'Guthaben ' + fmtEUR(-nachher) + ' lt. OPOS-Liste – erledigt' : 'Ausgeglichen lt. OPOS-Liste – erledigt' });
        st.erledigt++;
      }
    });
    if (o.fehlendeErledigen) {
      data.opos.filter(f => f.stufe !== 'erledigt' && f.posten.some(p => p.quelle || p.saldo)).forEach(f => {
        const m = data.mieter.find(x => x.id === f.mieterId);
        if (!m || gesehen.has(m.id) || !objekteInListe.has(m.objektId)) return;
        f.posten = f.posten.filter(p => !p.saldo && !p.quelle);
        if (offenSumme(f.posten) <= 0) { applyAction(data, 'opos', f.id, 'erledigt', { heute, verlaufText: 'Nicht mehr in der OPOS-Liste (Stand ' + fmtDatum(stand) + ') – erledigt' }); st.erledigt++; }
      });
    }
    data.meta.oposStand = stand;
    if ((data.adressbuch || []).length) Object.assign(st, adressbuchVerknuepfen(data));
    return st;
  }

  /* ---------- Instandhaltungsliste (Excel, TO-DO-Liste) ---------- */
  /** Montag der Kalenderwoche (ISO 8601) */
  function kwMontag(kw, jahr) {
    const j4 = new Date(Date.UTC(jahr, 0, 4)); const dow = (j4.getUTCDay() + 6) % 7;
    j4.setUTCDate(j4.getUTCDate() - dow + (kw - 1) * 7); return isoFromDate(j4);
  }
  function kwVon(iso) { const d = dateFromISO(iso); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow + 3); const j1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4)); return 1 + Math.round(((d - j1) / 86400000 - 3 + ((j1.getUTCDay() + 6) % 7)) / 7); }
  /** Termin aus Datum, „23.09.2026 | 24.09“, „KW 40“, Freitext → { datum, text } */
  function parseTermin(v, stand) {
    if (v == null || v === '') return { datum: '', text: '' };
    if (v instanceof Date) return { datum: parseDatum(v), text: '' };
    const s = String(v).trim();
    const kw = s.match(/KW\s*(\d{1,2})/i);
    if (kw) { let y = +stand.slice(0, 4); if (+kw[1] < kwVon(stand) - 20) y++; return { datum: kwMontag(+kw[1], y), text: s }; }
    const d = parseWV(s, stand);
    return { datum: d, text: d && /^\s*\d{1,2}\.\d{1,2}\.(\d{2,4})?\s*$/.test(s) ? '' : s };
  }
  function zellTextIH(v) { return v == null ? '' : v instanceof Date ? fmtDatum(parseDatum(v)) : typeof v === 'number' ? String(v) : String(v).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim(); }
  const PRIO_RE = /^(a\+|aaa|aa|a|b|c)(\s*punkt)?$/i;
  /**
   * TO-DO-Liste der Instandhaltung zerlegen. Kopfzeilen („Objekt“ … „Aufgabe“) dürfen mehrfach vorkommen – es gilt die letzte.
   * rows: sichtbare Zeilen, zeilen: Excel-Zeilennummern (optional)
   */
  function parseIhListe(rows, stand, zeilen) {
    const out = []; let map = null; const zaehler = {};
    rows.forEach((r, i) => {
      const low = r.map(c => String(c == null ? '' : c).trim().toLowerCase());
      if (low.includes('objekt') && low.includes('aufgabe')) {
        map = {};
        low.forEach((h, j) => {
          if (h === 'objekt') map.objekt = j; else if (/^(sb|hausmeister|sachbearbeiter|zuständig)$/.test(h)) map.sb = j; else if (h === 'aufgabe') map.aufgabe = j;
          else if (/material/.test(h)) map.material = j; else if (/^termin/.test(h)) map.termin = j; else if (/mieter|tel/.test(h)) map.mieter = j;
          else if (/nächster schritt|naechster schritt|schritt/.test(h)) map.schritt = j; else if (/^wv$|wiedervorlage/.test(h)) map.wv = j; else if (/besonderheit|bemerkung/.test(h)) map.besonderheiten = j;
          else if (/^prio/.test(h)) map.prio = j;
        });
        return;
      }
      if (!map || map.aufgabe == null) return;
      const g = k => (map[k] == null ? null : r[map[k]]);
      const aufgabe = zellTextIH(g('aufgabe')), objektText = zellTextIH(g('objekt')).replace(/\n/g, ' ');
      if (!aufgabe && !objektText) return;
      let prio = zellTextIH(g('prio')), mieterInfo = zellTextIH(g('mieter')), schritt = zellTextIH(g('schritt'));
      if (PRIO_RE.test(mieterInfo)) { prio = prio || mieterInfo; mieterInfo = ''; }
      if (PRIO_RE.test(schritt)) { prio = prio || schritt; schritt = ''; }
      prio = prio ? prio.replace(/\s*punkt$/i, '').toUpperCase() : '';
      const wvRoh = g('wv'); const wvDatum = parseWV(wvRoh, stand);
      const wvText = wvRoh instanceof Date ? '' : zellTextIH(wvRoh).replace(/^(WV\s*)?\d{1,2}\.\s*(\d{1,2}\.?|[A-Za-zä]{3,}\.?)(\d{2,4})?\s*/i, '').trim();
      const basis = normName(objektText).slice(0, 30) + '|' + normName(aufgabe).slice(0, 40);
      zaehler[basis] = (zaehler[basis] || 0) + 1;
      out.push({ key: basis + (zaehler[basis] > 1 ? '#' + zaehler[basis] : ''), zeile: zeilen ? zeilen[i] : i + 1, objektText, sb: zellTextIH(g('sb')), aufgabe,
        titel: aufgabe.split('\n')[0].replace(/\s*\/\/.*$/, '').slice(0, 90) || objektText, material: zellTextIH(g('material')), termin: parseTermin(g('termin'), stand),
        prio, mieterInfo, schritt, wv: wvDatum, wvText, besonderheiten: zellTextIH(g('besonderheiten')) });
    });
    return out;
  }
  function strNorm(s) { return String(s || '').toLowerCase().replace(/ß/g, 'ss').replace(/str\.|strasse/g, 'strasse').replace(/[^a-z0-9äöü]/g, ''); }
  /** Adresse zerlegen: Straßenname + Hausnummer(n) („1 - 22“, „5+7+9“, „53-55“) */
  function adresseTeile(s) {
    s = String(s || '').replace(/\n/g, ' ');
    const m = s.match(/^\s*(.*?[A-Za-zÄÖÜäöüß.])\s*(\d+)\s*[a-z]?\b((?:\s*[-–+,]\s*\d+\s*[a-z]?\b)*)/);
    if (!m) return { name: strNorm(s), nummern: [] };
    const nums = [+m[2]]; const rest = m[3] || '';
    const rng = (m[2] + rest).match(/^(\d+)\s*[-–]\s*(\d+)/);
    if (rng && +rng[2] > +rng[1] && +rng[2] - +rng[1] < 200) { for (let n = +rng[1]; n <= +rng[2]; n++) nums.push(n); }
    else (rest.match(/\d+/g) || []).forEach(n => nums.push(+n));
    return { name: strNorm(m[1]), nummern: nums };
  }
  /** Objekt zu einem Freitext wie „Am Alten Bahnhof 10 Haustür“ oder „Jakobstraße 25a, 3.OG rechts“ finden */
  function objektFinden(data, text) {
    const t = adresseTeile(text); if (!t.name || t.name.length < 5) return null;
    let best = null, score = 0;
    data.objekte.forEach(o => {
      if (PLATZHALTER_OBJEKT.test(o.bezeichnung)) return;
      [o.strasse, o.bezeichnung].filter(Boolean).forEach(adr => {
        const a = adresseTeile(adr); if (!a.name || a.name.length < 5) return;
        if (!(t.name === a.name || t.name.endsWith(a.name) || a.name.endsWith(t.name) || t.name.includes(a.name))) return;
        let sc = t.name === a.name ? 2 : 1;
        if (t.nummern.length && a.nummern.length) { if (a.nummern.includes(t.nummern[0])) sc += 3; else return; }
        if (sc > score) { score = sc; best = o; }
      });
    });
    return best;
  }
  /** Instandhaltungsliste übernehmen/abgleichen (Schlüssel: Objekt + Aufgabe) */
  function importIhListe(data, eintraege, o = {}) {
    const heute = o.heute || today(), stand = o.stand || heute;
    const st = { neu: 0, geaendert: 0, unveraendert: 0, erledigt: 0, wiedereroeffnet: 0, wvNeu: 0, ohneObjekt: 0 };
    const gesehen = new Set();
    eintraege.forEach(e => {
      gesehen.add(e.key);
      const ob = objektFinden(data, e.objektText);
      const felder = { objektText: e.objektText, sb: e.sb, prio: e.prio, material: e.material, naechsterSchritt: e.schritt, besonderheiten: e.besonderheiten, mieterInfo: e.mieterInfo,
        termin: e.termin.datum || '', terminText: e.termin.text, wvText: e.wvText, beschreibung: e.aufgabe, titel: e.titel, listenZeile: e.zeile };
      let f = data.ih.find(x => x.listenKey === e.key);
      if (!f) {
        f = Object.assign({ id: uid(), objektId: ob ? ob.id : '', mieterId: '', gemeldetAm: stand, dringlichkeit: /^(A\+|AAA|AA)$/.test(e.prio) ? 'hoch' : 'normal',
          status: e.termin.datum ? 'beauftragt' : 'gemeldet', gewerk: '', verursacher: 'unklar', angebote: [], anfragen: [], fotos: [], quelle: 'ih-liste', listenKey: e.key }, felder);
        data.ih.push(f); st.neu++;
        addVerlauf(data, 'ih', f.id, 'import', 'Aus Instandhaltungsliste übernommen' + (o.blatt ? ' (' + o.blatt + ', Zeile ' + e.zeile + ')' : ''), heute);
      } else {
        const diff = ['sb', 'prio', 'material', 'naechsterSchritt', 'besonderheiten', 'termin', 'terminText', 'wvText', 'beschreibung'].filter(k => (f[k] || '') !== (felder[k] || ''));
        if (['erledigt', 'abgerechnet'].includes(f.status)) { f.status = 'gemeldet'; st.wiedereroeffnet++; addVerlauf(data, 'ih', f.id, 'import', 'Wieder in der Instandhaltungsliste – erneut geöffnet', heute); }
        if (diff.length) {
          addVerlauf(data, 'ih', f.id, 'import', 'Liste geändert: ' + diff.map(k => ({ naechsterSchritt: 'nächster Schritt', terminText: 'Termin', wvText: 'WV', beschreibung: 'Aufgabe' }[k] || k) + (k === 'naechsterSchritt' && felder[k] ? ' „' + felder[k] + '“' : '')).join(', '), heute);
          st.geaendert++;
        } else st.unveraendert++;
        Object.assign(f, felder);
        if (!f.objektId && ob) f.objektId = ob.id;
        if (f.termin && f.status === 'gemeldet') f.status = 'beauftragt';
      }
      if (!f.objektId) st.ohneObjekt++;
      const offen = regel => data.wv.filter(w => w.bereich === 'ih' && w.refId === f.id && w.status === 'offen' && w.regel === regel);
      // WV lt. Liste
      const wvTag = e.wv || (e.wvText && !offen('ih-liste').length ? heute : '');
      if (wvTag && !offen('ih-liste').some(w => w.datum === wvDatum(data, wvTag))) {
        data.wv.filter(w => w.refId === f.id && w.regel === 'ih-liste' && w.status === 'offen').forEach(w => { w.status = 'erledigt'; w.erledigtAm = heute; });
        createWV(data, 'ih', f.id, wvTag, (e.wvText ? e.wvText + ' – ' : '') + (e.schritt || e.titel), { erstelltDurch: 'manuell', regel: 'ih-liste', heute }); st.wvNeu++;
      }
      // Termin
      if (e.termin.datum && !offen('ih-liste-termin').some(w => w.datum === wvDatum(data, e.termin.datum))) {
        data.wv.filter(w => w.refId === f.id && w.regel === 'ih-liste-termin' && w.status === 'offen').forEach(w => { w.status = 'erledigt'; w.erledigtAm = heute; });
        createWV(data, 'ih', f.id, e.termin.datum, 'Termin: ' + e.titel + (e.termin.text ? ' (' + e.termin.text + ')' : '') + ' – erledigt?', { erstelltDurch: 'manuell', regel: 'ih-liste-termin', heute }); st.wvNeu++;
      }
    });
    if (o.fehlendeErledigen !== false) {
      data.ih.filter(f => f.quelle === 'ih-liste' && !gesehen.has(f.listenKey) && !['erledigt', 'abgerechnet'].includes(f.status)).forEach(f => {
        f.status = 'erledigt'; f.erledigtAm = heute;
        data.wv.forEach(w => { if (w.bereich === 'ih' && w.refId === f.id && w.status === 'offen') { w.status = 'erledigt'; w.erledigtAm = heute; } });
        addVerlauf(data, 'ih', f.id, 'import', 'Nicht mehr (sichtbar) in der Instandhaltungsliste – als erledigt markiert', heute); st.erledigt++;
      });
    }
    data.meta.ihListeStand = stand;
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
    monateText, defaultEmail, wvDatum, createWV, completeWV, snoozeWV, setWVDatum, plusEinheit, WV_EINHEITEN, defaultUI, closeWV, offeneWV, addVerlauf, wvRegeln, applyAction, findFall,
    getPath, vorlageZuHTML, vorlageZuText,
    parseCSV, guessMapping, typAusText, importOPOS, normName, nameAufteilen, parseMietzeit, parseSaldo, parseWV, erkenneFormat, titelMieter, parseJsonBlatt, parseSaldenBlatt, findeMieter, saldoAbgleich, importSalden, parseTelefonliste, importTelefonliste, parseOposPdf, importOposPdf, nettoPosten, pdfUmlaute, typAusBuchung, monatsmieteSchaetzen, kwMontag, parseTermin, parseIhListe, adresseTeile, objektFinden, importIhListe, adresseZuMieter, emailsZuMieter, adressbuchVerknuepfen, whgNr, asciiDateiname, buildEML
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  else root.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);
