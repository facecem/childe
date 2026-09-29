/* ============================================================
 * modules/instandhaltung – Schaden → Anfrage → Auftrag → Rechnung
 * ============================================================ */
(function (root) {
  'use strict';
  const C = root.Core, D = root.Docs, App = root.App, H = App.h;
  const { esc, fmtEUR, fmtDatum } = C;
  const ST = C.IH_STATUS, DR = C.IH_DRINGLICHKEIT;
  const VERURSACHER = { unklar: 'unklar', verschleiss: 'Verschleiß / Alterung', mieter: 'Mieter' };
  const REIHE = ['gemeldet', 'angefragt', 'beauftragt', 'in_arbeit', 'erledigt', 'abgerechnet'];

  const objektName = x => (H.objekt(x.objektId) || {}).bezeichnung || x.objektText || '–';
  const PRIO_CLS = { 'A+': 'rot', AAA: 'rot', AA: 'rot', A: 'gelb', B: 'blau', C: '' };
  const aktiv = x => !(x.status === 'abgerechnet' || (x.status === 'erledigt' && x.quelle === 'ih-liste'));
  function tabelle(list) {
    return '<table class="tbl" id="ihTabelle"><thead><tr><th>Objekt</th><th>Aufgabe / nächster Schritt</th><th>SB</th><th>Prio</th><th>Status</th><th>Termin</th><th>nächste WV</th></tr></thead><tbody>' +
      list.map(x => {
        const m = H.mieter(x.mieterId); const hw = H.kontakt(x.handwerkerId);
        const zusatz = x.objektText && H.objekt(x.objektId) && C.normName(x.objektText) !== C.normName(objektName(x)) ? x.objektText : '';
        return '<tr class="klick" data-act="openFall" data-b="ih" data-id="' + x.id + '"><td>' + esc(objektName(x)) + (!x.objektId ? ' <small class="muted" title="keinem Objekt zugeordnet">?</small>' : '') +
          (zusatz ? '<br><small class="muted">' + esc(zusatz) + '</small>' : '') + (m && m.whg ? '<br><small class="muted">' + esc(C.mieterName(m)) + ' · ' + esc(m.whg) + '</small>' : '') + '</td>' +
          '<td><b>' + esc(x.titel) + '</b>' + App.flagIcon('ih', x) + (x.fotos.length ? ' <small class="muted">📷' + x.fotos.length + '</small>' : '') + (x.naechsterSchritt ? '<br><small>→ ' + esc(x.naechsterSchritt) + '</small>' : '') +
          (hw ? '<br><small class="muted">' + esc(hw.firma) + '</small>' : '') + '</td><td>' + esc(x.sb || '') + '</td>' +
          '<td>' + (x.prio ? H.chip(x.prio, PRIO_CLS[x.prio] || '') : x.dringlichkeit !== 'normal' ? H.chip(DR[x.dringlichkeit], 'dr-' + x.dringlichkeit) : '') + '</td>' +
          '<td>' + H.chip(ST[x.status], 'is-' + x.status) + '</td><td class="nw small">' + fmtDatum(x.termin) + (x.terminText && !x.termin ? esc(x.terminText.slice(0, 25)) : '') + '</td>' +
          '<td>' + H.wvChip(H.naechsteWV('ih', x.id)) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  /** Knopf „In Excel eintragen (n)“ – nur wenn Aufgaben aus der Excel-Liste stammen */
  function excelKnopf() {
    if (!App.data.ih.some(x => x.quelle === 'ih-liste')) return '';
    const n = C.excelAenderungen(App.data).length;
    return '<button data-act="ihExcelSchreiben" class="' + (n ? 'primary' : '') + '" title="WV und nächste Schritte aus dem Tool in die Instandhaltungsliste (Excel) schreiben">⇄ In Excel eintragen' + (n ? ' (' + n + ')' : '') + '</button>';
  }
  App.ihExcelKnopf = excelKnopf;

  /** Kern: Änderungen in die Datei schreiben, prüfen, Stand merken → { res, alt, blob, pruef } oder { fehler } */
  async function excelSchreiben(aend, h, datei) {
    const gruppen = {}; aend.forEach(a => { const bl = a.neu ? a.blatt : (a.f.listenBlatt || ''); (gruppen[bl] = gruppen[bl] || []).push(a); });
    const res = { ok: [], fehlt: [], konflikt: [] }; let alt = null, blob = null, pruef = null;
    try {
      for (const blatt of Object.keys(gruppen)) {
        const r2 = await D.excelZellenAendern(blob ? new File([blob], datei.name) : datei, blatt, gruppen[blatt]);
        if (!alt) alt = r2.alt; if (r2.blob) blob = r2.blob;
        res.ok.push(...r2.ok); res.fehlt.push(...r2.fehlt); res.konflikt.push(...r2.konflikt);
      }
      if (blob) {
        if (h && D.DATEI_API) { await D.dateiSchreiben(h, blob); pruef = await D.excelPruefen(await h.getFile(), res.ok); }
        else D.download(blob, datei.name);
      }
    } catch (e) {
      const gesperrt = /NoModificationAllowed|InvalidState|NotReadable|InvalidModification/.test(e.name) || /lock|gesperrt|in use|being used/i.test(e.message);
      const fehler = gesperrt ? 'Die Excel-Datei ist gerade geöffnet oder gesperrt – bitte Excel schließen. Nichts wurde geändert.' : 'Nicht in Excel gespeichert: ' + e.message;
      App.data.meta.ihExcelStatus = { zeit: new Date().toISOString(), ok: false, text: fehler, gesperrt };
      App.save();
      return { fehler, gesperrt };
    }
    C.excelGeschrieben(res.ok);
    res.ok.forEach(a => C.addVerlauf(App.data, 'ih', a.f.id, 'excel', (a.neu ? 'Als neue Zeile ' + a.zeile + ' in die Instandhaltungsliste eingetragen' : 'In Instandhaltungsliste eingetragen (Zeile ' + a.zeile + ')') +
      ': ' + [a.wv || (a.neu && a.werte.wv) ? 'WV ' + fmtDatum(a.wv || a.werte.wv) : '', a.termin ? 'Termin ' + fmtDatum(a.termin) : '', a.schritt != null && !a.neu ? 'nächster Schritt „' + a.schritt + '“' : ''].concat((a.texte || []).map(t => t.label + ' „' + t.wert + '“')).filter(Boolean).join(', ')));
    App.data.meta.ihExcelGeschrieben = new Date().toISOString();
    App.data.meta.ihExcelStatus = { zeit: new Date().toISOString(), ok: !pruef || pruef.ok, text: (res.ok.length ? res.ok.length + ' eingetragen' : 'nichts eingetragen') + (res.konflikt.length ? ', ' + res.konflikt.length + ' Konflikt(e)' : '') + (res.fehlt.length ? ', ' + res.fehlt.length + ' nicht gefunden' : '') + (pruef && !pruef.ok ? ' – Kontrolle fehlgeschlagen' : ''), zeilen: pruef ? pruef.zeilen : [] };
    App.save();
    return { res, alt, blob, pruef };
  }

  /* ---------- Automatisch eintragen: nach jeder Änderung, wenn die Datei verbunden ist ---------- */
  let autoTimer = null, autoLaeuft = false, autoNochmal = false;
  App.excelAuto = function () {
    if (!D.DATEI_API || App.ui().excelAuto === false || !C.excelAenderungen(App.data).length) return;
    clearTimeout(autoTimer); autoTimer = setTimeout(autoLauf, 600);
  };
  async function autoLauf() {
    if (autoLaeuft) { autoNochmal = true; return; }
    const aend = C.excelAenderungen(App.data).filter(a => !a.neu); // neue Zeilen nur nach Bestätigung
    if (!aend.length) return;
    const h = await D.handleLaden('ihListe'); if (!h) return;
    autoLaeuft = true;
    try {
      let erlaubt = (await h.queryPermission({ mode: 'readwrite' })) === 'granted';
      if (!erlaubt) { try { erlaubt = (await h.requestPermission({ mode: 'readwrite' })) === 'granted'; } catch (e) { erlaubt = false; } }
      if (!erlaubt) { App.data.meta.ihExcelStatus = { zeit: new Date().toISOString(), ok: false, text: 'Browser hat den Schreibzugriff noch nicht erlaubt – einmal „⇄ In Excel eintragen“ klicken.' }; App.save(); App.render(); return; }
      const r = await excelSchreiben(aend, h, await h.getFile());
      if (r.fehler) App.toast('Excel: ' + r.fehler + (r.gesperrt ? ' Die Änderung wird eingetragen, sobald die Datei geschlossen ist.' : ''), 'warn', 9000);
      else if (r.res.ok.length) App.toast('✓ In Excel eingetragen: ' + r.res.ok.map(a => 'Zeile ' + a.zeile + (a.wv ? ' WV ' + fmtDatum(a.wv) : '') + (a.termin ? ' Termin ' + fmtDatum(a.termin) : '') + (a.texte || []).map(t => ' ' + t.label).join('')).join(', ') + (r.pruef && r.pruef.ok ? ' (geprüft)' : ''), r.pruef && !r.pruef.ok ? 'warn' : 'ok', 6000);
      if (r.res && (r.res.konflikt.length || r.res.fehlt.length)) App.toast('Excel: ' + [r.res.konflikt.length ? r.res.konflikt.length + '× in Excel inzwischen von Hand geändert (nicht überschrieben)' : '', r.res.fehlt.length ? r.res.fehlt.length + '× Zeile nicht gefunden' : ''].filter(Boolean).join(', ') + ' – Liste neu einlesen.', 'warn', 9000);
      App.render();
    } finally {
      autoLaeuft = false;
      if (autoNochmal) { autoNochmal = false; App.excelAuto(); }
    }
  }
  // gesperrte Datei: regelmäßig erneut versuchen
  setInterval(() => { const st = App.data && App.data.meta.ihExcelStatus; if (st && st.gesperrt) App.excelAuto(); }, 60000);

  /** Statuszeile Excel-Verbindung (Instandhaltung) */
  App.excelStatusHTML = function () {
    if (!App.data.ih.some(x => x.quelle === 'ih-liste')) return '';
    const n = C.excelAenderungen(App.data).length, st = App.data.meta.ihExcelStatus;
    const zeit = st ? new Date(st.zeit).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    return '<div class="excelstatus ' + (!D.DATEI_API ? 'rot' : st && !st.ok ? 'gelb' : '') + '">' +
      (!D.DATEI_API ? '⚠ <b>Dieser Browser kann nicht direkt in die Excel schreiben.</b> Bitte die Datei in <b>Edge oder Chrome</b> öffnen.'
        : '📄 Excel: <b id="excelName">…</b> · ' + (App.ui().excelAuto === false ? 'manuell' : '<b>automatisch</b>') + (n ? ' · <span class="rot-t">' + n + ' noch nicht eingetragen</span>' : ' · <span class="gruen-t">alles eingetragen</span>') +
          (st ? ' · zuletzt ' + zeit + ': ' + (st.ok ? '✓ ' : '✗ ') + esc(st.text) : '')) +
      ' <button class="s" data-act="ihExcelDetails">Details</button></div>';
  };
  App.act.ihExcelDetails = async function () {
    const h = D.DATEI_API ? await D.handleLaden('ihListe') : null;
    let recht = '–'; try { if (h) recht = await h.queryPermission({ mode: 'readwrite' }); } catch (e) { recht = 'unbekannt'; }
    const aend = C.excelAenderungen(App.data), st = App.data.meta.ihExcelStatus;
    const rechtText = { granted: '✓ erlaubt', prompt: 'wird beim nächsten Eintragen abgefragt', denied: '✗ verweigert' }[recht] || recht;
    const r = await App.modal({ title: 'Excel-Verbindung', wide: true, body: '<dl class="kv">' +
      '<dt>Version</dt><dd>' + esc(root.APP_VERSION || '–') + '</dd>' +
      '<dt>Browser</dt><dd>' + (D.DATEI_API ? '✓ kann direkt in Dateien schreiben' : '<span class="rot-t">✗ kann nicht direkt schreiben – Edge oder Chrome verwenden</span>') + '</dd>' +
      '<dt>Verbundene Datei</dt><dd>' + (h ? esc(h.name) : '<span class="rot-t">keine – Liste über „⇪ Instandhaltungsliste einlesen“ auswählen</span>') + '</dd>' +
      '<dt>Schreibrecht</dt><dd>' + rechtText + '</dd>' +
      '<dt>Automatisch eintragen</dt><dd>' + (App.ui().excelAuto === false ? 'aus' : 'an – nach jeder WV-/Termin-/Schritt-Änderung') + '</dd>' +
      '<dt>Zuletzt</dt><dd>' + (st ? new Date(st.zeit).toLocaleString('de-DE') + ' – ' + (st.ok ? '✓ ' : '✗ ') + esc(st.text) + (st.zeilen && st.zeilen.length ? '<ul class="small">' + st.zeilen.map(z => '<li>' + esc(z) + '</li>').join('') + '</ul>' : '') : '–') + '</dd>' +
      '<dt>Noch offen</dt><dd>' + (aend.length ? '<ul class="small">' + aend.map(a => '<li>' + esc(a.neu ? 'neue Zeile: ' + a.f.titel : 'Zeile ' + a.f.listenZeile + ' – ' + a.f.titel) + (a.wv || (a.neu && a.werte.wv) ? ' · WV ' + fmtDatum(a.wv || a.werte.wv) : '') + (a.termin ? ' · Termin ' + fmtDatum(a.termin) : '') + (a.schritt != null && !a.neu ? ' · Schritt' : '') + (a.texte || []).map(t => ' · ' + t.label).join('') + '</li>').join('') + '</ul>' : 'nichts') + '</dd></dl>' +
      '<p class="small muted">Nur WV von <b>Instandhaltungs-Aufgaben</b> gehören in die Liste (nicht OPOS/Kaution). Eingetragen wird die nächste WV, der Termin und der nächste Schritt.</p>',
      buttons: [{ label: 'Schließen', value: '' }, { label: App.ui().excelAuto === false ? 'Automatik einschalten' : 'Automatik ausschalten', value: 'auto', type: 'submit' }, ...(D.DATEI_API ? [{ label: 'Andere Datei verbinden', value: 'neu' }] : []), ...(aend.length ? [{ label: '⇄ Jetzt eintragen', value: 'jetzt', cls: 'primary' }] : [])] });
    if (r.action === 'auto') { App.ui().excelAuto = App.ui().excelAuto === false; App.commit(); }
    if (r.action === 'neu') { try { await D.excelWaehlen('ihListe'); App.toast('Datei verbunden. Bitte Liste einmal neu einlesen, damit die Zeilen passen.', 'ok', 8000); } catch (e) { /* abgebrochen */ } App.render(); }
    if (r.action === 'jetzt') App.act.ihExcelSchreiben();
  };
  function gefiltert() {
    const f = App.f.ih, q = f.q.toLowerCase();
    const prioRang = x => ({ 'A+': 0, AAA: 0, AA: 1, A: 2, B: 3, C: 4 }[x.prio] ?? ({ notfall: 0, hoch: 1, normal: 5 }[x.dringlichkeit]));
    return App.data.ih.filter(x => (!f.objekt || (f.objekt === '_ohne' ? !x.objektId : x.objektId === f.objekt)) && (!f.sb || (f.sb === '_mein' ? App.istMeine({ bereich: 'ih', refId: x.id }) : (x.sb || '') === f.sb)) &&
      (f.status === '' || (f.status === 'aktiv' ? aktiv(x) : f.status === 'flag' ? C.vorgangPruefen(App.data, 'ih', x).geflaggt : x.status === f.status)) &&
      (!q || [x.titel, x.beschreibung, x.naechsterSchritt, x.material, x.besonderheiten, x.objektText, H.fallLabel('ih', x)].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => ((H.naechsteWV('ih', a.id) || {}).datum || '9999').localeCompare((H.naechsteWV('ih', b.id) || {}).datum || '9999') || prioRang(a) - prioRang(b));
  }

  App.views.ih = {
    render() {
      const f = App.f.ih; const list = gefiltert();
      return '<section class="card"><div class="toolbar"><h2>Instandhaltung</h2><input type="search" id="ihQ" data-filter="ih.q" placeholder="Suchen …" value="' + esc(f.q) + '">' +
        '<select data-filter="ih.objekt"><option value="">alle Objekte</option><option value="_ohne"' + (f.objekt === '_ohne' ? ' selected' : '') + '>– ohne Objekt –</option>' + H.objektOptionen(false).filter(([v]) => App.data.ih.some(x => x.objektId === v)).map(([v, l]) => '<option value="' + v + '"' + (f.objekt === v ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>' +
        '<select data-filter="ih.sb"><option value="">alle SB</option>' + (App.ui().meinSB ? '<option value="_mein"' + (f.sb === '_mein' ? ' selected' : '') + '>nur meine (' + esc(App.ui().meinSB) + ')</option>' : '') + Array.from(new Set(App.data.ih.map(x => x.sb).filter(Boolean))).sort().map(v => '<option' + (f.sb === v ? ' selected' : '') + '>' + esc(v) + '</option>').join('') + '</select>' +
        '<select data-filter="ih.status"><option value="aktiv"' + (f.status === 'aktiv' ? ' selected' : '') + '>aktive</option><option value="flag"' + (f.status === 'flag' ? ' selected' : '') + '>⚑ ohne Schritt / WV</option><option value=""' + (f.status === '' ? ' selected' : '') + '>alle</option>' +
        REIHE.map(s => '<option value="' + s + '"' + (f.status === s ? ' selected' : '') + '>' + ST[s] + '</option>').join('') + '</select>' +
        '<span class="muted">' + list.length + ' Aufgaben</span><span class="sp"></span>' + (App.data.meta.ihListeStand ? '<small class="muted">Liste eingelesen ' + fmtDatum(App.data.meta.ihListeStand) + '</small>' : '') +
        '<button data-act="ihListeImport">⇪ Instandhaltungsliste einlesen</button>' + excelKnopf() + '<button data-act="ihExcel">Liste Excel</button><button data-act="ihPng">PNG</button><button class="primary" data-act="ihNeu">+ Aufgabe / Schaden</button></div>' +
        App.excelStatusHTML() + (list.length ? tabelle(list) : H.leer('Keine Aufgaben für diesen Filter. Die bestehende Excel-Liste lässt sich über „⇪ Instandhaltungsliste einlesen“ übernehmen.')) + '</section>';
    },
    detail(id) {
      const x = H.fall('ih', id); if (!x) { App.detail = null; return App.views.ih.render(); }
      const o = H.objekt(x.objektId) || {}; const m = H.mieter(x.mieterId); const hw = H.kontakt(x.handwerkerId);
      const idx = REIHE.indexOf(x.status);
      const b = (act, label, cls = '') => '<button class="' + cls + '" data-act="' + act + '" data-id="' + id + '">' + label + '</button>';
      const next = { gemeldet: 'ihAnfrage', angefragt: 'ihBeauftragen', beauftragt: 'ihInArbeit', in_arbeit: 'ihErledigt', erledigt: 'ihRechnung' }[x.status];
      const cls = a => (a === next ? 'primary' : '');
      return '<div class="detailkopf"><button data-act="back">← Liste</button><h2>' + esc(x.titel) + '</h2>' + (x.prio ? H.chip('Prio ' + x.prio, PRIO_CLS[x.prio] || '') : '') + H.chip(DR[x.dringlichkeit], 'dr-' + x.dringlichkeit) +
        '<span class="muted">' + esc(o.bezeichnung || x.objektText || '') + (m ? ' · ' + esc(C.mieterName(m)) + (m.whg ? ' (' + esc(m.whg) + ')' : '') : '') + '</span><span class="sp"></span>' +
        '<button class="s" data-act="ihEdit" data-id="' + id + '">Bearbeiten</button><button class="s del" data-act="ihDel" data-id="' + id + '">Löschen</button></div>' +
        '<div class="pipeline">' + REIHE.map((s, i) => '<span class="' + (i < idx ? 'done' : i === idx ? 'on' : '') + '">' + ST[s] + '</span>').join('') + '</div>' +
        App.flagBanner('ih', x) + (!(x.naechsterSchritt || x.material || x.besonderheiten || x.sb) ? App.schrittZeile('ih', x) : '') +
        (x.naechsterSchritt || x.material || x.besonderheiten || x.sb ? '<section class="card naechster"><dl class="kv">' +
          (x.naechsterSchritt ? '<dt>nächster Schritt</dt><dd><b>' + esc(x.naechsterSchritt) + '</b></dd>' : '') + (x.sb ? '<dt>SB</dt><dd>' + esc(x.sb) + '</dd>' : '') +
          (x.material ? '<dt>Material / Info</dt><dd class="pre">' + esc(x.material) + '</dd>' : '') + (x.besonderheiten ? '<dt>Besonderheiten</dt><dd class="pre">' + esc(x.besonderheiten) + '</dd>' : '') +
          (x.mieterInfo ? '<dt>Mieter / Info</dt><dd>' + esc(x.mieterInfo) + '</dd>' : '') + (x.terminText ? '<dt>Termin (Liste)</dt><dd>' + esc(x.terminText) + '</dd>' : '') +
          (x.wvText ? '<dt>WV-Notiz (Liste)</dt><dd>' + esc(x.wvText) + '</dd>' : '') + (x.quelle === 'ih-liste' ? '<dt>Quelle</dt><dd class="muted">Instandhaltungsliste, Zeile ' + esc(x.listenZeile || '') + ' – Änderungen dort werden beim nächsten Einlesen übernommen</dd>' : '') +
          '</dl><button class="s" data-act="weiter" data-b="ih" data-id="' + id + '">nächsten Schritt + WV ändern</button></section>' : '') +
        '<div class="cols3"><section class="card"><h3>Aufgabe</h3><p class="pre">' + esc(x.beschreibung || '–') + '</p><dl class="kv">' +
        '<dt>gemeldet</dt><dd>' + fmtDatum(x.gemeldetAm) + '</dd><dt>Gewerk</dt><dd>' + esc(x.gewerk || '–') + '</dd><dt>Verursacher</dt><dd>' + VERURSACHER[x.verursacher || 'unklar'] + '</dd>' +
        '<dt>Handwerker</dt><dd>' + esc(hw ? hw.firma : '–') + '</dd><dt>Auftrag am</dt><dd>' + fmtDatum(x.auftragAm) + '</dd><dt>Termin</dt><dd>' + fmtDatum(x.termin) + (x.terminZeit ? ' ' + esc(x.terminZeit) : '') + '</dd>' +
        '<dt>Rechnung</dt><dd>' + (x.rechnung && x.rechnung.betrag ? fmtEUR(x.rechnung.betrag) + ' (Nr. ' + esc(x.rechnung.nr || '–') + ', ' + fmtDatum(x.rechnung.datum) + ')' : '–') + '</dd></dl></section>' +
        '<section class="card"><h3>Aktionen</h3><div class="btns">' + b('ihAnfrage', '✉ Anfrage an Handwerker (bis 3)', cls('ihAnfrage')) + b('ihAngebot', '+ Angebot erfassen') + b('ihBeauftragen', 'Beauftragen …', cls('ihBeauftragen')) +
        (m ? b('ihTermin', 'Terminankündigung Mieter') : '') + '</div><div class="btns">' + b('ihInArbeit', 'In Arbeit', cls('ihInArbeit')) + b('ihErledigt', 'Erledigt', cls('ihErledigt')) +
        b('ihRechnung', 'Rechnung erfassen', cls('ihRechnung')) + (m ? b('ihWeiterbelastung', 'Weiterbelastung an Mieter') : '') + b('ihAbgerechnet', 'Abgerechnet') + '</div></section>' +
        '<section class="card"><h3>Fotos (' + x.fotos.length + ')</h3><div class="fotos">' + x.fotos.map((f, i) => '<figure><img src="' + f + '" data-act="ihFoto" data-id="' + id + '" data-i="' + i + '" alt="Foto ' + (i + 1) + '"><button class="s del" data-act="ihFotoDel" data-id="' + id + '" data-i="' + i + '">×</button></figure>').join('') + '</div>' +
        '<label class="drop" data-drop="' + id + '">Fotos hierher ziehen oder <u>auswählen</u><input type="file" accept="image/*" multiple hidden data-change="ihFotoAdd" data-id="' + id + '"></label></section></div>' +
        '<section class="card"><div class="toolbar"><h3>Angebote & Anfragen</h3><span class="sp"></span>' + b('ihAngebot', '+ Angebot') + '</div>' +
        ((x.angebote.length || x.anfragen.length) ? '<table class="tbl"><thead><tr><th>Handwerker</th><th>angefragt</th><th>Angebot vom</th><th>Nr.</th><th class="r">Betrag</th><th></th></tr></thead><tbody>' +
          uniq([...x.anfragen.map(a => a.kontaktId), ...x.angebote.map(a => a.kontaktId)]).map(kid => {
            const k = H.kontakt(kid) || { firma: '(gelöscht)' }; const an = x.anfragen.find(a => a.kontaktId === kid); const ang = x.angebote.find(a => a.kontaktId === kid);
            const guenstig = ang && x.angebote.every(a => a.betrag >= ang.betrag) && x.angebote.length > 1;
            return '<tr class="' + (x.handwerkerId === kid ? 'aktiv' : '') + '"><td><b>' + esc(k.firma) + '</b>' + (x.handwerkerId === kid ? ' ' + H.chip('beauftragt', 'gruen') : '') + '</td><td>' + fmtDatum(an && an.datum) + '</td><td>' + fmtDatum(ang && ang.datum) + '</td><td>' + esc(ang && ang.nr || '') + '</td>' +
              '<td class="r">' + (ang ? (guenstig ? '<b>' + fmtEUR(ang.betrag) + '</b> ' + H.chip('günstigstes', 'gruen') : fmtEUR(ang.betrag)) : '<span class="muted">ausstehend</span>') + '</td>' +
              '<td class="r nw">' + (ang ? '<button class="s" data-act="ihBeauftragen" data-id="' + id + '" data-k="' + kid + '">beauftragen</button><button class="s del" data-act="ihAngebotDel" data-id="' + id + '" data-k="' + kid + '">×</button>' : '') + '</td></tr>';
          }).join('') + '</tbody></table>' : H.leer('Noch keine Anfragen/Angebote.')) + '</section>' +
        '<div class="cols2"><section class="card"><div class="toolbar"><h3>Wiedervorlagen</h3><span class="sp"></span><button class="s" data-act="wvNeu" data-b="ih" data-id="' + id + '">+ WV</button></div>' +
        App.wvTabelle(App.data.wv.filter(w => w.bereich === 'ih' && w.refId === id).sort((a, c) => (a.status === c.status ? a.datum.localeCompare(c.datum) : a.status === 'offen' ? -1 : 1)), { fall: false }) + '</section>' +
        '<section class="card"><h3>Verlauf</h3>' + App.verlaufListe('ih', id) + '</section></div>';
    },
    after() {
      const en = document.getElementById('excelName'); if (en) D.handleLaden('ihListe').then(h => { en.textContent = h ? h.name : 'nicht verbunden'; if (!h) en.classList.add('rot-t'); });
      const z = document.querySelector('[data-drop]'); if (!z) return;
      z.ondragover = e => { e.preventDefault(); z.classList.add('over'); };
      z.ondragleave = () => z.classList.remove('over');
      z.ondrop = e => { e.preventDefault(); z.classList.remove('over'); fotosHinzu(H.fall('ih', z.dataset.drop), Array.from(e.dataTransfer.files)); };
    }
  };
  const uniq = a => Array.from(new Set(a.filter(Boolean)));

  async function fotosHinzu(f, files) {
    const imgs = files.filter(x => /^image\//.test(x.type));
    if (!imgs.length) return;
    for (const file of imgs) { try { f.fotos.push(await App.bildKomprimieren(file)); } catch (e) { App.toast(file.name + ': ' + e.message, 'err'); } }
    C.addVerlauf(App.data, 'ih', f.id, 'foto', imgs.length + ' Foto(s) hinzugefügt');
    App.commit();
  }
  function ihFelder() {
    const sbs = Array.from(new Set(App.data.ih.map(x => x.sb).filter(Boolean)));
    return [
      { k: 'objektId', l: 'Objekt', t: 'select', o: [['', '– ohne / nicht zugeordnet –'], ...H.objektOptionen(false)] }, { k: 'objektText', l: 'Ort / Lage (Freitext)', ph: 'z. B. Haus 10, Hausflur' },
      { k: 'mieterId', l: 'Mieter / Wohnung (optional)', t: 'select', o: [['', '– Gemeinschaftseigentum / keiner –'], ...H.mieterOptionen(false)] },
      { k: 'sb', l: 'SB (zuständig)', list: 'dl_sb' },
      { k: 'titel', l: 'Kurzbeschreibung', req: true, full: true, ph: 'z. B. Wasserschaden Bad, Heizung ausgefallen' },
      { k: 'beschreibung', l: 'Aufgabe / Beschreibung', t: 'textarea', full: true, rows: 3 },
      { k: 'naechsterSchritt', l: 'nächster Schritt', full: true }, { k: 'material', l: 'benötigtes Material / Info', t: 'textarea', rows: 2 }, { k: 'besonderheiten', l: 'Besonderheiten', t: 'textarea', rows: 2 },
      { k: 'gemeldetAm', l: 'gemeldet am', t: 'date', req: true }, { k: 'termin', l: 'Termin', t: 'date' },
      { k: 'prio', l: 'Priorität', t: 'select', o: [['', '–'], ['A+', 'A+'], ['AAA', 'AAA'], ['AA', 'AA'], ['A', 'A'], ['B', 'B'], ['C', 'C']] }, { k: 'dringlichkeit', l: 'Dringlichkeit (WV-Regel)', t: 'select', o: Object.entries(DR) },
      { k: 'gewerk', l: 'Gewerk', t: 'select', o: [['', '–'], ...App.GEWERKE.map(g => [g, g])] }, { k: 'verursacher', l: 'Verursacher', t: 'select', o: Object.entries(VERURSACHER) },
      { k: 'html', t: 'html', html: '<datalist id="dl_sb">' + sbs.map(v => '<option value="' + esc(v) + '">').join('') + '</datalist>' }
    ];
  }


  Object.assign(App.change, {
    ihFotoAdd(el) { fotosHinzu(H.fall('ih', el.dataset.id), Array.from(el.files)); }
  });

  Object.assign(App.act, {
    async ihNeu() {
      const v = await App.formModal('Schaden aufnehmen', [...ihFelder(), { k: 'fotos', l: 'Fotos', t: 'file', multiple: true, accept: 'image/*', full: true, hint: 'werden verkleinert gespeichert' }],
        { gemeldetAm: C.today(), dringlichkeit: 'normal', verursacher: 'unklar', objektId: App.f.ih.objekt === '_ohne' ? '' : App.f.ih.objekt }, { wide: true, ok: 'Aufnehmen' });
      if (!v) return;
      if (v.mieterId && !v.objektId) v.objektId = (H.mieter(v.mieterId) || {}).objektId;
      const files = v.fotos; delete v.fotos; delete v._action; delete v.html;
      const f = Object.assign({ id: C.uid(), status: 'gemeldet', angebote: [], anfragen: [], fotos: [] }, v);
      App.data.ih.push(f);
      C.applyAction(App.data, 'ih', f.id, 'gemeldet', { heute: C.today(), dringlichkeit: f.dringlichkeit, verlaufText: 'Schaden gemeldet (' + DR[f.dringlichkeit] + ')' });
      App.tab = 'ih'; App.detail = f.id;
      if (files && files.length) await fotosHinzu(f, files); else App.commit();
    },
    async ihEdit(ds) {
      const f = H.fall('ih', ds.id);
      const v = await App.formModal('Schaden bearbeiten', ihFelder(), f, { wide: true });
      if (!v) return; delete v._action; delete v.html; Object.assign(f, v); App.commit();
    },
    async ihSchritt(ds) {
      const f = H.fall('ih', ds.id);
      const v = await App.formModal('Nächster Schritt', [{ k: 'naechsterSchritt', l: 'nächster Schritt', full: true },
        { k: 'wv', l: 'WV am (optional)', t: 'date' }], { naechsterSchritt: f.naechsterSchritt || '' }, { ok: 'Speichern' });
      if (!v) return;
      if (v.naechsterSchritt !== (f.naechsterSchritt || '')) C.addVerlauf(App.data, 'ih', f.id, 'schritt', 'Nächster Schritt: ' + (v.naechsterSchritt || '–'));
      f.naechsterSchritt = v.naechsterSchritt;
      if (v.wv) C.createWV(App.data, 'ih', f.id, v.wv, v.naechsterSchritt || f.titel, { erstelltDurch: 'manuell' });
      App.commit();
    },
    async ihExcelSchreiben() {
      let aend = C.excelAenderungen(App.data);
      if (!aend.length) return App.toast('Keine offenen Änderungen – die Excel ist auf dem Stand des Tools.');
      let h = D.DATEI_API ? await D.handleLaden('ihListe') : null;
      const pfeil = (alt, neu) => (alt ? fmtDatum(alt) + ' → ' : '') + '<b>' + fmtDatum(neu) + '</b>';
      const opts = aend.map((a, i) => [String(i), a.neu
        ? '<span class="chip gruen">neue Zeile</span> ' + esc(a.werte.objekt) + ' · <b>' + esc(a.f.titel) + '</b>' + (a.werte.wv ? ' · WV ' + fmtDatum(a.werte.wv) : '') + (a.werte.schritt ? ' · → ' + esc(a.werte.schritt) : '')
        : esc(objektName(a.f)) + ' · <b>' + esc(a.f.titel) + '</b> <small class="muted">(Zeile ' + (a.f.listenZeile || '?') + ')</small>' + (a.wv ? ' · WV ' + pfeil(a.f.listeWVDatum, a.wv) : '') +
          (a.termin ? ' · Termin ' + pfeil(a.f.listeTerminDatum, a.termin) : '') + (a.schritt != null ? ' · nächster Schritt „' + esc(a.schritt || '(leer)') + '“' : '') + (a.texte || []).map(t => ' · ' + esc(t.label) + ' „' + esc(t.wert || '(leer)') + '“').join('')]);
      const v = await App.formModal('⇄ In die Instandhaltungsliste eintragen', [
        { k: 'sel', l: aend.length + ' Änderung(en)' + (h ? ' → ' + h.name : ''), t: 'multi', cls: 'liste', o: opts }
      ], { sel: opts.map(o => o[0]) }, { wide: true, ok: D.DATEI_API ? (h ? '⇄ In ' + esc(h.name) + ' eintragen' : 'Excel-Datei wählen & eintragen') : 'Datei wählen …',
        intro: '<p class="small muted">Geändert werden nur die Zellen WV, Termin, nächster Schritt, SB, Prio, Material und Besonderheiten der jeweiligen Zeile; Aufgaben, die im Tool angelegt wurden, kommen als <b>neue Zeile ans Ende</b> der Liste. ' +
          'Formatierung, ausgeblendete Zeilen und andere Blätter bleiben unverändert. <b>Die Excel-Datei muss dafür geschlossen sein.</b> Nicht angehakte neue Aufgaben werden künftig nicht mehr angeboten.</p>' +
          (D.DATEI_API ? '' : '<p class="small rot-t">Dieser Browser kann nicht direkt in Dateien schreiben – bitte Edge oder Chrome verwenden. Hier bekommst du nur eine aktualisierte Kopie zum Speichern.</p>') });
      if (!v) return;
      const gewaehlt = new Set(v.sel);
      aend.forEach((a, i) => { if (!gewaehlt.has(String(i)) && a.neu) a.f.nichtInExcel = true; });
      aend = aend.filter((a, i) => gewaehlt.has(String(i)));
      if (!aend.length) { App.commit(); return; }
      let datei;
      try {
        if (D.DATEI_API) {
          if (!h) h = await D.excelWaehlen('ihListe');
          if (!await D.zugriff(h, true)) return App.toast('Schreibzugriff auf die Datei wurde nicht erlaubt.', 'warn');
          datei = await h.getFile();
        } else {
          const w = await App.formModal('Instandhaltungsliste wählen', [{ k: 'datei', l: 'Excel-Datei', t: 'file', accept: '.xlsx,.xlsm', full: true }], {}, { ok: 'Eintragen' });
          if (!w || !w.datei[0]) return; datei = w.datei[0];
        }
      } catch (e) { if (e.name === 'AbortError') return; return App.toast('Datei konnte nicht geöffnet werden: ' + e.message, 'err', 9000); }
      const vorher = aend.map(a => ({ f: a.f, snap: JSON.stringify(a.f) }));
      const r = await excelSchreiben(aend, h, datei);
      if (r.fehler) return App.toast(r.fehler, 'err', 12000);
      const { res, alt, blob, pruef } = r;
      App.commit();
      const hilfe = '<details class="small"><summary>Excel zeigt oben „Geschützte Ansicht – Dateien aus dem Internet …“?</summary>' +
        '<p>Windows markiert jede Datei, die ein Browser speichert, als „aus dem Internet“ – deshalb öffnet Excel sie geschützt. Einmalig abstellen, indem du den Ordner der Liste als vertrauenswürdig einträgst:</p>' +
        '<ol><li>Excel → <b>Datei → Optionen → Trust Center → Einstellungen für das Trust Center …</b></li><li><b>Vertrauenswürdige Speicherorte</b> → bei Netzlaufwerk zuerst Haken <b>„Vertrauenswürdige Speicherorte in meinem Netzwerk zulassen“</b></li>' +
        '<li><b>„Neuen Speicherort hinzufügen …“</b> → Ordner der Instandhaltungsliste wählen → Haken <b>„Unterordner … ebenfalls vertrauenswürdig“</b> → OK</li></ol>' +
        '<p>Danach öffnet Excel die Liste ohne gelbe Leiste. Ist die Option ausgegraut, muss die IT den Ordner freigeben.</p></details>';
      const rr = await App.modal({ title: res.ok.length ? '✓ In Excel eingetragen' : 'Nichts eingetragen', wide: true, body:
        (pruef ? '<p class="' + (pruef.ok ? 'gruen-t' : 'rot-t') + '"><b>' + (pruef.ok ? '✓ Kontrolle: Datei neu gelesen – alles steht drin.' : '✗ Kontrolle: nicht alles wiedergefunden – bitte Datei prüfen.') + '</b></p>' +
          '<ul class="small">' + pruef.zeilen.map(z => '<li>' + esc(z) + '</li>').join('') + '</ul>' : '') +
        '<ul>' + (res.ok.length ? '<li><b>' + res.ok.length + '</b> Aufgabe(n) in <b>' + esc(datei.name) + '</b>' + (D.DATEI_API ? ' gespeichert' : ' – <span class="rot-t">nur als Kopie heruntergeladen</span>: die Originaldatei ist unverändert! Kopie aus „Downloads“ über das Original kopieren oder Edge/Chrome verwenden.') + '</li>' : '') +
        (res.konflikt.length ? '<li class="rot-t">' + res.konflikt.length + ' nicht überschrieben, weil in Excel inzwischen von Hand geändert: ' + res.konflikt.map(a => esc(a.f.titel) + ' (Zeile ' + a.zeile + ', ' + a.feld + ' in Excel: „' + esc(a.inExcel) + '“)').join('; ') + ' – bitte Liste neu einlesen</li>' : '') +
        (res.fehlt.length ? '<li class="rot-t">' + res.fehlt.length + ' Aufgabe(n) in der Excel nicht mehr gefunden: ' + res.fehlt.map(a => esc(a.f.titel)).join('; ') + '</li>' : '') + '</ul>' + hilfe,
        buttons: [...(D.DATEI_API && blob ? [{ label: '↶ Rückgängig', value: 'undo', cls: 'del' }] : []), { label: 'OK', value: '' }] });
      if (rr.action === 'undo') {
        try { await D.dateiSchreiben(h, alt); } catch (e) { return App.toast('Rückgängig nicht möglich: ' + e.message, 'err', 9000); }
        vorher.forEach(x => { const alt2 = JSON.parse(x.snap); Object.keys(x.f).forEach(k => { if (!(k in alt2)) delete x.f[k]; }); Object.assign(x.f, alt2); C.addVerlauf(App.data, 'ih', x.f.id, 'excel', 'Eintrag in Excel rückgängig gemacht'); });
        App.commit(); App.toast('Excel-Datei wiederhergestellt.');
      }
    },
    async ihListeImport() {
      const offen = C.excelAenderungen(App.data).length;
      if (offen && await App.confirm(offen + ' Änderung(en) aus dem Tool stehen noch nicht in der Excel (WV / nächster Schritt). Beim Einlesen würden sie mit dem Stand der Excel überschrieben.<br><b>Zuerst in die Excel eintragen?</b>', 'Ja, erst eintragen', 'Nein, einlesen')) {
        await App.act.ihExcelSchreiben(); if (C.excelAenderungen(App.data).length) return;
      }
      const h = D.DATEI_API ? await D.handleLaden('ihListe') : null;
      const intro = '<p class="muted">Liest jede <b>sichtbare</b> Zeile mit Objekt und Aufgabe – <b>ausgeblendete Zeilen werden ignoriert</b>. Spalten: Objekt · SB · Aufgabe · benötigtes Material · Termin · Mieter/Prio · nächster Schritt · WV · Besonderheiten. ' +
        'WV und Termine werden Wiedervorlagen. Erneut einlesen gleicht ab: Änderungen landen im Verlauf, Aufgaben die nicht mehr sichtbar sind gelten als erledigt.</p>' +
        (D.DATEI_API ? '<p class="small">Die Datei wird dabei <b>verbunden</b>: WV und nächste Schritte aus dem Tool lassen sich danach per „⇄ In Excel eintragen“ direkt in diese Datei schreiben.</p>' : '');
      const v = await App.formModal('Instandhaltungsliste einlesen', [
        ...(D.DATEI_API ? [] : [{ k: 'datei', l: 'Excel-Datei (TO-DO-Liste)', t: 'file', accept: '.xlsx,.xlsm,.xls,.ods', full: true }]),
        { k: 'stand', l: 'Stand (für WV-Daten ohne Jahr)', t: 'date', d: C.today(), req: true }], {},
        { ok: D.DATEI_API ? (h ? 'Andere Datei wählen …' : 'Datei wählen …') : 'Weiter', intro, extra: h ? [{ label: '⇪ ' + esc(h.name) + ' neu einlesen', value: 'verbunden', cls: 'primary' }] : [] });
      if (!v) return;
      let datei;
      try {
        if (D.DATEI_API) {
          const hh = v._action === 'verbunden' ? h : await D.excelWaehlen('ihListe');
          if (!await D.zugriff(hh, false)) return App.toast('Kein Zugriff auf die Datei erlaubt.', 'warn');
          datei = await hh.getFile();
        } else { datei = v.datei[0]; if (!datei) return; }
      } catch (e) { if (e.name === 'AbortError') return; return App.toast('Datei konnte nicht geöffnet werden: ' + e.message, 'err', 9000); }
      let blaetter;
      try { blaetter = await D.leseArbeitsmappe(datei); } catch (e) { return App.toast('Datei konnte nicht gelesen werden: ' + e.message, 'err', 9000); }
      blaetter = blaetter.map(b => Object.assign(b, { aufgaben: C.parseIhListe(b.rows, v.stand, b.zeilen) })).filter(b => b.aufgaben.length);
      if (!blaetter.length) return App.toast('Keine Aufgaben gefunden – es braucht eine Kopfzeile mit „Objekt“ und „Aufgabe“.', 'err', 9000);
      let blatt = blaetter[0];
      if (blaetter.length > 1) {
        const w = await App.formModal('Blatt auswählen', [{ k: 'b', l: 'Tabellenblatt', t: 'select', full: true, o: blaetter.map((b, i) => [String(i), b.name.trim() + ' – ' + b.aufgaben.length + ' Aufgaben' + (b.ausgeblendet ? ' (' + b.ausgeblendet + ' Zeilen ausgeblendet)' : '')]) }], { b: '0' }, { ok: 'Weiter' });
        if (!w) return; blatt = blaetter[+w.b];
      }
      const A = blatt.aufgaben;
      const ohneObj = A.filter(e => !C.objektFinden(App.data, e.objektText)).length;
      const bekannt = A.filter(e => App.data.ih.some(x => x.listenKey === e.key)).length;
      const vorschau = '<div class="scrollx"><table class="tbl small"><thead><tr><th>Zeile</th><th>Objekt</th><th>SB</th><th>Aufgabe</th><th>nächster Schritt</th><th>Termin</th><th>WV</th></tr></thead><tbody>' +
        A.slice(0, 8).map(e => '<tr><td>' + e.zeile + '</td><td>' + esc(e.objektText) + '</td><td>' + esc(e.sb) + '</td><td>' + esc(e.titel) + '</td><td>' + esc(e.schritt) + '</td><td>' + fmtDatum(e.termin.datum) + '</td><td>' + fmtDatum(e.wv) + (e.wvText ? ' ' + esc(e.wvText) : '') + '</td></tr>').join('') + '</tbody></table></div>';
      const w = await App.formModal('Instandhaltungsliste einlesen – ' + blatt.name.trim(), [
        { k: 'fehlendeErledigen', l: 'Aufgaben aus früheren Einlesungen, die nicht mehr sichtbar in der Liste stehen, als erledigt markieren', t: 'checkbox', d: true, full: true }
      ], {}, { wide: true, ok: 'Einlesen', intro: '<p><b>' + A.length + '</b> Aufgaben aus sichtbaren Zeilen' + (blatt.ausgeblendet ? ', <b>' + blatt.ausgeblendet + '</b> ausgeblendete Zeilen ignoriert' : '') + '. ' +
        A.filter(e => e.wv || e.wvText).length + ' mit WV, ' + A.filter(e => e.termin.datum).length + ' mit Termin' + (bekannt ? ', ' + bekannt + ' bereits bekannt (werden abgeglichen)' : '') + '.</p>' +
        (ohneObj ? '<p class="small muted">' + ohneObj + ' Aufgaben lassen sich keinem Objekt zuordnen (z. B. Abkürzungen wie „BR51“) – sie werden mit dem Text aus der Liste angelegt und können später zugeordnet werden. Tipp: Telefonliste vorher einlesen, dann sind alle Objekte bekannt.</p>' : '') + vorschau });
      if (!w) return;
      const st = C.importIhListe(App.data, A, { stand: v.stand, blatt: blatt.name.trim(), fehlendeErledigen: w.fehlendeErledigen });
      App.tab = 'ih'; App.detail = null; App.commit();
      App.modal({ title: 'Instandhaltungsliste eingelesen', body: '<ul><li><b>' + st.neu + '</b> neue Aufgaben, ' + st.geaendert + ' geändert, ' + st.unveraendert + ' unverändert</li>' +
        (st.erledigt ? '<li>' + st.erledigt + ' nicht mehr sichtbar → erledigt</li>' : '') + (st.wiedereroeffnet ? '<li>' + st.wiedereroeffnet + ' wieder geöffnet</li>' : '') +
        '<li>' + st.wvNeu + ' Wiedervorlagen angelegt (WV und Termine aus der Liste)</li>' + (st.ohneObjekt ? '<li>' + st.ohneObjekt + ' ohne Objekt-Zuordnung – Filter „ohne Objekt“</li>' : '') + '</ul>' });
    },
    async ihDel(ds) {
      if (!await App.confirm('Instandhaltungsfall inkl. Fotos, WV und Verlauf löschen?', 'Löschen', 'Abbrechen')) return;
      const d = App.data; d.ih = d.ih.filter(x => x.id !== ds.id);
      d.wv = d.wv.filter(w => !(w.bereich === 'ih' && w.refId === ds.id)); d.verlauf = d.verlauf.filter(w => !(w.bereich === 'ih' && w.refId === ds.id));
      App.detail = null; App.commit();
    },
    ihFoto(ds) { const f = H.fall('ih', ds.id); App.modal({ title: 'Foto ' + (+ds.i + 1), wide: true, body: '<img src="' + f.fotos[+ds.i] + '" style="max-width:100%">' }); },
    async ihFotoDel(ds) { const f = H.fall('ih', ds.id); if (!await App.confirm('Foto löschen?')) return; f.fotos.splice(+ds.i, 1); App.commit(); },
    async ihAnfrage(ds) {
      const f = H.fall('ih', ds.id);
      const hw = App.data.kontakte.filter(k => k.typ === 'handwerker')
        .sort((a, b) => ((b.gewerk || []).includes(f.gewerk) - (a.gewerk || []).includes(f.gewerk)) || a.firma.localeCompare(b.firma));
      if (!hw.length) { App.toast('Noch keine Handwerker angelegt.', 'warn'); return App.act.kontaktEdit({ typ: 'handwerker' }); }
      const vor = hw.filter(k => (k.gewerk || []).includes(f.gewerk)).slice(0, 3).map(k => k.id);
      const v = await App.formModal('Anfrage an Handwerker', [
        { k: 'ids', l: 'Handwerker (max. 3)' + (f.gewerk ? ' – passend zu „' + f.gewerk + '“ vorausgewählt' : ''), t: 'multi',
          o: hw.map(k => [k.id, esc(k.firma) + ' <small class="muted">' + esc((k.gewerk || []).join(', ')) + (k.email ? '' : ' · keine E-Mail') + '</small>']) },
        { k: 'frist', l: 'Angebot erbeten bis', t: 'date', d: C.addDays(C.today(), Number(App.data.settings.fristen.ihMieter) || 14), req: true },
        { k: 'fotos', l: 'Fotos als Anhang mitsenden', t: 'checkbox', d: f.fotos.length > 0 }
      ], { ids: vor }, { ok: 'E-Mail-Entwürfe erstellen', wide: true, intro: '<p class="muted">Je Handwerker wird ein E-Mail-Entwurf (.eml) erzeugt – per Doppelklick in Outlook öffnen und senden.</p>' });
      if (!v) return;
      if (!v.ids.length) return App.toast('Bitte mindestens einen Handwerker wählen.', 'warn');
      if (v.ids.length > 3 && !await App.confirm(v.ids.length + ' Handwerker gewählt (empfohlen: max. 3). Trotzdem fortfahren?')) return;
      const anh = v.fotos ? f.fotos.map((u, i) => ({ name: 'Foto_' + (i + 1) + '.jpg', mime: 'image/jpeg', base64: u.split(',')[1] })) : [];
      v.ids.forEach(kid => {
        const k = H.kontakt(kid);
        const doc = D.erzeuge(App.data, 'ih_anfrage', { bereich: 'ih', fall: f, frist: v.frist, empfaengerKontakt: k });
        const eml = C.buildEML({ to: k.email || '', subject: doc.betreff, text: doc.emailText, attachments: anh });
        D.download(new Blob([eml], { type: 'message/rfc822' }), C.asciiDateiname('Anfrage ' + k.firma + ' ' + f.titel) + '.eml');
        if (!f.anfragen.some(a => a.kontaktId === kid)) f.anfragen.push({ kontaktId: kid, datum: C.today() });
      });
      C.applyAction(App.data, 'ih', f.id, 'angefragt', { verlaufText: 'Angebote angefragt bei: ' + v.ids.map(i => (H.kontakt(i) || {}).firma).join(', ') + ' (bis ' + fmtDatum(v.frist) + ')' });
      App.commit(); App.toast(v.ids.length + ' E-Mail-Entwürfe gespeichert. WV „Angebot eingegangen?“ angelegt.', 'ok', 7000);
    },
    async ihAngebot(ds) {
      const f = H.fall('ih', ds.id);
      const opt = H.kontaktOptionen('handwerker'); const vor = f.anfragen.find(a => !f.angebote.some(x => x.kontaktId === a.kontaktId));
      const v = await App.formModal('Angebot erfassen', [
        { k: 'kontaktId', l: 'Handwerker', t: 'select', o: opt, req: true, full: true }, { k: 'betrag', l: 'Betrag brutto (€)', t: 'money', req: true },
        { k: 'datum', l: 'Angebot vom', t: 'date', d: C.today(), req: true }, { k: 'nr', l: 'Angebotsnummer' }], { kontaktId: vor ? vor.kontaktId : '' });
      if (!v || !v.kontaktId) return;
      f.angebote = f.angebote.filter(a => a.kontaktId !== v.kontaktId);
      f.angebote.push({ kontaktId: v.kontaktId, betrag: v.betrag, datum: v.datum, nr: v.nr });
      C.addVerlauf(App.data, 'ih', f.id, 'angebot', 'Angebot ' + (H.kontakt(v.kontaktId) || {}).firma + ': ' + fmtEUR(v.betrag));
      const alle = f.anfragen.length && f.anfragen.every(a => f.angebote.some(x => x.kontaktId === a.kontaktId));
      if (alle) C.closeWV(App.data, 'ih', f.id, ['ih:angefragt']);
      App.commit(); if (alle) App.toast('Alle angefragten Angebote liegen vor – WV geschlossen. Jetzt beauftragen.');
    },
    async ihAngebotDel(ds) { const f = H.fall('ih', ds.id); f.angebote = f.angebote.filter(a => a.kontaktId !== ds.k); App.commit(); },
    async ihBeauftragen(ds) {
      const f = H.fall('ih', ds.id);
      const guenstig = f.angebote.slice().sort((a, b) => a.betrag - b.betrag)[0];
      const kid = ds.k || f.handwerkerId || (guenstig && guenstig.kontaktId) || '';
      const ang = f.angebote.find(a => a.kontaktId === kid);
      const v = await App.formModal('Handwerker beauftragen', [
        { k: 'kontaktId', l: 'Handwerker', t: 'select', o: H.kontaktOptionen('handwerker'), req: true, full: true },
        { k: 'termin', l: 'Ausführungstermin (falls bekannt)', t: 'date' }, { k: 'terminZeit', l: 'Uhrzeit', ph: 'z. B. 8–10' },
        { k: 'auftragssumme', l: 'Auftragssumme (€)', t: 'money', d: ang ? ang.betrag : '' }
      ], { kontaktId: kid, termin: f.termin || '', terminZeit: f.terminZeit || '' }, { ok: 'Auftrag erstellen' });
      if (!v || !v.kontaktId) return;
      Object.assign(f, { handwerkerId: v.kontaktId, termin: v.termin, terminZeit: v.terminZeit, auftragssumme: v.auftragssumme });
      App.save();
      const k = H.kontakt(v.kontaktId);
      const ok = await App.dokument({ vorlageId: 'ih_auftrag', bereich: 'ih', fall: f, empfaengerKontakt: k, aktion: 'beauftragt', aktionCtx: () => ({ termin: f.termin, verlaufText: 'Beauftragt: ' + k.firma + (f.auftragssumme ? ' (' + fmtEUR(f.auftragssumme) + ')' : '') + (f.termin ? ', Termin ' + fmtDatum(f.termin) : '') }) });
      if (ok && f.mieterId && f.termin && await App.confirm('Terminankündigung an den Mieter jetzt erstellen?')) App.act.ihTermin(ds);
    },
    async ihTermin(ds) {
      const f = H.fall('ih', ds.id);
      if (!f.handwerkerId) return App.toast('Bitte zuerst einen Handwerker beauftragen.', 'warn');
      await App.dokument({ vorlageId: 'ih_termin', bereich: 'ih', fall: f, verlaufText: 'Terminankündigung an Mieter erstellt (§ 555a BGB)' });
    },
    ihInArbeit(ds) { C.applyAction(App.data, 'ih', ds.id, 'in_arbeit', {}); App.commit(); },
    async ihErledigt(ds) {
      const f = H.fall('ih', ds.id);
      const v = await App.formModal('Arbeiten erledigt', [{ k: 'am', l: 'erledigt am', t: 'date', d: C.today(), req: true }, { k: 'notiz', l: 'Notiz', full: true }], {}, { ok: 'Erledigt' });
      if (!v) return; f.erledigtAm = v.am;
      C.applyAction(App.data, 'ih', f.id, 'erledigt', { verlaufText: 'Arbeiten erledigt am ' + fmtDatum(v.am) + (v.notiz ? ' – ' + v.notiz : '') });
      App.commit(); App.toast('WV „Rechnung prüfen / weiterbelasten?“ angelegt.');
    },
    async ihRechnung(ds) {
      const f = H.fall('ih', ds.id);
      const v = await App.formModal('Rechnung erfassen', [
        { k: 'nr', l: 'Rechnungsnummer' }, { k: 'datum', l: 'Rechnungsdatum', t: 'date', d: C.today() }, { k: 'betrag', l: 'Betrag brutto (€)', t: 'money', req: true },
        { k: 'geprueft', l: 'sachlich und rechnerisch geprüft', t: 'checkbox', full: true },
        { k: 'verursacher', l: 'Verursacher', t: 'select', o: Object.entries(VERURSACHER) }
      ], Object.assign({ verursacher: f.verursacher }, f.rechnung || {}), { ok: 'Speichern' });
      if (!v) return;
      f.rechnung = { nr: v.nr, datum: v.datum, betrag: v.betrag, geprueft: v.geprueft }; f.verursacher = v.verursacher;
      C.addVerlauf(App.data, 'ih', f.id, 'rechnung', 'Rechnung ' + (v.nr || '') + ' über ' + fmtEUR(v.betrag) + ' erfasst' + (v.geprueft ? ' (geprüft)' : ''));
      App.commit();
      if (f.verursacher === 'mieter' && f.mieterId) { if (await App.confirm('Verursacher ist der Mieter – Weiterbelastung jetzt erstellen?')) return App.act.ihWeiterbelastung(ds); }
      else if (v.geprueft && await App.confirm('Rechnung geprüft – Fall als abgerechnet abschließen?')) App.act.ihAbgerechnet(ds);
    },
    async ihWeiterbelastung(ds) {
      const f = H.fall('ih', ds.id);
      const v = await App.formModal('Weiterbelastung an Mieter', [{ k: 'betrag', l: 'Betrag (€)', t: 'money', req: true, d: f.weiterbelastung || (f.rechnung || {}).betrag || 0 },
        { k: 'opos', l: 'als offenen Posten im OPOS des Mieters anlegen (nach Verbuchen)', t: 'checkbox', d: true, full: true }], {}, { ok: 'Schreiben erstellen' });
      if (!v) return; f.weiterbelastung = v.betrag; App.save();
      const frist = C.addDays(C.today(), Number(App.data.settings.fristen.weiterbelastung) || 14);
      await App.dokument({ vorlageId: 'ih_weiterbelastung', bereich: 'ih', fall: f, frist, verlaufText: 'Weiterbelastung ' + fmtEUR(v.betrag) + ' an Mieter erstellt',
        nachVerbuchen(fr) {
          if (!v.opos) return;
          let of = App.data.opos.find(x => x.mieterId === f.mieterId && x.stufe !== 'erledigt');
          if (!of) of = App.opos.neuerFall(f.mieterId);
          of.posten.push({ id: C.uid(), bez: 'Schadensersatz: ' + f.titel, faellig: fr || frist, typ: 'sonstig', betrag: v.betrag, offen: v.betrag });
          C.addVerlauf(App.data, 'opos', of.id, 'posten', 'Weiterbelastung aus Instandhaltung „' + f.titel + '“: ' + fmtEUR(v.betrag));
          C.createWV(App.data, 'opos', of.id, C.addDays(fr || frist, Number(App.data.settings.puffer) || 0), 'Zahlungseingang Weiterbelastung prüfen', { regel: 'opos:weiterbelastung' });
          App.toast('Offener Posten im OPOS angelegt.');
        } });
    },
    async ihAbgerechnet(ds) {
      const f = H.fall('ih', ds.id);
      if (!f.rechnung && !await App.confirm('Keine Rechnung erfasst. Trotzdem als abgerechnet abschließen?')) return;
      C.applyAction(App.data, 'ih', f.id, 'abgerechnet', {}); App.commit();
    },
    async ihExcel() {
      const l = gefiltert();
      if (!l.length) return App.toast('Keine Daten.', 'warn');
      const zeilen = l.map(x => { const wv = H.naechsteWV('ih', x.id); const hw = H.kontakt(x.handwerkerId);
        return [objektName(x) + (x.objektText && x.objektId && C.normName(x.objektText) !== C.normName(objektName(x)) ? ' – ' + x.objektText : ''), x.sb || '', x.beschreibung || x.titel, x.material || '',
          x.termin ? fmtDatum(x.termin) : x.terminText || '', x.prio || '', x.naechsterSchritt || '', wv ? fmtDatum(wv.datum) : '', x.besonderheiten || '', ST[x.status], hw ? hw.firma : ''];
      });
      await D.excel('Instandhaltungsliste ' + C.today(), [{ name: 'aktuelle TO DO Liste', kopf: ['Objekt', 'SB', 'Aufgabe', 'benötigtes Material', 'Termin', 'Prio', 'nächster Schritt', 'WV', 'Besonderheiten', 'Status', 'Handwerker'], zeilen }]);
    },
    async ihPng() {
      const el = document.getElementById('ihTabelle'); if (!el) return App.toast('Keine Liste sichtbar.', 'warn');
      try { await D.png(el.closest('.card'), 'Instandhaltungsliste ' + C.today()); } catch (e) { App.toast('PNG-Export benötigt Internet (html2canvas): ' + e.message, 'err'); }
    }
  });
})(window);
