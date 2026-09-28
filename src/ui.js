/* ============================================================
 * ui – App-Rahmen, Speicher, Dialoge, Dokumenten-Vorschau,
 * Dashboard, Stammdaten, Kontakte, Einstellungen, Suche, Kürzel
 * ============================================================ */
(function (root) {
  'use strict';
  const C = root.Core, D = root.Docs;
  const { esc, fmtEUR, fmtDatum, fmtZahl } = C;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  const App = root.App = {
    data: null, tab: 'dashboard', detail: null, views: {}, act: {}, change: {},
    f: {
      dash: { bereich: '', zeit: 'faellig', objekt: '' },
      opos: { q: '', stufe: 'aktiv', sel: {} },
      ih: { q: '', objekt: '', status: 'aktiv' },
      kaution: { q: '', status: 'aktiv' },
      stamm: { sub: 'mieter', q: '', objekt: '' },
      kontakte: { q: '', typ: '', sub: 'adressbuch', aq: '', aobj: '', afilter: '', mehr: 0 },
      einst: { vorlage: 'erinnerung' }
    }
  };
  const TABS = [
    ['dashboard', 'Dashboard'], ['opos', 'OPOS'], ['ih', 'Instandhaltung'], ['kaution', 'Kaution'],
    ['stamm', 'Objekte & Mieter'], ['kontakte', 'Kontakte'], ['einst', 'Einstellungen']
  ];
  const UI = () => App.data.settings.ui;
  App.ui = UI;
  Object.defineProperty(App, 'GEWERKE', { get: () => UI().gewerke });

  /* ---------- Speicher ---------- */
  App.load = function () {
    let raw = null;
    try { raw = localStorage.getItem(C.STORE_KEY); } catch (e) { /* kein Speicher */ }
    if (raw) { try { App.data = C.normalize(JSON.parse(raw)); return; } catch (e) { console.error(e); } }
    let alt = null;
    try { alt = localStorage.getItem(C.PROTOTYP_KEY); } catch (e) { /* */ }
    if (alt) {
      try {
        App.data = C.normalize(C.migratePrototype(JSON.parse(alt)));
        App.save();
        setTimeout(() => toast('Daten aus dem Prototyp (OPOS-Assistent) übernommen: ' + App.data.opos.length + ' Fälle. Der alte Datenstand bleibt unverändert gespeichert.', 'ok', 9000), 300);
        return;
      } catch (e) { console.error(e); setTimeout(() => toast('Prototyp-Daten konnten nicht gelesen werden: ' + e.message, 'err'), 300); }
    }
    App.data = C.emptyData();
  };
  App.save = function () {
    try { localStorage.setItem(C.STORE_KEY, JSON.stringify(App.data)); return true; }
    catch (e) { toast('Speichern fehlgeschlagen (Browser-Speicher voll?). Bitte Backup exportieren und ggf. Fotos löschen.', 'err', 10000); return false; }
  };
  App.commit = function () { App.save(); App.render(); };

  /* ---------- Toast ---------- */
  function toast(msg, type = 'ok', ms = 4500) {
    const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg;
    $('#toasts').appendChild(t); setTimeout(() => t.classList.add('weg'), ms); setTimeout(() => t.remove(), ms + 400);
  }
  App.toast = toast;

  /* ---------- Dialoge ---------- */
  function modal({ title, body, buttons, wide, cls, onOpen }) {
    return new Promise(resolve => {
      const d = $('#dlg'); let done = false;
      const finish = r => { if (done) return; done = true; if (d.open) d.close(); resolve(r); };
      buttons = buttons || [{ label: 'Schließen', value: '' }];
      d.className = (wide ? 'wide ' : '') + (cls || '');
      d.innerHTML = '<form novalidate><header><h3>' + esc(title) + '</h3><button type="button" class="x" data-close title="Schließen (Esc)">×</button></header>' +
        '<div class="mbody">' + body + '</div><footer>' + buttons.map(b => b.value === ''
          ? '<button type="button" data-close class="' + (b.cls || '') + '">' + b.label + '</button>'
          : '<button type="' + (b.type || 'submit') + '" value="' + esc(b.value) + '" class="' + (b.cls || '') + '">' + b.label + '</button>').join('') + '</footer></form>';
      const form = d.querySelector('form');
      form.addEventListener('submit', e => {
        e.preventDefault();
        const v = e.submitter ? e.submitter.value : (buttons.filter(b => b.value && (b.type || 'submit') === 'submit').pop() || {}).value;
        if (!v) return;
        if (!(e.submitter && e.submitter.dataset.noval != null) && !form.reportValidity()) return;
        finish({ action: v, values: collect(form) });
      });
      $$('[data-close]', d).forEach(b => { b.onclick = () => finish({ action: '' }); });
      d.oncancel = e => { e.preventDefault(); finish({ action: '' }); };
      // close-Event kommt asynchron – ist schon der nächste Dialog offen, ignorieren
      d.onclose = () => { if (!d.open) finish({ action: '' }); };
      d.showModal();
      const first = d.querySelector('.mbody input:not([type=hidden]):not([type=checkbox]), .mbody select, .mbody textarea');
      if (first) first.focus();
      if (onOpen) onOpen(d, finish);
    });
  }
  function collect(rootEl) {
    const o = {};
    $$('[name]', rootEl).forEach(el => {
      const k = el.name;
      if (el.type === 'checkbox') { if (el.dataset.multi != null) { o[k] = o[k] || []; if (el.checked) o[k].push(el.value); } else o[k] = el.checked; }
      else if (el.type === 'file') o[k] = Array.from(el.files || []);
      else if (el.dataset.money != null) o[k] = C.parseBetrag(el.value);
      else if (el.type === 'number') o[k] = el.value === '' ? '' : Number(el.value);
      else o[k] = el.value;
    });
    return o;
  }
  function feld(f, v) {
    const val = v == null ? (f.d != null ? f.d : '') : v;
    const req = f.req ? ' required' : '';
    const attr = (f.ph ? ' placeholder="' + esc(f.ph) + '"' : '') + (f.list ? ' list="' + f.list + '"' : '') + (f.min != null ? ' min="' + f.min + '"' : '') + (f.max != null ? ' max="' + f.max + '"' : '');
    let inp;
    switch (f.t) {
      case 'html': return '<div class="full">' + f.html + '</div>';
      case 'checkbox': return '<label class="chk' + (f.full ? ' full' : '') + '"><input type="checkbox" name="' + f.k + '"' + (val ? ' checked' : '') + '> ' + esc(f.l) + '</label>';
      case 'multi': return '<div class="fld full"><span>' + esc(f.l) + '</span><div class="multi' + (f.cls ? ' ' + f.cls : '') + '">' + f.o.map(([ov, ol]) =>
        '<label class="chk"><input type="checkbox" data-multi name="' + f.k + '" value="' + esc(ov) + '"' + ((val || []).includes(ov) ? ' checked' : '') + '> ' + ol + '</label>').join('') + '</div>' + (f.hint ? '<small>' + f.hint + '</small>' : '') + '</div>';
      case 'select': inp = '<select name="' + f.k + '"' + req + '>' + f.o.map(([ov, ol]) => '<option value="' + esc(ov) + '"' + (String(ov) === String(val) ? ' selected' : '') + '>' + esc(ol) + '</option>').join('') + '</select>'; break;
      case 'textarea': inp = '<textarea name="' + f.k + '" rows="' + (f.rows || 4) + '"' + req + attr + '>' + esc(val) + '</textarea>'; break;
      case 'money': inp = '<input name="' + f.k + '" data-money inputmode="decimal" autocomplete="off" value="' + (val === '' ? '' : esc(fmtZahl(val))) + '"' + req + attr + '>'; break;
      case 'file': inp = '<input type="file" name="' + f.k + '"' + (f.multiple ? ' multiple' : '') + ' accept="' + (f.accept || '') + '">'; break;
      default: inp = '<input type="' + (f.t || 'text') + '" name="' + f.k + '" value="' + esc(val) + '"' + req + attr + (f.step ? ' step="' + f.step + '"' : '') + ' autocomplete="off">';
    }
    return '<label class="fld' + (f.full ? ' full' : '') + '"><span>' + esc(f.l) + (f.req ? ' *' : '') + '</span>' + inp + (f.hint ? '<small>' + f.hint + '</small>' : '') + '</label>';
  }
  async function formModal(title, fields, values = {}, o = {}) {
    const body = (o.intro || '') + '<div class="grid">' + fields.map(f => feld(f, values[f.k])).join('') + '</div>' + (o.outro || '');
    const r = await modal({ title, body, wide: o.wide, onOpen: o.onOpen,
      buttons: [{ label: 'Abbrechen', value: '' }, ...(o.extra || []), { label: o.ok || 'Speichern', value: 'ok', cls: 'primary' }] });
    if (!r.action) return null;
    r.values._action = r.action; return r.values;
  }
  async function confirmDlg(text, ok = 'Ja', cancel = 'Nein', title = 'Bitte bestätigen') {
    const r = await modal({ title, body: '<p>' + text + '</p>', buttons: [{ label: cancel, value: '' }, { label: ok, value: 'ok', cls: 'primary' }] });
    return r.action === 'ok';
  }
  Object.assign(App, { modal, formModal, confirm: confirmDlg, feld, collect });

  /* ---------- Lookup-Helfer ---------- */
  const H = App.h = {
    mieter: id => App.data.mieter.find(m => m.id === id),
    objekt: id => App.data.objekte.find(o => o.id === id),
    kontakt: id => App.data.kontakte.find(k => k.id === id),
    fall: (b, id) => (App.data[b] || []).find(x => x.id === id),
    objektVonFall(b, f) {
      if (!f) return null;
      if (b === 'ih') return H.objekt(f.objektId);
      const m = H.mieter(f.mieterId); return m ? H.objekt(m.objektId) : null;
    },
    fallLabel(b, f) {
      if (!f) return '(gelöscht)';
      if (b === 'ih') { const o = H.objekt(f.objektId); return f.titel + (o ? ' · ' + o.bezeichnung : ''); }
      const m = H.mieter(f.mieterId); const o = m && H.objekt(m.objektId);
      return C.mieterName(m) + (o ? ' · ' + o.bezeichnung + (m.whg ? ' ' + m.whg : '') : '');
    },
    mieterOptionen(leer = true) {
      const l = App.data.mieter.slice().sort((a, b) => (a.nachname || '').localeCompare(b.nachname || '')).map(m => {
        const o = H.objekt(m.objektId); return [m.id, C.mieterName(m) + (o ? ' – ' + o.bezeichnung + (m.whg ? ' ' + m.whg : '') : '')];
      });
      return leer ? [['', '– bitte wählen –'], ...l] : l;
    },
    objektOptionen(leer = true) {
      const l = App.data.objekte.slice().sort((a, b) => a.bezeichnung.localeCompare(b.bezeichnung)).map(o => [o.id, o.bezeichnung]);
      return leer ? [['', '– bitte wählen –'], ...l] : l;
    },
    kontaktOptionen(typ, leer = true) {
      const l = App.data.kontakte.filter(k => !typ || k.typ === typ).map(k => [k.id, k.firma + (k.gewerk && k.gewerk.length ? ' (' + k.gewerk.join(', ') + ')' : '')]);
      return leer ? [['', '– bitte wählen –'], ...l] : l;
    },
    naechsteWV(b, id) { return C.offeneWV(App.data, b, id)[0]; },
    wvChip(w) {
      if (!w) return '<span class="muted">–</span>';
      const t = C.today(); const cls = w.datum < t ? 'rot' : w.datum === t ? 'gelb' : '';
      return '<span class="wvdate ' + cls + '" title="' + esc(w.aufgabe) + '">' + fmtDatum(w.datum) + '</span>';
    },
    chip: (text, cls = '') => '<span class="chip ' + cls + '">' + esc(text) + '</span>',
    leer: text => '<div class="leer">' + text + '</div>'
  };

  /* ---------- WV-Tabelle (Dashboard + Fälle) ---------- */
  const EINHEIT_KURZ = { tage: '', werktage: ' WT', wochen: ' Wo', monate: ' Mo' };
  function snoozeButtons(id) {
    const u = UI();
    return (u.wvButtons || []).map(n => '<button class="s" data-act="wvSnooze" data-id="' + id + '" data-t="' + n + '" title="+' + n + ' ' + C.WV_EINHEITEN[u.wvEinheit] + '">+' + n + EINHEIT_KURZ[u.wvEinheit] + '</button>').join('');
  }
  function aufgabenListe() { return '<datalist id="dl_wvAufgaben">' + (UI().wvAufgaben || []).map(a => '<option value="' + esc(a) + '">').join('') + '</datalist>'; }
  App.wvTabelle = function (list, o = {}) {
    if (!list.length) return H.leer(o.leer || 'Keine Wiedervorlagen.');
    const t = C.today();
    return '<table class="tbl wv"><thead><tr><th>WV-Datum</th>' + (o.fall !== false ? '<th>Bereich</th><th>Fall</th>' : '') +
      '<th>Aufgabe</th><th></th><th class="r">Aktion</th></tr></thead><tbody>' + list.map(w => {
      const f = H.fall(w.bereich, w.refId);
      const cls = w.status === 'erledigt' ? 'done' : w.datum < t ? 'ueber' : w.datum === t ? 'heute' : '';
      return '<tr class="' + cls + '"><td class="nw"><b>' + fmtDatum(w.datum) + '</b>' + (w.status === 'offen' && w.datum < t ? '<br><small>' + C.diffDays(w.datum, t) + ' T überfällig</small>' : '') + '</td>' +
        (o.fall !== false ? '<td>' + H.chip(C.BEREICHE[w.bereich], 'b-' + w.bereich) + '</td><td><a href="#" data-act="openFall" data-b="' + w.bereich + '" data-id="' + w.refId + '">' + esc(H.fallLabel(w.bereich, f)) + '</a></td>' : '') +
        '<td>' + esc(w.aufgabe) + '</td><td class="muted" title="' + (w.erstelltDurch === 'auto' ? 'automatisch erzeugt' : 'manuell') + '">' + (w.erstelltDurch === 'auto' ? '⚙' : '✎') + '</td>' +
        '<td class="r nw">' + (w.status === 'offen'
          ? '<span class="wvbtns">' + snoozeButtons(w.id) + '<button class="s mehr" data-act="wvSnoozeFrei" data-id="' + w.id + '" title="andere Anzahl oder festes Datum">+…</button></span>' +
            '<button class="s ok" data-act="wvDone" data-id="' + w.id + '" title="erledigt">✓</button><button class="s ok" data-act="wvDoneNeu" data-id="' + w.id + '" title="erledigt + neue WV">✓+</button>'
          : '<small class="muted">erledigt ' + fmtDatum(w.erledigtAm) + '</small> <button class="s" data-act="wvReopen" data-id="' + w.id + '" title="wieder öffnen">↺</button>') +
        '</td></tr>';
    }).join('') + '</tbody></table>';
  };
  App.verlaufListe = function (b, id) {
    const l = App.data.verlauf.filter(v => v.bereich === b && v.refId === id).sort((a, x) => x.datum.localeCompare(a.datum) || 0);
    return (l.length ? '<ul class="verlauf">' + l.map(v => '<li><span class="nw">' + fmtDatum(v.datum) + '</span> ' + esc(v.text) + '</li>').join('') + '</ul>' : H.leer('Noch kein Verlauf.')) +
      '<button class="s" data-act="verlaufNotiz" data-b="' + b + '" data-id="' + id + '">+ Notiz</button>';
  };

  Object.assign(App.act, {
    openFall(ds) { App.tab = ds.b; App.detail = ds.id; App.render(); window.scrollTo(0, 0); },
    back() { App.detail = null; App.render(); },
    tab(ds) { App.tab = ds.tab; App.detail = null; App.render(); window.scrollTo(0, 0); },
    wvSnooze(ds) { const w = C.snoozeWV(App.data, ds.id, +ds.t, C.today(), UI().wvEinheit); App.commit(); toast('WV verschoben auf ' + fmtDatum(w.datum) + '.'); },
    async wvSnoozeFrei(ds) {
      const w = App.data.wv.find(x => x.id === ds.id); if (!w) return;
      const letzte = App.f.snooze || { anzahl: 5, einheit: UI().wvEinheit };
      const basis = C.maxISO(w.datum, C.today());
      const chips = [1, 2, 3, 4, 5, 7, 10, 14, 21, 30].map(n => '<button type="button" class="s" data-n="' + n + '">+' + n + '</button>').join('');
      const v = await formModal('WV verschieben', [
        { k: 'html', t: 'html', html: '<p class="muted">Aktuell: <b>' + fmtDatum(w.datum) + '</b> – ' + esc(w.aufgabe) + '</p><div class="chips">' + chips + '</div>' },
        { k: 'anzahl', l: 'um', t: 'number', min: 1, req: true }, { k: 'einheit', l: 'Einheit', t: 'select', o: Object.entries(C.WV_EINHEITEN) },
        { k: 'datum', l: 'oder festes Datum', t: 'date', hint: 'überschreibt „um …“' },
        { k: 'html2', t: 'html', html: '<p class="small">Neues Datum: <b id="snzVorschau"></b> <span class="muted">(Wochenende/Feiertag → nächster Werktag)</span></p>' }
      ], letzte, { ok: 'Verschieben', onOpen(d) {
        const f = d.querySelector('form'); const out = d.querySelector('#snzVorschau');
        const upd = () => { const x = collect(f); const iso = x.datum || C.plusEinheit(basis, x.anzahl, x.einheit); out.textContent = x.datum || x.anzahl ? fmtDatum(C.wvDatum(App.data, iso)) : '–'; };
        d.querySelectorAll('[data-n]').forEach(b => { b.onclick = () => { f.anzahl.value = b.dataset.n; f.datum.value = ''; upd(); }; });
        f.addEventListener('input', upd); f.addEventListener('change', upd); upd();
      } });
      if (!v) return;
      App.f.snooze = { anzahl: v.anzahl, einheit: v.einheit };
      const n = v.datum ? C.setWVDatum(App.data, w.id, v.datum) : C.snoozeWV(App.data, w.id, v.anzahl, C.today(), v.einheit);
      App.commit(); toast('WV verschoben auf ' + fmtDatum(n.datum) + '.');
    },
    wvDone(ds) { C.completeWV(App.data, ds.id); App.commit(); },
    wvReopen(ds) { const w = App.data.wv.find(x => x.id === ds.id); if (w) { w.status = 'offen'; delete w.erledigtAm; App.commit(); } },
    async wvDoneNeu(ds) {
      const w = App.data.wv.find(x => x.id === ds.id); if (!w) return;
      const v = await formModal('Erledigt + neue WV', [
        { k: 'datum', l: 'Neue WV am', t: 'date', req: true, d: C.addDays(C.today(), UI().neuWvTage) },
        { k: 'aufgabe', l: 'Aufgabe', req: true, full: true, d: w.aufgabe, list: 'dl_wvAufgaben' }], {}, { ok: 'Anlegen', outro: aufgabenListe() });
      if (!v) return;
      C.completeWV(App.data, w.id);
      const n = C.createWV(App.data, w.bereich, w.refId, v.datum, v.aufgabe, { erstelltDurch: 'manuell' });
      App.commit(); if (n.datum !== v.datum) toast('WV auf nächsten Werktag gelegt: ' + fmtDatum(n.datum), 'warn');
    },
    async wvNeu(ds) {
      const bereiche = [['opos', 'OPOS'], ['ih', 'Instandhaltung'], ['kaution', 'Kaution']];
      let b = ds.b, id = ds.id;
      if (!id) {
        const opts = [];
        bereiche.forEach(([k, l]) => App.data[k].forEach(f => opts.push([k + '|' + f.id, l + ': ' + H.fallLabel(k, f)])));
        if (!opts.length) return toast('Noch keine Fälle vorhanden.', 'warn');
        const v0 = await formModal('Neue Wiedervorlage', [{ k: 'fall', l: 'Fall', t: 'select', o: opts, full: true }], {}, { ok: 'Weiter' });
        if (!v0) return; [b, id] = v0.fall.split('|');
      }
      const v = await formModal('Neue Wiedervorlage', [
        { k: 'datum', l: 'Datum', t: 'date', req: true, d: C.addDays(C.today(), UI().neuWvTage) },
        { k: 'aufgabe', l: 'Aufgabe', req: true, full: true, list: 'dl_wvAufgaben', ph: 'Vorschlag wählen oder frei eingeben' }], {}, { outro: aufgabenListe() });
      if (!v) return;
      const n = C.createWV(App.data, b, id, v.datum, v.aufgabe, { erstelltDurch: 'manuell' });
      App.commit(); toast('WV angelegt für ' + fmtDatum(n.datum) + '.');
    },
    async verlaufNotiz(ds) {
      const v = await formModal('Notiz zum Verlauf', [{ k: 'datum', l: 'Datum', t: 'date', d: C.today(), req: true }, { k: 'text', l: 'Notiz', t: 'textarea', full: true, req: true }]);
      if (!v) return; C.addVerlauf(App.data, ds.b, ds.id, 'notiz', v.text, v.datum); App.commit();
    }
  });

  /* ---------- Dokument: Vorschau + Export + Verbuchen ---------- */
  /**
   * o: { vorlageId, bereich, fall, frist (ISO|undefined), extra, empfaengerKontakt,
   *      aktion, aktionCtx(frist) → ctx, nachVerbuchen(frist), verlaufText }
   */
  App.dokument = async function (o) {
    let frist = o.frist || '';
    let doc;
    const gen = () => { doc = D.erzeuge(App.data, o.vorlageId, { bereich: o.bereich, fall: o.fall, frist, extra: o.extra, empfaengerKontakt: o.empfaengerKontakt }); };
    gen();
    let exportiert = false;
    const hatFrist = o.frist !== undefined;
    const body = '<div class="doctool">' + (hatFrist ? '<label>Frist <input type="date" id="docFrist" value="' + esc(frist) + '"></label>' : '') +
      '<label class="grow">E-Mail an <input type="email" id="docTo" value="' + esc(doc.email) + '" placeholder="E-Mail-Adresse"></label>' +
      '<span class="muted small">Text in der Vorschau direkt bearbeitbar (vor Export).</span></div><iframe id="docFrame" class="docframe" title="Vorschau"></iframe>';
    const r = await modal({
      title: doc.titel + ' – Vorschau', wide: true, cls: 'docdlg', body,
      buttons: [{ label: 'Schließen', value: '' }, ...(o.aktion ? [{ label: 'Nur verbuchen', value: 'book', cls: 'ghost' }] : []),
        { label: '🖨 Drucken', value: 'print', type: 'button' }, { label: 'Word', value: 'word', type: 'button' }, { label: 'PDF', value: 'pdf', type: 'button' },
        { label: '✉ PDF + E-Mail-Entwurf', value: 'mail', type: 'button', cls: 'primary' }],
      onOpen(d) {
        const fr = d.querySelector('#docFrame');
        const load = () => { fr.srcdoc = D.standalone(doc.html, doc.titel).replace('<body>', '<body contenteditable="true" spellcheck="true" style="background:#dfe4ea;padding:12px">'); };
        load();
        const fi = d.querySelector('#docFrist'); if (fi) fi.onchange = () => { frist = fi.value; gen(); load(); };
        const aktuell = () => { const el = fr.contentDocument && fr.contentDocument.querySelector('.brief'); return el ? el.outerHTML : doc.html; };
        $$('footer button[type=button][value]', d).forEach(btn => {
          btn.onclick = async () => {
            btn.disabled = true; const html = aktuell();
            try {
              if (btn.value === 'print') D.drucken(html, doc.titel);
              if (btn.value === 'word') D.word(html, doc.dateiname);
              if (btn.value === 'pdf') { toast('PDF wird erstellt …'); await D.pdf(html, doc.dateiname); }
              if (btn.value === 'mail') {
                const to = d.querySelector('#docTo').value;
                if (!to) toast('Keine E-Mail-Adresse hinterlegt – Entwurf ohne Empfänger.', 'warn');
                const res = await D.emailEntwurf(Object.assign({}, doc, { html }), to);
                toast(res.art === 'eml' ? 'E-Mail-Entwurf (.eml) gespeichert – per Doppelklick öffnen, Outlook zeigt ihn als Entwurf mit PDF-Anhang.'
                  : 'PDF-Bibliothek nicht verfügbar (' + res.fehler + '). Word-Datei gespeichert, E-Mail-Text in der Zwischenablage, Mailprogramm geöffnet.', res.art === 'eml' ? 'ok' : 'warn', 9000);
              }
              exportiert = true;
            } catch (e) { toast('Fehler: ' + e.message + ' – Word und Drucken funktionieren auch offline.', 'err', 8000); }
            finally { btn.disabled = false; }
          };
        });
      }
    });
    const buchen = r.action === 'book' || (exportiert && o.aktion && await confirmDlg('Schreiben „' + esc(doc.titel) + '“ als versendet verbuchen?<br><small class="muted">Legt einen Verlaufseintrag und die Wiedervorlage(n) automatisch an.</small>', 'Ja, verbuchen', 'Nein'));
    if (buchen && o.aktion) {
      const res = C.applyAction(App.data, o.bereich, o.fall.id, o.aktion, Object.assign({ frist: frist || undefined }, o.aktionCtx ? o.aktionCtx(frist) : {}));
      if (o.nachVerbuchen) o.nachVerbuchen(frist);
      App.commit();
      toast('Verbucht. ' + (res.neu.length ? 'WV: ' + res.neu.map(w => fmtDatum(w.datum)).join(', ') : ''));
      return true;
    }
    if (exportiert && !o.aktion && o.fall) {
      C.addVerlauf(App.data, o.bereich, o.fall.id, 'schreiben', o.verlaufText || (doc.titel + ' erstellt'));
      if (o.nachVerbuchen) o.nachVerbuchen(frist);
      App.commit();
    }
    return exportiert;
  };

  /* ---------- Dashboard ---------- */
  App.views.dashboard = {
    render() {
      const d = App.data, t = C.today(), f = App.f.dash;
      const offen = d.wv.filter(w => w.status === 'offen');
      const inObj = w => !f.objekt || (H.objektVonFall(w.bereich, H.fall(w.bereich, w.refId)) || {}).id === f.objekt;
      const cnt = { ueber: offen.filter(w => w.datum < t).length, heute: offen.filter(w => w.datum === t).length, w7: offen.filter(w => w.datum > t && w.datum <= C.addDays(t, 7)).length };
      const rueck = C.sum(d.opos.filter(x => x.stufe !== 'erledigt'), x => C.offenSumme(x.posten));
      const vt = Number(UI().verjaehrungWarnTage) || 30;
      const kVerj = d.kaution.filter(k => k.status !== 'ausgezahlt' && (C.verjaehrung(k) || { restTage: 9999 }).restTage < vt);
      const zeig = UI().kacheln || [];
      let list = offen;
      if (f.zeit === 'ueber') list = list.filter(w => w.datum < t);
      else if (f.zeit === 'heute') list = list.filter(w => w.datum === t);
      else if (f.zeit === 'faellig') list = list.filter(w => w.datum <= t);
      else if (f.zeit === '7') list = list.filter(w => w.datum <= C.addDays(t, 7));
      else if (f.zeit === '30') list = list.filter(w => w.datum <= C.addDays(t, 30));
      else if (f.zeit === 'erledigt') list = d.wv.filter(w => w.status === 'erledigt').sort((a, b) => (b.erledigtAm || '').localeCompare(a.erledigtAm || '')).slice(0, 200);
      list = list.filter(w => (!f.bereich || w.bereich === f.bereich) && inObj(w));
      if (f.zeit !== 'erledigt') list.sort((a, b) => a.datum.localeCompare(b.datum));
      const kachel = (n, l, cls, act) => '<button class="kachel ' + cls + '" ' + act + '><b>' + n + '</b><span>' + l + '</span></button>';
      const lb = d.meta.lastBackup;
      const backupAlt = !lb || C.diffDays(lb.slice(0, 10), t) >= 7;
      return (backupAlt && (d.opos.length + d.ih.length + d.kaution.length) ? '<div class="banner warn">💾 ' + (lb ? 'Letztes Backup am ' + fmtDatum(lb) + '.' : 'Noch kein Backup erstellt.') +
        ' Die Daten liegen nur in diesem Browser – bitte wöchentlich sichern. <button data-act="backupExport">Jetzt Backup speichern</button></div>' : '') +
        '<div class="kacheln">' +
        [['ueber', () => kachel(cnt.ueber, 'überfällig', cnt.ueber ? 'rot' : '', 'data-act="dashZeit" data-z="ueber"')],
         ['heute', () => kachel(cnt.heute, 'heute fällig', cnt.heute ? 'gelb' : '', 'data-act="dashZeit" data-z="heute"')],
         ['w7', () => kachel(cnt.w7, 'in 7 Tagen', '', 'data-act="dashZeit" data-z="7"')],
         ['opos', () => kachel(offen.filter(w => w.bereich === 'opos').length, 'WV OPOS', 'b-opos', 'data-act="dashBereich" data-b="opos"')],
         ['ih', () => kachel(offen.filter(w => w.bereich === 'ih').length, 'WV Instandhaltung', 'b-ih', 'data-act="dashBereich" data-b="ih"')],
         ['kaution', () => kachel(offen.filter(w => w.bereich === 'kaution').length, 'WV Kaution', 'b-kaution', 'data-act="dashBereich" data-b="kaution"')],
         ['rueck', () => kachel(fmtEUR(rueck), 'Rückstand gesamt', rueck ? 'rot-t' : '', 'data-act="tab" data-tab="opos"')],
         ['verj', () => kachel(kVerj.length, 'Kautionen: Verjährung < ' + vt + ' T', kVerj.length ? 'rot' : '', 'data-act="tab" data-tab="kaution"')]]
          .filter(([k]) => zeig.includes(k)).map(([, f2]) => f2()).join('') +
        '</div>' +
        '<section class="card"><div class="toolbar"><h2>Wiedervorlagen</h2>' +
        '<select data-filter="dash.zeit">' + [['faellig', 'fällig (bis heute)'], ['ueber', 'überfällig'], ['heute', 'heute'], ['7', 'nächste 7 Tage'], ['30', 'nächste 30 Tage'], ['alle', 'alle offenen'], ['erledigt', 'erledigte']]
          .map(([v, l]) => '<option value="' + v + '"' + (f.zeit === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' +
        '<select data-filter="dash.bereich"><option value="">alle Bereiche</option>' + Object.entries(C.BEREICHE).map(([v, l]) => '<option value="' + v + '"' + (f.bereich === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' +
        '<select data-filter="dash.objekt"><option value="">alle Objekte</option>' + H.objektOptionen(false).map(([v, l]) => '<option value="' + v + '"' + (f.objekt === v ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>' +
        '<span class="sp"></span><button data-act="wvNeu">+ WV</button><button data-act="tagesliste">🖨 Tagesliste</button><button data-act="wvExcel">WV-Liste Excel</button></div>' +
        App.wvTabelle(list, { leer: f.zeit === 'faellig' ? 'Nichts fällig – alles erledigt. 🎉' : 'Keine Einträge für diesen Filter.' }) + '</section>';
    }
  };
  Object.assign(App.act, {
    dashZeit(ds) { App.f.dash.zeit = ds.z; App.f.dash.bereich = ''; App.render(); },
    dashBereich(ds) { App.f.dash.bereich = ds.b; App.f.dash.zeit = 'alle'; App.render(); },
    tagesliste() {
      const t = C.today();
      const list = App.data.wv.filter(w => w.status === 'offen' && w.datum <= t).sort((a, b) => a.datum.localeCompare(b.datum));
      const html = '<div style="font-family:Calibri,Arial,sans-serif;font-size:10.5pt;padding:15mm 15mm"><h2 style="margin:0 0 2mm">Tagesliste Wiedervorlagen – ' + fmtDatum(t) + '</h2><p style="margin:0 0 5mm;color:#555">' +
        esc(App.data.settings.firma) + ' · ' + list.length + ' fällige Vorgänge</p><table style="border-collapse:collapse;width:100%">' +
        '<tr>' + ['☐', 'WV', 'Bereich', 'Fall', 'Aufgabe', 'Notiz'].map(h => '<th style="text-align:left;border-bottom:1pt solid #000;padding:1.5mm">' + h + '</th>').join('') + '</tr>' +
        list.map(w => '<tr>' + ['☐', fmtDatum(w.datum), C.BEREICHE[w.bereich], H.fallLabel(w.bereich, H.fall(w.bereich, w.refId)), w.aufgabe, ''].map((c, i) =>
          '<td style="border-bottom:.5pt solid #aaa;padding:1.5mm;' + (i === 5 ? 'width:35mm' : '') + '">' + esc(c) + '</td>').join('') + '</tr>').join('') + '</table></div>';
      D.drucken(html, 'Tagesliste ' + fmtDatum(t));
    },
    async wvExcel() {
      const zeilen = App.data.wv.slice().sort((a, b) => a.datum.localeCompare(b.datum)).map(w => {
        const f = H.fall(w.bereich, w.refId); const o = H.objektVonFall(w.bereich, f);
        return [fmtDatum(w.datum), C.BEREICHE[w.bereich], o ? o.bezeichnung : '', H.fallLabel(w.bereich, f), w.aufgabe, w.status, w.erstelltDurch, fmtDatum(w.erledigtAm)];
      });
      const art = await D.excel('WV-Liste ' + C.today(), [{ name: 'Wiedervorlagen', kopf: ['WV-Datum', 'Bereich', 'Objekt', 'Fall', 'Aufgabe', 'Status', 'erstellt', 'erledigt am'], zeilen }]);
      if (art === 'csv') toast('Excel-Bibliothek nicht erreichbar – als CSV gespeichert (öffnet ebenfalls in Excel).', 'warn');
    }
  });

  /* ---------- Stammdaten: Objekte & Mieter ---------- */
  App.views.stamm = {
    render() {
      const f = App.f.stamm, d = App.data;
      const sub = '<div class="subtabs"><button class="' + (f.sub === 'mieter' ? 'on' : '') + '" data-act="stammSub" data-s="mieter">Mieter (' + d.mieter.length + ')</button>' +
        '<button class="' + (f.sub === 'objekte' ? 'on' : '') + '" data-act="stammSub" data-s="objekte">Objekte (' + d.objekte.length + ')</button></div>';
      const q = f.q.toLowerCase();
      if (f.sub === 'objekte') {
        const l = d.objekte.filter(o => !q || JSON.stringify(o).toLowerCase().includes(q)).sort((a, b) => a.bezeichnung.localeCompare(b.bezeichnung));
        return sub + '<section class="card"><div class="toolbar"><input type="search" id="stammQ" data-filter="stamm.q" placeholder="Suchen …" value="' + esc(f.q) + '"><span class="sp"></span><button class="primary" data-act="objektEdit">+ Objekt</button></div>' +
          (l.length ? '<table class="tbl"><thead><tr><th>Bezeichnung</th><th>Anschrift</th><th>Eigentümer</th><th>IBAN (Eigentümer)</th><th class="r">Mieter</th><th></th></tr></thead><tbody>' +
            l.map(o => '<tr><td><b>' + esc(o.bezeichnung) + '</b></td><td>' + esc(o.strasse) + ', ' + esc(o.plzort) + '</td><td>' + esc(o.eigentuemer) + '</td><td>' + esc(o.iban || '') + '</td><td class="r">' +
              d.mieter.filter(m => m.objektId === o.id).length + '</td><td class="r nw"><button class="s" data-act="objektEdit" data-id="' + o.id + '">Bearbeiten</button><button class="s del" data-act="objektDel" data-id="' + o.id + '">×</button></td></tr>').join('') +
            '</tbody></table>' : H.leer('Noch keine Objekte. Legen Sie zuerst ein Objekt an.')) + '</section>';
      }
      const l = d.mieter.filter(m => (!f.objekt || m.objektId === f.objekt) && (!q || JSON.stringify(m).toLowerCase().includes(q)))
        .sort((a, b) => (a.nachname || '').localeCompare(b.nachname || ''));
      return sub + '<section class="card"><div class="toolbar"><input type="search" id="stammQ" data-filter="stamm.q" placeholder="Suchen …" value="' + esc(f.q) + '">' +
        '<select data-filter="stamm.objekt"><option value="">alle Objekte</option>' + H.objektOptionen(false).map(([v, l2]) => '<option value="' + v + '"' + (f.objekt === v ? ' selected' : '') + '>' + esc(l2) + '</option>').join('') + '</select>' +
        '<span class="sp"></span><button class="primary" data-act="mieterEdit">+ Mieter</button></div>' +
        (l.length ? '<table class="tbl"><thead><tr><th>Name</th><th>Objekt / Whg</th><th>Mietnr.</th><th class="r">Gesamtmiete</th><th>Mietbeginn</th><th>Kontakt</th><th class="r">Fälle</th><th></th></tr></thead><tbody>' +
          l.map(m => {
            const o = H.objekt(m.objektId);
            const faelle = [['opos', 'OPOS'], ['kaution', 'Kaution']].map(([b, lb]) => { const x = d[b].find(y => y.mieterId === m.id && y.stufe !== 'erledigt' && y.status !== 'ausgezahlt'); return x ? '<a href="#" data-act="openFall" data-b="' + b + '" data-id="' + x.id + '">' + lb + '</a>' : ''; }).filter(Boolean).join(' · ');
            return '<tr><td><b>' + esc(C.mieterName(m)) + '</b>' + (m.mietende ? ' <small class="muted">(Ende ' + fmtDatum(m.mietende) + ')</small>' : '') + '</td><td>' + esc(o ? o.bezeichnung : '–') + (m.whg ? ' · ' + esc(m.whg) : '') + '</td><td>' + esc(m.mietnr) + '</td>' +
              '<td class="r">' + fmtEUR(m.gesamtmiete) + '</td><td>' + fmtDatum(m.mietbeginn) + '</td><td class="small">' + esc(m.email || '') + (m.tel ? '<br>' + esc(m.tel) : '') + '</td><td class="r">' + faelle + '</td>' +
              '<td class="r nw"><button class="s" data-act="mieterEdit" data-id="' + m.id + '">Bearbeiten</button><button class="s del" data-act="mieterDel" data-id="' + m.id + '">×</button></td></tr>';
          }).join('') + '</tbody></table>' : H.leer('Keine Mieter gefunden.')) + '</section>';
    }
  };
  const OBJEKT_FELDER = [
    { k: 'bezeichnung', l: 'Bezeichnung', req: true, ph: 'z. B. Musterweg 12' }, { k: 'strasse', l: 'Straße, Nr.', req: true },
    { k: 'plzort', l: 'PLZ Ort', req: true, ph: '52062 Aachen' }, { k: 'eigentuemer', l: 'Eigentümer', hint: 'Erscheint in Kündigung/Auftrag als Vertretener' },
    { k: 'iban', l: 'IBAN Eigentümer (optional)', hint: 'Wird im Brieffuß verwendet, wenn in den Einstellungen „IBAN je Eigentümer“ aktiv ist.' }
  ];
  App.mieterFelder = () => [
    { k: 'objektId', l: 'Objekt', t: 'select', o: H.objektOptionen(), req: true }, { k: 'whg', l: 'Wohnung / Lage', ph: 'z. B. EG links' },
    { k: 'anrede', l: 'Anrede', t: 'select', o: [['', '–'], ['Frau', 'Frau'], ['Herr', 'Herr'], ['Eheleute', 'Eheleute'], ['Familie', 'Familie'], ['Firma', 'Firma']] },
    { k: 'mietnr', l: 'Mieternummer' }, { k: 'vorname', l: 'Vorname' }, { k: 'nachname', l: 'Nachname / Firma', req: true },
    { k: 'email', l: 'E-Mail', t: 'email' }, { k: 'tel', l: 'Telefon', t: 'tel' },
    { k: 'gesamtmiete', l: 'Gesamtmiete mtl. (€)', t: 'money', hint: 'Grundlage für den Kündigungscheck' }, { k: 'kaution', l: 'Kaution (€)', t: 'money' },
    { k: 'mietbeginn', l: 'Mietbeginn', t: 'date' }, { k: 'mietende', l: 'Mietende', t: 'date' },
    { k: 'anschrift', l: 'Abweichende Postanschrift', t: 'textarea', rows: 2, full: true, hint: 'Leer = Wohnungsanschrift aus dem Objekt' }
  ];
  Object.assign(App.act, {
    stammSub(ds) { App.f.stamm.sub = ds.s; App.render(); },
    async objektEdit(ds) {
      const o = ds.id ? H.objekt(ds.id) : null;
      const v = await formModal(o ? 'Objekt bearbeiten' : 'Neues Objekt', OBJEKT_FELDER, o || {});
      if (!v) return null;
      delete v._action;
      if (o) Object.assign(o, v); else App.data.objekte.push(Object.assign({ id: C.uid() }, v));
      App.commit(); return o || App.data.objekte[App.data.objekte.length - 1];
    },
    async objektDel(ds) {
      if (App.data.mieter.some(m => m.objektId === ds.id) || App.data.ih.some(f => f.objektId === ds.id)) return toast('Objekt hat noch Mieter oder Instandhaltungsfälle – bitte zuerst diese löschen/umhängen.', 'warn');
      if (!await confirmDlg('Objekt löschen?')) return;
      App.data.objekte = App.data.objekte.filter(o => o.id !== ds.id); App.commit();
    },
    async mieterEdit(ds) {
      if (!App.data.objekte.length) { toast('Bitte zuerst ein Objekt anlegen.', 'warn'); const o = await App.act.objektEdit({}); if (!o) return null; }
      const m = ds.id ? H.mieter(ds.id) : null;
      const v = await formModal(m ? 'Mieter bearbeiten' : 'Neuer Mieter', App.mieterFelder(), m || { objektId: ds.objektId || App.f.stamm.objekt || '' }, { wide: true });
      if (!v) return null;
      delete v._action;
      if (m) { if (v.gesamtmiete !== m.gesamtmiete) m.mieteGeschaetzt = false; Object.assign(m, v); App.commit(); return m; }
      const neu = Object.assign({ id: C.uid() }, v); App.data.mieter.push(neu); App.commit(); return neu;
    },
    async mieterDel(ds) {
      const d = App.data;
      if (d.opos.some(f => f.mieterId === ds.id) || d.kaution.some(f => f.mieterId === ds.id) || d.ih.some(f => f.mieterId === ds.id))
        return toast('Mieter hat noch Fälle (OPOS/Kaution/Instandhaltung) – bitte zuerst dort löschen.', 'warn');
      if (!await confirmDlg('Mieter löschen?')) return;
      d.mieter = d.mieter.filter(m => m.id !== ds.id); App.commit();
    }
  });

  /* ---------- Kontakte ---------- */
  const KTYP = { handwerker: 'Handwerker', anwalt: 'Anwalt', sonstig: 'Sonstig' };
  App.views.kontakte = {
    render() {
      const f = App.f.kontakte;
      const sub = '<div class="subtabs"><button class="' + (f.sub === 'adressbuch' ? 'on' : '') + '" data-act="kontakteSub" data-s="adressbuch">Mieter & Eigentümer (' + (App.data.adressbuch || []).filter(a => a.aktiv !== false).length + ')</button>' +
        '<button class="' + (f.sub === 'firmen' ? 'on' : '') + '" data-act="kontakteSub" data-s="firmen">Handwerker, Anwälte & Sonstige (' + App.data.kontakte.length + ')</button></div>';
      return sub + (f.sub === 'adressbuch' ? adressbuchHTML() : firmenHTML());
    }
  };
  function firmenHTML() {
    const f = App.f.kontakte; const q = f.q.toLowerCase();
    const l = App.data.kontakte.filter(k => (!f.typ || k.typ === f.typ) && (!q || JSON.stringify(k).toLowerCase().includes(q))).sort((a, b) => a.firma.localeCompare(b.firma));
    return '<section class="card"><div class="toolbar"><h2>Kontakte</h2><input type="search" id="kontaktQ" data-filter="kontakte.q" placeholder="Suchen (Firma, Gewerk …)" value="' + esc(f.q) + '">' +
      '<select data-filter="kontakte.typ"><option value="">alle</option>' + Object.entries(KTYP).map(([v, lb]) => '<option value="' + v + '"' + (f.typ === v ? ' selected' : '') + '>' + lb + '</option>').join('') + '</select>' +
      '<span class="sp"></span><button class="primary" data-act="kontaktEdit">+ Kontakt</button></div>' +
      (l.length ? '<table class="tbl"><thead><tr><th>Firma</th><th>Typ</th><th>Gewerk</th><th>Ansprechpartner</th><th>Telefon</th><th>E-Mail</th><th>Notiz</th><th></th></tr></thead><tbody>' +
        l.map(k => '<tr><td><b>' + esc(k.firma) + '</b></td><td>' + KTYP[k.typ] + '</td><td>' + (k.gewerk || []).map(g => H.chip(g)).join(' ') + '</td><td>' + esc(k.ansprechpartner || '') + '</td>' +
          '<td class="nw">' + esc(k.tel || '') + '</td><td>' + (k.email ? '<a href="mailto:' + esc(k.email) + '">' + esc(k.email) + '</a>' : '') + '</td><td class="small">' + esc(k.notiz || '') + '</td>' +
          '<td class="r nw"><button class="s" data-act="kontaktEdit" data-id="' + k.id + '">Bearbeiten</button><button class="s del" data-act="kontaktDel" data-id="' + k.id + '">×</button></td></tr>').join('') +
        '</tbody></table>' : H.leer('Keine Kontakte. Legen Sie Handwerker mit Gewerk an – dann schlägt das Tool passende Firmen für Anfragen vor.')) + '</section>';
  }
  const ABFILTER = [['', 'alle aktuellen'], ['mieter', 'nur Mieter'], ['eigentuemer', 'nur Eigentümer'], ['ohneMail', 'ohne E-Mail'], ['opos', 'mit offenem OPOS-Fall'], ['geaendert', 'neu/geändert beim letzten Einlesen'], ['weg', 'nicht mehr in der Liste']];
  function adressbuchListe() {
    const f = App.f.kontakte, q = f.aq.toLowerCase().trim(), d = App.data;
    const oposVon = {}; d.opos.forEach(x => { if (x.stufe !== 'erledigt') { const m = H.mieter(x.mieterId); if (m && m.adrNr) oposVon[m.adrNr] = x; } });
    return { oposVon, liste: (d.adressbuch || []).filter(a => {
      if (f.afilter === 'weg') { if (a.aktiv !== false) return false; } else if (a.aktiv === false) return false;
      if (f.aobj && a.objektId !== f.aobj) return false;
      if (f.afilter === 'mieter' && !/mieter/i.test(a.rolle)) return false;
      if (f.afilter === 'eigentuemer' && !/eigent/i.test(a.rolle)) return false;
      if (f.afilter === 'ohneMail' && a.emails.length) return false;
      if (f.afilter === 'opos' && !oposVon[a.adrNr]) return false;
      if (f.afilter === 'geaendert' && !a.aenderung) return false;
      return !q || [a.name, a.importName, a.emails.join(' '), a.strasse, a.plzort, a.lage, a.adrNr, (H.objekt(a.objektId) || {}).bezeichnung].join(' ').toLowerCase().includes(q);
    }).sort((a, b) => (a.objektNr || '').localeCompare(b.objektNr || '') || (a.whg || '').localeCompare(b.whg || '')) };
  }
  function adressbuchHTML() {
    const f = App.f.kontakte, d = App.data; const ab = d.adressbuch || [];
    const { oposVon, liste } = adressbuchListe();
    const objOpt = Array.from(new Set(ab.map(a => a.objektId).filter(Boolean))).map(id => H.objekt(id)).filter(Boolean).sort((a, b) => (a.nr || '').localeCompare(b.nr || ''));
    const max = 200 + (f.mehr || 0);
    const kopf = '<div class="toolbar"><h2>Adressbuch</h2><span class="muted">' + (d.meta.telefonlisteStand ? 'Telefonliste vom ' + fmtDatum(d.meta.telefonlisteStand) : 'noch keine Telefonliste eingelesen') + '</span>' +
      '<span class="sp"></span><button data-act="adressbuchExcel"' + (ab.length ? '' : ' disabled') + '>Excel</button><button class="primary" data-act="telefonlisteImport">⇪ Telefonliste (PDF) einlesen</button></div>';
    if (!ab.length) return '<section class="card">' + kopf + H.leer('Hier landen alle Mieter und Eigentümer mit Anschrift und E-Mail aus der Telefonliste der Verwaltungssoftware (PDF).<br>' +
      'Monatlich neu einlesen – Änderungen werden erkannt, OPOS-Mieter automatisch verknüpft (E-Mail für ✉ Mahnen).') + '</section>';
    const alt = d.meta.telefonlisteStand && C.diffDays(d.meta.telefonlisteStand, C.today()) > 35;
    return '<section class="card">' + kopf + (alt ? '<div class="banner warn">Die Telefonliste ist älter als einen Monat – bitte aktuelle PDF einlesen.</div>' : '') +
      '<div class="toolbar"><input type="search" id="abQ" data-filter="kontakte.aq" placeholder="Name, E-Mail, Adresse, AdrNr …" value="' + esc(f.aq) + '">' +
      '<select data-filter="kontakte.aobj"><option value="">alle Objekte</option>' + objOpt.map(o => '<option value="' + o.id + '"' + (f.aobj === o.id ? ' selected' : '') + '>' + esc((o.nr ? o.nr + ' · ' : '') + o.bezeichnung) + '</option>').join('') + '</select>' +
      '<select data-filter="kontakte.afilter">' + ABFILTER.map(([v, l]) => '<option value="' + v + '"' + (f.afilter === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' +
      '<span class="muted">' + liste.length + ' Einträge</span></div>' +
      (liste.length ? '<table class="tbl"><thead><tr><th>Objekt</th><th>Whg / Lage</th><th>Name</th><th>Anschrift</th><th>E-Mail</th><th>AdrNr</th><th></th></tr></thead><tbody>' +
        liste.slice(0, max).map(a => {
          const o = H.objekt(a.objektId) || {}; const fall = oposVon[a.adrNr];
          return '<tr class="' + (a.aktiv === false ? 'done' : '') + '"><td class="small">' + esc(o.nr || a.objektNr) + '<br>' + esc(o.bezeichnung || '') + '</td>' +
            '<td class="small">' + esc(C.whgNr(a.whg)) + (a.lage ? ' · ' + esc(a.lage) : '') + (/eigent/i.test(a.rolle) ? '<br>' + H.chip('Eigentümer', 'blau') : '') + '</td>' +
            '<td><b>' + esc(a.name || a.importName) + '</b>' + (a.anrede ? ' <small class="muted">' + esc(a.anrede) + '</small>' : '') + '<br><small class="muted">' + esc(a.importName) + '</small></td>' +
            '<td class="small">' + esc(a.strasse) + '<br>' + esc(a.plzort) + '</td>' +
            '<td class="small">' + (a.emails.length ? a.emails.map(m => '<a href="mailto:' + esc(m) + '">' + esc(m) + '</a>').join('<br>') : '<span class="rot-t">keine</span>') + '</td>' +
            '<td class="small">' + esc(a.adrNr) + '</td><td class="r nw">' + (a.aenderung ? H.chip(a.aenderung.slice(0, 40), a.aktiv === false ? 'rot' : 'gelb') + ' ' : '') +
            (fall ? '<button class="s" data-act="openFall" data-b="opos" data-id="' + fall.id + '">OPOS</button><button class="s" data-act="oposMahnenMail" data-id="' + fall.id + '">✉ Mahnen</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table>' + (liste.length > max ? '<p class="r"><button data-act="adressbuchMehr">Weitere ' + Math.min(200, liste.length - max) + ' anzeigen (' + (liste.length - max) + ' übrig)</button></p>' : '')
        : H.leer('Keine Einträge für diesen Filter.')) + '</section>';
  }
  Object.assign(App.act, {
    kontakteSub(ds) { App.f.kontakte.sub = ds.s; App.render(); },
    adressbuchMehr() { App.f.kontakte.mehr = (App.f.kontakte.mehr || 0) + 200; App.render(); },
    async telefonlisteImport() {
      const v = await formModal('Telefonliste einlesen', [{ k: 'datei', l: 'PDF aus der Verwaltungssoftware („Telefonliste gültig ab …“)', t: 'file', accept: '.pdf,application/pdf', full: true }], {},
        { ok: 'Einlesen', intro: '<p class="muted">Liest alle Mieter und Eigentümer mit Objekt, Wohnung, Anschrift und E-Mail. Monatlich neu einlesen – bekannte Einträge (AdrNr) werden aktualisiert, ' +
          'nicht mehr enthaltene markiert. OPOS-Mieter werden über Name und Wohnung verknüpft und bekommen ihre E-Mail für ✉ Mahnen. Selbst eingetragene E-Mails bleiben erhalten.</p>' });
      if (!v || !v.datei[0]) return;
      toast('PDF wird gelesen …');
      let liste;
      try { liste = C.parseTelefonliste(await D.lesePdfText(v.datei[0])); }
      catch (e) { return toast('PDF konnte nicht gelesen werden: ' + e.message + ' (für das Einlesen wird einmal Internet benötigt)', 'err', 9000); }
      if (!liste.personen.length) return toast('In der PDF wurden keine Einträge gefunden. Ist es die Telefonliste mit Textebene (nicht eingescannt)?', 'err', 9000);
      if (App.data.meta.telefonlisteStand && liste.stand && liste.stand < App.data.meta.telefonlisteStand &&
        !await confirmDlg('Diese Liste (' + fmtDatum(liste.stand) + ') ist älter als die bereits eingelesene (' + fmtDatum(App.data.meta.telefonlisteStand) + '). Trotzdem einlesen?')) return;
      const st = C.importTelefonliste(App.data, liste);
      App.tab = 'kontakte'; App.f.kontakte.sub = 'adressbuch'; App.commit();
      const oposAktiv = App.data.opos.filter(f => f.stufe !== 'erledigt');
      const ohne = oposAktiv.map(f => H.mieter(f.mieterId)).filter(m => m && !C.emailsZuMieter(App.data, m));
      const ohneEhem = ohne.filter(m => m.mietende && m.mietende < C.today()).length, ohneMail = ohne.length - ohneEhem;
      modal({ title: 'Telefonliste eingelesen (Stand ' + fmtDatum(liste.stand) + ')', body: '<ul>' +
        '<li><b>' + liste.personen.length + '</b> Personen in ' + liste.objekte.length + ' Objekten, ' + liste.personen.filter(x => x.emails.length).length + ' mit E-Mail</li>' +
        '<li>' + st.neu + ' neu, ' + st.geaendert + ' geändert, ' + st.unveraendert + ' unverändert' + (st.entfernt ? ', <b>' + st.entfernt + '</b> nicht mehr in der Liste' : '') + '</li>' +
        (st.objekteNeu ? '<li>' + st.objekteNeu + ' Objekte neu angelegt</li>' : '') +
        '<li><b>' + st.mieterVerknuepft + '</b> OPOS-Mieter verknüpft, ' + st.emailsNeu + ' E-Mail-Adressen übernommen' + (st.objektZugeordnet ? ', ' + st.objektZugeordnet + ' dem richtigen Objekt zugeordnet' : '') + '</li>' +
        '<li>' + (ohneMail ? '<span class="rot-t">' + ohneMail + ' offene OPOS-Fälle aktueller Mieter ohne E-Mail</span> – beim ✉ Mahnen eintragen' : 'Alle offenen OPOS-Fälle aktueller Mieter haben eine E-Mail-Adresse.') +
          (ohneEhem ? '<br><small class="muted">' + ohneEhem + ' weitere Fälle ehemaliger Mieter ohne E-Mail (stehen nicht mehr in der Telefonliste)</small>' : '') + '</li></ul>' });
    },
    async adressbuchExcel() {
      const zeilen = (App.data.adressbuch || []).map(a => { const o = H.objekt(a.objektId) || {}; return [a.objektNr, o.bezeichnung || '', C.whgNr(a.whg), a.lage, a.rolle, a.anrede, a.name, a.importName, a.strasse, a.plzort, a.emails.join('; '), a.adrNr, a.aktiv === false ? 'nicht mehr in Liste' : 'aktuell', fmtDatum(a.stand)]; });
      await D.excel('Adressbuch ' + C.today(), [{ name: 'Adressbuch', kopf: ['Objekt-Nr', 'Objekt', 'Whg', 'Lage', 'Rolle', 'Anrede', 'Name', 'Name (Liste)', 'Straße', 'PLZ Ort', 'E-Mail', 'AdrNr', 'Status', 'Stand'], zeilen }]);
    },
    async kontaktEdit(ds) {
      const k = ds.id ? H.kontakt(ds.id) : null;
      const v = await formModal(k ? 'Kontakt bearbeiten' : 'Neuer Kontakt', [
        { k: 'typ', l: 'Typ', t: 'select', o: Object.entries(KTYP), d: ds.typ || 'handwerker' }, { k: 'firma', l: 'Firma / Name', req: true },
        { k: 'gewerk', l: 'Gewerke', t: 'multi', o: App.GEWERKE.map(g => [g, g]) },
        { k: 'ansprechpartner', l: 'Ansprechpartner' }, { k: 'tel', l: 'Telefon', t: 'tel' }, { k: 'email', l: 'E-Mail', t: 'email' },
        { k: 'anschrift', l: 'Anschrift', t: 'textarea', rows: 2 }, { k: 'notiz', l: 'Notiz', t: 'textarea', rows: 2 }
      ], k || {}, { wide: true });
      if (!v) return null;
      delete v._action;
      if (k) Object.assign(k, v); else App.data.kontakte.push(Object.assign({ id: C.uid() }, v));
      App.commit(); return k || App.data.kontakte[App.data.kontakte.length - 1];
    },
    async kontaktDel(ds) { if (!await confirmDlg('Kontakt löschen?')) return; App.data.kontakte = App.data.kontakte.filter(k => k.id !== ds.id); App.commit(); }
  });

  /* ---------- Einstellungen ---------- */
  const FRIST_LABEL = {
    erinnerung: 'Zahlungserinnerung: Zahlungsfrist (Tage)', mahnung1: '1. Mahnung: Zahlungsfrist (Tage)', mahnungLetzte: 'Letzte Mahnung: Zahlungsfrist (Tage)',
    emailMahnung: 'E-Mail-Mahnung (✉ Mahnen): Zahlungsfrist (Tage)', abmahnung: 'Abmahnung: Prüffrist (Tage)', kuendigung: 'Kündigung: Räumungs-/Prüffrist (Tage)', anwalt: 'Anwalt: Sachstand nach (Tagen)',
    angebot: 'IH: Angebot eingegangen? nach (Tagen)', ausfuehrung: 'IH: Ausführung prüfen ohne Termin (Tage)', rechnung: 'IH: Rechnung prüfen nach Erledigung (Tage)',
    ihMieter: 'IH: Frist Anfrage an Handwerker (Tage)', weiterbelastung: 'IH: Zahlungsfrist Weiterbelastung (Tage)',
    kautionAbrechnungMonate: 'Kaution: Abrechnung nach Übergabe (Monate)', auszahlung: 'Kaution: Auszahlung prüfen nach (Tagen)', bankverbindung: 'Kaution: Frist Bankverbindung (Tage)'
  };

  const KACHELN = [['ueber', 'überfällig'], ['heute', 'heute fällig'], ['w7', 'in 7 Tagen'], ['opos', 'WV OPOS'], ['ih', 'WV Instandhaltung'], ['kaution', 'WV Kaution'], ['rueck', 'Rückstand gesamt'], ['verj', 'Kautionen mit naher Verjährung']];
  const DASH_ZEIT = [['faellig', 'fällig (bis heute)'], ['ueber', 'überfällig'], ['heute', 'heute'], ['7', 'nächste 7 Tage'], ['30', 'nächste 30 Tage'], ['alle', 'alle offenen']];
  function emailHTML() {
    const E = App.data.settings.email;
    const felder = [
      { k: 'methode', l: '✉ Mahnen öffnet', t: 'select', o: [['mailto', 'Outlook direkt (Standard-Mailprogramm)'], ['eml', '.eml-Entwurf zum Doppelklicken']],
        hint: 'Outlook muss in Windows als Standard-App für E-Mail eingestellt sein.' },
      { k: 'cc', l: 'Immer in Kopie (CC)', t: 'email', ph: 'optional' },
      { k: 'abmahnungStandard', l: 'Abmahnungs-Absatz standardmäßig einfügen', t: 'checkbox', full: true },
      { k: 'signatur', l: 'Grußformel und Signatur (unter jeder E-Mail-Mahnung)', t: 'textarea', rows: 12, full: true }
    ];
    return '<section class="card"><h2>E-Mail-Mahnung (✉ Mahnen)</h2><p class="small muted">Den Mail-Text selbst änderst du unten unter „Vorlagen“ → „E-Mail-Mahnung“.</p><form id="setEmail"><div class="grid">' + felder.map(x => feld(x, E[x.k])).join('') + '</div>' +
      '<div class="actions"><button type="button" class="primary" data-act="emailSave">Speichern</button></div></form></section>';
  }
  function anpassenHTML() {
    const u = UI();
    const felder = [
      { k: 'wvButtons', l: 'Schnell-Buttons zum Verschieben', ph: '1, 2, 3, 4', hint: 'Zahlen mit Komma getrennt, z. B. „1, 2, 3, 4, 7, 14“. Daneben gibt es immer „+…“ für eine freie Anzahl oder ein Datum.' },
      { k: 'wvEinheit', l: 'Schnell-Buttons zählen in', t: 'select', o: Object.entries(C.WV_EINHEITEN) },
      { k: 'neuWvTage', l: 'Neue WV: Vorschlag in … Tagen', t: 'number', min: 0 },
      { k: 'verjaehrungWarnTage', l: 'Kaution: Warnung … Tage vor Verjährung', t: 'number', min: 1 },
      { k: 'wvAufgaben', l: 'Vorschläge für WV-Aufgaben (eine je Zeile)', t: 'textarea', rows: 5 },
      { k: 'gewerke', l: 'Gewerke (eine je Zeile)', t: 'textarea', rows: 5 },
      { k: 'startTab', l: 'Beim Öffnen anzeigen', t: 'select', o: TABS.filter(([k]) => k !== 'einst') },
      { k: 'dashZeit', l: 'Dashboard: WV-Filter beim Öffnen', t: 'select', o: DASH_ZEIT },
      { k: 'tabs', l: 'Sichtbare Bereiche', t: 'multi', o: TABS.filter(([k]) => k !== 'einst').map(([k, l]) => [k, esc(l)]) },
      { k: 'kacheln', l: 'Kacheln im Dashboard', t: 'multi', o: KACHELN },
      { k: 'akzent', l: 'Akzentfarbe', t: 'color' }, { k: 'kopf', l: 'Farbe Kopfleiste', t: 'color' },
      { k: 'schrift', l: 'Schriftgröße (px)', t: 'number', min: 11, max: 20, step: '0.5' },
      { k: 'kompakt', l: 'Kompakte Tabellen (mehr Zeilen auf dem Bildschirm)', t: 'checkbox', full: true }
    ];
    const vals = Object.assign({}, u, { wvButtons: (u.wvButtons || []).join(', '), wvAufgaben: (u.wvAufgaben || []).join('\n'), gewerke: (u.gewerke || []).join('\n') });
    return '<section class="card"><h2>Anpassen</h2><form id="setUI"><div class="grid">' + felder.map(x => feld(x, vals[x.k])).join('') + '</div>' +
      '<div class="actions"><button type="button" class="del" data-act="uiReset">Auf Standard zurücksetzen</button><button type="button" class="primary" data-act="uiSave">Speichern</button></div></form></section>';
  }
  App.views.einst = {
    render() {
      const s = App.data.settings, f = App.f.einst;
      const firmaFelder = [
        { k: 'firma', l: 'Firma', req: true }, { k: 'strasse', l: 'Straße' }, { k: 'plzort', l: 'PLZ Ort' }, { k: 'ort', l: 'Ort (für Datum)' },
        { k: 'tel', l: 'Telefon' }, { k: 'mail', l: 'E-Mail' }, { k: 'web', l: 'Web' }, { k: 'sachbearbeiter', l: 'Sachbearbeiter/in (Ansprechpartner)' },
        { k: 'unterzeichner', l: 'Unterzeichner (Kündigung, Vereinbarungen)' }, { k: 'funktion', l: 'Funktion Unterzeichner' },
        { k: 'bank', l: 'Bank' }, { k: 'iban', l: 'IBAN (Mietkonto)' }, { k: 'bic', l: 'BIC' },
        { k: 'ibanJeEigentuemer', l: 'IBAN je Eigentümer verwenden (aus Objekt), sonst Verwaltungs-IBAN', t: 'checkbox', full: true }
      ];
      const regelFelder = [
        ...Object.keys(FRIST_LABEL).map(k => ({ k: 'fr_' + k, l: FRIST_LABEL[k], t: 'number', min: 0 })),
        { k: 'puffer', l: 'Puffer nach Frist für WV (Tage)', t: 'number', min: 0 }, { k: 'mahngebuehr', l: 'Mahnkosten je Mahnung (€)', t: 'money', hint: 'Standard 0 – bei Wohnraum keine 40-€-Pauschale (§ 288 Abs. 5 BGB gilt nicht ggü. Verbrauchern).' },
        { k: 'ratenVerzugTage', l: 'Raten: Gesamtfälligkeit nach Verzug von (Tagen)', t: 'number', min: 0 },
        { k: 'feiertageNRW', l: 'WV nicht auf NRW-Feiertage legen', t: 'checkbox', full: true }
      ];
      const vals = Object.assign({}, s); Object.keys(s.fristen).forEach(k => { vals['fr_' + k] = s.fristen[k]; });
      const v = D.vorlage(App.data, f.vorlage);
      const vorlagenOpt = Object.entries(D.STANDARD).map(([id, x]) => '<option value="' + id + '"' + (id === f.vorlage ? ' selected' : '') + '>' + C.BEREICHE[x.bereich] + ': ' + esc(x.titel) + ((App.data.vorlagen[id]) ? ' (angepasst)' : '') + '</option>').join('');
      const bytes = (() => { try { return (localStorage.getItem(C.STORE_KEY) || '').length * 2; } catch (e) { return 0; } })();
      return '<div class="cols2">' +
        '<section class="card"><h2>Briefkopf & Absender</h2><form id="setFirma"><div class="grid">' + firmaFelder.map(x => feld(x, vals[x.k])).join('') + '</div>' +
        '<div class="fld full"><span>Logo (optional, ersetzt Firmenname im Kopf)</span><div class="row">' + (s.logo ? '<img src="' + s.logo + '" class="logoprev" alt="Logo">' : '<span class="muted">kein Logo</span>') +
        '<input type="file" accept="image/*" id="logoFile">' + (s.logo ? '<button type="button" class="s del" data-act="logoDel">Logo entfernen</button>' : '') + '</div></div>' +
        '<div class="actions"><button type="button" class="primary" data-act="settingsSave" data-form="setFirma">Speichern</button></div></form></section>' +
        '<section class="card"><h2>Fristen & Regeln</h2><form id="setRegeln"><div class="grid">' + regelFelder.map(x => feld(x, vals[x.k.startsWith('fr_') ? x.k : x.k])).join('') + '</div>' +
        '<div class="actions"><button type="button" class="primary" data-act="settingsSave" data-form="setRegeln">Speichern</button></div></form></section></div>' +
        emailHTML() + anpassenHTML() +
        '<section class="card"><div class="toolbar"><h2>Vorlagen (Textbausteine)</h2><select data-change="vorlageWahl">' + vorlagenOpt + '</select>' +
        (v.geaendert ? H.chip('angepasst', 'gelb') : H.chip('Standard')) + '</div>' +
        '<div class="vorlagen"><div><form id="vorlForm"><label class="fld full"><span>Betreff</span><input name="betreff" value="' + esc(v.betreff) + '"></label>' +
        '<label class="fld full"><span>Brieftext <small class="muted">(**fett**, Leerzeile = Absatz)</small></span><textarea name="text" rows="18" id="vorlText">' + esc(v.text) + '</textarea></label>' +
        (v.nurEmail ? '<label class="fld full"><span>Abmahnungs-Absatz (für {{abmahnungAbsatz}})</span><textarea name="abmahnung" rows="9">' + esc(v.abmahnung || '') + '</textarea></label>'
          : '<label class="fld full"><span>E-Mail-Text</span><textarea name="email" rows="7">' + esc(v.email || '') + '</textarea></label>') + '</form>' +
        '<div class="actions"><button data-act="vorlageReset" class="del">Auf Standard zurücksetzen</button><button data-act="vorlageVorschau">Vorschau aktualisieren</button><button class="primary" data-act="vorlageSave">Vorlage speichern</button></div>' +
        '<details><summary>Platzhalter (klicken zum Einfügen)</summary><div class="platzhalter">' + D.PLATZHALTER.map(([k, l]) => '<button class="s" data-act="phInsert" data-k="' + k + '" title="' + esc(l) + '">{{' + k + '}}</button>').join('') + '</div></details></div>' +
        '<iframe id="vorlPrev" class="docframe small" title="Vorschau"></iframe></div></section>' +
        '<section class="card"><h2>Daten</h2><p class="muted">Alle Daten liegen ausschließlich in diesem Browser (localStorage, ca. ' + (bytes / 1024 / 1024).toFixed(2) + ' MB belegt). Es werden keine Daten übertragen. ' +
        'Letztes Backup: ' + (App.data.meta.lastBackup ? fmtDatum(App.data.meta.lastBackup) : 'noch keines') + '.</p>' +
        '<div class="actions left"><button class="primary" data-act="backupExport">💾 Backup exportieren (JSON)</button><label class="btn">Backup importieren<input type="file" accept=".json,application/json" id="backupFile" hidden></label>' +
        '<button data-act="demoLaden">Demo laden</button><button class="del" data-act="allesLoeschen">Alle Daten löschen</button></div>' +
        '<p class="small muted">Tastaturkürzel: <kbd>Alt</kbd>+<kbd>1</kbd>…<kbd>7</kbd> Bereiche · <kbd>Strg</kbd>+<kbd>K</kbd> oder <kbd>/</kbd> Suche · <kbd>Esc</kbd> zurück · <kbd>Alt</kbd>+<kbd>N</kbd> neuer Eintrag im aktuellen Bereich</p></section>';
    },
    after() {
      const lf = $('#logoFile'); if (lf) lf.onchange = async () => { const file = lf.files[0]; if (!file) return; App.data.settings.logo = await App.bildKomprimieren(file, 600, 0.9, 'image/png'); App.commit(); };
      const bf = $('#backupFile'); if (bf) bf.onchange = () => App.backupImport(bf.files[0]);
      App.act.vorlageVorschau();
    }
  };
  Object.assign(App.act, {
    emailSave() { Object.assign(App.data.settings.email, collect($('#setEmail'))); App.commit(); toast('E-Mail-Einstellungen gespeichert.'); },
    uiSave() {
      const v = collect($('#setUI')); const u = UI();
      const zeilen = t => String(t || '').split('\n').map(x => x.trim()).filter(Boolean);
      const btn = String(v.wvButtons).split(/[,;\s]+/).map(Number).filter(n => n > 0 && n < 1000);
      Object.assign(u, v, {
        wvButtons: Array.from(new Set(btn)).slice(0, 12), wvAufgaben: zeilen(v.wvAufgaben), gewerke: zeilen(v.gewerke),
        neuWvTage: Number(v.neuWvTage) || 0, verjaehrungWarnTage: Number(v.verjaehrungWarnTage) || 30, schrift: Math.min(20, Math.max(11, Number(v.schrift) || 14.5))
      });
      if (!u.tabs.length) u.tabs = ['dashboard'];
      if (!u.tabs.includes(u.startTab)) u.startTab = u.tabs[0];
      App.commit(); toast('Anpassungen gespeichert.');
    },
    async uiReset() {
      if (!await confirmDlg('Alle Anpassungen (Buttons, Farben, Listen, Ansicht) auf Standard zurücksetzen?')) return;
      App.data.settings.ui = C.defaultUI(); App.commit();
    },
    settingsSave(ds) {
      const v = collect($('#' + ds.form)); const s = App.data.settings;
      Object.keys(v).forEach(k => { if (k.startsWith('fr_')) s.fristen[k.slice(3)] = Number(v[k]) || 0; else s[k] = v[k]; });
      App.commit(); toast('Einstellungen gespeichert.');
    },
    logoDel() { App.data.settings.logo = ''; App.commit(); },
    vorlageVorschau() {
      const fr = $('#vorlPrev'); if (!fr) return;
      const id = App.f.einst.vorlage, std = D.STANDARD[id];
      const v = collect($('#vorlForm'));
      const tmp = Object.assign({}, App.data, { vorlagen: Object.assign({}, App.data.vorlagen, { [id]: v }) });
      const fall = App.data[std.bereich].find(f => std.bereich !== 'ih' || f.handwerkerId) || App.data[std.bereich][0] || { posten: [], einbehalte: [] };
      const frist = C.addDays(C.today(), 10);
      if (std.nurEmail) {
        const ctx = D.kontext(tmp, { vorlageId: id, bereich: std.bereich, fall, frist });
        const vl = D.vorlage(tmp, id);
        const mt = C.monateText(fall.posten || []) || C.monatLabel(C.today().slice(0, 7));
        Object.assign(ctx, { monate: mt, fuerMonat: /,| und /.test(mt) ? 'die Monate' : 'den Monat', betrag: fmtEUR(C.offenSumme(fall.posten || [], 'miete') || C.offenSumme(fall.posten || [])), abmahnungAbsatz: vl.abmahnung || '' });
        const txt = 'Betreff: ' + C.vorlageZuText(vl.betreff, ctx) + '\n\n' + C.vorlageZuText(vl.text, ctx).replace(/\n{3,}/g, '\n\n').trim() + '\n\n' + App.data.settings.email.signatur;
        fr.srcdoc = '<pre style="font-family:Calibri,Arial,sans-serif;font-size:11pt;white-space:pre-wrap;margin:16px">' + esc(txt) + '</pre>';
        return;
      }
      const doc = D.erzeuge(tmp, id, { bereich: std.bereich, fall, frist });
      fr.srcdoc = D.standalone(doc.html, doc.titel).replace('<body>', '<body style="background:#dfe4ea;padding:8px;zoom:.72">');
    },
    vorlageSave() {
      const id = App.f.einst.vorlage; const v = collect($('#vorlForm'));
      App.data.vorlagen[id] = v; App.commit(); toast('Vorlage gespeichert.');
    },
    async vorlageReset() {
      if (!await confirmDlg('Vorlage auf den Standardtext zurücksetzen? Ihre Anpassungen gehen verloren.')) return;
      delete App.data.vorlagen[App.f.einst.vorlage]; App.commit();
    },
    phInsert(ds) {
      const ta = $('#vorlText'); const ins = '{{' + ds.k + '}}';
      const p = ta.selectionStart || ta.value.length; ta.value = ta.value.slice(0, p) + ins + ta.value.slice(ta.selectionEnd || p);
      ta.focus(); ta.selectionStart = ta.selectionEnd = p + ins.length;
    },
    backupExport() {
      App.data.meta.lastBackup = new Date().toISOString(); App.save();
      D.download(new Blob([JSON.stringify(App.data, null, 1)], { type: 'application/json' }), 'Verwaltungs-Assistent_Backup_' + C.today() + '.json');
      App.render(); toast('Backup gespeichert. Bitte an einem sicheren Ort (Netzlaufwerk) ablegen.');
    },
    async demoLaden() {
      const hat = App.data.opos.length + App.data.ih.length + App.data.kaution.length + App.data.mieter.length;
      if (hat && !await confirmDlg('Demo-Daten laden? <b>Alle vorhandenen Daten werden ersetzt.</b> Vorher ein Backup exportieren!', 'Ersetzen', 'Abbrechen')) return;
      App.data = App.demoDaten(); App.tab = 'dashboard'; App.detail = null; App.commit(); toast('Demo-Daten geladen (fiktive Mieter).');
    },
    async allesLoeschen() {
      if (!await confirmDlg('<b>Alle Daten löschen?</b> Dies kann nicht rückgängig gemacht werden. Vorher ein Backup exportieren!', 'Alles löschen', 'Abbrechen')) return;
      App.data = C.emptyData(); App.detail = null; App.commit(); toast('Alle Daten gelöscht.');
    }
  });
  Object.assign(App.change, {
    vorlageWahl(el) { App.f.einst.vorlage = el.value; App.render(); }
  });
  App.backupImport = async function (file) {
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (!d || typeof d !== 'object' || !('settings' in d || 'faelle' in d || Array.isArray(d))) throw new Error('Keine gültige Backup-Datei');
      if (!await confirmDlg('Backup vom ' + (d.meta && d.meta.lastBackup ? fmtDatum(d.meta.lastBackup) : 'unbekannten Datum') + ' einspielen? <b>Aktuelle Daten werden ersetzt.</b>', 'Einspielen', 'Abbrechen')) return;
      App.data = d.version ? C.normalize(d) : C.normalize(C.migratePrototype(d));
      App.detail = null; App.commit(); toast('Backup eingespielt.');
    } catch (e) { toast('Import fehlgeschlagen: ' + e.message, 'err'); }
  };

  /* ---------- Bilder ---------- */
  App.bildKomprimieren = function (file, max = 1280, q = 0.7, typ = 'image/jpeg') {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onerror = rej;
      r.onload = () => {
        const img = new Image();
        img.onerror = () => rej(new Error('Bild nicht lesbar'));
        img.onload = () => {
          const f = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = Math.round(img.width * f); c.height = Math.round(img.height * f);
          const ctx = c.getContext('2d'); if (typ === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
          ctx.drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL(typ, q));
        };
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  };

  /* ---------- Suche ---------- */
  function suche(q) {
    q = q.trim().toLowerCase(); if (q.length < 2) return [];
    const d = App.data, r = [];
    const hit = s => String(s || '').toLowerCase().includes(q);
    d.mieter.forEach(m => {
      if (![C.mieterName(m), m.mietnr, m.email, m.whg].some(hit)) return;
      const o = H.objekt(m.objektId);
      const op = d.opos.find(f => f.mieterId === m.id && f.stufe !== 'erledigt'); const k = d.kaution.find(f => f.mieterId === m.id);
      r.push({ t: 'Mieter', l: C.mieterName(m) + (o ? ' – ' + o.bezeichnung : ''), act: op ? { b: 'opos', id: op.id } : k ? { b: 'kaution', id: k.id } : { mieter: m.id } });
    });
    d.objekte.forEach(o => { if ([o.bezeichnung, o.strasse, o.eigentuemer].some(hit)) r.push({ t: 'Objekt', l: o.bezeichnung, act: { objekt: o.id } }); });
    d.ih.forEach(f => { if ([f.titel, f.beschreibung].some(hit)) r.push({ t: 'Instandhaltung', l: H.fallLabel('ih', f), act: { b: 'ih', id: f.id } }); });
    (d.adressbuch || []).forEach(a => { if (a.aktiv !== false && r.length < 14 && [a.name, a.importName, a.emails.join(' ')].some(hit) && !d.mieter.some(m => m.adrNr === a.adrNr && [C.mieterName(m)].some(hit))) r.push({ t: 'Adressbuch', l: (a.name || a.importName) + ' – ' + ((H.objekt(a.objektId) || {}).bezeichnung || a.objektNr), act: { adresse: a.adrNr || a.importName } }); });
    d.kontakte.forEach(k => { if ([k.firma, k.ansprechpartner, (k.gewerk || []).join(' ')].some(hit)) r.push({ t: 'Kontakt', l: k.firma, act: { kontakt: k.id } }); });
    d.opos.forEach(f => { if ((f.posten || []).some(p => hit(p.bez)) || hit(f.notiz)) r.push({ t: 'OPOS', l: H.fallLabel('opos', f), act: { b: 'opos', id: f.id } }); });
    return r.slice(0, 14);
  }
  function sucheOeffnen(a) {
    $('#sucheErg').hidden = true; $('#suche').value = '';
    if (a.b) return App.act.openFall(a);
    if (a.mieter) { App.tab = 'stamm'; App.f.stamm.sub = 'mieter'; App.detail = null; App.render(); return App.act.mieterEdit({ id: a.mieter }); }
    if (a.objekt) { App.tab = 'stamm'; App.f.stamm.sub = 'mieter'; App.f.stamm.objekt = a.objekt; App.detail = null; return App.render(); }
    if (a.adresse) { App.tab = 'kontakte'; App.f.kontakte.sub = 'adressbuch'; App.f.kontakte.aq = a.adresse; App.f.kontakte.afilter = ''; App.f.kontakte.aobj = ''; App.detail = null; return App.render(); }
    if (a.kontakt) { App.tab = 'kontakte'; App.f.kontakte.sub = 'firmen'; App.detail = null; App.render(); return App.act.kontaktEdit({ id: a.kontakt }); }
  }
  let _treffer = [];
  function sucheRender() {
    const box = $('#sucheErg'); _treffer = suche($('#suche').value);
    if (!_treffer.length) { box.hidden = !$('#suche').value.trim(); box.innerHTML = '<div class="muted pad">Keine Treffer.</div>'; return; }
    box.hidden = false;
    box.innerHTML = _treffer.map((x, i) => '<button data-i="' + i + '"><small>' + x.t + '</small> ' + esc(x.l) + '</button>').join('');
  }

  /* ---------- Rendern ---------- */
  function sichtbareTabs() { const t = UI().tabs || []; return TABS.filter(([k]) => k === 'einst' || t.includes(k)); }
  function applyTheme() {
    const u = UI(), r = document.documentElement.style;
    r.setProperty('--pri', u.akzent || '#1f5fa8'); r.setProperty('--kopf', u.kopf || '#15385f');
    r.setProperty('--fs', (Number(u.schrift) || 14.5) + 'px');
    document.body.classList.toggle('kompakt', !!u.kompakt);
  }
  App.render = function () {
    const nav = $('#nav'); const t = C.today();
    const ueber = App.data.wv.filter(w => w.status === 'offen' && w.datum <= t);
    applyTheme();
    if (!sichtbareTabs().some(([k]) => k === App.tab)) { App.tab = sichtbareTabs()[0][0]; App.detail = null; }
    nav.innerHTML = sichtbareTabs().map(([k, l], i) => {
      const n = ['opos', 'ih', 'kaution'].includes(k) ? ueber.filter(w => w.bereich === k).length : k === 'dashboard' ? ueber.length : 0;
      return '<button class="' + (App.tab === k ? 'on' : '') + '" data-act="tab" data-tab="' + k + '" title="Alt+' + (i + 1) + '">' + l + (n ? '<span class="badge">' + n + '</span>' : '') + '</button>';
    }).join('');
    const act = document.activeElement; const fid = act && act.id; const sel = act && act.selectionStart;
    const v = App.views[App.tab];
    const main = $('#main');
    try { main.innerHTML = App.detail && v.detail ? v.detail(App.detail) : v.render(); }
    catch (e) { console.error(e); main.innerHTML = '<div class="banner err">Anzeigefehler: ' + esc(e.message) + ' <button data-act="back">Zurück</button></div>'; }
    if (v.after) v.after();
    if (fid && fid !== 'suche') { const el = document.getElementById(fid); if (el && el !== document.activeElement) { el.focus(); try { if (sel != null) el.selectionStart = el.selectionEnd = sel; } catch (e) { /* */ } } }
    $('#firmaKopf').textContent = App.data.settings.firma;
  };

  /* ---------- Events ---------- */
  let _filterTimer;
  function init() {
    App.load();
    App.tab = UI().startTab || 'dashboard'; App.f.dash.zeit = UI().dashZeit || 'faellig';
    document.addEventListener('click', e => {
      const sb = e.target.closest('#sucheErg button'); if (sb) { e.preventDefault(); return sucheOeffnen(_treffer[+sb.dataset.i].act); }
      if (!e.target.closest('.suche')) $('#sucheErg').hidden = true;
      const el = e.target.closest('[data-act]'); if (!el) return;
      const fn = App.act[el.dataset.act]; if (!fn) return;
      e.preventDefault();
      Promise.resolve(fn(Object.assign({}, el.dataset), el, e)).catch(err => { console.error(err); toast('Fehler: ' + err.message, 'err'); });
    });
    document.addEventListener('change', e => {
      const el = e.target;
      if (el.dataset.change && App.change[el.dataset.change]) return App.change[el.dataset.change](el, e);
      if (el.dataset.filter && el.tagName === 'SELECT') { setFilter(el.dataset.filter, el.value); App.f.kontakte.mehr = 0; App.render(); }
    });
    document.addEventListener('input', e => {
      const el = e.target;
      if (el.id === 'suche') return sucheRender();
      if (el.dataset.filter && el.tagName === 'INPUT') { setFilter(el.dataset.filter, el.value); clearTimeout(_filterTimer); _filterTimer = setTimeout(App.render, 180); }
    });
    $('#suche').addEventListener('keydown', e => {
      if (e.key === 'Enter' && _treffer[0]) { e.preventDefault(); sucheOeffnen(_treffer[0].act); }
      if (e.key === 'Escape') { $('#suche').value = ''; $('#sucheErg').hidden = true; $('#suche').blur(); }
    });
    document.addEventListener('keydown', e => {
      if ($('#dlg').open) return;
      const inFeld = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
      if (e.altKey && /^[1-7]$/.test(e.key)) { const t = sichtbareTabs()[+e.key - 1]; if (t) { e.preventDefault(); App.act.tab({ tab: t[0] }); } }
      else if ((e.ctrlKey && e.key.toLowerCase() === 'k') || (e.key === '/' && !inFeld)) { e.preventDefault(); $('#suche').focus(); $('#suche').select(); }
      else if (e.key === 'Escape' && App.detail && !inFeld) App.act.back();
      else if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        const m = { opos: 'oposNeu', ih: 'ihNeu', kaution: 'kautionNeu', kontakte: 'kontaktEdit', stamm: App.f.stamm.sub === 'objekte' ? 'objektEdit' : 'mieterEdit', dashboard: 'wvNeu' }[App.tab];
        if (m && App.act[m]) App.act[m]({});
      }
    });
    App.render();
    const lb = App.data.meta.lastBackup;
    if ((App.data.opos.length + App.data.ih.length + App.data.kaution.length) && (!lb || C.diffDays(lb.slice(0, 10), C.today()) >= 7))
      setTimeout(() => toast('Erinnerung: Das letzte Backup ist älter als eine Woche. Einstellungen → Backup exportieren.', 'warn', 8000), 800);
  }
  function setFilter(path, val) { const [a, b] = path.split('.'); App.f[a][b] = val; }
  document.addEventListener('DOMContentLoaded', init);
})(window);
