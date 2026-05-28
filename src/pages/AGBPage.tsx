import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { SEOHead } from "@/components/SEOHead";

export default function AGBPage() {
  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Allgemeine Geschäftsbedingungen" description="AGB von Legal AI – Nutzungsbedingungen für den KI-gestützten Rechtsassistenten." path="/agb" />
      <div className="mx-auto max-w-3xl px-6 py-12 space-y-8">
        <Link to="/auth" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Zurück
        </Link>

        <h1 className="text-3xl font-bold tracking-tight">Nutzungsbedingungen (AGB)</h1>
        <p className="text-sm text-muted-foreground">Stand: März 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">1. Geltungsbereich</h2>
            <p className="text-sm text-muted-foreground">
              Diese Nutzungsbedingungen gelten für die Nutzung der KI-gestützten Rechtsrecherche-Plattform „Legal AI" 
              (nachfolgend „Dienst"). Mit der Registrierung akzeptieren Sie diese Bedingungen.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">2. Leistungsbeschreibung</h2>
            <p className="text-sm text-muted-foreground">
              Der Dienst bietet KI-gestützte juristische Recherche, Dokumentenanalyse und Texterstellung. 
              Die Ergebnisse werden unter Verwendung von Sprachmodellen (LLMs) generiert und mit Quellen aus 
              öffentlichen Rechtsdatenbanken (RIS, FindOK, Parlament) angereichert.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">3. Keine Rechtsberatung</h2>
            <p className="text-sm text-muted-foreground">
              <strong>Der Dienst stellt keine Rechtsberatung dar.</strong> Die KI-generierten Inhalte dienen 
              ausschließlich zu Informationszwecken und ersetzen nicht die Konsultation eines zugelassenen 
              Rechtsanwalts. Der Anbieter übernimmt keine Haftung für die Richtigkeit, Vollständigkeit oder 
              Aktualität der bereitgestellten Informationen.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">4. KI-generierte Inhalte und Transparenz</h2>
            <p className="text-sm text-muted-foreground">
              Alle Antworten werden durch Künstliche Intelligenz generiert und sind als solche zu behandeln. 
              Gemäß Art. 50 der Verordnung (EU) 2024/1689 (AI Act) sind Nutzer verpflichtet:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li>Dritte (insbesondere Mandanten und Gerichte) darüber zu informieren, wenn Schriftsätze, Analysen oder Gutachten maßgeblich KI-generiert sind.</li>
              <li>KI-generierte Inhalte vor der Verwendung auf Richtigkeit zu überprüfen.</li>
              <li>Die menschliche Aufsicht über alle KI-gestützten Arbeitsergebnisse sicherzustellen.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">5. Pflichten bei anwaltlicher Nutzung</h2>
            <p className="text-sm text-muted-foreground">
              Nutzer, die als Rechtsanwälte tätig sind, unterliegen der anwaltlichen Verschwiegenheitspflicht 
              (§ 9 RAO). Bei der Nutzung des Dienstes gilt:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li>Mandantendaten sind vor der Eingabe zu <strong>pseudonymisieren</strong>.</li>
              <li>Alternativ ist eine <strong>explizite, informierte Entbindung</strong> von der Verschwiegenheitspflicht durch den Mandanten einzuholen.</li>
              <li>Der integrierte <strong>Datenschutz-Modus</strong> (Privacy No-Store) sollte für sensible Mandatsdaten aktiviert werden.</li>
              <li>Ein <strong>Auftragsverarbeitungsvertrag (AVV)</strong> gemäß Art. 28 DSGVO ist für den professionellen Einsatz erforderlich.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">6. Nutzungsrechte und -beschränkungen</h2>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li>Der Dienst darf nur für rechtmäßige Zwecke genutzt werden.</li>
              <li>Eine Nutzung zur Erzeugung irreführender, betrügerischer oder rechtswidriger Inhalte ist untersagt.</li>
              <li>Automatisierte Massenanfragen (Scraping) sind ohne Genehmigung nicht gestattet.</li>
              <li>Die Weitergabe von Zugangsdaten an Dritte ist nicht gestattet.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">7. Verfügbarkeit und Haftung</h2>
            <p className="text-sm text-muted-foreground">
              Der Anbieter bemüht sich um eine hohe Verfügbarkeit, übernimmt jedoch keine Garantie. 
              Wartungsarbeiten oder Störungen können den Dienst vorübergehend einschränken. 
              Die Haftung ist auf Vorsatz und grobe Fahrlässigkeit beschränkt, soweit gesetzlich zulässig.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">8. Datenschutz</h2>
            <p className="text-sm text-muted-foreground">
              Die Verarbeitung personenbezogener Daten erfolgt gemäß unserer{" "}
              <Link to="/datenschutz" className="text-primary hover:underline">Datenschutzerklärung</Link>. 
              Die KI-Verarbeitung erfolgt über API-Gateways; die Anbieter speichern keine Nutzerdaten 
              und verwenden diese nicht zum Training.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">9. Kündigung</h2>
            <p className="text-sm text-muted-foreground">
              Sie können Ihr Konto jederzeit in den Einstellungen löschen. Bei Löschung werden alle 
              personenbezogenen Daten, Chat-Verläufe und hochgeladene Dokumente unwiderruflich entfernt 
              (Art. 17 DSGVO). Kostenpflichtige Abonnements können zum Laufzeitende gekündigt werden.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">10. Änderungen</h2>
            <p className="text-sm text-muted-foreground">
              Der Anbieter behält sich vor, diese Nutzungsbedingungen zu ändern. Wesentliche Änderungen 
              werden per E-Mail oder In-App-Benachrichtigung mitgeteilt. Die fortgesetzte Nutzung nach 
              Änderung gilt als Zustimmung.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">11. Anwendbares Recht und Gerichtsstand</h2>
            <p className="text-sm text-muted-foreground">
              Es gilt das Recht der Republik Österreich. 
              Gerichtsstand ist Wien, soweit gesetzlich zulässig.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
