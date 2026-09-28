/* ============================================================
 * modules/kaution – Rechner, Verjährungs-Ampel § 548 BGB, Schreiben
 * ============================================================ */
(function (root) {
  'use strict';
  const C = root.Core, D = root.Docs, App = root.App, H = App.h;
  const { esc, fmtEUR, fmtDatum } = C;
  const KS = C.K_STATUS;
  const ART = { konto: 'Kautionskonto', bar: 'Barkaution', buergschaft: 'Bürgschaft' };
  const AMPEL = { rot: 'Verjährung bald!', gelb: 'Abrechnung überfällig (> 3 Monate)', gruen: 'im Zeitplan', grau: '–' };

  const warn = () => Number(App.ui().verjaehrungWarnTage) || 30;
  function ampelDot(k) { const a = C.kautionAmpel(k, C.today(), warn()); return '<span class="dot ' + a + '" title="' + AMPEL[a] + '"></span>'; }

  App.views.kaution = {
    render() {
      const f = App.f.kaution, q = f.q.toLowerCase();
      const list = App.data.kaution.filter(k => (f.status === '' || (f.status === 'aktiv' ? k.status !== 'ausgezahlt' : k.status === f.status)) &&
        (!q || H.fallLabel('kaution', k).toLowerCase().includes(q)))
        .sort((a, b) => ((C.verjaehrung(a) || { restTage: 9999 }).restTage - (C.verjaehrung(b) || { restTage: 9999 }).restTage));
      return '<section class="card"><div class="toolbar"><h2>Kautionen</h2><input type="search" id="kautQ" data-filter="kaution.q" placeholder="Suchen …" value="' + esc(f.q) + '">' +
        '<select data-filter="kaution.status"><option value="aktiv"' + (f.status === 'aktiv' ? ' selected' : '') + '>aktive</option><option value=""' + (f.status === '' ? ' selected' : '') + '>alle</option>' +
        Object.entries(KS).map(([v, l]) => '<option value="' + v + '"' + (f.status === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' +
        '<span class="sp"></span><button data-act="kautionAuszahlungsliste">Auszahlungsliste Excel</button><button class="primary" data-act="kautionNeu">+ Kautionsfall</button></div>' +
        (list.length ? '<table class="tbl"><thead><tr><th></th><th>Mieter</th><th>Objekt / Whg</th><th class="r">Kaution</th><th>Art</th><th>Auszug</th><th>Übergabe</th><th>Verjährung</th><th>Status</th><th class="r">Auszahlung</th><th>nächste WV</th></tr></thead><tbody>' +
          list.map(k => {
            const m = H.mieter(k.mieterId) || {}; const o = H.objekt(m.objektId) || {}; const v = C.verjaehrung(k); const r = C.kautionsabrechnung(k);
            return '<tr class="klick" data-act="openFall" data-b="kaution" data-id="' + k.id + '"><td>' + ampelDot(k) + '</td><td><b>' + esc(C.mieterName(m)) + '</b></td><td>' + esc(o.bezeichnung || '–') + (m.whg ? ' · ' + esc(m.whg) : '') + '</td>' +
              '<td class="r">' + fmtEUR(k.betrag) + '</td><td>' + ART[k.art] + '</td><td>' + fmtDatum(k.auszugAm) + '</td><td>' + fmtDatum(k.uebergabeAm) + '</td>' +
              '<td>' + (v ? fmtDatum(v.ende) + ' <small class="' + (v.restTage < warn() ? 'rot-t' : 'muted') + '">(' + (v.restTage >= 0 ? 'noch ' + v.restTage + ' T' : 'abgelaufen') + ')</small>' : '–') + '</td>' +
              '<td>' + H.chip(KS[k.status], 'ks-' + k.status) + '</td><td class="r">' + (k.auszugAm ? fmtEUR(r.auszahlung) : '') + '</td><td>' + H.wvChip(H.naechsteWV('kaution', k.id)) + '</td></tr>';
          }).join('') + '</tbody></table>' : H.leer('Keine Kautionsfälle.')) + '</section>';
    },
    detail(id) {
      const k = H.fall('kaution', id); if (!k) { App.detail = null; return App.views.kaution.render(); }
      const m = H.mieter(k.mieterId) || {}; const o = H.objekt(m.objektId) || {};
      const v = C.verjaehrung(k); const r = C.kautionsabrechnung(k); const a = C.kautionAmpel(k, C.today(), warn());
      const b = (act, label, cls = '') => '<button class="' + cls + '" data-act="' + act + '" data-id="' + id + '">' + label + '</button>';
      const next = !k.auszugAm ? 'kautionAuszug' : k.status === 'in_pruefung' ? 'kautionAbrechnung' : k.status === 'abgerechnet' ? 'kautionAusgezahlt' : '';
      const c = x => (x === next ? 'primary' : '');
      return '<div class="detailkopf"><button data-act="back">← Liste</button><h2>Kaution ' + esc(C.mieterName(m)) + '</h2>' + H.chip(KS[k.status], 'ks-' + k.status) +
        '<span class="muted">' + esc(o.bezeichnung || '') + (m.whg ? ' · ' + esc(m.whg) : '') + '</span><span class="sp"></span>' +
        '<button class="s" data-act="kautionEdit" data-id="' + id + '">Bearbeiten</button><button class="s del" data-act="kautionDel" data-id="' + id + '">Löschen</button></div>' +
        '<div class="cols3"><section class="card ampel-' + a + '"><h3>Fristen</h3>' +
        (v ? '<div class="big ' + (v.restTage < warn() ? 'rot-t' : '') + '">' + (v.restTage >= 0 ? 'noch ' + v.restTage + ' Tage' : 'seit ' + (-v.restTage) + ' Tagen abgelaufen') + '</div>' +
          '<div>bis zur <b>Verjährung § 548 BGB</b> am <b>' + fmtDatum(v.ende) + '</b></div><p class="small muted">Ersatzansprüche wegen Veränderung/Verschlechterung verjähren 6 Monate nach Rückgabe der Mietsache. ' +
          'Rechtzeitig sichern (z. B. Aufrechnung mit der Kaution erklären, ggf. Mahnbescheid).</p><dl class="kv"><dt>Auszug</dt><dd>' + fmtDatum(k.auszugAm) + '</dd><dt>Übergabe</dt><dd>' + fmtDatum(k.uebergabeAm) + '</dd>' +
          '<dt>seit Übergabe</dt><dd>' + v.seitUebergabe + ' Tage</dd><dt>Status</dt><dd>' + AMPEL[a] + '</dd></dl>'
          : '<p>Noch kein Auszug erfasst.</p>') + '</section>' +
        '<section class="card"><h3>Kautionsrechner</h3><table class="tbl rechner"><tbody>' +
        '<tr><td>Kaution (' + ART[k.art] + ')</td><td class="r">' + fmtEUR(r.kaution) + '</td><td></td></tr>' +
        '<tr><td>+ Zinsen</td><td class="r">' + fmtEUR(r.zinsen) + '</td><td class="r"><button class="s" data-act="kautionZinsen" data-id="' + id + '">ändern</button></td></tr>' +
        k.einbehalte.map((e, i) => '<tr><td>− ' + esc(e.grund) + '</td><td class="r">' + fmtEUR(e.betrag) + '</td><td class="r"><button class="s del" data-act="kautionEinbehaltDel" data-id="' + id + '" data-i="' + i + '">×</button></td></tr>').join('') +
        '<tr><td>− NK-Einbehalt' + (k.nkDatum ? ' <small class="muted">(bis ' + fmtDatum(k.nkDatum) + ')</small>' : '') + '</td><td class="r">' + fmtEUR(r.nkEinbehalt) + '</td><td class="r"><button class="s" data-act="kautionNK" data-id="' + id + '">ändern</button></td></tr>' +
        (r.bereitsAusgezahlt ? '<tr><td>− bereits ausgezahlt</td><td class="r">' + fmtEUR(r.bereitsAusgezahlt) + '</td><td></td></tr>' : '') +
        '</tbody><tfoot><tr><td><b>' + (r.auszahlung >= 0 ? '= Auszahlung' : '= Nachforderung') + '</b></td><td class="r"><b class="' + (r.auszahlung < 0 ? 'rot-t' : '') + '">' + fmtEUR(Math.abs(r.auszahlung)) + '</b></td><td></td></tr></tfoot></table>' +
        '<button class="s" data-act="kautionEinbehalt" data-id="' + id + '">+ Einbehalt</button><p class="small muted">Auszahlungs-IBAN: ' + esc(k.auszahlungIban || '– fehlt –') + '</p></section>' +
        '<section class="card"><h3>Aktionen</h3><div class="btns">' + b('kautionAuszug', 'Auszug / Übergabe erfassen', c('kautionAuszug')) + b('kautionBank', 'Bankverbindung anfordern') +
        b('kautionAbrechnung', 'Kautionsabrechnung', c('kautionAbrechnung')) + b('kautionTeil', 'Teilauszahlung mit Einbehalt') + b('kautionAusgezahlt', 'Auszahlung erfolgt', c('kautionAusgezahlt')) + '</div>' +
        '<dl class="kv"><dt>Anlagekonto</dt><dd>' + esc(k.anlagekonto || '–') + '</dd><dt>Mietende</dt><dd>' + fmtDatum(m.mietende) + '</dd><dt>E-Mail</dt><dd>' + esc(m.email || '–') + '</dd></dl></section></div>' +
        '<div class="cols2"><section class="card"><div class="toolbar"><h3>Wiedervorlagen</h3><span class="sp"></span><button class="s" data-act="wvNeu" data-b="kaution" data-id="' + id + '">+ WV</button></div>' +
        App.wvTabelle(App.data.wv.filter(w => w.bereich === 'kaution' && w.refId === id).sort((x, y) => (x.status === y.status ? x.datum.localeCompare(y.datum) : x.status === 'offen' ? -1 : 1)), { fall: false }) + '</section>' +
        '<section class="card"><h3>Verlauf</h3>' + App.verlaufListe('kaution', id) + '</section></div>';
    }
  };

  const FELDER = () => [
    { k: 'mieterId', l: 'Mieter', t: 'select', o: H.mieterOptionen(), req: true, full: true },
    { k: 'betrag', l: 'Kaution (€)', t: 'money', req: true }, { k: 'art', l: 'Art', t: 'select', o: Object.entries(ART) },
    { k: 'anlagekonto', l: 'Anlagekonto / Sparbuch' }, { k: 'zinsen', l: 'aufgelaufene Zinsen (€)', t: 'money' },
    { k: 'auszahlungIban', l: 'IBAN für Auszahlung', full: true }
  ];

  Object.assign(App.act, {
    async kautionNeu() {
      const v = await App.formModal('Neuer Kautionsfall', FELDER(), { art: 'konto', zinsen: 0 }, { wide: true, ok: 'Anlegen',
        onOpen(d) {
          const s = d.querySelector('[name=mieterId]'); const b = d.querySelector('[name=betrag]');
          s.onchange = () => { const m = H.mieter(s.value); if (m && m.kaution && !C.parseBetrag(b.value)) b.value = C.fmtZahl(m.kaution); };
        } });
      if (!v) return; delete v._action;
      if (App.data.kaution.some(k => k.mieterId === v.mieterId && k.status !== 'ausgezahlt') && !await App.confirm('Für diesen Mieter gibt es bereits einen offenen Kautionsfall. Trotzdem anlegen?')) return;
      const k = Object.assign({ id: C.uid(), status: 'offen', einbehalte: [], nkEinbehalt: 0 }, v);
      App.data.kaution.push(k); C.addVerlauf(App.data, 'kaution', k.id, 'angelegt', 'Kautionsfall angelegt (' + fmtEUR(k.betrag) + ')');
      App.tab = 'kaution'; App.detail = k.id; App.commit();
      const m = H.mieter(k.mieterId);
      if (m && m.mietende && await App.confirm('Mietende ' + fmtDatum(m.mietende) + ' ist hinterlegt. Auszug/Übergabe jetzt erfassen?')) App.act.kautionAuszug({ id: k.id });
    },
    async kautionEdit(ds) {
      const k = H.fall('kaution', ds.id);
      const v = await App.formModal('Kautionsfall bearbeiten', [...FELDER(), { k: 'status', l: 'Status', t: 'select', o: Object.entries(KS) }], k, { wide: true });
      if (!v) return; delete v._action; Object.assign(k, v); App.commit();
    },
    async kautionDel(ds) {
      if (!await App.confirm('Kautionsfall inkl. WV und Verlauf löschen?', 'Löschen', 'Abbrechen')) return;
      const d = App.data; d.kaution = d.kaution.filter(x => x.id !== ds.id);
      d.wv = d.wv.filter(w => !(w.bereich === 'kaution' && w.refId === ds.id)); d.verlauf = d.verlauf.filter(w => !(w.bereich === 'kaution' && w.refId === ds.id));
      App.detail = null; App.commit();
    },
    async kautionAuszug(ds) {
      const k = H.fall('kaution', ds.id); const m = H.mieter(k.mieterId) || {};
      const v = await App.formModal('Auszug / Wohnungsübergabe', [
        { k: 'auszugAm', l: 'Auszug am', t: 'date', req: true }, { k: 'uebergabeAm', l: 'Wohnungsübergabe (Rückgabe) am', t: 'date', req: true, hint: 'maßgeblich für die Verjährung (§ 548 BGB)' }
      ], { auszugAm: k.auszugAm || m.mietende || C.today(), uebergabeAm: k.uebergabeAm || k.auszugAm || m.mietende || C.today() }, { ok: 'Speichern & WV anlegen',
        intro: '<p class="muted">Erzeugt automatisch: „Übergabeprotokoll prüfen“ (+1 Tag), „Kautionsabrechnung erstellen“ (+' + App.data.settings.fristen.kautionAbrechnungMonate + ' Monate) und „Ansprüche sichern – Verjährung“ (+5 Monate).</p>' });
      if (!v) return;
      k.auszugAm = v.auszugAm; k.uebergabeAm = v.uebergabeAm;
      if (!m.mietende) m.mietende = v.auszugAm;
      C.applyAction(App.data, 'kaution', k.id, 'auszug', { auszugAm: v.auszugAm, uebergabeAm: v.uebergabeAm, verlaufText: 'Auszug ' + fmtDatum(v.auszugAm) + ', Übergabe ' + fmtDatum(v.uebergabeAm) + ' erfasst – Verjährung am ' + fmtDatum(C.addMonths(v.uebergabeAm, 6)) });
      C.applyAction(App.data, 'kaution', k.id, 'uebergabe', { uebergabeAm: v.uebergabeAm, verlaufText: 'Abrechnungsfrist gestartet' });
      App.commit(); App.toast('Verjährungs-WV angelegt.');
    },
    async kautionZinsen(ds) {
      const k = H.fall('kaution', ds.id);
      const v = await App.formModal('Zinsen', [{ k: 'zinsen', l: 'aufgelaufene Zinsen (€)', t: 'money' }], k); if (!v) return;
      k.zinsen = v.zinsen; App.commit();
    },
    async kautionEinbehalt(ds) {
      const k = H.fall('kaution', ds.id);
      const v = await App.formModal('Einbehalt', [{ k: 'grund', l: 'Grund', req: true, full: true, list: 'dl_einb' }, { k: 'betrag', l: 'Betrag (€)', t: 'money', req: true }], {},
        { outro: '<datalist id="dl_einb"><option value="Schönheitsreparaturen"><option value="Reinigung der Wohnung"><option value="fehlende Schlüssel"><option value="Beschädigung"><option value="Mietrückstand"><option value="Sperrmüllentsorgung"></datalist>' });
      if (!v) return; k.einbehalte.push({ grund: v.grund, betrag: v.betrag });
      C.addVerlauf(App.data, 'kaution', k.id, 'einbehalt', 'Einbehalt „' + v.grund + '“ ' + fmtEUR(v.betrag)); App.commit();
    },
    async kautionEinbehaltDel(ds) { const k = H.fall('kaution', ds.id); if (!await App.confirm('Einbehalt entfernen?')) return; k.einbehalte.splice(+ds.i, 1); App.commit(); },
    async kautionNK(ds) {
      const k = H.fall('kaution', ds.id);
      const v = await App.formModal('Einbehalt für Betriebskosten', [
        { k: 'nkEinbehalt', l: 'Betrag (€)', t: 'money' }, { k: 'nkDatum', l: 'nächste NK-Abrechnung voraussichtlich', t: 'date', hint: 'erzeugt WV „Einbehalt auflösen“' }], k);
      if (!v) return;
      k.nkEinbehalt = v.nkEinbehalt; k.nkDatum = v.nkDatum;
      C.applyAction(App.data, 'kaution', k.id, 'nkEinbehalt', { nkDatum: v.nkEinbehalt > 0 ? v.nkDatum : '', verlaufText: 'NK-Einbehalt ' + fmtEUR(v.nkEinbehalt) + (v.nkDatum ? ' bis ' + fmtDatum(v.nkDatum) : '') });
      App.commit();
    },
    async kautionBank(ds) {
      const k = H.fall('kaution', ds.id);
      const frist = C.addDays(C.today(), Number(App.data.settings.fristen.bankverbindung) || 14);
      const ok = await App.dokument({ vorlageId: 'k_bankverbindung', bereich: 'kaution', fall: k, frist, verlaufText: 'Bankverbindung angefordert' });
      if (ok) { C.createWV(App.data, 'kaution', k.id, C.addDays(frist, Number(App.data.settings.puffer) || 0), 'Bankverbindung eingegangen?', { regel: 'kaution:bank' }); App.commit(); }
    },
    async kautionAbrechnung(ds) {
      const k = H.fall('kaution', ds.id);
      if (!k.uebergabeAm && !k.auszugAm) { App.toast('Bitte zuerst Auszug/Übergabe erfassen.', 'warn'); return App.act.kautionAuszug(ds); }
      if (!k.auszahlungIban && C.kautionsabrechnung(k).auszahlung > 0 && !await App.confirm('Keine Auszahlungs-IBAN hinterlegt. Trotzdem Abrechnung erstellen? (Platzhalter „[IBAN fehlt]“ im Schreiben)')) return;
      await App.dokument({ vorlageId: 'k_abrechnung', bereich: 'kaution', fall: k, aktion: 'abrechnung',
        aktionCtx: () => ({ verlaufText: 'Kautionsabrechnung versendet – Auszahlung ' + fmtEUR(C.kautionsabrechnung(k).auszahlung) }) });
    },
    async kautionTeil(ds) {
      const k = H.fall('kaution', ds.id); const r = C.kautionsabrechnung(k);
      const teil = C.round2(r.guthaben - r.einbehalte - r.nkEinbehalt - r.bereitsAusgezahlt);
      if (!(teil > 0)) return App.toast('Kein auszahlbarer Betrag.', 'warn');
      await App.dokument({ vorlageId: 'k_teilauszahlung', bereich: 'kaution', fall: k, verlaufText: 'Teilauszahlung ' + fmtEUR(teil) + ' mitgeteilt',
        nachVerbuchen() { k.teilauszahlung = C.round2((k.teilauszahlung || 0) + teil); } });
    },
    async kautionAusgezahlt(ds) {
      const k = H.fall('kaution', ds.id); const r = C.kautionsabrechnung(k);
      const v = await App.formModal('Auszahlung erfolgt', [{ k: 'am', l: 'ausgezahlt am', t: 'date', d: C.today(), req: true }, { k: 'betrag', l: 'Betrag (€)', t: 'money', d: Math.max(0, r.auszahlung) }], {}, { ok: 'Abschließen',
        intro: r.nkEinbehalt ? '<p class="pruef">Hinweis: NK-Einbehalt von ' + fmtEUR(r.nkEinbehalt) + ' ist noch offen. Den Fall ggf. erst nach der NK-Abrechnung abschließen.</p>' : '' });
      if (!v) return;
      C.applyAction(App.data, 'kaution', k.id, 'ausgezahlt', { heute: v.am, verlaufText: 'Kaution ausgezahlt: ' + fmtEUR(v.betrag) });
      App.commit();
    },
    async kautionAuszahlungsliste() {
      const zeilen = App.data.kaution.filter(k => ['in_pruefung', 'abgerechnet'].includes(k.status)).map(k => {
        const m = H.mieter(k.mieterId) || {}; const o = H.objekt(m.objektId) || {}; const r = C.kautionsabrechnung(k);
        return [C.mieterName(m), o.bezeichnung || '', m.whg || '', k.auszahlungIban || '', r.auszahlung, 'Kautionsrückzahlung ' + (m.mietnr || C.mieterName(m)), k.anlagekonto || '', KS[k.status], fmtDatum(k.uebergabeAm)];
      });
      if (!zeilen.length) return App.toast('Keine Kautionen in Prüfung/abgerechnet.', 'warn');
      await D.excel('Kaution Auszahlungsliste ' + C.today(), [{ name: 'Auszahlungen', kopf: ['Empfänger', 'Objekt', 'Whg', 'IBAN', 'Betrag', 'Verwendungszweck', 'Anlagekonto', 'Status', 'Übergabe'], zeilen }]);
    }
  });
})(window);
