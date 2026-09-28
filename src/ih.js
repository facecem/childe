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

  function tabelle(list) {
    return '<table class="tbl" id="ihTabelle"><thead><tr><th>gemeldet</th><th>Objekt / Whg</th><th>Schaden</th><th>Dringl.</th><th>Status</th><th>Handwerker</th><th class="r">Kosten</th><th>nächste WV</th></tr></thead><tbody>' +
      list.map(x => {
        const o = H.objekt(x.objektId) || {}; const m = H.mieter(x.mieterId); const hw = H.kontakt(x.handwerkerId);
        return '<tr class="klick" data-act="openFall" data-b="ih" data-id="' + x.id + '"><td>' + fmtDatum(x.gemeldetAm) + '</td><td>' + esc(o.bezeichnung || '–') + (m && m.whg ? ' · ' + esc(m.whg) : '') + '</td>' +
          '<td><b>' + esc(x.titel) + '</b>' + (x.fotos.length ? ' <small class="muted">📷' + x.fotos.length + '</small>' : '') + '</td><td>' + H.chip(DR[x.dringlichkeit], 'dr-' + x.dringlichkeit) + '</td>' +
          '<td>' + H.chip(ST[x.status], 'is-' + x.status) + '</td><td>' + esc(hw ? hw.firma : '–') + '</td><td class="r">' + (x.rechnung && x.rechnung.betrag ? fmtEUR(x.rechnung.betrag) : x.auftragssumme ? '<span class="muted">' + fmtEUR(x.auftragssumme) + '</span>' : '') + '</td>' +
          '<td>' + H.wvChip(H.naechsteWV('ih', x.id)) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  function gefiltert() {
    const f = App.f.ih, q = f.q.toLowerCase();
    return App.data.ih.filter(x => (!f.objekt || x.objektId === f.objekt) &&
      (f.status === '' || (f.status === 'aktiv' ? !['abgerechnet'].includes(x.status) : x.status === f.status)) &&
      (!q || (x.titel + ' ' + x.beschreibung + ' ' + H.fallLabel('ih', x)).toLowerCase().includes(q)))
      .sort((a, b) => ({ notfall: 0, hoch: 1, normal: 2 }[a.dringlichkeit] - { notfall: 0, hoch: 1, normal: 2 }[b.dringlichkeit]) || (b.gemeldetAm || '').localeCompare(a.gemeldetAm || ''));
  }

  App.views.ih = {
    render() {
      const f = App.f.ih; const list = gefiltert();
      return '<section class="card"><div class="toolbar"><h2>Instandhaltung</h2><input type="search" id="ihQ" data-filter="ih.q" placeholder="Suchen …" value="' + esc(f.q) + '">' +
        '<select data-filter="ih.objekt"><option value="">alle Objekte</option>' + H.objektOptionen(false).map(([v, l]) => '<option value="' + v + '"' + (f.objekt === v ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>' +
        '<select data-filter="ih.status"><option value="aktiv"' + (f.status === 'aktiv' ? ' selected' : '') + '>aktive</option><option value=""' + (f.status === '' ? ' selected' : '') + '>alle</option>' +
        REIHE.map(s => '<option value="' + s + '"' + (f.status === s ? ' selected' : '') + '>' + ST[s] + '</option>').join('') + '</select>' +
        '<span class="sp"></span><button data-act="ihExcel">Liste Excel</button><button data-act="ihPng">Liste PNG</button><button class="primary" data-act="ihNeu">+ Schaden aufnehmen</button></div>' +
        (list.length ? tabelle(list) : H.leer('Keine Instandhaltungsfälle für diesen Filter.')) + '</section>';
    },
    detail(id) {
      const x = H.fall('ih', id); if (!x) { App.detail = null; return App.views.ih.render(); }
      const o = H.objekt(x.objektId) || {}; const m = H.mieter(x.mieterId); const hw = H.kontakt(x.handwerkerId);
      const idx = REIHE.indexOf(x.status);
      const b = (act, label, cls = '') => '<button class="' + cls + '" data-act="' + act + '" data-id="' + id + '">' + label + '</button>';
      const next = { gemeldet: 'ihAnfrage', angefragt: 'ihBeauftragen', beauftragt: 'ihInArbeit', in_arbeit: 'ihErledigt', erledigt: 'ihRechnung' }[x.status];
      const cls = a => (a === next ? 'primary' : '');
      return '<div class="detailkopf"><button data-act="back">← Liste</button><h2>' + esc(x.titel) + '</h2>' + H.chip(DR[x.dringlichkeit], 'dr-' + x.dringlichkeit) +
        '<span class="muted">' + esc(o.bezeichnung || '') + (m ? ' · ' + esc(C.mieterName(m)) + (m.whg ? ' (' + esc(m.whg) + ')' : '') : '') + '</span><span class="sp"></span>' +
        '<button class="s" data-act="ihEdit" data-id="' + id + '">Bearbeiten</button><button class="s del" data-act="ihDel" data-id="' + id + '">Löschen</button></div>' +
        '<div class="pipeline">' + REIHE.map((s, i) => '<span class="' + (i < idx ? 'done' : i === idx ? 'on' : '') + '">' + ST[s] + '</span>').join('') + '</div>' +
        '<div class="cols3"><section class="card"><h3>Schaden</h3><p class="pre">' + esc(x.beschreibung || '–') + '</p><dl class="kv">' +
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
    return [
      { k: 'objektId', l: 'Objekt', t: 'select', o: H.objektOptionen(), req: true }, { k: 'mieterId', l: 'Mieter / Wohnung (optional)', t: 'select', o: [['', '– Gemeinschaftseigentum / keiner –'], ...H.mieterOptionen(false)] },
      { k: 'titel', l: 'Kurzbeschreibung', req: true, full: true, ph: 'z. B. Wasserschaden Bad, Heizung ausgefallen' },
      { k: 'beschreibung', l: 'Beschreibung', t: 'textarea', full: true, rows: 4 },
      { k: 'gemeldetAm', l: 'gemeldet am', t: 'date', req: true }, { k: 'dringlichkeit', l: 'Dringlichkeit', t: 'select', o: Object.entries(DR) },
      { k: 'gewerk', l: 'Gewerk', t: 'select', o: [['', '–'], ...App.GEWERKE.map(g => [g, g])] }, { k: 'verursacher', l: 'Verursacher', t: 'select', o: Object.entries(VERURSACHER) }
    ];
  }

  Object.assign(App.change, {
    ihFotoAdd(el) { fotosHinzu(H.fall('ih', el.dataset.id), Array.from(el.files)); }
  });

  Object.assign(App.act, {
    async ihNeu() {
      if (!App.data.objekte.length) return App.toast('Bitte zuerst unter „Objekte & Mieter“ ein Objekt anlegen.', 'warn');
      const v = await App.formModal('Schaden aufnehmen', [...ihFelder(), { k: 'fotos', l: 'Fotos', t: 'file', multiple: true, accept: 'image/*', full: true, hint: 'werden verkleinert gespeichert' }],
        { gemeldetAm: C.today(), dringlichkeit: 'normal', verursacher: 'unklar', objektId: App.f.ih.objekt }, { wide: true, ok: 'Aufnehmen' });
      if (!v) return;
      if (v.mieterId && !v.objektId) v.objektId = (H.mieter(v.mieterId) || {}).objektId;
      const files = v.fotos; delete v.fotos; delete v._action;
      const f = Object.assign({ id: C.uid(), status: 'gemeldet', angebote: [], anfragen: [], fotos: [] }, v);
      App.data.ih.push(f);
      C.applyAction(App.data, 'ih', f.id, 'gemeldet', { heute: C.today(), dringlichkeit: f.dringlichkeit, verlaufText: 'Schaden gemeldet (' + DR[f.dringlichkeit] + ')' });
      App.tab = 'ih'; App.detail = f.id;
      if (files && files.length) await fotosHinzu(f, files); else App.commit();
    },
    async ihEdit(ds) {
      const f = H.fall('ih', ds.id);
      const v = await App.formModal('Schaden bearbeiten', ihFelder(), f, { wide: true });
      if (!v) return; delete v._action; Object.assign(f, v); App.commit();
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
      const blaetter = {};
      App.data.ih.forEach(x => {
        const o = H.objekt(x.objektId) || { bezeichnung: 'ohne Objekt' }; const m = H.mieter(x.mieterId); const hw = H.kontakt(x.handwerkerId);
        (blaetter[o.bezeichnung] = blaetter[o.bezeichnung] || []).push([fmtDatum(x.gemeldetAm), m ? m.whg || C.mieterName(m) : 'Gemeinschaft', x.titel, x.beschreibung || '', DR[x.dringlichkeit], ST[x.status],
          x.gewerk || '', hw ? hw.firma : '', fmtDatum(x.termin), x.auftragssumme || '', (x.rechnung || {}).betrag || '', VERURSACHER[x.verursacher || 'unklar']]);
      });
      const kopf = ['gemeldet', 'Wohnung', 'Schaden', 'Beschreibung', 'Dringlichkeit', 'Status', 'Gewerk', 'Handwerker', 'Termin', 'Auftrag €', 'Rechnung €', 'Verursacher'];
      const l = Object.keys(blaetter).sort().map(n => ({ name: n.replace(/[\\/?*[\]:]/g, ' '), kopf, zeilen: blaetter[n] }));
      if (!l.length) return App.toast('Keine Daten.', 'warn');
      await D.excel('Instandhaltungsliste ' + C.today(), l);
    },
    async ihPng() {
      const el = document.getElementById('ihTabelle'); if (!el) return App.toast('Keine Liste sichtbar.', 'warn');
      try { await D.png(el.closest('.card'), 'Instandhaltungsliste ' + C.today()); } catch (e) { App.toast('PNG-Export benötigt Internet (html2canvas): ' + e.message, 'err'); }
    }
  });
})(window);
