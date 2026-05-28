import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { SEOHead } from "@/components/SEOHead";

export default function DatenschutzPage() {
  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Datenschutzerklärung"
        description="Datenschutzerklärung von Legal AI. DSGVO-konforme Verarbeitung juristischer Daten auf EU-Servern. Transparente Informationen zu Datenerhebung und -verarbeitung."
        path="/datenschutz"
      />
      <div className="mx-auto max-w-3xl px-6 py-12 space-y-8">
        <Link to="/auth" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Zurück
        </Link>

        <h1 className="text-3xl font-bold tracking-tight">Datenschutzerklärung</h1>
        <p className="text-sm text-muted-foreground">Stand: März 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">

          {/* 1 — Verantwortlicher */}
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">1. Verantwortlicher</h2>
            <p>[TODO — Firmenname einfügen]<br />[TODO — Adresse einfügen]<br />E-Mail: [TODO — E-Mail einfügen]</p>
            <p>Datenschutzbeauftragte/r: [TODO — Name/Kontakt einfügen]</p>
          </section>

          {/* 2 — Erhobene Daten */}
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">2. Erhobene und verarbeitete Daten</h2>
            <p>Wir verarbeiten folgende personenbezogene Daten im Rahmen der Nutzung des Dienstes:</p>

            <h3 className="text-base font-semibold mt-4 mb-2">2.1 Kontodaten</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li>E-Mail-Adresse, Anzeigename (bei Registrierung)</li>
              <li>Authentifizierungsdaten (Passwort-Hash via bcrypt, Session-Token)</li>
              <li>Profilpräferenzen: Standardjurisdiktion, Rechtsgebiet, Antwort-Stil, benutzerdefinierte Anweisungen</li>
            </ul>

            <h3 className="text-base font-semibold mt-4 mb-2">2.2 Nutzungsdaten</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li><strong>Chat-Verläufe:</strong> Nachrichten (Fragen und KI-Antworten), Modus, Quellkonfiguration, Jurisdiktion</li>
              <li><strong>Hochgeladene Dokumente:</strong> Dateiname, MIME-Typ, Dateigröße, Speicherpfad (verschlüsselter Cloud-Storage)</li>
              <li><strong>Akten (Matters):</strong> Name, Status, zugehörige Chats, Dateien, Notizen und Tags</li>
              <li><strong>Feedback:</strong> Bewertungen (Daumen hoch/runter) zu einzelnen KI-Antworten inkl. optionalem Kommentar und Metadaten (Modell, Confidence-Score, Quellenanzahl)</li>
            </ul>

            <h3 className="text-base font-semibold mt-4 mb-2">2.3 Technische und Protokolldaten</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li><strong>Audit-Logs:</strong> Nutzer-ID, Aktion (Login, Datenexport, Kontolöschung etc.), Ressourcentyp, Zeitstempel — <em>Aufbewahrung: 180 Tage</em> (entspricht der von Art. 12 EU AI Act vorgesehenen Mindestaufbewahrungsfrist für Hochrisiko-KI-Systeme; vorsorglich umgesetzt)</li>
              <li><strong>Retrieval-Logs:</strong> Suchanfrage, genutzter Anbieter, Latenz, Top-Ergebnisse — <em>Aufbewahrung: 30 Tage</em></li>
              <li><strong>Rate-Limit-Logs:</strong> Nutzer-ID, Endpunkt, Zeitstempel — <em>Aufbewahrung: 1 Stunde</em></li>
              <li><strong>Usage-Ledger:</strong> Token-Verbrauch (Input/Output), Modell, Kostenschätzung pro Workspace — <em>Aufbewahrung: 6 Monate</em></li>
              <li><strong>Zitationsdaten:</strong> Quellenreferenzen (Titel, Aktenzeichen, URL, Fundstelle) zu einzelnen Antworten</li>
            </ul>

            <h3 className="text-base font-semibold mt-4 mb-2">2.4 Workspace-Daten</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li>Workspace-Name, Logo, Mitgliederliste mit Rollen (Owner, Admin, Member, Viewer)</li>
              <li>Einladungen: E-Mail, Rolle, Token, Ablaufdatum</li>
              <li>Abrechnungsdaten: Plan-Typ, Kontingente, Stripe-Kunden-ID (sofern vorhanden)</li>
            </ul>

            <h3 className="text-base font-semibold mt-4 mb-2">2.5 Pseudonymisierungsprotokolle</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li>Erkannte Entitäten, pseudonymisierter Text und Zuordnungstabelle — <em>Originaltexte werden nicht dauerhaft gespeichert</em></li>
            </ul>

            <h3 className="text-base font-semibold mt-4 mb-2">2.6 Vektor-Embeddings</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li>Rechtsdokumente werden in numerische Vektoren (Embeddings) umgewandelt und in der Datenbank gespeichert, um semantische Suche zu ermöglichen. Die Vektoren enthalten keine direkt lesbaren personenbezogenen Daten, können aber theoretisch Rückschlüsse auf den Ausgangstext erlauben.</li>
            </ul>
          </section>

          {/* 3 — Rechtsgrundlagen */}
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">3. Rechtsgrundlagen (Art. 6 DSGVO)</h2>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li><strong>Art. 6 Abs. 1 lit. a:</strong> Einwilligung — Bei Registrierung und Nutzung der KI-Funktionen</li>
              <li><strong>Art. 6 Abs. 1 lit. b:</strong> Vertragserfüllung — Bereitstellung des Rechtsrecherche-Dienstes, Workspace-Verwaltung</li>
              <li><strong>Art. 6 Abs. 1 lit. c:</strong> Rechtliche Verpflichtung — Aufbewahrung von Audit-Logs zur Nachweisbarkeit (Art. 5 Abs. 2 DSGVO)</li>
              <li><strong>Art. 6 Abs. 1 lit. f:</strong> Berechtigtes Interesse — Sicherheit, Missbrauchsprävention, Rate-Limiting, Qualitätsverbesserung durch Feedback</li>
            </ul>
          </section>

          {/* 4 — KI-Verarbeitung & Drittanbieter */}
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">4. KI-Verarbeitung & Drittanbieter</h2>

            <h3 className="text-base font-semibold mt-4 mb-2">4.1 KI-Modelle (via OpenRouter)</h3>
            <p className="text-sm text-muted-foreground">
              Ihre Eingaben werden über OpenRouter als technischen Vermittlungsdienst verarbeitet. Für
              juristische Antworten, Analyse, Verifikation und Dokumentenverarbeitung wird standardmäßig
              folgendes Modell genutzt:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground mt-2">
              <li><strong>OpenAI GPT-5.5 via OpenRouter</strong> — Rechtsrecherche, Analyse, Verifikation und Dokumentenverarbeitung</li>
              <li><strong>OpenAI text-embedding-3-small via OpenRouter</strong> — semantische Suche und Dokumenten-Embeddings</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-2">
              Die KI-Anbieter verarbeiten die Daten ausschließlich zur Beantwortung Ihrer Anfrage —
              <strong> keine Speicherung, kein Training</strong> mit Ihren Daten (Zero Data Retention / ZDR-Modus).
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) i.V.m. Art. 28 DSGVO (Auftragsverarbeitung).
            </p>

            <h3 className="text-base font-semibold mt-4 mb-2">4.2 Live-Rechtsrecherche (Firecrawl)</h3>
            <p className="text-sm text-muted-foreground">
              Für die Echtzeitrecherche in öffentlichen Rechtsdatenbanken (z.B. RIS, FindOK, Parlament)
              wird der Dienst <strong>Firecrawl</strong> (Firecrawl Inc., USA) eingesetzt. Dieser extrahiert ausschließlich
              öffentlich zugängliche Rechtsinhalte. Ihre Suchanfragen werden dabei als URL-Parameter übermittelt.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Es werden <strong>keine personenbezogenen Mandatsdaten</strong> an Firecrawl übermittelt — lediglich
              die Suchanfrage (Gesetzesbegriffe, Aktenzeichen, Rechtsfragen).
            </p>

            <h3 className="text-base font-semibold mt-4 mb-2">4.3 Embedding-Erzeugung</h3>
            <p className="text-sm text-muted-foreground">
              Hochgeladene Dokumente und Rechtsinhalte werden durch KI-Modelle in numerische Vektoren
              (Embeddings) umgewandelt, um semantische Suche innerhalb des Workspace zu ermöglichen.
              Diese Embeddings werden in der Datenbank gespeichert und bei Kontolöschung entfernt.
            </p>

            <h3 className="text-base font-semibold mt-4 mb-2">4.4 Internationaler Datentransfer</h3>
            <p className="text-sm text-muted-foreground">
              Die Verarbeitung kann in Rechenzentren außerhalb der EU (USA) erfolgen. Grundlage:
              EU-US Data Privacy Framework (DPF) für zertifizierte Anbieter bzw. Standardvertragsklauseln
              gem. Art. 46 Abs. 2 lit. c DSGVO. Ergänzend wurden Transfer Impact Assessments (TIA)
              unter Berücksichtigung von EuGH C-311/18 (Schrems II) durchgeführt.
            </p>
          </section>

          {/* 5 — Speicherdauer */}
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">5. Speicherdauer</h2>
            <div className="overflow-x-auto">
              <table className="text-sm text-muted-foreground w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 font-semibold text-foreground">Datenkategorie</th>
                    <th className="text-left py-2 font-semibold text-foreground">Aufbewahrungsfrist</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  <tr><td className="py-2 pr-4">Rate-Limit-Logs</td><td className="py-2">1 Stunde (automatische Löschung)</td></tr>
                  <tr><td className="py-2 pr-4">Retrieval-Logs</td><td className="py-2">30 Tage (automatische Löschung)</td></tr>
                  <tr><td className="py-2 pr-4">Audit-Logs</td><td className="py-2">180 Tage (automatische Löschung)</td></tr>
                  <tr><td className="py-2 pr-4">Usage-Ledger (Token-Verbrauch)</td><td className="py-2">6 Monate (automatische Löschung)</td></tr>
                  <tr><td className="py-2 pr-4">Chat-Verläufe</td><td className="py-2">Bis zur Löschung durch Nutzer oder Kontolöschung</td></tr>
                  <tr><td className="py-2 pr-4">Hochgeladene Dateien</td><td className="py-2">Bis zur Löschung durch Nutzer oder Kontolöschung</td></tr>
                  <tr><td className="py-2 pr-4">Kontodaten & Profil</td><td className="py-2">Bis zur Kontolöschung</td></tr>
                  <tr><td className="py-2 pr-4">Feedback-Bewertungen</td><td className="py-2">Bis zur Kontolöschung</td></tr>
                  <tr><td className="py-2 pr-4">Vektor-Embeddings</td><td className="py-2">Bis zur Löschung des Quelldokuments</td></tr>
                  <tr><td className="py-2 pr-4">Pseudonymisierungsprotokolle</td><td className="py-2">Bis zur Kontolöschung</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              Bei aktiviertem <strong>„Nicht speichern"-Modus</strong> (Privacy No-Store): Nachrichten werden nach der Sitzung gelöscht
              und nicht dauerhaft in der Datenbank gespeichert.
            </p>
          </section>

          {/* 6 — Workspace & Datenfreigabe */}
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">6. Workspace & gemeinsame Datennutzung</h2>
            <p className="text-sm text-muted-foreground">
              Der Dienst ermöglicht die Zusammenarbeit in <strong>Workspaces</strong>. Innerhalb eines Workspace
              können alle Mitglieder — je nach Rolle (Owner, Admin, Member, Viewer) — folgende Daten einsehen:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground mt-2">
              <li>Chat-Verläufe und KI-Antworten</li>
              <li>Hochgeladene Dateien und Akten</li>
              <li>Aktennotizen und Tags</li>
              <li>Analyseergebnisse und Pseudonymisierungsprotokolle</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-2">
              Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung — gemeinsame Fallbearbeitung) sowie
              Art. 6 Abs. 1 lit. a (Einwilligung durch Beitritt zum Workspace).
              Row-Level Security (RLS) stellt sicher, dass Daten <strong>nicht workspace-übergreifend</strong> zugänglich sind.
            </p>
          </section>

          {/* 7 — Dateispeicherung */}
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">7. Dateispeicherung</h2>
            <p className="text-sm text-muted-foreground">
              Hochgeladene Dokumente werden in einem <strong>verschlüsselten Cloud-Storage</strong> gespeichert
              (Verschlüsselung at Rest und in Transit). Der Zugriff ist auf authentifizierte Mitglieder des
              jeweiligen Workspace beschränkt. Metadaten (Dateiname, MIME-Typ, Größe, Upload-Zeitpunkt) werden
              in der Datenbank gespeichert.
            </p>
          </section>

          {/* 8 — Betroffenenrechte */}
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">8. Ihre Rechte (Art. 15–22 DSGVO)</h2>
            <p className="text-sm text-muted-foreground">Sie haben folgende Rechte:</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li><strong>Auskunft</strong> (Art. 15) — Welche Daten über Sie gespeichert sind</li>
              <li><strong>Berichtigung</strong> (Art. 16) — Korrektur unrichtiger Daten (über Profilseite)</li>
              <li><strong>Löschung</strong> (Art. 17) — „Recht auf Vergessenwerden" — In den Einstellungen können Sie Ihr Konto und alle zugehörigen Daten unwiderruflich löschen</li>
              <li><strong>Datenübertragbarkeit</strong> (Art. 20) — Export Ihrer Daten. <em>Hinweis: Der vollständige Datenexport als JSON wird derzeit implementiert. Aktuell können Chat-Verläufe als Markdown exportiert werden.</em></li>
              <li><strong>Widerspruch</strong> (Art. 21) — Gegen die Verarbeitung auf Basis berechtigter Interessen</li>
              <li><strong>Einschränkung</strong> (Art. 18) — Einschränkung der Verarbeitung</li>
              <li><strong>Widerruf der Einwilligung</strong> (Art. 7 Abs. 3) — Jederzeit mit Wirkung für die Zukunft</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-2">
              Kontakt: [TODO — E-Mail einfügen]. Beschwerderecht bei der zuständigen Aufsichtsbehörde
              (Datenschutzbehörde Österreich).
            </p>
          </section>

          {/* 9 — Cookies */}
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">9. Cookies & lokale Speicherung</h2>
            <p className="text-sm text-muted-foreground">
              Diese Anwendung verwendet ausschließlich <strong>funktionale Cookies</strong> für die Authentifizierung
              (Session-Token). Zusätzlich wird <code className="text-xs bg-muted px-1 py-0.5 rounded">localStorage</code> für
              folgende Zwecke genutzt:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground mt-2">
              <li>Cookie-Consent-Status</li>
              <li>Sidebar-Zustand (UI-Präferenz)</li>
              <li>Theme-Einstellung (Hell/Dunkel)</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-2">
              Es werden <strong>keine</strong> Tracking-, Analyse- oder Marketing-Cookies eingesetzt.
              Es werden keine Daten an Werbenetzwerke oder Analytics-Dienste übermittelt.
            </p>
          </section>

          {/* 10 — Pseudonymisierung */}
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">10. Pseudonymisierung</h2>
            <p className="text-sm text-muted-foreground">
              Die integrierte Pseudonymisierungsfunktion ersetzt personenbezogene Daten in Dokumenten durch Platzhalter
              (z.B. Namen, Adressen, Telefonnummern). Die Originaltexte werden <strong>nicht dauerhaft gespeichert</strong> —
              nur die pseudonymisierten Ergebnisse und die Zuordnungstabelle werden in der Datenbank protokolliert
              (Art. 32 DSGVO — technische Schutzmaßnahme). Die Pseudonymisierung wird im Audit-Log protokolliert.
            </p>
          </section>

          {/* 11 — Sicherheitsmaßnahmen */}
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">11. Sicherheitsmaßnahmen (Art. 32 DSGVO)</h2>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li>Verschlüsselung aller Daten in Transit (TLS 1.3) und at Rest (AES-256)</li>
              <li>Row-Level Security (RLS) — Nutzer sehen nur Daten ihres eigenen Workspace</li>
              <li>Workspace-Isolation — Strikte Trennung aller Daten zwischen Workspaces</li>
              <li>Authentifizierung mit Passwort-Hash (bcrypt) und E-Mail-Verifizierung</li>
              <li>JWT-basierte Autorisierung für alle API-Endpunkte (Edge Functions)</li>
              <li>Rate-Limiting — Schutz vor Missbrauch und Überlastung</li>
              <li>CORS-Konfiguration — Einschränkung auf autorisierte Domains</li>
              <li>Audit-Trail — Alle datenschutzrelevanten Aktionen werden protokolliert</li>
            </ul>
          </section>

          {/* 12 — DSFA */}
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">12. Datenschutz-Folgenabschätzung (Art. 35 DSGVO)</h2>
            <p className="text-sm text-muted-foreground">
              Die Verarbeitung personenbezogener Daten — insbesondere sensibler Mandatsdaten — durch KI-Systeme
              stellt eine Verarbeitung dar, die voraussichtlich ein <strong>hohes Risiko</strong> für die Rechte und
              Freiheiten natürlicher Personen zur Folge hat. Daher wurde eine Datenschutz-Folgenabschätzung (DSFA)
              gemäß Art. 35 DSGVO durchgeführt, die folgende Aspekte umfasst:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground mt-2">
              <li><strong>Risikobewertung:</strong> Identifikation der Risiken durch Datenübermittlung an KI-Anbieter (Drittstaatentransfer, unbefugter Zugriff)</li>
              <li><strong>Maßnahmen:</strong> Pseudonymisierungsfunktion für hochgeladene Dokumente, optionaler Privacy-No-Store-Modus (Chat-Verlauf wird nicht persistiert), TLS 1.3 in Transit und AES-256 at Rest, Auftragsverarbeitungsverträge, Standardvertragsklauseln (SCCs), AI Gateway als Vermittlungsschicht</li>
              <li><strong>Transfer Impact Assessment (TIA):</strong> Bewertung der Risiken bei Datenübermittlung in die USA unter Berücksichtigung des EU-US Data Privacy Frameworks und zusätzlicher Schutzmaßnahmen gemäß EuGH C-311/18 (Schrems II)</li>
              <li><strong>Ergebnis:</strong> Die verbleibenden Risiken sind durch die implementierten technischen und organisatorischen Maßnahmen auf ein akzeptables Niveau reduziert</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-2">
              Die DSFA wird regelmäßig überprüft und bei wesentlichen Änderungen der Verarbeitungstätigkeiten aktualisiert.
            </p>
          </section>

          {/* 13 — AVV */}
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">13. Auftragsverarbeitung (Art. 28 DSGVO)</h2>
            <p className="text-sm text-muted-foreground">
              Mit den eingesetzten Dienstleistern bestehen Auftragsverarbeitungsverträge (AVV)
              gemäß Art. 28 DSGVO:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground mt-2">
              <li><strong>KI-Anbieter</strong> (Google, OpenAI) — Verarbeitung von Anfragen über AI Gateway</li>
              <li><strong>Firecrawl Inc.</strong> — Web-Scraping öffentlicher Rechtsdatenbanken</li>
              <li><strong>Cloud-Infrastruktur</strong> — Datenbank, Dateispeicherung, Edge Functions</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-2">Die AVVs enthalten:</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground mt-1">
              <li>Weisungsgebundenheit der Anbieter</li>
              <li>Verpflichtung zur Vertraulichkeit</li>
              <li>Technische und organisatorische Maßnahmen (TOMs)</li>
              <li>Löschung der Daten nach Auftragsende</li>
              <li>Keine Nutzung der Daten zum Training der KI-Modelle</li>
            </ul>
          </section>

          {/* 14 — AI Act Transparenz */}
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">14. EU AI Act — Transparenzpflichten</h2>
            <p className="text-sm text-muted-foreground">
              Gemäß Art. 50 der Verordnung (EU) 2024/1689 (AI Act) weisen wir darauf hin, dass dieser Dienst
              KI-Systeme zur Textgenerierung einsetzt. Nutzer sind verpflichtet, Dritte (insbesondere Mandanten,
              Gerichte und Behörden) darüber zu informieren, wenn Schriftsätze, Analysen oder Gutachten
              maßgeblich KI-generiert sind. Alle Exporte und Dokumente enthalten einen entsprechenden Transparenzhinweis.
            </p>
          </section>

          {/* 15 — Hochrisiko-KI */}
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">15. Hochrisiko-KI-Einordnung (Anhang III AI Act)</h2>
            <p className="text-sm text-muted-foreground">
              Gemäß Anhang III Nr. 8 der Verordnung (EU) 2024/1689 können KI-Systeme, die in der <strong>Rechtspflege
              und in demokratischen Prozessen</strong> eingesetzt werden, als Hochrisiko-KI-Systeme eingestuft werden.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              <strong>Selbsteinschätzung:</strong> Der vorliegende Dienst ist als <strong>Rechtsrecherche-Werkzeug</strong> konzipiert,
              das Informationen aus öffentlichen Rechtsdatenbanken aufbereitet. Der Dienst:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground mt-2">
              <li>Trifft <strong>keine autonomen rechtlichen Entscheidungen</strong> — alle Ergebnisse erfordern menschliche Überprüfung</li>
              <li>Dient als <strong>Unterstützungswerkzeug</strong>, nicht als Ersatz für anwaltliche Beurteilung</li>
              <li>Enthält <strong>Transparenzhinweise</strong> in allen Ausgaben (Art. 50 AI Act)</li>
              <li>Implementiert <strong>menschliche Aufsicht</strong> (Human-in-the-Loop) — Nutzer müssen alle Ergebnisse validieren</li>
              <li>Verfügt über ein <strong>Confidence-Scoring</strong> und <strong>Quellenverifikation</strong> zur Qualitätssicherung</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-2">
              Sollte der Dienst zukünftig als Hochrisiko-KI nach Anhang III eingestuft werden, werden die erweiterten
              Anforderungen (Risikomanagementsystem, Datenqualität, technische Dokumentation, Konformitätsbewertung)
              entsprechend umgesetzt.
            </p>
          </section>

          {/* 16 — Unterauftragnehmer */}
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">16. Verzeichnis der Unterauftragnehmer</h2>
            <div className="overflow-x-auto">
              <table className="text-sm text-muted-foreground w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 font-semibold text-foreground">Anbieter</th>
                    <th className="text-left py-2 pr-4 font-semibold text-foreground">Zweck</th>
                    <th className="text-left py-2 pr-4 font-semibold text-foreground">Sitz</th>
                    <th className="text-left py-2 font-semibold text-foreground">Transfergrundlage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  <tr>
                    <td className="py-2 pr-4">OpenRouter, LLC</td>
                    <td className="py-2 pr-4">KI-Routing und Modellzugriff</td>
                    <td className="py-2 pr-4">USA</td>
                    <td className="py-2">DPF + SCCs</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">OpenAI Inc.</td>
                    <td className="py-2 pr-4">KI-Modelle und Embeddings</td>
                    <td className="py-2 pr-4">USA</td>
                    <td className="py-2">DPF + SCCs</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Firecrawl Inc.</td>
                    <td className="py-2 pr-4">Web-Scraping (Rechtsrecherche)</td>
                    <td className="py-2 pr-4">USA</td>
                    <td className="py-2">SCCs</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Cloud-Infrastruktur</td>
                    <td className="py-2 pr-4">Datenbank, Storage, Auth, Edge Functions</td>
                    <td className="py-2 pr-4">EU (Frankfurt)</td>
                    <td className="py-2">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
