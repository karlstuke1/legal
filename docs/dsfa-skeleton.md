# Datenschutz-Folgenabschätzung (DSFA) — Skeleton

**Stand:** 30.04.2026  
**Status:** SKELETON — must be completed and signed off before public launch.

This document is the formal Datenschutz-Folgenabschätzung gemäß Art. 35 DSGVO referenced in the public Datenschutzerklärung (section 12). Until this document is finalized and approved by the Verantwortlicher, the public DSFA claim is technically incomplete.

---

## 1. Verarbeitungstätigkeit

**Bezeichnung:** Rechtsassistent — KI-gestützte juristische Recherche  
**Verantwortlicher:** [TODO — Firmenname, Adresse, Geschäftsführung einfügen]  
**Datenschutzbeauftragte/r:** [TODO — Name + Kontakt]  
**Datum der Inbetriebnahme:** [TODO]  
**Letzte Aktualisierung:** 30.04.2026

## 2. Beschreibung der Verarbeitung

### 2.1 Zweck
KI-gestützte juristische Recherche und Dokumentenanalyse für Anwält:innen, Jurist:innen und Studierende. Der Dienst beantwortet Rechtsfragen unter Verweis auf öffentlich zugängliche Quellen (RIS, FINDOK, EUR-Lex, Parlament).

### 2.2 Datenkategorien
- **Kontodaten:** E-Mail, Anzeigename, Passwort-Hash, Sessions
- **Chat-Verläufe:** Fragen + KI-Antworten (sofern Nutzer:in nicht "Privacy-No-Store" aktiviert hat)
- **Hochgeladene Dokumente:** ggf. mandantenbezogene Schriftstücke (sofern Nutzer:in das Vault-Feature nutzt)
- **Workspace-Daten:** Mitgliederliste, Rollen, Akten
- **Telemetrie:** Audit-Log, Retrieval-Log, Usage-Ledger, Rate-Limit-Log

### 2.3 Datenflüsse (Auftragsverarbeitung)
| Empfänger | Sitz | Zweck | Rechtsgrundlage |
|---|---|---|---|
| Supabase | EU (Frankfurt) | DB, Storage, Auth, Edge Functions | Art. 6 Abs. 1 lit. b + Art. 28 |
| Lovable AI Gateway | [TODO Sitz prüfen] | Routing zu LLM-Anbietern | Art. 6 Abs. 1 lit. b + Art. 28 |
| OpenRouter, LLC | USA | KI-Routing und Modellzugriff | DPF + SCCs |
| OpenAI Inc. | USA | LLM-Inference und Embeddings | DPF + SCCs |
| Firecrawl Inc. | USA | Web-Scraping öffentl. Rechtsdatenbanken | SCCs |

## 3. Notwendigkeit und Verhältnismäßigkeit

[TODO ausarbeiten — Argumentation: warum die Verarbeitung notwendig und verhältnismäßig ist; Alternativen geprüft (lokale LLMs, EU-only Provider) und verworfen wegen Qualität/Coverage.]

## 4. Risiken für Betroffene

### 4.1 Identifizierte Risiken

| # | Risiko | Eintritts-Wahrscheinlichkeit | Schadensschwere |
|---|---|---|---|
| R1 | Unbefugter Zugriff auf Mandantendaten in Chat-Verläufen | mittel | hoch |
| R2 | Datentransfer in die USA → Zugriff durch US-Behörden (Cloud Act) | mittel | hoch |
| R3 | Halluzinationen führen zu falschen Rechtsauskünften | hoch | mittel |
| R4 | LLM-Anbieter trainieren mit eingegebenen Daten | gering | hoch |
| R5 | Verletzung Anwaltsgeheimnis bei Mandantenarbeit (RAO § 9) | mittel-hoch | sehr hoch |

### 4.2 Bewertung
- Schadensschwere bemessen an Art. 35 Abs. 7 lit. c DSGVO
- Eintrittswahrscheinlichkeit auf Basis dokumentierter Maßnahmen

## 5. Schutzmaßnahmen

### 5.1 Technisch
- TLS 1.3 in Transit, AES-256 at Rest (Supabase managed)
- Row-Level Security (RLS) auf allen sensiblen Tabellen
- JWT-basierte Authentifizierung für alle Edge Functions
- Rate-Limiting (Chat: 20/min, Embed-Documents: 15/h, Pseudonymize: 10/min)
- **Auto-Pseudonymisierung im Chat (opt-in pro Nutzer)** — ersetzt Personennamen, Adressen, IBAN etc. **bevor** der Text das LLM erreicht; mitigiert R5 direkt
- **Privacy-No-Store-Modus (opt-in)** — Chat-Nachrichten werden nicht persistiert; mitigiert R1 + R2
- **Citation-Allowlist im LLM-Prompt** + RIS-Suche-Fallback statt direkter Doc-Links → mitigiert R3 strukturell
- Audit-Logs (180 Tage) für Compliance-Nachweis (AI Act Art. 12 Vorbereitung)

