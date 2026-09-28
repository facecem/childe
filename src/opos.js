/* ============================================================
 * modules/opos – Offene Posten, Mahnwesen, Kündigung, Raten, Import
 * ============================================================ */
(function (root) {
  'use strict';
  const C = root.Core, D = root.Docs, App = root.App, H = App.h;
  const { esc, fmtEUR, fmtDatum } = C;
  const S = C.STUFEN;
  const BRIEF_STUFEN = ['erinnerung', 'mahnung1', 'mahnungLetzte', 'kuendigung'];

  function naechsteStufe(f) {
    const i = C.STUFEN_REIHE.indexOf(f.stufe);
    if (f.stufe === 'neu') return 'erinnerung';
    if (i >= 0 && i < 3) return C.STUFEN_REIHE[i + 1];
    return null;
  }
  function aeltesteFaelligkeit(f) { const l = f.posten.filter(p => p.offen > 0 && p.faellig).map(p => p.faellig).sort(); return l[0] || ''; }
  const stufeChip = st => H.chip(S[st] || st, 'st-' + st);

  App.views.opos = {
    render() {
      const f = App.f.opos, d = App.data, q = f.q.toLowerCase();
      const list = d.opos.filter(x => {
        if (f.stufe === 'aktiv' && x.stufe === 'erledigt') return false;
        if (f.stufe && f.stufe !== 'aktiv' && x.stufe !== f.stufe) return false;
        return !q || H.fallLabel('opos', x).toLowerCase().includes(q) || (H.mieter(x.mieterId) || {}).mietnr === f.q;
      }).map(x => ({ x, offen: C.offenSumme(x.posten), wv: H.naechsteWV('opos', x.id), check: C.kuendigungsCheck(x.posten, (H.mieter(x.mieterId) || {}).gesamtmiete) }))
        .sort((a, b) => ((a.wv || {}).datum || '9999').localeCompare((b.wv || {}).datum || '9999') || b.offen - a.offen);
      const sel = Object.keys(f.sel).filter(k => f.sel[k] && list.some(r => r.x.id === k));
      const summe = C.sum(list, r => r.offen);
      return '<section class="card"><div class="toolbar"><h2>Offene Posten</h2>' +
        '<input type="search" id="oposQ" data-filter="opos.q" placeholder="Mieter, Objekt, Mietnr. …" value="' + esc(f.q) + '">' +
        '<select data-filter="opos.stufe"><option value="aktiv"' + (f.stufe === 'aktiv' ? ' selected' : '') + '>aktive Fälle</option><option value=""' + (f.stufe === '' ? ' selected' : '') + '>alle</option>' +
        C.STUFEN_REIHE.map(s => '<option value="' + s + '"' + (f.stufe === s ? ' selected' : '') + '>' + S[s] + '</option>').join('') + '</select>' +
        '<span class="sp"></span><button data-act="oposImport">⇪ OPOS-Liste einlesen</button><button data-act="oposExcel">Export Excel</button>' +
        '<button data-act="mahnlauf"' + (sel.length ? '' : ' disabled title="Fälle per Häkchen auswählen"') + '>Mahnlauf (' + sel.length + ')</button><button class="primary" data-act="oposNeu">+ Neuer Fall</button></div>' +
        (list.length ? '<table class="tbl"><thead><tr><th><input type="checkbox" data-change="oposSelAll"' + (sel.length && sel.length === list.length ? ' checked' : '') + ' title="alle"></th><th>Mieter</th><th>Objekt / Whg</th><th>Stufe</th>' +
          '<th class="r">offen Miete</th><th class="r">offen gesamt</th><th>älteste Fäll.</th><th>nächste WV</th><th>Prüfhinweis</th></tr></thead><tbody>' +
          list.map(({ x, offen, wv, check }) => {
            const m = H.mieter(x.mieterId) || {}; const o = H.objekt(m.objektId);
            return '<tr class="klick" data-act="openFall" data-b="opos" data-id="' + x.id + '"><td data-stop><input type="checkbox" data-change="oposSel" data-id="' + x.id + '"' + (f.sel[x.id] ? ' checked' : '') + '></td>' +
              '<td><b>' + esc(C.mieterName(m)) + '</b>' + (m.mietnr ? ' <small class="muted">' + esc(m.mietnr) + '</small>' : '') + '</td><td>' + esc(o ? o.bezeichnung : '–') + (m.whg ? ' · ' + esc(m.whg) : '') + '</td>' +
              '<td>' + stufeChip(x.stufe) + (m.mietende && m.mietende < C.today() ? ' ' + H.chip('ehemalig') : '') + (x.raten && x.raten.some(r => !r.bezahlt) ? ' ' + H.chip('Raten', 'blau') : '') + '</td><td class="r">' + fmtEUR(C.offenSumme(x.posten, 'miete')) + '</td><td class="r"><b>' + fmtEUR(offen) + '</b></td>' +
              '<td>' + fmtDatum(aeltesteFaelligkeit(x)) + '</td><td>' + H.wvChip(wv) + '</td><td>' + (check.moeglich && x.stufe !== 'erledigt' ? H.chip('⚠ Kündigung mögl.', 'rot') : '') + '</td></tr>';
          }).join('') + '</tbody><tfoot><tr><td></td><td colspan="4">' + list.length + ' Fälle</td><td class="r"><b>' + fmtEUR(summe) + '</b></td><td colspan="3"></td></tr></tfoot></table>'
          : H.leer('Keine Fälle. Legen Sie einen Fall an oder importieren Sie die OPOS-Liste aus Ihrer Verwaltungssoftware.')) + '</section>';
    },
    detail(id) {
      const x = H.fall('opos', id); if (!x) { App.detail = null; return App.views.opos.render(); }
      const m = H.mieter(x.mieterId) || {}; const o = H.objekt(m.objektId) || {};
      const check = C.kuendigungsCheck(x.posten, m.gesamtmiete);
      const offen = C.offenSumme(x.posten);
      const ns = naechsteStufe(x);
      const posten = x.posten.slice().sort((a, b) => (a.faellig || '').localeCompare(b.faellig || ''));
      const briefBtn = (st, label) => '<button class="' + (st === ns ? 'primary' : '') + '" data-act="oposBrief" data-id="' + id + '" data-v="' + st + '">' + label + '</button>';
      return '<div class="detailkopf"><button data-act="back">← Liste</button><h2>' + esc(C.mieterName(m)) + '</h2>' + stufeChip(x.stufe) +
        '<span class="muted">' + esc(o.bezeichnung || '') + (m.whg ? ' · ' + esc(m.whg) : '') + '</span><span class="sp"></span><button class="s del" data-act="oposDel" data-id="' + id + '">Fall löschen</button></div>' +
        '<div class="cols3">' +
        '<section class="card"><h3>Mieter</h3><dl class="kv">' +
        '<dt>Mietnr.</dt><dd>' + esc(m.mietnr || '–') + '</dd><dt>Gesamtmiete</dt><dd>' + fmtEUR(m.gesamtmiete) + '</dd><dt>Mietbeginn</dt><dd>' + fmtDatum(m.mietbeginn) + '</dd>' +
        '<dt>E-Mail</dt><dd>' + esc(m.email || '–') + '</dd><dt>Telefon</dt><dd>' + esc(m.tel || '–') + '</dd><dt>Eigentümer</dt><dd>' + esc(o.eigentuemer || '–') + '</dd></dl>' +
        '<button class="s" data-act="mieterEdit" data-id="' + m.id + '">Mieter bearbeiten</button></section>' +
        '<section class="card"><h3>Stand</h3><div class="big ' + (offen > 0 ? 'rot-t' : 'gruen-t') + '">' + fmtEUR(offen) + '</div><div class="muted">offen, davon Miete ' + fmtEUR(C.offenSumme(x.posten, 'miete')) + '</div>' +
        (x.frist ? '<p>Letzte Frist: <b>' + fmtDatum(x.frist) + '</b></p>' : '') +
        '<div class="pruef ' + (check.moeglich ? 'rot' : '') + '"><b>Kündigungscheck § 543 Abs. 2 S. 1 Nr. 3 BGB</b><br>' + esc(check.text) + '<br><small>' + esc(check.hinweis) + ' Nur Mietposten zählen. Schonfristzahlung (§ 569 Abs. 3 Nr. 2 BGB) beachten.</small></div></section>' +
        '<section class="card"><h3>Aktionen</h3><div class="btns">' +
        briefBtn('erinnerung', 'Zahlungserinnerung') + briefBtn('mahnung1', '1. Mahnung') + briefBtn('mahnungLetzte', 'Letzte Mahnung') + briefBtn('kuendigung', 'Kündigung …') +
        '<button data-act="oposBrief" data-id="' + id + '" data-v="abmahnung">Abmahnung (unpünktl.)</button><button data-act="oposRaten" data-id="' + id + '">Ratenzahlung …</button>' +
        '</div><div class="btns"><button class="primary" data-act="oposZahlung" data-id="' + id + '">€ Zahlung verbuchen</button><button data-act="oposAnwalt" data-id="' + id + '">An Anwalt übergeben</button>' +
        '<button data-act="oposStufe" data-id="' + id + '">Stufe setzen</button><button data-act="oposErledigt" data-id="' + id + '">Fall erledigt</button></div></section></div>' +
        '<section class="card"><div class="toolbar"><h3>Posten</h3><span class="sp"></span><button data-act="oposMieten" data-id="' + id + '">+ Monatsmieten</button><button data-act="postenEdit" data-id="' + id + '">+ Posten</button></div>' +
        (posten.length ? '<table class="tbl"><thead><tr><th>Fällig</th><th>Bezeichnung</th><th>Typ</th><th class="r">Betrag</th><th class="r">offen</th><th></th></tr></thead><tbody>' +
          posten.map(p => '<tr class="' + (p.offen <= 0 ? 'done' : '') + '"><td>' + fmtDatum(p.faellig) + '</td><td>' + esc(p.bez) + '</td><td>' + (p.typ === 'miete' ? 'Miete' : 'Sonstig') + '</td><td class="r">' + fmtEUR(p.betrag) + '</td>' +
            '<td class="r"><b>' + fmtEUR(p.offen) + '</b></td><td class="r nw"><button class="s" data-act="postenEdit" data-id="' + id + '" data-p="' + p.id + '">Bearbeiten</button><button class="s del" data-act="postenDel" data-id="' + id + '" data-p="' + p.id + '">×</button></td></tr>').join('') +
          '</tbody></table>' : H.leer('Noch keine Posten.')) + '</section>' +
        (x.raten && x.raten.length ? '<section class="card"><h3>Ratenplan</h3><table class="tbl"><thead><tr><th>Rate</th><th>fällig</th><th class="r">Betrag</th><th>Status</th></tr></thead><tbody>' +
          x.raten.map((r, i) => '<tr class="' + (r.bezahlt ? 'done' : r.faellig < C.today() ? 'ueber' : '') + '"><td>' + r.nr + '.</td><td>' + fmtDatum(r.faellig) + '</td><td class="r">' + fmtEUR(r.betrag) + '</td><td>' +
            '<label class="chk"><input type="checkbox" data-change="rateBezahlt" data-id="' + id + '" data-i="' + i + '"' + (r.bezahlt ? ' checked' : '') + '> bezahlt</label></td></tr>').join('') + '</tbody></table></section>' : '') +
        '<div class="cols2"><section class="card"><div class="toolbar"><h3>Wiedervorlagen</h3><span class="sp"></span><button class="s" data-act="wvNeu" data-b="opos" data-id="' + id + '">+ WV</button></div>' +
        App.wvTabelle(App.data.wv.filter(w => w.bereich === 'opos' && w.refId === id).sort((a, b) => (a.status === b.status ? a.datum.localeCompare(b.datum) : a.status === 'offen' ? -1 : 1)), { fall: false }) + '</section>' +
        '<section class="card"><h3>Verlauf</h3>' + App.verlaufListe('opos', id) + '<label class="fld full"><span>Notiz zum Fall</span><textarea data-change="oposNotiz" data-id="' + id + '" rows="3">' + esc(x.notiz || '') + '</textarea></label></section></div>';
    }
  };

  function neuerFall(mieterId) {
    const f = { id: C.uid(), mieterId, stufe: 'neu', posten: [], raten: [], notiz: '', angelegt: C.today() };
    App.data.opos.push(f);
    C.addVerlauf(App.data, 'opos', f.id, 'angelegt', 'Fall angelegt');
    C.createWV(App.data, 'opos', f.id, C.today(), 'Offene Posten prüfen – Zahlungserinnerung versenden?', { regel: 'opos:neu' });
    return f;
  }

  Object.assign(App.change, {
    oposSel(el) { App.f.opos.sel[el.dataset.id] = el.checked; App.render(); },
    oposSelAll(el) { $$('input[data-change=oposSel]').forEach(c => { App.f.opos.sel[c.dataset.id] = el.checked; }); App.render(); },
    oposNotiz(el) { const f = H.fall('opos', el.dataset.id); f.notiz = el.value; App.save(); App.toast('Notiz gespeichert.'); },
    rateBezahlt(el) {
      const f = H.fall('opos', el.dataset.id); const r = f.raten[+el.dataset.i]; r.bezahlt = el.checked;
      if (el.checked) rateWVSchliessen(f, r);
      C.addVerlauf(App.data, 'opos', f.id, 'rate', 'Rate ' + r.nr + ' (' + fmtEUR(r.betrag) + ') als ' + (el.checked ? 'bezahlt' : 'offen') + ' markiert');
      App.commit();
    }
  });
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  function rateWVSchliessen(f, r) {
    App.data.wv.forEach(w => { if (w.bereich === 'opos' && w.refId === f.id && w.status === 'offen' && w.regel === 'opos:raten' && w.aufgabe.startsWith('Rate ' + r.nr + '/')) { w.status = 'erledigt'; w.erledigtAm = C.today(); } });
  }
  // Klick auf Checkbox in der Zeile soll den Fall nicht öffnen
  document.addEventListener('click', e => { if (e.target.closest('[data-stop]')) e.stopPropagation(); }, true);

  Object.assign(App.act, {
    async oposNeu() {
      const v = await App.formModal('Neuer OPOS-Fall', [
        { k: 'mieterId', l: 'Mieter', t: 'select', o: H.mieterOptionen(), full: true },
        { k: 'mieten', l: 'Offene Monatsmieten gleich anlegen (Anzahl)', t: 'number', min: 0, d: 0 },
        { k: 'ab', l: 'erste offene Miete (Monat)', t: 'month', d: C.today().slice(0, 7) }
      ], {}, { ok: 'Anlegen', extra: [{ label: '+ Neuer Mieter', value: 'neuMieter', cls: 'ghost' }] });
      if (!v) return;
      let mid = v.mieterId;
      if (v._action === 'neuMieter' || !mid) { const m = await App.act.mieterEdit({}); if (!m) return; mid = m.id; }
      const exist = App.data.opos.find(f => f.mieterId === mid && f.stufe !== 'erledigt');
      if (exist) { App.toast('Für diesen Mieter gibt es bereits einen aktiven Fall.', 'warn'); return App.act.openFall({ b: 'opos', id: exist.id }); }
      const f = neuerFall(mid);
      if (v.mieten > 0) mietenAnlegen(f, v.ab + '-01', +v.mieten, (H.mieter(mid) || {}).gesamtmiete || 0);
      App.tab = 'opos'; App.detail = f.id; App.commit();
    },
    async oposDel(ds) {
      if (!await App.confirm('Fall inkl. Wiedervorlagen und Verlauf löschen?', 'Löschen', 'Abbrechen')) return;
      const d = App.data; d.opos = d.opos.filter(f => f.id !== ds.id);
      d.wv = d.wv.filter(w => !(w.bereich === 'opos' && w.refId === ds.id)); d.verlauf = d.verlauf.filter(w => !(w.bereich === 'opos' && w.refId === ds.id));
      App.detail = null; App.commit();
    },
    async postenEdit(ds) {
      const f = H.fall('opos', ds.id); const p = ds.p ? f.posten.find(x => x.id === ds.p) : null;
      const m = H.mieter(f.mieterId) || {};
      const v = await App.formModal(p ? 'Posten bearbeiten' : 'Neuer Posten', [
        { k: 'bez', l: 'Bezeichnung', req: true, full: true, list: 'dl_posten' }, { k: 'faellig', l: 'Fällig am', t: 'date', req: true },
        { k: 'typ', l: 'Typ', t: 'select', o: [['miete', 'Miete (zählt für Kündigung)'], ['sonstig', 'Sonstig (NK-Nachzahlung, Kosten …)']] },
        { k: 'betrag', l: 'Betrag (€)', t: 'money', req: true }, { k: 'offen', l: 'davon offen (€)', t: 'money', hint: 'leer = voller Betrag' }
      ], p || { typ: 'miete', betrag: m.gesamtmiete || '', faellig: C.today() }, {
        outro: '<datalist id="dl_posten"><option value="Miete ' + C.today().slice(5, 7) + '/' + C.today().slice(0, 4) + '"><option value="Nebenkostennachzahlung"><option value="Mahnkosten"><option value="Rücklastschriftgebühr"></datalist>'
      });
      if (!v) return;
      const offen = v.offen === 0 && !p ? v.betrag : v.offen;
      if (p) Object.assign(p, { bez: v.bez, faellig: v.faellig, typ: v.typ, betrag: v.betrag, offen });
      else { f.posten.push({ id: C.uid(), bez: v.bez, faellig: v.faellig, typ: v.typ, betrag: v.betrag, offen }); C.addVerlauf(App.data, 'opos', f.id, 'posten', 'Posten „' + v.bez + '“ ' + fmtEUR(v.betrag) + ' erfasst'); }
      App.commit();
    },
    async postenDel(ds) {
      const f = H.fall('opos', ds.id); if (!await App.confirm('Posten löschen?')) return;
      f.posten = f.posten.filter(p => p.id !== ds.p); App.commit();
    },
    async oposMieten(ds) {
      const f = H.fall('opos', ds.id); const m = H.mieter(f.mieterId) || {};
      const v = await App.formModal('Monatsmieten als offene Posten anlegen', [
        { k: 'ab', l: 'ab Monat', t: 'month', req: true, d: C.today().slice(0, 7) }, { k: 'anzahl', l: 'Anzahl Monate', t: 'number', min: 1, d: 1, req: true },
        { k: 'betrag', l: 'Betrag je Monat (€)', t: 'money', d: m.gesamtmiete || 0, req: true }], {}, { ok: 'Anlegen' });
      if (!v) return; mietenAnlegen(f, v.ab + '-01', +v.anzahl, v.betrag); App.commit();
    },
    async oposZahlung(ds) {
      const f = H.fall('opos', ds.id); const offen = C.offenSumme(f.posten);
      const v = await App.formModal('Zahlung verbuchen', [
        { k: 'betrag', l: 'Betrag (€)', t: 'money', req: true, d: offen }, { k: 'datum', l: 'Zahlungseingang am', t: 'date', req: true, d: C.today() },
        { k: 'notiz', l: 'Notiz', full: true }], {}, { ok: 'Verbuchen', intro: '<p class="muted">Die Zahlung wird auf die ältesten offenen Posten verrechnet. Offen: <b>' + fmtEUR(offen) + '</b></p>' });
      if (!v || !(v.betrag > 0)) return;
      const r = C.verteileZahlung(f.posten, v.betrag);
      f.posten = r.posten;
      C.addVerlauf(App.data, 'opos', f.id, 'zahlung', 'Zahlung ' + fmtEUR(v.betrag) + ' verbucht: ' + r.buchungen.map(b => b.bez + ' ' + fmtEUR(b.betrag)).join(', ') + (r.rest ? ' · Überzahlung ' + fmtEUR(r.rest) : '') + (v.notiz ? ' · ' + v.notiz : ''), v.datum);
      let rest = v.betrag;
      (f.raten || []).filter(x => !x.bezahlt).forEach(x => { if (rest + 0.005 >= x.betrag) { x.bezahlt = true; rest = C.round2(rest - x.betrag); rateWVSchliessen(f, x); } });
      App.commit();
      if (C.offenSumme(f.posten) <= 0 && f.stufe !== 'erledigt') {
        if (await App.confirm('Alle Posten sind ausgeglichen. Fall als erledigt abschließen? (offene automatische WV werden geschlossen)', 'Ja, erledigt', 'Nein')) {
          C.applyAction(App.data, 'opos', f.id, 'erledigt', {}); App.commit();
        }
      } else App.toast('Zahlung verbucht. Noch offen: ' + fmtEUR(C.offenSumme(f.posten)));
    },
    async oposBrief(ds) {
      const f = H.fall('opos', ds.id), st = ds.v, m = H.mieter(f.mieterId) || {};
      if (!C.offenSumme(f.posten) && st !== 'abmahnung') return App.toast('Keine offenen Posten – kein Mahnschreiben nötig.', 'warn');
      const extra = {};
      if (st === 'kuendigung') {
        const ch = C.kuendigungsCheck(f.posten, m.gesamtmiete);
        const ok = await App.confirm('<div class="pruef ' + (ch.moeglich ? '' : 'rot') + '"><b>Kündigungscheck:</b> ' + esc(ch.text) + '<br><small>' + esc(ch.hinweis) + '</small></div>' +
          '<ul class="small"><li>Die Kündigung bedarf der <b>Schriftform</b> (§ 568 Abs. 1 BGB): Original unterschrieben per Post/Boten, E-Mail nur „vorab“.</li>' +
          '<li>Vollmacht im Original beilegen (§ 174 BGB).</li><li>Alle Mieter laut Mietvertrag als Empfänger – ggf. Anschrift anpassen.</li>' +
          '<li>Schonfristzahlung: vollständiger Ausgleich bis 2 Monate nach Rechtshängigkeit der Räumungsklage macht die fristlose Kündigung unwirksam.</li></ul>' +
          (ch.moeglich ? '' : '<p><b>Die Voraussetzungen scheinen nicht erfüllt. Trotzdem fortfahren?</b></p>'), 'Schreiben erstellen', 'Abbrechen', 'Kündigung vorbereiten');
        if (!ok) return;
      }
      if (st === 'abmahnung') {
        const v = await App.formModal('Abmahnung – Angaben', [{ k: 'abmahnungDetails', l: 'Verspätete Zahlungen (Monat, Eingangsdatum)', t: 'textarea', full: true, req: true, rows: 5,
          ph: 'Miete Juni 2026: Eingang am 18.06.2026\nMiete Juli 2026: Eingang am 21.07.2026' }], {}, { ok: 'Weiter' });
        if (!v) return; extra.abmahnungDetails = v.abmahnungDetails;
      }
      const tage = Number(App.data.settings.fristen[st]) || 10;
      await App.dokument({ vorlageId: st, bereich: 'opos', fall: f, frist: C.addDays(C.today(), tage), extra, aktion: st });
    },
    async mahnlauf() {
      const d = App.data; const ids = Object.keys(App.f.opos.sel).filter(k => App.f.opos.sel[k]);
      const faelle = ids.map(id => H.fall('opos', id)).filter(f => f && f.stufe !== 'erledigt' && C.offenSumme(f.posten) > 0);
      if (!faelle.length) return App.toast('Keine ausgewählten Fälle mit offenen Posten.', 'warn');
      const zeilen = faelle.map(f => {
        const ns = naechsteStufe(f);
        return '<tr><td>' + esc(H.fallLabel('opos', f)) + '</td><td>' + stufeChip(f.stufe) + '</td><td class="r">' + fmtEUR(C.offenSumme(f.posten)) + '</td><td><select name="st_' + f.id + '">' +
          '<option value="">– auslassen –</option>' + ['erinnerung', 'mahnung1', 'mahnungLetzte'].map(s => '<option value="' + s + '"' + (s === ns ? ' selected' : '') + '>' + S[s] + '</option>').join('') + '</select></td>' +
          '<td>' + ((H.mieter(f.mieterId) || {}).email ? '✉' : '<small class="muted">nur Post</small>') + '</td></tr>';
      }).join('');
      const r = await App.modal({
        title: 'Mahnlauf (' + faelle.length + ' Fälle)', wide: true,
        body: '<p class="muted">Je Fall wird die nächste Stufe vorgeschlagen. Kündigungen werden nicht im Mahnlauf erstellt (Einzelprüfung).</p>' +
          '<table class="tbl"><thead><tr><th>Fall</th><th>aktuell</th><th class="r">offen</th><th>Schreiben</th><th></th></tr></thead><tbody>' + zeilen + '</tbody></table>' +
          '<div class="grid"><label class="fld"><span>Ausgabe</span><select name="ausgabe"><option value="druck">Alle Briefe in einem Druckauftrag</option><option value="word">Alle Briefe als eine Word-Datei</option>' +
          '<option value="pdf">Einzelne PDF-Dateien</option><option value="mail">E-Mail-Entwürfe (.eml mit PDF), sonst Druck</option></select></label>' +
          '<label class="chk"><input type="checkbox" name="buchen" checked> nach Ausgabe als versendet verbuchen (WV anlegen)</label></div>',
        buttons: [{ label: 'Abbrechen', value: '' }, { label: 'Mahnlauf starten', value: 'ok', cls: 'primary' }]
      });
      if (r.action !== 'ok') return;
      const jobs = faelle.map(f => ({ f, st: r.values['st_' + f.id] })).filter(j => j.st);
      const docs = jobs.map(j => { const frist = C.addDays(C.today(), Number(d.settings.fristen[j.st]) || 10); return Object.assign(j, { frist, doc: D.erzeuge(d, j.st, { bereich: 'opos', fall: j.f, frist }) }); });
      const ohneMail = [];
      if (r.values.ausgabe === 'druck') D.drucken(docs.map(x => x.doc.html).join(''), 'Mahnlauf ' + fmtDatum(C.today()));
      if (r.values.ausgabe === 'word') D.word(docs.map(x => x.doc.html).join('<br style="page-break-before:always" clear="all">'), 'Mahnlauf_' + C.today());
      try {
        if (r.values.ausgabe === 'pdf') for (const x of docs) await D.pdf(x.doc.html, x.doc.dateiname);
        if (r.values.ausgabe === 'mail') {
          for (const x of docs) { if (x.doc.email) await D.emailEntwurf(x.doc, x.doc.email); else ohneMail.push(x); }
          if (ohneMail.length) D.drucken(ohneMail.map(x => x.doc.html).join(''), 'Mahnlauf (Post)');
        }
      } catch (e) { App.toast('PDF-Erstellung fehlgeschlagen (' + e.message + ') – bitte Druck oder Word wählen.', 'err', 8000); return; }
      if (r.values.buchen) docs.forEach(x => C.applyAction(d, 'opos', x.f.id, x.st, { frist: x.frist }));
      App.f.opos.sel = {}; App.commit();
      App.toast(docs.length + ' Schreiben erstellt' + (r.values.buchen ? ' und verbucht' : '') + (ohneMail.length ? ' · ' + ohneMail.length + ' ohne E-Mail-Adresse zum Druck' : '') + '.', 'ok', 7000);
    },
    async oposRaten(ds) {
      const f = H.fall('opos', ds.id); const offen = C.offenSumme(f.posten);
      const n1 = C.addMonths(C.today().slice(0, 8) + '15', 1);
      const v = await App.formModal('Ratenzahlung vereinbaren', [
        { k: 'summe', l: 'Gesamtbetrag (€)', t: 'money', d: offen, req: true }, { k: 'anzahl', l: 'Anzahl Raten', t: 'number', min: 1, d: 3, req: true },
        { k: 'erste', l: 'erste Rate fällig am', t: 'date', d: n1, req: true }, { k: 'intervall', l: 'Abstand (Monate)', t: 'number', min: 1, d: 1 }
      ], {}, { ok: 'Ratenplan erstellen' });
      if (!v) return;
      const raten = C.ratenplan(v.summe, v.anzahl, v.erste, v.intervall || 1);
      await App.dokument({ vorlageId: 'raten', bereich: 'opos', fall: f, frist: C.addDays(C.today(), 14), extra: { raten }, aktion: 'raten', aktionCtx: () => ({ raten }) });
    },
    async oposAnwalt(ds) {
      const f = H.fall('opos', ds.id);
      const v = await App.formModal('An Anwalt übergeben', [
        { k: 'anwaltId', l: 'Anwalt', t: 'select', o: H.kontaktOptionen('anwalt'), full: true }, { k: 'az', l: 'Aktenzeichen (optional)' }],
      { anwaltId: f.anwaltId || '' }, { ok: 'Übergeben', extra: [{ label: '+ Anwalt anlegen', value: 'neu', cls: 'ghost' }] });
      if (!v) return;
      if (v._action === 'neu') { await App.act.kontaktEdit({ typ: 'anwalt' }); return App.act.oposAnwalt(ds); }
      const a = H.kontakt(v.anwaltId); f.anwaltId = v.anwaltId; f.anwaltAz = v.az;
      C.applyAction(App.data, 'opos', f.id, 'anwalt', { verlaufText: 'An Anwalt übergeben' + (a ? ': ' + a.firma : '') + (v.az ? ' (Az. ' + v.az + ')' : '') });
      App.commit(); App.toast('Übergabe verbucht – WV „Sachstand Anwalt“ angelegt.');
    },
    async oposStufe(ds) {
      const f = H.fall('opos', ds.id);
      const v = await App.formModal('Stufe manuell setzen', [{ k: 'stufe', l: 'Stufe', t: 'select', o: C.STUFEN_REIHE.map(s => [s, S[s]]) }], { stufe: f.stufe }, { intro: '<p class="muted">Ohne Schreiben und ohne automatische WV.</p>' });
      if (!v || v.stufe === f.stufe) return;
      C.addVerlauf(App.data, 'opos', f.id, 'stufe', 'Stufe manuell geändert: ' + S[f.stufe] + ' → ' + S[v.stufe]); f.stufe = v.stufe; App.commit();
    },
    async oposErledigt(ds) {
      const f = H.fall('opos', ds.id); const offen = C.offenSumme(f.posten);
      if (!await App.confirm(offen > 0 ? 'Es sind noch ' + fmtEUR(offen) + ' offen. Fall trotzdem als erledigt markieren?' : 'Fall als erledigt markieren?')) return;
      C.applyAction(App.data, 'opos', f.id, 'erledigt', {}); App.commit();
    },
    async oposExcel() {
      const zeilen = [];
      App.data.opos.forEach(f => {
        const m = H.mieter(f.mieterId) || {}; const o = H.objekt(m.objektId) || {}; const wv = H.naechsteWV('opos', f.id);
        f.posten.filter(p => p.offen > 0).forEach(p => zeilen.push([m.mietnr || '', C.mieterName(m), o.bezeichnung || '', m.whg || '', S[f.stufe], p.bez, fmtDatum(p.faellig), p.typ, p.betrag, p.offen, wv ? fmtDatum(wv.datum) : '', wv ? wv.aufgabe : '']));
      });
      await D.excel('OPOS ' + C.today(), [{ name: 'Offene Posten', kopf: ['Mietnr', 'Mieter', 'Objekt', 'Whg', 'Stufe', 'Bezeichnung', 'Fällig', 'Typ', 'Betrag', 'Offen', 'nächste WV', 'Aufgabe'], zeilen }]);
    },
    async oposImport() {
      const v = await App.formModal('OPOS-Liste einlesen', [
        { k: 'datei', l: 'Datei (Excel .xlsx/.xls oder CSV)', t: 'file', accept: '.xlsx,.xlsm,.xls,.ods,.csv,.txt', full: true },
        { k: 'stand', l: 'Stand der Liste (Stichtag)', t: 'date', d: C.today(), req: true }], {},
        { ok: 'Weiter', intro: '<p class="muted">Erkannt werden automatisch:</p><ul class="small muted"><li><b>Saldenliste</b> je Mieter (Spalten Name · Datum · Saldo, dazu WV- und Notizspalten)</li>' +
          '<li><b>Rohdaten</b> aus der Verwaltungssoftware (<code>"name": "… Whg. … PFkt. … Mieter …"</code> / <code>"saldo_zeile": "Summe PKto: …"</code>)</li>' +
          '<li><b>Einzelposten</b> (Datum · Buchungstext · Betrag · Fälligkeit), z. B. für einen Mieter</li></ul><p class="small muted">Monatlich erneut einlesen: Salden werden abgeglichen, nichts wird doppelt angelegt.</p>' });
      if (!v || !v.datei[0]) return;
      let blaetter;
      try { blaetter = await D.leseArbeitsmappe(v.datei[0]); }
      catch (e) { return App.toast('Datei konnte nicht gelesen werden: ' + e.message + (/xlsx/i.test(e.message) ? ' – ohne Internet bitte als CSV speichern.' : ''), 'err', 9000); }
      blaetter = blaetter.filter(b => b.rows.length).map(b => {
        const f = C.erkenneFormat(b.rows);
        let info = '', anzahl = 0, summe = 0;
        if (f.format === 'json') { const e = C.parseJsonBlatt(b.rows); anzahl = e.length; summe = C.sum(e, x => x.saldo); info = anzahl + ' Konten (Rohdaten)'; }
        else if (f.format === 'saldo') { const e = C.parseSaldenBlatt(b.rows, f.kopf, v.stand); anzahl = e.length; summe = C.sum(e, x => x.saldo); info = anzahl + ' Mieter (Saldenliste)'; }
        else if (f.format === 'posten') { anzahl = b.rows.length - f.kopf - 1; info = anzahl + ' Einzelposten'; }
        else info = 'Format nicht erkannt – Spalten selbst zuordnen';
        return Object.assign(b, f, { info: info + (summe ? ', Summe ' + fmtEUR(summe) : ''), anzahl });
      });
      if (!blaetter.length) return App.toast('Die Datei enthält keine Daten.', 'warn');
      const vorschlag = blaetter.find(b => b.format === 'json' || b.format === 'saldo') || blaetter.find(b => b.format !== 'unbekannt') || blaetter[0];
      let blatt = vorschlag;
      if (blaetter.length > 1) {
        const w = await App.formModal('Blatt auswählen', [{ k: 'blatt', l: 'Tabellenblatt', t: 'select', full: true, o: blaetter.map((b, i) => [String(i), b.name + ' – ' + b.info]) }],
          { blatt: String(blaetter.indexOf(vorschlag)) }, { ok: 'Weiter', intro: '<p class="muted">Die Datei enthält ' + blaetter.length + ' Blätter. Welches soll eingelesen werden?</p>' });
        if (!w) return; blatt = blaetter[+w.blatt];
      }
      if (blatt.format === 'json' || blatt.format === 'saldo') return importSaldenDialog(blatt, v.stand);
      return importPostenDialog(blatt);
    }
  });

  async function importSaldenDialog(blatt, stand) {
    const eintraege = blatt.format === 'json' ? C.parseJsonBlatt(blatt.rows) : C.parseSaldenBlatt(blatt.rows, blatt.kopf, stand);
    const ehem = eintraege.filter(e => e.aktiv === false || (e.bis && e.bis < stand)).length;
    const vorschau = '<div class="scrollx"><table class="tbl small"><thead><tr><th>Name</th><th>Whg</th><th>Mietzeit</th><th class="r">Saldo</th><th>WV</th><th>Notizen</th></tr></thead><tbody>' +
      eintraege.slice(0, 8).map(e => '<tr><td>' + esc(e.name) + '</td><td>' + esc(e.whg) + '</td><td class="nw">' + fmtDatum(e.von) + ' – ' + fmtDatum(e.bis) + '</td><td class="r">' + fmtEUR(e.saldo) + '</td>' +
        '<td>' + e.wv.map(fmtDatum).join(', ') + '</td><td class="small">' + esc(e.notizen.join(' · ').slice(0, 90)) + '</td></tr>').join('') + '</tbody></table></div>';
    const hatSaldoPosten = App.data.opos.some(f => f.stufe !== 'erledigt' && f.posten.some(p => p.saldo));
    const w = await App.formModal('Saldenliste einlesen – ' + blatt.name, [
      { k: 'objektId', l: 'Objekt für neue Mieter', t: 'select', o: [['', blatt.format === 'json' ? 'automatisch (aus PFkt.-Nummer)' : 'automatisch („Import OPOS-Liste“)'], ...H.objektOptionen(false)] },
      { k: 'mindestSaldo', l: 'Salden unter … € ignorieren', t: 'money', d: 0.01, hint: 'z. B. 10 für Cent-/Kleinstbeträge' },
      { k: 'ehemalige', l: 'ehemalige Mieter übernehmen (' + ehem + ' in der Liste)', t: 'checkbox', d: true, full: true },
      { k: 'notizen', l: 'Notizspalten in die Fall-Notiz übernehmen', t: 'checkbox', d: true, full: true },
      { k: 'wv', l: 'WV-Daten aus der Liste als Wiedervorlagen anlegen', t: 'checkbox', d: true, full: true },
      { k: 'pruefWV', l: 'für jeden neuen Fall eine WV „Fall prüfen“ für heute anlegen', t: 'checkbox', d: false, full: true },
      { k: 'fehlendeErledigen', l: 'Fälle, die nicht mehr in dieser Liste stehen, als erledigt markieren (nur bei vollständiger Liste!)', t: 'checkbox', d: false, full: true }
    ], {}, { wide: true, ok: 'Einlesen', intro: '<p>' + eintraege.length + ' Einträge, Summe <b>' + fmtEUR(C.sum(eintraege, e => e.saldo)) + '</b>, Stand ' + fmtDatum(stand) + '.' +
      (hatSaldoPosten ? ' Bereits eingelesene Mieter werden erkannt und ihr Saldo aktualisiert.' : '') + ' Mehrere Konten eines Mieters (z. B. Wohnung + Stellplatz) werden zusammengefasst.</p>' + vorschau });
    if (!w) return;
    const st = C.importSalden(App.data, eintraege, Object.assign({}, w, { stand, blatt: blatt.name }));
    App.tab = 'opos'; App.detail = null; App.commit();
    App.modal({ title: 'Einlesen abgeschlossen', body: '<ul><li><b>' + st.faelleNeu + '</b> neue Fälle, <b>' + st.mieterNeu + '</b> neue Mieter' + (st.objekteNeu ? ', ' + st.objekteNeu + ' neue Objekte' : '') + '</li>' +
      '<li><b>' + st.aktualisiert + '</b> Salden geändert (siehe Verlauf je Fall), ' + st.unveraendert + ' unverändert</li>' +
      (st.erledigt ? '<li><b>' + st.erledigt + '</b> Fälle ausgeglichen → erledigt</li>' : '') + (st.wvNeu ? '<li>' + st.wvNeu + ' Wiedervorlagen aus der Liste angelegt</li>' : '') +
      '<li>' + st.uebersprungen + ' übersprungen</li><li>Summe eingelesen: ' + fmtEUR(st.summe) + '</li></ul>' +
      '<p class="small muted">Der Saldo steht je Fall als Posten „Saldo lt. OPOS-Liste“. Für Kündigungscheck und Mahnschreiben mit Postenaufstellung die Einzelposten einlesen oder erfassen. ' +
      (st.mieterNeu ? 'Bei neuen Mietern bitte Anschrift, E-Mail und Monatsmiete in den Stammdaten ergänzen.' : '') + '</p>' });
  }

  async function importPostenDialog(blatt) {
    const rows = blatt.rows; const k0 = Math.max(0, blatt.kopf || 0);
    const kopf = rows[k0].map((h, i) => String(h == null || h === '' ? 'Spalte ' + (i + 1) : h));
    const map = C.guessMapping(kopf);
    const titel = C.titelMieter(rows, k0);
    let mieterVorschlag = '';
    if (titel) {
      const nn = C.normName(titel.name);
      const m = App.data.mieter.find(x => C.normName(x.importName || '') === nn || C.normName(x.nachname + ', ' + x.vorname) === nn || C.normName(x.vorname + ' ' + x.nachname) === nn);
      if (m) mieterVorschlag = m.id;
    }
    const opt = [['', '– nicht vorhanden –'], ...kopf.map((h, i) => [String(i), (i + 1) + ': ' + h])];
    const zelle = c => (c instanceof Date ? fmtDatum(C.parseDatum(c)) : c);
    const vorschau = '<div class="scrollx"><table class="tbl small"><thead><tr>' + kopf.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
      rows.slice(k0 + 1, k0 + 6).map(r => '<tr>' + kopf.map((h, i) => '<td>' + esc(zelle(r[i])) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
    const felder = Object.entries(C.IMPORT_FELDER).map(([k, x]) => ({ k: 'm_' + k, l: x.label, t: 'select', o: opt }));
    const vals = { mieterId: mieterVorschlag, kopfZeile: String(k0 + 1) }; Object.keys(map).forEach(k => { vals['m_' + k] = String(map[k]); });
    const w = await App.formModal('Einzelposten einlesen – ' + blatt.name, [
      { k: 'mieterId', l: 'Alle Zeilen gehören zu Mieter (wenn keine Namensspalte)', t: 'select', full: true,
        o: [['', '– aus Spalten (Name/Mieternr.) –'], ...(titel && !mieterVorschlag ? [['neu', 'Neu anlegen: ' + titel.name + ' (' + titel.whg + ')']] : []), ...H.mieterOptionen(false)],
        hint: titel ? 'Titelzeile erkannt: „' + esc(titel.name) + ' (' + esc(titel.whg) + ')“' : '' },
      { k: 'kopfZeile', l: 'Kopfzeile ist Zeile Nr.', t: 'number', min: 1 }, ...felder], vals,
    { wide: true, ok: 'Einlesen', intro: '<p class="muted">' + (rows.length - k0 - 1) + ' Datenzeilen. Pflicht: Betrag sowie Mieter (Spalte oder Auswahl oben). Bereits vorhandene Posten werden erkannt.</p>' + vorschau });
    if (!w) return;
    const mapping = {}; Object.keys(C.IMPORT_FELDER).forEach(k => { if (w['m_' + k] !== '') mapping[k] = +w['m_' + k]; });
    if (mapping.offen == null && mapping.betrag == null) return App.toast('Bitte eine Betragsspalte zuordnen.', 'err');
    let mieterId = w.mieterId;
    if (mieterId === 'neu') {
      const m = Object.assign({ id: C.uid(), objektId: (App.data.objekte[0] || {}).id || '', whg: titel.whg, anschrift: '', email: '', tel: '', mietnr: '', gesamtmiete: 0, mietbeginn: '', mietende: '', kaution: 0, importName: titel.name }, C.nameAufteilen(titel.name));
      App.data.mieter.push(m); mieterId = m.id;
    }
    if (!mieterId && mapping.mietnr == null && mapping.name == null && mapping.nachname == null) return App.toast('Bitte Mieter auswählen oder Namens-/Mieternummernspalte zuordnen.', 'err');
    const vorher = new Set(App.data.opos.map(f => f.id));
    const start = Math.max(1, +w.kopfZeile || 1);
    const st = C.importOPOS(App.data, rows.slice(start), mapping, C.today(), { mieterId });
    App.data.opos.filter(f => !vorher.has(f.id)).forEach(f => C.createWV(App.data, 'opos', f.id, C.today(), 'Importierten Fall prüfen – Zahlungserinnerung versenden?', { regel: 'opos:neu' }));
    const fall = mieterId && App.data.opos.find(f => f.mieterId === mieterId && f.stufe !== 'erledigt');
    if (fall) { App.tab = 'opos'; App.detail = fall.id; }
    App.commit();
    App.modal({ title: 'Einlesen abgeschlossen', body: '<ul><li>' + st.faelleNeu + ' neue Fälle</li><li>' + st.postenNeu + ' neue Posten</li><li>' + st.postenAktualisiert + ' Posten aktualisiert</li><li>' +
      st.mieterNeu + ' neue Mieter' + (st.mieterNeu ? ' <small class="muted">(bitte Monatsmiete, Anschrift und E-Mail in den Stammdaten ergänzen)</small>' : '') + '</li><li>' + st.uebersprungen + ' Zeilen übersprungen (kein offener Betrag / kein Mieter)</li></ul>' +
      (fall && fall.posten.some(p => p.saldo) ? '<p class="small muted">Der Fall hat zusätzlich einen Saldo aus der OPOS-Liste: Der Saldo-Posten wurde um die Einzelposten reduziert, die Summe offen bleibt gleich dem Listensaldo.</p>' : '') });
  }

  function mietenAnlegen(f, ab, anzahl, betrag) {
    for (let i = 0; i < anzahl; i++) {
      const m1 = C.addMonths(ab, i); const faellig = C.addWerktage(C.addDays(m1, -1), 3, false);
      f.posten.push({ id: C.uid(), bez: 'Miete ' + C.monatLabel(m1.slice(0, 7)), faellig, typ: 'miete', betrag: C.round2(betrag), offen: C.round2(betrag) });
    }
    C.addVerlauf(App.data, 'opos', f.id, 'posten', anzahl + ' Monatsmiete(n) à ' + fmtEUR(betrag) + ' als offen erfasst');
  }
  App.opos = { neuerFall, mietenAnlegen };
})(window);
