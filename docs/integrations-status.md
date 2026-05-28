# Integrations & Quellen — Status-Recap

**Stand:** 28.05.2026
**Scope:** AT-only-Phase. DE/CH/Kommentar-Lizenzen sind explizit out-of-scope, kommen nach Inkorporation.

## Provider-Übersicht

| Provider | Inhalt | URL-Sicherheit | Inline-Linking | Status |
|---|---|---|---|---|
| **RIS** | AT Bundesnormen, Landesnormen, Judikatur | 🟢 Suchfallback statt Gesetzesnummer-Raten | ✓ §/BGBl; harte Rechtsprechungs-IDs nur source-backed | 🟢 stabil |
| **FINDOK** | BMF Steuer-Richtlinien, BFG-Erkenntnisse | 🟢 Sanitizer für 5 Session-Token-Patterns | (kein dedizierter Pattern — Quellenpanel reicht) | 🟢 stabil |
| **EUR-Lex** | EU-Verordnungen, Richtlinien, Entscheidungen | 🟢 SPARQL-Fallback ersetzt RDF-URIs durch Search-URLs | harte CELEX/ECLI-Links nur source-backed | 🟢 stabil |
| **CURIA** | EuGH-/EuG-Rechtsprechung | 🟢 Stabile case-search-Endpoints | C-/T-Cases nur source-backed | 🟢 stabil |
| **PARLAMENT** | Materialien, Initiativanträge, Anfragen | 🟢 Sanitizer für Java-Session-Tokens | (kein Pattern — Quellenpanel) | 🟢 stabil |
| **GII** | Deutsches Bundesrecht | 🟡 — keine Sanitizer, aber stabile Slug-URLs | ✗ kein Inline-Linking | 🟡 für AT-Phase ausreichend |

## Was wir fixed haben — chronologisch

### URL-Reliability
1. **PR #8 — Stop rendering broken links.** Halluzinations-Schutz im Citation-Engine, Mid-Stream-Cutoff-Notice, Such-Fallback statt direkter URL für unverifizierte Case-Refs.
2. **PR #9 — Strict-AZ-Match.** `findSourceUrl` baut keinen Cross-Attribution-Link mehr (keine Verwechslung zwischen ähnlichen Aktenzeichen).
3. **PR #11 — Harvey-Style Layout.** Quellen permanent rechts sichtbar (sticky), keine doppelte Anzeige.
4. **PR #14 — Welcome-Screen-Gate.** Quellen-Panel nur sichtbar wenn aktiver Chat.
5. **PR #15 — Tooltip-Crash-Fix + JSX-Undef-Guard.** Strukturelle Test-Klasse gegen "X is not defined"-Bugs.
6. **PR #16 — Stop guessing Gesetzesnummern.** Hardcodiertes Mapping wird nicht mehr für URL-Bau verwendet (war Quelle des "AngG-zeigt-auf-Sozialversicherungs-Konvention"-Bugs).

### Provider-Sweep
7. **PR #17 — Provider-wide reliability.** FINDOK-Sanitizer auf 5 Token-Patterns erweitert, EUR-Lex SPARQL-Fallback ersetzt RDF-URIs durch Search-URLs, CELEX + ECJ-Cases inline-verlinkt.
8. **PR #18 — PARLAMENT + AT-spezifisch.** PARLAMENT-Sanitizer (5 Patterns) parallel zu FINDOK, BGBl-Referenzen inline-verlinkt (`BGBl. I Nr. 60/2014` → RIS BgblAuth direkter URL), AT/EU-ECLI inline-verlinkt.

