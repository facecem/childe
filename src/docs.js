/* ============================================================
 * docs – Textbausteine, Briefrahmen (DIN 5008), Export
 * PDF (html2pdf, CDN) · Word (.doc-HTML, offline) · Drucken · E-Mail (.eml)
 * ============================================================ */
(function (root) {
  'use strict';
  const C = root.Core;
  const { esc, fmtEUR, fmtDatum } = C;

  const CDN = {
    html2pdf: 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
    xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    html2canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
  };
  const _libs = {};
  function loadLib(name, globalName) {
    if (root[globalName]) return Promise.resolve(root[globalName]);
    if (_libs[name]) return _libs[name];
    _libs[name] = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = CDN[name]; s.async = true;
      s.onload = () => (root[globalName] ? res(root[globalName]) : rej(new Error(name + ' nicht verfügbar')));
      s.onerror = () => { delete _libs[name]; rej(new Error(name + ' konnte nicht geladen werden (offline?)')); };
      document.head.appendChild(s);
    });
    return _libs[name];
  }

  /* ---------- Standard-Vorlagen ----------
   * empfaenger: mieter | handwerker ; bereich für die Zuordnung im Editor
   * Platzhalter siehe PLATZHALTER unten. **fett**, Leerzeile = neuer Absatz. */
  const STANDARD = {
    erinnerung: {
      bereich: 'opos', titel: 'Zahlungserinnerung', empfaenger: 'mieter',
      betreff: 'Zahlungserinnerung – Mietverhältnis {{objekt.strasse}}{{mieter.whgKomma}}',
      text: `{{briefanrede}}

sicher ist es Ihrer Aufmerksamkeit entgangen: Auf Ihrem Mietkonto (Mieternummer {{mieter.mietnr}}) sind folgende Beträge noch offen:

{{postenTabelle}}

Bitte überweisen Sie den offenen Betrag von **{{summe}}** bis spätestens **{{frist}}** auf das unten genannte Konto. Geben Sie als Verwendungszweck bitte Ihre Mieternummer an.

Sollten Sie die Zahlung inzwischen veranlasst haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.`,
      email: `{{briefanrede}}

anbei erhalten Sie eine Zahlungserinnerung zu Ihrem Mietkonto. Offen sind derzeit {{summe}}; bitte überweisen Sie den Betrag bis {{frist}}.

Mit freundlichen Grüßen
{{sachbearbeiter}}
{{firma.firma}}`
    },
    mahnung1: {
      bereich: 'opos', titel: '1. Mahnung', empfaenger: 'mieter',
      betreff: '1. Mahnung – Mietrückstand {{objekt.strasse}}{{mieter.whgKomma}}',
      text: `{{briefanrede}}

trotz unserer Zahlungserinnerung konnten wir bis heute keinen vollständigen Zahlungseingang feststellen. Auf Ihrem Mietkonto (Mieternummer {{mieter.mietnr}}) sind folgende Beträge offen:

{{postenTabelle}}

Wir fordern Sie auf, den Gesamtbetrag von **{{summeGesamt}}** bis spätestens **{{frist}}** zu überweisen.{{mahngebuehrSatz}}

Bitte beachten Sie, dass die Miete gemäß § 556b Abs. 1 BGB spätestens bis zum dritten Werktag eines Monats im Voraus zu zahlen ist. Sollten Sie Schwierigkeiten haben, den Betrag auf einmal zu begleichen, setzen Sie sich bitte umgehend mit uns in Verbindung.`,
      email: `{{briefanrede}}

anbei erhalten Sie unsere 1. Mahnung. Bitte überweisen Sie {{summeGesamt}} bis {{frist}}.

Mit freundlichen Grüßen
{{sachbearbeiter}}
{{firma.firma}}`
    },
    mahnungLetzte: {
      bereich: 'opos', titel: 'Letzte Mahnung', empfaenger: 'mieter',
      betreff: 'Letzte Mahnung vor Kündigung – Mietrückstand {{objekt.strasse}}{{mieter.whgKomma}}',
      text: `{{briefanrede}}

auf unsere bisherigen Schreiben haben Sie nicht reagiert. Ihr Mietkonto (Mieternummer {{mieter.mietnr}}) weist weiterhin folgenden Rückstand auf:

{{postenTabelle}}

Wir fordern Sie **letztmalig** auf, den Gesamtbetrag von **{{summeGesamt}}** bis spätestens **{{frist}}** zu zahlen.{{mahngebuehrSatz}}

Wir weisen ausdrücklich darauf hin, dass ein Zahlungsrückstand in dieser Größenordnung den Vermieter zur fristlosen Kündigung des Mietverhältnisses gemäß § 543 Abs. 2 S. 1 Nr. 3 BGB berechtigen kann. Nach fruchtlosem Ablauf der Frist behalten wir uns vor, ohne weitere Ankündigung die Kündigung auszusprechen und gerichtliche Schritte einzuleiten.`,
      email: `{{briefanrede}}

anbei erhalten Sie unsere letzte Mahnung. Bitte überweisen Sie {{summeGesamt}} bis spätestens {{frist}}.

Mit freundlichen Grüßen
{{sachbearbeiter}}
{{firma.firma}}`
    },
    abmahnung: {
      bereich: 'opos', titel: 'Abmahnung (unpünktliche Zahlung)', empfaenger: 'mieter',
      betreff: 'Abmahnung wegen wiederholt unpünktlicher Mietzahlung – {{objekt.strasse}}{{mieter.whgKomma}}',
      text: `{{briefanrede}}

gemäß § 556b Abs. 1 BGB und Ihrem Mietvertrag ist die Miete spätestens bis zum dritten Werktag eines jeden Monats zu zahlen. Diese Verpflichtung haben Sie wiederholt nicht eingehalten:

{{abmahnungDetails}}

Wir **mahnen** Sie hiermit wegen der wiederholt unpünktlichen Mietzahlung **ab** und fordern Sie auf, die Miete künftig pünktlich zu zahlen.

Sollten Sie die Miete auch künftig unpünktlich zahlen, müssen Sie mit der fristlosen, hilfsweise ordentlichen Kündigung des Mietverhältnisses rechnen (§ 543 Abs. 1, § 573 Abs. 2 Nr. 1 BGB).`,
      email: `{{briefanrede}}

anbei erhalten Sie ein Schreiben zu Ihrer Mietzahlung. Bitte beachten Sie den Inhalt.

Mit freundlichen Grüßen
{{sachbearbeiter}}
{{firma.firma}}`
    },
    kuendigung: {
      bereich: 'opos', titel: 'Kündigung (fristlos, hilfsweise ordentlich)', empfaenger: 'mieter', unterschrift: true,
      betreff: 'Fristlose, hilfsweise ordentliche Kündigung des Mietverhältnisses {{objekt.strasse}}, {{objekt.plzort}}{{mieter.whgKomma}}',
      text: `{{briefanrede}}

wir zeigen an, dass wir {{objekt.eigentuemerOderVermieter}} vertreten. Eine auf uns lautende Vollmacht fügen wir im Original bei.

Namens und in Vollmacht unseres Auftraggebers kündigen wir das mit Ihnen bestehende Mietverhältnis über die Wohnung {{objekt.strasse}}, {{objekt.plzort}}{{mieter.whgKomma}}

**fristlos gemäß §§ 543 Abs. 2 S. 1 Nr. 3, 569 Abs. 3 BGB wegen Zahlungsverzugs.**

Der Rückstand setzt sich wie folgt zusammen:

{{postenTabelle}}

Der Rückstand an Miete beläuft sich auf {{summeMiete}} und übersteigt damit {{kuendigungsgrund}}.

**Hilfsweise** kündigen wir das Mietverhältnis ordentlich gemäß § 573 Abs. 2 Nr. 1 BGB fristgerecht zum nächstzulässigen Termin, nach unserer Berechnung zum **{{ordentlichZum}}**.

Wir fordern Sie auf, die Wohnung bis spätestens **{{frist}}** geräumt und mit sämtlichen Schlüsseln an uns herauszugeben.

Einer stillschweigenden Verlängerung des Mietverhältnisses gemäß § 545 BGB widersprechen wir bereits jetzt ausdrücklich.

**Hinweis gemäß § 568 Abs. 2 BGB:** Sie können der ordentlichen Kündigung nach §§ 574 bis 574b BGB widersprechen und die Fortsetzung des Mietverhältnisses verlangen, wenn die Beendigung des Mietverhältnisses für Sie, Ihre Familie oder einen anderen Angehörigen Ihres Haushalts eine Härte bedeuten würde, die auch unter Würdigung der berechtigten Interessen des Vermieters nicht zu rechtfertigen ist. Der Widerspruch ist schriftlich zu erklären und muss uns spätestens zwei Monate vor der Beendigung des Mietverhältnisses zugehen (§ 574b BGB).

Anlage: Vollmacht (Original)`,
      email: `{{briefanrede}}

vorab per E-Mail erhalten Sie beigefügt unser Kündigungsschreiben. Das unterschriebene Original geht Ihnen zusätzlich per Post zu. Maßgeblich ist allein das schriftliche Original (Schriftform gemäß § 568 Abs. 1 BGB); diese E-Mail dient nur der Vorabinformation.

Mit freundlichen Grüßen
{{sachbearbeiter}}
{{firma.firma}}`
    },
    raten: {
      bereich: 'opos', titel: 'Ratenzahlungsvereinbarung', empfaenger: 'mieter', unterschrift: true, mieterUnterschrift: true,
      betreff: 'Ratenzahlungsvereinbarung – Mietrückstand {{objekt.strasse}}{{mieter.whgKomma}}',
      text: `{{briefanrede}}

wie besprochen bieten wir Ihnen an, den derzeitigen Rückstand auf Ihrem Mietkonto (Mieternummer {{mieter.mietnr}}) in Höhe von **{{ratenSumme}}** in folgenden Raten zu begleichen:

{{ratenTabelle}}

Die Vereinbarung gilt unter folgenden Bedingungen:

1. Die laufende Miete ist daneben weiterhin pünktlich und vollständig zu zahlen.
2. Gerät eine Rate ganz oder teilweise um mehr als {{ratenVerzugTage}} Tage in Rückstand, wird der gesamte dann noch offene Betrag sofort zur Zahlung fällig.
3. Diese Vereinbarung stellt keinen Verzicht auf bestehende Rechte des Vermieters, insbesondere auf das Recht zur Kündigung, dar.

Bitte senden Sie uns ein unterschriebenes Exemplar dieses Schreibens bis zum **{{frist}}** zurück.`,
      email: `{{briefanrede}}

anbei erhalten Sie die besprochene Ratenzahlungsvereinbarung. Bitte senden Sie uns diese unterschrieben bis {{frist}} zurück.

Mit freundlichen Grüßen
{{sachbearbeiter}}
{{firma.firma}}`
    },
    ih_anfrage: {
      bereich: 'ih', titel: 'Anfrage Angebot an Handwerker', empfaenger: 'handwerker',
      betreff: 'Anfrage Angebot: {{schaden.titel}} – {{objekt.strasse}}, {{objekt.plzort}}',
      text: `Sehr geehrte Damen und Herren,

in dem von uns verwalteten Objekt {{objekt.strasse}}, {{objekt.plzort}}{{mieter.whgKomma}} ist folgender Schaden aufgetreten:

**{{schaden.titel}}**
{{schaden.beschreibung}}

Dringlichkeit: {{schaden.dringlichkeitText}}

Wir bitten um Besichtigung und ein Angebot bis zum **{{frist}}**. Ansprechpartner vor Ort: {{mieter.name}}{{mieter.telKomma}}.`,
      email: `Sehr geehrte Damen und Herren,

im Objekt {{objekt.strasse}}, {{objekt.plzort}}{{mieter.whgKomma}} ist folgender Schaden aufgetreten:

{{schaden.titel}}
{{schaden.beschreibung}}

Dringlichkeit: {{schaden.dringlichkeitText}}

Wir bitten um Besichtigung und ein Angebot bis {{frist}}. Ansprechpartner vor Ort: {{mieter.name}}{{mieter.telKomma}}.

Mit freundlichen Grüßen
{{sachbearbeiter}}
{{firma.firma}}
Tel. {{firma.tel}}`
    },
    ih_auftrag: {
      bereich: 'ih', titel: 'Auftrag an Handwerker', empfaenger: 'handwerker',
      betreff: 'Auftrag: {{schaden.titel}} – {{objekt.strasse}}, {{objekt.plzort}}',
      text: `Sehr geehrte Damen und Herren,

im Namen und für Rechnung {{objekt.eigentuemerGenitiv}} beauftragen wir Sie mit folgenden Arbeiten im Objekt {{objekt.strasse}}, {{objekt.plzort}}{{mieter.whgKomma}}:

**{{schaden.titel}}**
{{schaden.beschreibung}}

Grundlage: {{angebotText}}
Ausführungstermin: {{terminText}}

Bitte stimmen Sie den Termin direkt mit dem Mieter ab ({{mieter.name}}{{mieter.telKomma}}). Die Rechnung stellen Sie bitte auf {{objekt.eigentuemerOderVermieter}}, c/o {{firma.firma}}, {{firma.strasse}}, {{firma.plzort}} aus und geben Sie das Objekt sowie die Wohnung an.

Bitte bestätigen Sie uns den Auftrag kurz.`,
      email: `Sehr geehrte Damen und Herren,

anbei erhalten Sie unseren Auftrag für {{schaden.titel}} im Objekt {{objekt.strasse}}. Bitte bestätigen Sie kurz den Eingang.

Mit freundlichen Grüßen
{{sachbearbeiter}}
{{firma.firma}}`
    },
    ih_termin: {
      bereich: 'ih', titel: 'Terminankündigung an Mieter (§ 555a BGB)', empfaenger: 'mieter',
      betreff: 'Ankündigung von Erhaltungsmaßnahmen – {{objekt.strasse}}{{mieter.whgKomma}}',
      text: `{{briefanrede}}

in Ihrer Wohnung bzw. im Gebäude sind folgende Erhaltungsmaßnahmen erforderlich:

**{{schaden.titel}}**
{{schaden.beschreibung}}

Die Arbeiten werden durch die Firma {{handwerker.firma}} ausgeführt. Termin: **{{terminText}}**.

Wir bitten Sie, den Handwerkern zu diesem Termin Zugang zu Ihrer Wohnung zu gewähren. Gemäß § 555a Abs. 1 BGB sind Sie verpflichtet, Erhaltungsmaßnahmen zu dulden. Sollte Ihnen der Termin nicht möglich sein, setzen Sie sich bitte umgehend mit der Firma {{handwerker.firma}}{{handwerker.telKlammer}} oder mit uns in Verbindung.

Vielen Dank für Ihr Verständnis.`,
      email: `{{briefanrede}}

wir kündigen Ihnen Arbeiten in Ihrer Wohnung an ({{schaden.titel}}), Termin: {{terminText}}, ausführende Firma: {{handwerker.firma}}. Details entnehmen Sie bitte dem Anhang.

Mit freundlichen Grüßen
{{sachbearbeiter}}
{{firma.firma}}`
    },
    ih_weiterbelastung: {
      bereich: 'ih', titel: 'Weiterbelastung an Mieter', empfaenger: 'mieter',
      betreff: 'Schadensersatz – Reparaturkosten {{schaden.titel}}, {{objekt.strasse}}{{mieter.whgKomma}}',
      text: `{{briefanrede}}

am {{schaden.gemeldetAm}} wurde uns folgender Schaden in Ihrer Wohnung gemeldet:

**{{schaden.titel}}**
{{schaden.beschreibung}}

Nach unseren Feststellungen wurde der Schaden durch Sie bzw. Personen, für die Sie einzustehen haben, verursacht. Der Schaden wurde durch die Firma {{handwerker.firma}} behoben. Die Kosten betragen laut Rechnung {{rechnung.nr}} vom {{rechnung.datum}}:

**{{weiterbelastungBetrag}}**

Gemäß §§ 280 Abs. 1, 241 Abs. 2, 538 BGB sind Sie zum Ersatz dieses Schadens verpflichtet. Wir fordern Sie auf, den Betrag bis zum **{{frist}}** auf das unten genannte Konto zu überweisen. Eine Kopie der Rechnung liegt bei.`,
      email: `{{briefanrede}}

anbei erhalten Sie unser Schreiben zu den Reparaturkosten ({{schaden.titel}}). Bitte überweisen Sie {{weiterbelastungBetrag}} bis {{frist}}.

Mit freundlichen Grüßen
{{sachbearbeiter}}
{{firma.firma}}`
    },
    k_abrechnung: {
      bereich: 'kaution', titel: 'Kautionsabrechnung', empfaenger: 'mieter',
      betreff: 'Abrechnung der Mietkaution – {{objekt.strasse}}{{mieter.whgKomma}}',
      text: `{{briefanrede}}

das Mietverhältnis über die oben genannte Wohnung ist beendet; die Wohnung wurde am {{kaution.uebergabeAm}} an uns zurückgegeben. Über die geleistete Mietsicherheit rechnen wir wie folgt ab:

{{kautionTabelle}}

{{auszahlungSatz}}{{nkSatz}}`,
      email: `{{briefanrede}}

anbei erhalten Sie die Abrechnung Ihrer Mietkaution. Auszahlungsbetrag: {{kaution.auszahlung}}.

Mit freundlichen Grüßen
{{sachbearbeiter}}
{{firma.firma}}`
    },
    k_bankverbindung: {
      bereich: 'kaution', titel: 'Anforderung Bankverbindung', empfaenger: 'mieter',
      betreff: 'Rückzahlung Ihrer Mietkaution – Bitte um Bankverbindung',
      text: `{{briefanrede}}

für die Abrechnung und Rückzahlung Ihrer Mietkaution aus dem Mietverhältnis {{objekt.strasse}}{{mieter.whgKomma}} benötigen wir Ihre aktuelle Bankverbindung sowie Ihre neue Anschrift.

Bitte teilen Sie uns bis zum **{{frist}}** mit:

Kontoinhaber: ______________________________
IBAN: ______________________________
Neue Anschrift: ______________________________

Sie können uns die Angaben gern auch per E-Mail an {{firma.mail}} senden.`,
      email: `{{briefanrede}}

für die Rückzahlung Ihrer Mietkaution benötigen wir Ihre Bankverbindung (Kontoinhaber, IBAN) und Ihre neue Anschrift. Bitte antworten Sie bis {{frist}} auf diese E-Mail.

Mit freundlichen Grüßen
{{sachbearbeiter}}
{{firma.firma}}`
    },
    k_teilauszahlung: {
      bereich: 'kaution', titel: 'Teilauszahlung mit Einbehalt', empfaenger: 'mieter',
      betreff: 'Teilauszahlung Ihrer Mietkaution – {{objekt.strasse}}{{mieter.whgKomma}}',
      text: `{{briefanrede}}

nach Rückgabe der Wohnung am {{kaution.uebergabeAm}} zahlen wir Ihnen den unstreitigen Teil Ihrer Mietkaution vorab aus. Einen Teilbetrag behalten wir bis zur endgültigen Klärung ein:

{{kautionTabelle}}

Den Betrag von **{{teilauszahlungBetrag}}** überweisen wir in den nächsten Tagen auf Ihr Konto {{kaution.auszahlungIban}}.{{nkSatz}}

Über den Einbehalt rechnen wir ab, sobald alle Ansprüche geklärt sind.`,
      email: `{{briefanrede}}

anbei erhalten Sie unser Schreiben zur Teilauszahlung Ihrer Mietkaution.

Mit freundlichen Grüßen
{{sachbearbeiter}}
{{firma.firma}}`
    }
  };

  const PLATZHALTER = [
    ['briefanrede', 'Sehr geehrte/r … ,'], ['datum', 'heutiges Datum'], ['frist', 'Frist (TT.MM.JJJJ)'],
    ['mieter.name', 'Vor- und Nachname'], ['mieter.nachname', ''], ['mieter.mietnr', 'Mieternummer'], ['mieter.whg', 'Wohnung'],
    ['mieter.whgKomma', '„, Whg …“ oder leer'], ['mieter.tel', ''], ['objekt.bezeichnung', ''], ['objekt.strasse', ''], ['objekt.plzort', ''],
    ['objekt.eigentuemer', ''], ['firma.firma', ''], ['firma.tel', ''], ['firma.mail', ''], ['sachbearbeiter', ''],
    ['summe', 'offene Mietposten+Sonstige'], ['summeGesamt', 'inkl. Mahngebühr'], ['summeMiete', 'nur Mietposten'], ['postenTabelle', 'Tabelle offene Posten'],
    ['mahngebuehrSatz', 'Satz zur Mahngebühr (leer bei 0)'], ['kuendigungsgrund', 'aus Kündigungscheck'], ['ordentlichZum', '§ 573c-Termin'],
    ['abmahnungDetails', 'Freitext'], ['ratenTabelle', ''], ['ratenSumme', ''], ['ratenVerzugTage', ''],
    ['schaden.titel', ''], ['schaden.beschreibung', ''], ['schaden.gemeldetAm', ''], ['schaden.dringlichkeitText', ''], ['handwerker.firma', ''],
    ['terminText', ''], ['angebotText', ''], ['rechnung.nr', ''], ['rechnung.datum', ''], ['weiterbelastungBetrag', ''],
    ['kaution.betrag', ''], ['kaution.auszahlung', ''], ['kaution.uebergabeAm', ''], ['kaution.auszahlungIban', ''], ['kautionTabelle', ''],
    ['auszahlungSatz', ''], ['nkSatz', ''], ['teilauszahlungBetrag', '']
  ];

  function vorlage(data, id) {
    const std = STANDARD[id]; const own = (data.vorlagen || {})[id] || {};
    return Object.assign({}, std, own, { id, geaendert: !!(own.betreff || own.text || own.email) });
  }

  /* ---------- Tabellen ---------- */
  function tabelle(kopf, zeilen, fuss, rechts = []) {
    const td = (v, i, tag = 'td') => '<' + tag + (rechts.includes(i) ? ' class="r"' : '') + '>' + v + '</' + tag + '>';
    return '<table class="bt"><thead><tr>' + kopf.map((k, i) => td(esc(k), i, 'th')).join('') + '</tr></thead><tbody>' +
      zeilen.map(z => '<tr>' + z.map((v, i) => td(esc(v), i)).join('') + '</tr>').join('') + '</tbody>' +
      (fuss ? '<tfoot><tr>' + fuss.map((v, i) => td(v === '' ? '' : '<b>' + esc(v) + '</b>', i)).join('') + '</tr></tfoot>' : '') + '</table>';
  }
  function postenTabelle(posten) {
    const offen = posten.filter(p => C.round2(p.offen) > 0).sort((a, b) => (a.faellig || '').localeCompare(b.faellig || ''));
    return {
      html: tabelle(['Fällig', 'Bezeichnung', 'Betrag', 'offen'], offen.map(p => [fmtDatum(p.faellig), p.bez, fmtEUR(p.betrag), fmtEUR(p.offen)]), ['', 'Summe', '', fmtEUR(C.sum(offen, p => p.offen))], [2, 3]),
      text: offen.map(p => '- ' + fmtDatum(p.faellig) + '  ' + p.bez + ': ' + fmtEUR(p.offen)).join('\n') + '\nSumme: ' + fmtEUR(C.sum(offen, p => p.offen))
    };
  }

  /* ---------- Kontext für Platzhalter ---------- */
  function adresse(m, o) {
    if (!m) return [];
    const z = [];
    if (m.anrede && m.anrede !== 'Firma') z.push(m.anrede);
    z.push(C.mieterName(m));
    if (m.anschrift) z.push(...String(m.anschrift).split(/\n/));
    else if (o) { z.push(o.strasse + (m.whg ? ', ' + m.whg : '')); z.push(o.plzort); }
    return z.filter(Boolean);
  }
  function kontaktAdresse(k) { return k ? [k.firma, k.ansprechpartner, ...(String(k.anschrift || '').split(/\n/))].filter(Boolean) : []; }

  /** Kontext aufbauen. opts: { vorlageId, bereich, fall, frist, extra, empfaengerKontakt } */
  function kontext(data, opts) {
    const s = data.settings; const fall = opts.fall || {};
    const mieter = data.mieter.find(m => m.id === (fall.mieterId || opts.mieterId));
    const objekt = data.objekte.find(o => o.id === (fall.objektId || (mieter && mieter.objektId)));
    const hw = opts.empfaengerKontakt || data.kontakte.find(k => k.id === fall.handwerkerId);
    const m = mieter ? Object.assign({}, mieter, {
      name: C.mieterName(mieter), whgKomma: mieter.whg ? ', ' + mieter.whg : '', telKomma: mieter.tel ? ', Tel. ' + mieter.tel : ''
    }) : { name: '–', whgKomma: '', telKomma: '' };
    const o = objekt ? Object.assign({}, objekt, {
      eigentuemerOderVermieter: objekt.eigentuemer ? 'die Eigentümerin/den Eigentümer ' + objekt.eigentuemer : 'den Vermieter',
      eigentuemerGenitiv: objekt.eigentuemer ? 'der Eigentümerin/des Eigentümers ' + objekt.eigentuemer : 'des Vermieters'
    }) : { strasse: '', plzort: '', eigentuemerOderVermieter: 'den Vermieter', eigentuemerGenitiv: 'des Vermieters' };
    const ctx = {
      firma: s, sachbearbeiter: s.sachbearbeiter, datum: fmtDatum(C.today()), frist: fmtDatum(opts.frist || ''),
      mieter: m, objekt: o, briefanrede: C.briefanrede(mieter),
      handwerker: hw ? Object.assign({}, hw, { telKlammer: hw.tel ? ' (Tel. ' + hw.tel + ')' : '' }) : { firma: '–', telKlammer: '' },
      ratenVerzugTage: s.ratenVerzugTage
    };
    if (opts.bereich === 'opos') {
      const pt = postenTabelle(fall.posten || []);
      const summe = C.offenSumme(fall.posten || []);
      const geb = C.round2(s.mahngebuehr);
      const check = C.kuendigungsCheck(fall.posten || [], mieter && mieter.gesamtmiete);
      Object.assign(ctx, {
        postenTabelle: pt.html, postenListe: pt.text, summe: fmtEUR(summe), summeMiete: fmtEUR(check.summeMiete),
        summeGesamt: fmtEUR(summe + (['mahnung1', 'mahnungLetzte'].includes(opts.vorlageId) ? geb : 0)),
        mahngebuehrSatz: geb > 0 && ['mahnung1', 'mahnungLetzte'].includes(opts.vorlageId) ? ' Darin enthalten sind Mahnkosten in Höhe von ' + fmtEUR(geb) + '.' : '',
        kuendigungsgrund: check.grund || '[Kündigungsgrund prüfen!]',
        ordentlichZum: fmtDatum(C.ordentlicherKuendigungstermin(C.today(), mieter && mieter.mietbeginn)),
        abmahnungDetails: (opts.extra && opts.extra.abmahnungDetails) || '[Zahlungseingänge mit Datum eintragen]'
      });
      const raten = (opts.extra && opts.extra.raten) || fall.raten || [];
      ctx.ratenTabelle = tabelle(['Rate', 'fällig am', 'Betrag'], raten.map(r => [r.nr + '.', fmtDatum(r.faellig), fmtEUR(r.betrag)]), ['', 'Summe', fmtEUR(C.sum(raten, r => r.betrag))], [2]);
      ctx.ratenListe = raten.map(r => r.nr + '. Rate am ' + fmtDatum(r.faellig) + ': ' + fmtEUR(r.betrag)).join('\n');
      ctx.ratenSumme = fmtEUR(C.sum(raten, r => r.betrag));
    }
    if (opts.bereich === 'ih') {
      const ang = (fall.angebote || []).find(a => a.kontaktId === fall.handwerkerId) || (fall.angebote || [])[0];
      Object.assign(ctx, {
        schaden: Object.assign({}, fall, { gemeldetAm: fmtDatum(fall.gemeldetAm), dringlichkeitText: C.IH_DRINGLICHKEIT[fall.dringlichkeit] || '' }),
        terminText: fall.termin ? fmtDatum(fall.termin) + (fall.terminZeit ? ', ' + fall.terminZeit + ' Uhr' : '') : 'wird noch mit Ihnen abgestimmt',
        angebotText: ang ? 'Ihr Angebot vom ' + fmtDatum(ang.datum) + ' über ' + fmtEUR(ang.betrag) + (ang.nr ? ' (Nr. ' + ang.nr + ')' : '') : 'nach Aufwand, Kostenrahmen bitte vorab abstimmen',
        rechnung: Object.assign({ nr: '', datum: '' }, fall.rechnung || {}, { datum: fmtDatum((fall.rechnung || {}).datum) }),
        weiterbelastungBetrag: fmtEUR(fall.weiterbelastung || (fall.rechnung || {}).betrag || 0)
      });
    }
    if (opts.bereich === 'kaution') {
      const r = C.kautionsabrechnung(fall);
      const zeilen = [['Kaution', fmtEUR(r.kaution)], ['zzgl. Zinsen', fmtEUR(r.zinsen)]];
      (fall.einbehalte || []).forEach(e => zeilen.push(['abzgl. ' + e.grund, '-' + fmtEUR(e.betrag)]));
      if (r.nkEinbehalt) zeilen.push(['abzgl. Einbehalt Betriebskosten (vorläufig)', '-' + fmtEUR(r.nkEinbehalt)]);
      if (r.bereitsAusgezahlt) zeilen.push(['abzgl. bereits ausgezahlt', '-' + fmtEUR(r.bereitsAusgezahlt)]);
      const teil = C.round2(r.guthaben - r.einbehalte - r.nkEinbehalt - r.bereitsAusgezahlt);
      Object.assign(ctx, {
        kaution: Object.assign({}, fall, { betrag: fmtEUR(r.kaution), auszahlung: fmtEUR(r.auszahlung), uebergabeAm: fmtDatum(fall.uebergabeAm || fall.auszugAm), auszahlungIban: fall.auszahlungIban || '[IBAN fehlt]' }),
        kautionTabelle: tabelle(['Position', 'Betrag'], zeilen, [r.auszahlung >= 0 ? 'Auszahlungsbetrag' : 'Nachforderung', fmtEUR(Math.abs(r.auszahlung))], [1]),
        kautionListe: zeilen.map(z => z[0] + ': ' + z[1]).join('\n') + '\n' + (r.auszahlung >= 0 ? 'Auszahlung: ' : 'Nachforderung: ') + fmtEUR(Math.abs(r.auszahlung)),
        auszahlungSatz: r.auszahlung > 0 ? 'Den Betrag von ' + fmtEUR(r.auszahlung) + ' überweisen wir in den nächsten Tagen auf Ihr Konto ' + (fall.auszahlungIban || '[IBAN fehlt]') + '.'
          : r.auszahlung < 0 ? 'Es ergibt sich eine Forderung zu Ihren Lasten in Höhe von ' + fmtEUR(-r.auszahlung) + '. Wir bitten um Ausgleich bis zum ' + fmtDatum(opts.frist || C.addDays(C.today(), 14)) + ' auf das unten genannte Konto.' : 'Es ergibt sich kein Auszahlungsbetrag.',
        nkSatz: r.nkEinbehalt ? '\n\nFür die noch ausstehende Betriebskostenabrechnung behalten wir vorläufig ' + fmtEUR(r.nkEinbehalt) + ' ein. Nach Vorliegen der Abrechnung' + (fall.nkDatum ? ' (voraussichtlich ' + fmtDatum(fall.nkDatum) + ')' : '') + ' rechnen wir diesen Betrag gesondert ab.' : '',
        teilauszahlungBetrag: fmtEUR(teil > 0 ? teil : 0)
      });
    }
    if (opts.extra) Object.keys(opts.extra).forEach(k => { if (typeof opts.extra[k] === 'string') ctx[k] = opts.extra[k]; });
    ctx._empfaenger = opts.empfaengerKontakt || (STANDARD[opts.vorlageId] && STANDARD[opts.vorlageId].empfaenger === 'handwerker') ? kontaktAdresse(hw) : adresse(mieter, objekt);
    ctx._email = STANDARD[opts.vorlageId] && STANDARD[opts.vorlageId].empfaenger === 'handwerker' ? (hw && hw.email) || '' : (mieter && mieter.email) || '';
    ctx._zeichen = mieter && mieter.mietnr ? mieter.mietnr : '';
    return ctx;
  }

  /* ---------- Briefrahmen DIN 5008 (Form B) ---------- */
  const BRIEF_CSS = `
  .brief{font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;font-size:11pt;line-height:1.35;color:#000;background:#fff;width:210mm;min-height:296mm;box-sizing:border-box;padding:0 20mm 28mm 25mm;position:relative}
  .brief *{box-sizing:border-box}
  .brief .kopf{height:45mm;padding-top:12mm;display:flex;justify-content:space-between;align-items:flex-start}
  .brief .kopf .fn{font-size:15pt;font-weight:bold;color:#1f3a5f}
  .brief .kopf .fz{font-size:9pt;color:#444}
  .brief .kopf img{max-height:22mm;max-width:60mm}
  .brief .fenster{display:flex;justify-content:space-between;height:45mm}
  .brief .anschrift{width:85mm}
  .brief .ruecksende{font-size:7pt;border-bottom:.5pt solid #555;padding-bottom:1mm;margin:0 0 3mm;height:5mm;white-space:nowrap;overflow:hidden}
  .brief .info{width:70mm;font-size:9pt;margin-top:8mm}
  .brief .info td{padding:0 2mm 0 0;vertical-align:top}
  .brief .betreff{font-weight:bold;margin:8.46mm 0 8.46mm}
  .brief p{margin:0 0 3.5mm}
  .brief table.bt{border-collapse:collapse;width:100%;margin:1mm 0 4mm;font-size:10pt}
  .brief table.bt th,.brief table.bt td{border-bottom:.5pt solid #999;padding:1mm 1.5mm;text-align:left}
  .brief table.bt th{background:#eef2f7}
  .brief table.bt .r{text-align:right;white-space:nowrap}
  .brief table.bt tfoot td{border-bottom:none;border-top:1pt solid #000}
  .brief .gruss{margin-top:6mm;page-break-inside:avoid}
  .brief .sig{height:14mm}
  .brief .siglinie{display:inline-block;border-top:.5pt solid #000;min-width:65mm;padding-top:1mm;font-size:9pt}
  .brief .sigzeile{display:flex;justify-content:space-between;gap:10mm;margin-top:14mm}
  .brief .fuss{position:absolute;left:25mm;right:20mm;bottom:8mm;border-top:.5pt solid #999;padding-top:1.5mm;font-size:7.5pt;color:#444;display:flex;justify-content:space-between;gap:4mm}
  .brief mark{background:#ffe08a}`;

  function briefHTML(data, v, ctx) {
    const s = data.settings;
    const betreff = C.vorlageZuText(v.betreff, ctx);
    const body = C.vorlageZuHTML(v.text, ctx);
    const kopfLinks = s.logo ? '<img src="' + s.logo + '" alt="">' : '<div><div class="fn">' + esc(s.firma) + '</div><div class="fz">Hausverwaltung</div></div>';
    const kopfRechts = '<div class="fz" style="text-align:right">' + esc(s.firma) + '<br>' + esc(s.strasse) + '<br>' + esc(s.plzort) + '<br>Tel. ' + esc(s.tel) + '<br>' + esc(s.mail) + (s.web ? '<br>' + esc(s.web) : '') + '</div>';
    const info = [['Unser Zeichen', ctx._zeichen], ['Ansprechpartner', s.sachbearbeiter], ['Telefon', s.tel], ['E-Mail', s.mail], ['Datum', ctx.datum]]
      .filter(r => r[1]).map(r => '<tr><td>' + esc(r[0]) + ':</td><td>' + esc(r[1]) + '</td></tr>').join('');
    const unterschrift = v.unterschrift
      ? '<div class="sig"></div><span class="siglinie">' + esc(s.unterzeichner) + (s.funktion ? ', ' + esc(s.funktion) : '') + '<br>' + esc(s.firma) + '</span>'
      : '<br><br>' + esc(s.sachbearbeiter) + '<br>' + esc(s.firma);
    const mieterSig = v.mieterUnterschrift ? '<div class="sigzeile"><span class="siglinie">Ort, Datum</span><span class="siglinie">Unterschrift Mieter/in (' + esc(ctx.mieter.name) + ')</span></div>' : '';
    const iban = (s.ibanJeEigentuemer && ctx.objekt && ctx.objekt.iban) ? ctx.objekt.iban : s.iban;
    return '<div class="brief">' +
      '<div class="kopf">' + kopfLinks + kopfRechts + '</div>' +
      '<div class="fenster"><div class="anschrift"><div class="ruecksende">' + esc(s.firma) + ' · ' + esc(s.strasse) + ' · ' + esc(s.plzort) + '</div>' +
      (ctx._empfaenger || []).map(esc).join('<br>') + '</div><table class="info">' + info + '</table></div>' +
      '<div class="betreff">' + esc(betreff) + '</div>' + body +
      '<div class="gruss">Mit freundlichen Grüßen' + unterschrift + mieterSig + '</div>' +
      '<div class="fuss"><div>' + esc(s.firma) + '<br>' + esc(s.strasse) + ', ' + esc(s.plzort) + '</div><div>Tel. ' + esc(s.tel) + '<br>' + esc(s.mail) + '</div><div>' + esc(s.bank) + '<br>IBAN ' + esc(iban) + (s.bic ? ' · BIC ' + esc(s.bic) : '') + '</div></div>' +
      '</div>';
  }

  /** Dokument erzeugen → { html, betreff, emailText, email, dateiname } */
  function erzeuge(data, vorlageId, opts) {
    const v = vorlage(data, vorlageId);
    const ctx = kontext(data, Object.assign({ vorlageId }, opts));
    const betreff = C.vorlageZuText(v.betreff, ctx);
    const name = ctx.mieter && ctx.mieter.nachname ? ctx.mieter.nachname : (ctx.handwerker && ctx.handwerker.firma) || '';
    return {
      vorlageId, titel: v.titel, html: briefHTML(data, v, ctx), betreff, emailText: C.vorlageZuText(v.email || '', ctx),
      email: opts.empfaengerKontakt ? opts.empfaengerKontakt.email || '' : ctx._email,
      dateiname: C.asciiDateiname(C.today() + ' ' + v.titel.replace(/\(.*\)/, '').trim() + (name ? ' ' + name : ''))
    };
  }

  function standalone(inner, titel) {
    return '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>' + esc(titel || 'Dokument') + '</title><style>@page{size:A4;margin:0}body{margin:0;background:#fff}' + BRIEF_CSS +
      '@media print{.brief{page-break-after:always}}</style></head><body>' + inner + '</body></html>';
  }

  /* ---------- Export ---------- */
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function drucken(html, titel) {
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(standalone(html, titel)); f.contentDocument.close();
    setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 300);
  }
  function word(html, name) {
    const doc = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8">' +
      '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->' +
      '<style>@page WordSection1{size:21cm 29.7cm;margin:1.5cm 2cm 2cm 2.5cm}div.WordSection1{page:WordSection1}body{font-family:Calibri;font-size:11pt}' +
      BRIEF_CSS.replace(/\.brief\{[^}]*\}/, '.brief{font-family:Calibri;font-size:11pt}').replace(/\.brief \.fuss\{[^}]*\}/, '.brief .fuss{border-top:.5pt solid #999;margin-top:10mm;font-size:7.5pt;color:#444}').replace(/display:flex;?/g, '') +
      '</style></head><body><div class="WordSection1">' + html + '</div></body></html>';
    download(new Blob(['﻿' + doc], { type: 'application/msword' }), name + '.doc');
  }
  async function pdfBlob(html) {
    const lib = await loadLib('html2pdf', 'html2pdf');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;background:#fff';
    host.innerHTML = '<style>' + BRIEF_CSS + '</style>' + html;
    document.body.appendChild(host);
    try {
      return await lib().set({ margin: 0, image: { type: 'jpeg', quality: 0.95 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'] } }).from(host.querySelector('.brief')).outputPdf('blob');
    } finally { host.remove(); }
  }
  async function pdf(html, name) { const b = await pdfBlob(html); download(b, name + '.pdf'); return b; }
  function blobToBase64(blob) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
  }
  /** PDF + .eml-Entwurf; Fallback ohne CDN: mailto + Text in Zwischenablage + Word-Datei */
  async function emailEntwurf(doc, to) {
    try {
      const blob = await pdfBlob(doc.html);
      const eml = C.buildEML({ to: to || doc.email || '', subject: doc.betreff, text: doc.emailText, attachments: [{ name: doc.dateiname + '.pdf', mime: 'application/pdf', base64: await blobToBase64(blob) }] });
      download(new Blob([eml], { type: 'message/rfc822' }), doc.dateiname + '.eml');
      return { art: 'eml' };
    } catch (e) {
      try { await navigator.clipboard.writeText(doc.emailText); } catch (_) { /* ignorieren */ }
      word(doc.html, doc.dateiname);
      location.href = 'mailto:' + encodeURIComponent(to || doc.email || '') + '?subject=' + encodeURIComponent(doc.betreff) + '&body=' + encodeURIComponent(doc.emailText);
      return { art: 'mailto', fehler: e.message };
    }
  }
  /** Reine E-Mail ohne Anhang (z. B. Handwerker-Anfrage) */
  function emailOhneAnhang(to, subject, text, name) {
    const eml = C.buildEML({ to, subject, text, attachments: [] });
    download(new Blob([eml], { type: 'message/rfc822' }), C.asciiDateiname(name || subject) + '.eml');
  }

  /* ---------- Tabellen-Export (Excel, Fallback CSV) ---------- */
  async function excel(name, blaetter) {
    // blaetter: [{ name, kopf:[...], zeilen:[[...]] }]
    try {
      const X = await loadLib('xlsx', 'XLSX');
      const wb = X.utils.book_new();
      blaetter.forEach(b => {
        const ws = X.utils.aoa_to_sheet([b.kopf, ...b.zeilen]);
        ws['!cols'] = b.kopf.map((k, i) => ({ wch: Math.min(60, Math.max(String(k).length, ...b.zeilen.map(z => String(z[i] == null ? '' : z[i]).length)) + 2) }));
        X.utils.book_append_sheet(wb, ws, b.name.slice(0, 31));
      });
      X.writeFile(wb, C.asciiDateiname(name) + '.xlsx');
      return 'xlsx';
    } catch (e) {
      const b = blaetter[0];
      const cell = v => { const s = typeof v === 'number' ? C.fmtZahl(v) : String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const csv = [b.kopf, ...b.zeilen].map(z => z.map(cell).join(';')).join('\r\n');
      download(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), C.asciiDateiname(name) + '.csv');
      return 'csv';
    }
  }
  /** Alle Blätter einer Excel-Datei (Rohwerte, Datumswerte als Date) bzw. eine CSV → [{ name, rows }] */
  async function leseArbeitsmappe(file) {
    const leer = r => r.some(c => c != null && String(c).trim() !== '');
    if (/\.(xlsx|xlsm|xlsb|xls|ods)$/i.test(file.name)) {
      const X = await loadLib('xlsx', 'XLSX');
      const wb = X.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      return wb.SheetNames.map(n => ({ name: n, rows: X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }).filter(leer) }));
    }
    const buf = await file.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('\ufffd')) text = new TextDecoder('windows-1252').decode(buf);
    return [{ name: file.name, rows: C.parseCSV(text) }];
  }
  async function png(el, name) {
    const h2c = await loadLib('html2canvas', 'html2canvas');
    const canvas = await h2c(el, { scale: 2, backgroundColor: '#ffffff' });
    canvas.toBlob(b => download(b, C.asciiDateiname(name) + '.png'));
  }

  root.Docs = { STANDARD, PLATZHALTER, BRIEF_CSS, vorlage, kontext, erzeuge, briefHTML, standalone, download, drucken, word, pdf, pdfBlob, emailEntwurf, emailOhneAnhang, excel, leseArbeitsmappe, png, loadLib, tabelle };
})(window);
