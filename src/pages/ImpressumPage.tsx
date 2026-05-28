import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { SEOHead } from "@/components/SEOHead";

export default function ImpressumPage() {
  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Impressum" description="Impressum von Legal AI – KI-gestützter Rechtsassistent für österreichisches Recht." path="/impressum" />
      <div className="mx-auto max-w-3xl px-6 py-12 space-y-8">
        <Link to="/auth" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Zurück
        </Link>

        <h1 className="text-3xl font-bold tracking-tight">Impressum</h1>
        <p className="text-sm text-muted-foreground">Angaben gemäß § 5 DDG / § 25 MedienG / Art. 3 UWG-CH</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">Anbieter</h2>
            <p>
              [Firmenname einfügen]<br />
              [Rechtsform einfügen]<br />
              [Straße und Hausnummer]<br />
              [PLZ Ort, Land]
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">Kontakt</h2>
            <p>
              Telefon: [Telefonnummer einfügen]<br />
              E-Mail: [E-Mail einfügen]
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">Vertretungsberechtigte Person(en)</h2>
            <p>[Name(n) einfügen]</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">Registereintrag</h2>
            <p>
              Registergericht: [Gericht einfügen]<br />
              Registernummer: [Nummer einfügen]
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">Umsatzsteuer-ID</h2>
            <p>USt-IdNr.: [Nummer einfügen]</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">Verantwortlich für den Inhalt</h2>
            <p>[Name einfügen], [Adresse einfügen]</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">Haftungshinweis</h2>
            <p className="text-sm text-muted-foreground">
              Die KI-gestützten Rechtsauskünfte dieser Anwendung stellen <strong>keine Rechtsberatung</strong> dar 
              und ersetzen nicht die Konsultation eines zugelassenen Rechtsanwalts. Trotz sorgfältiger Quellenarbeit 
              übernehmen wir keine Gewähr für die Richtigkeit, Vollständigkeit und Aktualität der bereitgestellten Informationen.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">Streitbeilegung</h2>
            <p className="text-sm text-muted-foreground">
              Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{" "}
              <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                https://ec.europa.eu/consumers/odr
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