### Anti-Halluzination
- **Harvey-style `[Quelle N]`-Architektur** (`chat/numbered-sources.ts`): Der LLM-Prompt sieht keine RS-Nummern, GZ, ECLI, CELEX oder URLs mehr. Das Backend emittiert `source_map` inklusive `doc_ref` nur für den Scrubber.
- **`citation-allowlist.ts` ist Legacy**: Tests bleiben als Regressionen, aber der Live-Prompt verwendet die nummerierte Quellenarchitektur.
- **OpenRouter für alle Modell-Calls**: Chat-Finalantworten, Tool-Routing, Retrieval-Planung/Reranking, Verify, Dokumentanalyse, Risk Reports, Vertragsvergleich, Pseudonymisierung, Titel, Kontext-Zusammenfassungen und Embeddings laufen über OpenRouter. Nicht-Embedding-Aufgaben verwenden `openai/gpt-5.5` mit low reasoning; Embeddings verwenden `openai/text-embedding-3-small`.
- **Deterministische Exact-Norm-Seeding-Logik**: Explizite `§`-/`Paragraf`-Fragen holen vor der LLM-Toolwahl eine verifizierte RIS-Normquelle und setzen sie in die nummerierte Quellenliste.
- **Persistierte Quellenmetadaten**: Assistant-Messages speichern ihre verwendeten Source-Groups im JSON-Content, damit Reloads/historische Chats die verifizierten Quellen für Inline-Links und Quellenpanel behalten.
- **`verify-answer` Edge Function**: blockierender Pre-Persist-Faktencheck mit strict JSON schema und optionalem `repaired_text`.
- **Citation-Engine** (`src/lib/citation-engine.ts`): regex-basierte Extraktion + Strict-Verification gegen Retrieval-Sources. `fabricatedSuspects` werden im Confidence-Score abgewertet.
- **Truncation-Notice** (`chat/truncation-notice.ts`): Stream-Cutoffs werden mit konkreter Ursache (length / safety / connection / unknown) als Callout angezeigt statt mitten im Wort abzubrechen.

## Was offen ist — AT-Phase

### Hochpriorität
- [ ] **Multi-Query-Expansion in Retrieval.** Aktuell läuft pro User-Frage 1-3 Sub-Queries. Auf 5-8 erweitern mit synonymen Suchstrategien (z.B. "Kündigung" → AngG + ABGB + OGH-Judikatur + OLG-Judikatur).
- [ ] **Re-Ranking nach Retrieval.** Cross-Encoder oder LLM-Score auf Top-30-Treffer, Top-K filtern. Bringt Antwort-Präzision messbar nach oben.
- [ ] **Antwort-Struktur härten** im System-Prompt: Anspruchsgrundlage → Tatbestandsmerkmale → Rechtsfolgen → Beweislast → Praxis-Hinweis. Heute lose Struktur.
- [ ] **Citation-Density-Zwang** im Prompt: jeder rechtliche Satz braucht Beleg, sonst gestrichen.

### Mittelpriorität
- [ ] **VfGH-Slg-Nummern** als eigenes Inline-Pattern (heute mit OGH/VwGH in einem Topf).
- [ ] **Bundesländer-Landesnormen** explizit als Provider-Sub-Branch in RIS-Retrieval.
- [ ] **Erlässe & Verwaltungsrichtlinien** auf bmf.gv.at, sozialministerium.at: zusätzliche Free-Source-Erweiterung.

### Niedrigpriorität (AT-Phase)
- [ ] **Watermarking AI-Output** (AI Act Art. 50 — Code of Practice final ab Juni 2026)
- [ ] **`LAW_GESETZESNUMMER` validieren** — wird nur noch für Display-Labels verwendet, kein URL-Risiko mehr; Validation ist Hygiene.

### Out-of-Scope für AT-Phase (kommt mit DE/CH-Expansion)
- BGB / BGH-Inline-Linking via GII
- Schweizer Recht (BGE/BGer)
- Manz / RDB / Beck-Online (lizenzpflichtig)

## Anti-Bug-Test-Suite

Strukturelle Regressions-Guards im `src/test`-Ordner. Jede Bug-Klasse, die wir gefixt haben, hat einen Test der die Lösung in die Codebase einbrennt:

- `chat-page-gates.test.ts` — Sources-Panel-Sichtbarkeit über vier UI-Zustände
- `sources-panel-imports.test.ts` — JSX-Undef-Guard für SourcesPanel (Tooltip-Crash-Klasse)
- `truncation-notice.test.ts` + Doppel-Notice-Source-Scan im chat/index.ts
- `embed-documents-guardrails.test.ts` — Rate-Limit + Service-Role-Auth bleiben verdrahtet
- `findok-url.test.ts` — 5 Session-Token-Patterns + False-Positive-Guard
- `parlament-url.test.ts` — gleiches Pattern für PARLAMENT
- `preprocess-content.test.ts` — End-to-End-Citation-Rewriting für alle Patterns (RS, OGH, §, BGBl, ECLI, CELEX, ECJ-Case)
- `citation-engine.test.ts` — Citation-Extraction + Verification + Fabrication-Detection
- `citation-allowlist.test.ts` — Allowlist-Block-Generation
- `source-label.test.ts` — Display-Name-Formatierung

**Aktuell: 140 Tests, alle grün.**
