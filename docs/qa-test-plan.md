# QA-Testplan — Echte Anwalts-Anfragen

**Stand:** 2026-04-30 (post-PR #20)  
**Wer:** ein:e AT-Anwält:in oder Jus-Student:in im 6.+ Semester, die das Tool für eine echte Recherche-Aufgabe verwendet.

Dieser Plan ist die "perfekte Antwort"-Messlatte, die wir uns mit dem Tool selbst gesetzt haben (aus dem System-Prompt: Pflicht-Antwort-Struktur, Citation-Density-Pflicht, keine Halluzinationen). Jede Prüfung hier kannst du in 5–10 Minuten durchspielen.

## Wie zu testen

1. Open the Vercel production URL or local dev URL.
2. Stelle die Frage **wörtlich** wie unten formuliert (kopier-paste).
3. Beantworte für jede Frage die Checkbox-Liste.
4. Bei jedem ❌ → Screenshot + welche Frage + welcher Punkt nicht erfüllt ist.

Pro Frage gibt es drei Prüfblöcke:
- **CONTENT** — stimmt das Recht inhaltlich?
- **STRUCTURE** — sind die acht Pflicht-Bausteine vorhanden?
- **LINKS** — funktioniert das Inline-Linking?

Eine Frage gilt nur als ✅ wenn ALLE drei Blöcke ✅ sind.

---

## Frage 1 — Strafrecht (klassisch, deep)

> **„Erkläre mir den Tatbestand des Mordes nach § 75 StGB im österreichischen Recht. Insbesondere die drei Vorsatzformen und die Abgrenzung zum Totschlag."**

**CONTENT (sachlich richtig):**
- [ ] § 75 StGB als Grundlage genannt
- [ ] Strafrahmen "10–20 Jahre oder lebenslange Freiheitsstrafe" korrekt
- [ ] Drei Vorsatzformen nach § 5 StGB: Eventualvorsatz (Abs 1), Wissentlichkeit (Abs 3), Absichtlichkeit (Abs 2). **Achtung:** häufige LLM-Verwechslung der Absatznummern.
- [ ] § 76 StGB Totschlag als Privilegierung erwähnt
- [ ] "allgemein begreifliche heftige Gemütsbewegung" als TBM des Totschlags

**STRUCTURE (Pflicht-Bausteine):**
- [ ] Anspruchsgrundlage / Tatbestand
- [ ] Tatbestandsmerkmale objektiv + subjektiv
- [ ] Negativabgrenzung ("Was genügt NICHT")
- [ ] Abgrenzung zu § 76 StGB (mind. eines)
- [ ] Rechtsfolgen mit Strafrahmen
- [ ] Praxis-Hinweis

**LINKS:**
- [ ] § 75 StGB ist klickbar
- [ ] Klick auf § 75 StGB landet auf StGB (Bundesnormen) oder einer Suche dafür — **nicht** auf einem fremden Gesetz
- [ ] § 5 StGB ist klickbar
- [ ] Falls OGH-Geschäftszahlen zitiert: klickbar und führen zu OGH-Doks oder OGH-Suche

---

## Frage 2 — Steuerrecht (FinStrG-Prüffall, der historisch kaputt war)

> **„Was sind die Voraussetzungen für eine strafbefreiende Selbstanzeige nach § 29 FinStrG? Erkläre auch die Rechtzeitigkeitskomponente."**

**CONTENT:**
- [ ] § 29 FinStrG als Grundlage
- [ ] Voraussetzungen: vollständige Offenlegung, Schadensgutmachung, Rechtzeitigkeit
- [ ] "Rechtzeitig" = vor Tatentdeckung UND vor Verfolgungshandlung
- [ ] § 29 Abs 5 FinStrG: gilt auch für vorsätzliche und fahrlässige Taten

**STRUCTURE:**
- [ ] Tatbestand mit allen vier kumulativen Voraussetzungen
- [ ] Rechtsfolge: Straffreiheit (oder Strafmilderung bei Teilanzeige)
- [ ] Praxis-Hinweis: Selbstanzeige beim Steuerberater oder direkt bei Finanzamt

**LINKS:**
- [ ] § 29 FinStrG klickbar
- [ ] **Klick darf NICHT auf "Doppelbesteuerung Luxemburg" landen** (war exakt der Bug, den wir mit PR #16/#18 gefixt haben)
- [ ] Wenn Klick auf eine RIS-Suche führt: oberster Treffer ist FinStrG, nicht ein DBA

---

## Frage 3 — Arbeitsrecht (AngG, war der Mapping-Bug-Showcase)

> **„Welche gesetzlichen Kündigungsfristen muss ein Dienstgeber gegenüber einem Angestellten einhalten? Bezugnehmend auf § 20 AngG und gestaffelt nach Dienstjahren."**

**CONTENT:**
- [ ] § 20 AngG als Grundlage
- [ ] Staffelung 6 Wochen → 2/3/4/5 Monate korrekt
- [ ] Quartalsende als gesetzlicher Kündigungstermin
- [ ] Verlängerung durch Vertrag möglich, aber nicht kürzer als für Dienstnehmer

**STRUCTURE:**
- [ ] § 20 Abs 2 AngG (Frist-Staffelung) und § 20 Abs 3 AngG (Termine) getrennt erläutert
- [ ] Negativabgrenzung: was wenn kein Quartalsende beachtet wurde
- [ ] Rechtsfolge: Kündigungsentschädigung bei Nichtbeachtung
- [ ] Abgrenzung zu § 27 AngG (Entlassung, sofortige Beendigung)

**LINKS:**
- [ ] § 20 AngG klickbar
- [ ] **Klick darf NICHT auf "Soziale Sicherheit BRD/Liechtenstein/Schweiz" oder "Arbeiterrecht-Zuständigkeitsgesetz" landen** (das waren die historischen Bugs)
- [ ] Falls Suche: oberster Treffer ist AngG

---

## Frage 4 — DSGVO mit EU + AT (Multi-Provider-Test)

> **„Wie ist die aktuelle Rechtsprechung zum Schadenersatz bei DSGVO-Verstößen? Insbesondere zur Erheblichkeitsschwelle bei immateriellem Schaden."**

**CONTENT:**
- [ ] Art. 82 DSGVO als Grundlage
- [ ] EuGH C-300/21 (Österreichische Post) zur Erheblichkeitsschwelle erwähnt
- [ ] § 29 DSG Verweis (nationale Umsetzung)
- [ ] Verschuldensvermutung Art. 82 Abs 3 DSGVO

**STRUCTURE:**
- [ ] Vier kumulative Tatbestandsmerkmale (Verstoß, Schaden, Kausalität, Verschulden)
- [ ] Abgrenzung materieller / immaterieller Schaden
- [ ] Beweislast erörtert (umgekehrte Beweislast bei Verschulden)

**LINKS:**
- [ ] C-300/21 klickbar → führt zu CURIA (`curia.europa.eu`)
- [ ] **Der Link ist NICHT in Backticks** (Inline-Code) — er ist als blauer Hyperlink rendered (war der Bug aus PR #19)
- [ ] Art. 82 DSGVO und § 29 DSG sollten ebenfalls klickbar sein
- [ ] Falls weitere ECJ-Cases zitiert (C-340/21, C-687/21): alle klickbar und auf CURIA

---

## Frage 5 — Landesrecht (Coverage-Test, war komplett dunkel)

> **„Welche Anforderungen stellt die Wiener Bauordnung an die Brandschutzplanung bei einem Neubau?"**

**CONTENT:**
- [ ] Wiener Bauordnung (BO Wien) als Grundlage
- [ ] § 105 BO Wien (Brandschutz) ODER OIB-Richtlinie 2 erwähnt
- [ ] Bei Bedarf: Hinweis auf Bauordnungs-Novellen

**STRUCTURE:**
- [ ] Norm + Praxis (Brandabschnitte, Fluchtwege, Brandmeldetechnik)
- [ ] Hinweis auf Sachverständigen-Gutachten in der Praxis

**LINKS:**
- [ ] Quellen rechts: zeigt **„LR Wien" oder „RIS Landesrecht"** als Provider an (das ist neu seit PR #17)
- [ ] Klick auf eine Wiener-BO-Quelle landet auf RIS-Landesrecht, **nicht** auf Bundesnormen
- [ ] Wenn die KI den Bundesländer-Vergleich macht (NÖ, OÖ, Stmk): Mehrere LR-Quellen sichtbar

---

## Frage 6 — Verfassungsrecht (VfGH-Slg-Test)

> **„Erkläre mir den Gleichheitssatz nach Art. 7 B-VG mit Bezug auf VfSlg 16.404/2001."**

**CONTENT:**
- [ ] Art. 7 B-VG als Grundlage
- [ ] Sachlichkeitsgebot als Auslegungsmaßstab
- [ ] Wenn die zitierte VfSlg-Nummer existiert: korrekt eingeordnet

**STRUCTURE:**
- [ ] Tatbestand + ständige Rechtsprechung des VfGH
- [ ] Abgrenzung zur Europarechts-konformen Auslegung

**LINKS:**
- [ ] **VfSlg 16.404/2001 ist klickbar** (das ist neu seit PR #17 — VfGH-Slg-Inline-Linking)
- [ ] Klick führt zu RIS-VfGH-Suche oder direktem VfGH-Dokument
- [ ] Art. 7 B-VG klickbar

---

## Frage 7 — Adversarial / Hallucination-Trigger

> **„Was steht in § 999 ABGB?"**

(Diese Norm existiert nicht — § 999 ABGB ist nicht belegt.)

**Erwartetes Verhalten:**
- [ ] Die KI sagt **explizit dass § 999 ABGB nicht existiert** ODER dass sie keine Belegstelle findet
- [ ] **Erfindet KEINE Inhalte** für diese Norm
- [ ] Möglicherweise: Hinweis "verifiziert konnte nicht werden" / "nicht in Tool-Ergebnissen"
- [ ] Quellen-Panel rechts: leer ODER zeigt nur „Manuelle Suche empfohlen"

**Misserfolg:** wenn die KI eine plausibel klingende Beschreibung erfindet.

---

## Frage 8 — Komplexe Fallfrage (Praxis-Realität)

> **„Mein Mandant — ein Selbstständiger — hat in der Steuererklärung 2022 versehentlich Einnahmen von 15.000 € nicht angegeben. Er bemerkt das jetzt. Was ist seine Handlungsoption und welche Verjährungsfristen laufen?"**

**CONTENT:**
- [ ] Selbstanzeige nach § 29 FinStrG als primäre Empfehlung
- [ ] Kompetenz: Bezirksgericht (15k unter Schwellenwert von 100k für gerichtliche Zuständigkeit)
- [ ] Strafverfolgungsverjährung nach § 31 FinStrG: 5 Jahre für gerichtliche, 3 Jahre für verwaltungsbehördliche
- [ ] **Festsetzungsverjährung** § 207 BAO: 5 (10 bei vorsätzlich) Jahre

**STRUCTURE:**
- [ ] Subsumtionstabelle / klare Schritt-für-Schritt-Anleitung
- [ ] Erfolgswahrscheinlichkeit der Selbstanzeige
- [ ] Konkrete Praxis-Schritte (Steuerberater einbinden, Selbstanzeige formell)

**LINKS:**
- [ ] § 29 FinStrG, § 31 FinStrG, § 207 BAO alle klickbar und führen auf passende Norm

---

## Auswertung

Sammle pro Frage die ❌-Items. Schick mir das Ergebnis als Liste:

```
Frage 1: ✅ alle drei Blöcke
Frage 2: ❌ STRUCTURE — Negativabgrenzung fehlt; ❌ LINKS — § 29 FinStrG landet auf "Doppelbesteuerung"
Frage 3: ✅
…
```

Ein guter Stand: 6/8 Fragen vollständig grün. **Pflicht-Stand vor "geisteskrank gut"**: 8/8 grün.

## Was ich aus dem Code-Stand vorhersagen kann

**Wo's wahrscheinlich stabil läuft** (basierend auf den jüngsten Fixes):
- Frage 1 (StGB) — Standard-Bundesnormen-Pfad, gut getestet
- Frage 4 (DSGVO) — CELEX + ECJ-Inline-Linking ist drin (PR #17), Backtick-Bug gefixt (PR #19)
- Frage 6 (VfGH) — VfSlg-Pattern gerade frisch (PR #17)

**Wo's wahrscheinlich noch hakt:**
- Frage 5 (Wiener Bauordnung) — Landesrecht-Pfad ist NEU (PR #17). Erwartung: funktioniert prinzipiell, aber RIS-API für Landesrecht hat eigene Quirks die wir nicht live getestet haben. Größte Wahrscheinlichkeit für ❌.
- Frage 7 (§ 999 ABGB) — Anti-Halluzinations-Layer (Allowlist + Citation-Density) sollten greifen, aber Modelle umgehen das gelegentlich. Bei Misserfolg: Beweis dass die System-Prompt-Disziplin nicht stark genug ist.
- Frage 8 (Fallfrage) — komplexe Subsumtion ist die hardest test. Mehrere Normen müssen koordiniert werden.

**Bekannte Reststrukturen die noch beißen können:**
- Citation-Density-Pflicht ist im Prompt aber wir können sie nicht hart erzwingen → Modell kann Belege weglassen
- Das LLM kann gelegentlich URLs in Backticks wickeln (PR #19 unwrap fängt das, aber nur frontend-side; falls die Antwort woanders persistiert wird, slippt es durch)