### 5.2 Organisatorisch
- Auftragsverarbeitungsverträge (AVV) mit allen Sub-Auftragnehmern (Status: [TODO bestätigen für jeden])
- Standardvertragsklauseln (SCCs) für US-Transfers
- Zero-Data-Retention-Konfiguration mit LLM-Providern (mitigiert R4)
- Schulung der Nutzer:innen (AI Act Art. 4 — AI Literacy)
- Disclaimer "Keine Rechtsberatung" auf jedem Output (mitigiert R3 rechtlich)

### 5.3 Rechtlich
- Datenschutzerklärung gemäß Art. 13/14 DSGVO ([TODO Platzhalter füllen])
- Impressum gemäß § 5 ECG, § 25 MedienG
- AGB mit klarer Haftungsbeschränkung
- AI Act Art. 50 Transparenzhinweis

## 6. Transfer Impact Assessment (TIA) — USA-Transfers

### 6.1 Rechtsgrundlage
- DPF (EU-US Data Privacy Framework) für DPF-zertifizierte Empfänger
- SCCs (Standardvertragsklauseln, Modul 2 — Controller-Prozessor) für alle US-Empfänger

### 6.2 Bewertung Schrems II / EuGH C-311/18
- US-Recht (FISA 702, EO 12333) bietet keinen DSGVO-äquivalenten Schutz
- Mitigation: Pseudonymisierungsoption + Privacy-No-Store + ZDR-Konfiguration → minimiert tatsächliche Datenexposition
- Sub-prozessor-Verzeichnis publiziert in Datenschutzerklärung Sektion 16

### 6.3 Ergebnis
[TODO — Schlussbewertung durch [TODO Datenschutzbeauftragte/r] und ggf. externen Datenschutzjuristen]

## 7. AI-Act-spezifische Bewertung

### 7.1 Risikoklasse
**Selbsteinschätzung:** Kein Hochrisiko-System nach Annex III Nr. 8(a), da:
- Nicht von einer "judicial authority" oder in deren Auftrag betrieben (Art. 6 Abs. 2 i.V.m. Annex III Nr. 8(a))
- Reines Recherche-/Unterstützungswerkzeug, keine autonomen rechtlichen Entscheidungen
- Human-in-the-Loop verpflichtend kommuniziert
- Confidence-Score und Quellenverifikation als zusätzliche Qualitätssicherung

**Risiko der Re-Klassifikation:** Die EU-Kommission hat 2026 weitere Guidance angekündigt. Falls Hochrisiko bestätigt, sind erforderlich:
- Risikomanagement-System (Art. 9)
- Daten-Governance-Doku (Art. 10)
- Technische Dokumentation Annex IV (Art. 11)
- Logs ≥ 6 Monate (Art. 12) — **bereits umgesetzt: 180 Tage**
- Konformitätsbewertung + CE-Marking (Art. 43, 48)
- EU-Datenbank-Registrierung (Art. 49)

**Empfehlung:** Externe Begutachtung durch Datenschutzjurist:in vor Aug 2026 zur formalen Klassifikation.

### 7.2 Transparenz (Art. 50)
- Banner "KI-Transparenzhinweis" im Chat ✓
- Disclaimer in Profil-Einstellungen + AGB ✓
- Watermarking AI-generierter Inhalte: ausstehend (Code of Practice Final Juni 2026)

## 8. Beteiligte / Konsultation

- Verantwortlicher: [TODO]
- Datenschutzbeauftragte/r: [TODO]
- Externe Beratung: [TODO ggf.]
- Aufsichtsbehörde-Konsultation: nicht erforderlich, da Restrisiken durch Maßnahmen auf akzeptables Niveau reduziert sind ([TODO bestätigen]).

## 9. Überprüfung und Aktualisierung

DSFA wird mindestens jährlich überprüft sowie ad-hoc bei:
- Substanziellen Änderungen der Verarbeitungstätigkeit
- Neuen Risiken (z.B. neue LLM-Provider, geänderte Datenflüsse)
- Behördlichen Entscheidungen (z.B. EuGH-Urteile zu Datentransfers)
- Veröffentlichung von EU-Kommissions-Guidance zum AI Act

---

## TODO-Liste vor Go-Live

- [ ] Verantwortlicher (Firmenname, Adresse, Geschäftsführung)
- [ ] Datenschutzbeauftragte/r (Name, Kontakt)
- [ ] AVV-Status pro Sub-Auftragnehmer bestätigen
- [ ] Sektion 3 (Notwendigkeit/Verhältnismäßigkeit) ausformulieren
- [ ] Sektion 6.3 Schlussbewertung TIA
- [ ] Externes Memo zur AI-Act-Hochrisiko-Klassifikation einholen
- [ ] DSFA durch Verantwortlichen unterzeichnen lassen
