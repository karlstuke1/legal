import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Download, ShieldAlert } from "lucide-react";
import jsPDF from "jspdf";

const TEMPLATE_LINES = {
  title: "ENTBINDUNG VON DER VERSCHWIEGENHEITSPFLICHT",
  sections: [
    { label: "Mandant/in:", value: "____________________________________" },
    { label: "Aktenzeichen/Sache:", value: "____________________________" },
    { label: "Datum:", value: new Date().toLocaleDateString("de-DE") },
  ],
  body: `Ich, ________________________________ (Mandant/in),

entbinde hiermit meinen Rechtsanwalt / meine Rechtsanwältin

________________________________ (Name des/der RA)

von der anwaltlichen Verschwiegenheitspflicht gemäß § 43a Abs. 2 BRAO / § 9 RAO / Art. 13 BGFA im folgenden Umfang:`,
  scope: `UMFANG DER ENTBINDUNG:
Ich bin damit einverstanden, dass im Rahmen meines Mandats folgende Daten an einen KI-gestützten Rechtsrecherche-Dienst übermittelt werden:

☐ Sachverhaltsdarstellungen (anonymisiert)
☐ Sachverhaltsdarstellungen (nicht anonymisiert)
☐ Vertragsdokumente
☐ Schriftsätze und Korrespondenz
☐ Sonstige: ____________________________________`,
  info: `AUFKLÄRUNG:
Mir wurde erläutert, dass:
• Die Daten zur Verarbeitung an OpenAI-Modelle über OpenRouter übermittelt werden
• Die Verarbeitung über OpenRouter erfolgt und die Anbieter die Daten nicht speichern oder zum Training verwenden
• Die Datenverarbeitung in Rechenzentren außerhalb der EU (USA) erfolgen kann
• Ein Auftragsverarbeitungsvertrag (Art. 28 DSGVO) mit dem Dienstanbieter besteht
• Ich diese Entbindung jederzeit widerrufen kann`,
  consent: `EINWILLIGUNG (DSGVO):
Ich willige zudem gemäß Art. 6 Abs. 1 lit. a DSGVO in die oben beschriebene Verarbeitung meiner personenbezogenen Daten ein. Mir ist bekannt, dass ich diese Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen kann.`,
  signatures: [
    "_________________________          _________________________",
    "Ort, Datum                         Unterschrift Mandant/in",
    "",
    "_________________________",
    "Unterschrift Rechtsanwalt/in",
    "(Bestätigung der Aufklärung)",
  ],
};

function downloadTemplatePDF() {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 25;
  const maxWidth = pageWidth - margin * 2;
  let y = 30;

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(TEMPLATE_LINES.title, pageWidth / 2, y, { align: "center" });
  y += 4;
  doc.setDrawColor(60);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 12;

  // Metadata fields
  doc.setFontSize(11);
  for (const s of TEMPLATE_LINES.sections) {
    doc.setFont("helvetica", "bold");
    doc.text(s.label, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(s.value, margin + 45, y);
    y += 7;
  }
  y += 6;

  // Helper to write wrapped text
  const writeBlock = (text: string, fontSize = 10, fontStyle: "normal" | "bold" = "normal") => {
    doc.setFont("helvetica", fontStyle);
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, maxWidth) as string[];
    for (const line of lines) {
      if (y > 270) { doc.addPage(); y = 25; }
      doc.text(line, margin, y);
      y += 5;
    }
    y += 3;
  };

  // Body
  writeBlock(TEMPLATE_LINES.body);

  // Scope
  const scopeLines = TEMPLATE_LINES.scope.split("\n");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(scopeLines[0], margin, y);
  y += 7;
  for (const line of scopeLines.slice(1)) {
    writeBlock(line);
  }
  y += 3;

  // Info
  const infoLines = TEMPLATE_LINES.info.split("\n");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(infoLines[0], margin, y);
  y += 7;
  for (const line of infoLines.slice(1)) {
    writeBlock(line);
  }
  y += 3;

  // Consent
  const consentLines = TEMPLATE_LINES.consent.split("\n");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(consentLines[0], margin, y);
  y += 7;
  for (const line of consentLines.slice(1)) {
    writeBlock(line);
  }
  y += 12;

  // Signatures
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  for (const line of TEMPLATE_LINES.signatures) {
    if (y > 270) { doc.addPage(); y = 25; }
    doc.text(line, margin, y);
    y += 6;
  }

  doc.save("Entbindung-Verschwiegenheitspflicht-Vorlage.pdf");
}

interface LawyerHintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LawyerHintDialog({ open, onOpenChange }: LawyerHintDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[min(calc(100vw-2rem),30rem)] rounded-2xl p-5 sm:p-6">
        <AlertDialogHeader className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <ShieldAlert className="h-4.5 w-4.5 text-primary" />
            </div>
            <AlertDialogTitle className="text-[15px] leading-snug">Verschwiegenheitspflicht</AlertDialogTitle>
          </div>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-left text-[13px] leading-relaxed text-muted-foreground">
              <p>
                Eingaben können an KI-Modelle übermittelt werden. Personenbezogene Mandantendaten sollten vorher geschützt werden.
              </p>
              <ul className="list-disc rounded-xl border border-border/35 bg-muted/25 py-3 pl-8 pr-3 space-y-2">
                <li><strong className="text-foreground/75">Pseudonymisieren</strong> vor der Eingabe</li>
                <li><strong className="text-foreground/75">Datenschutz-Modus</strong> bei sensiblen Fällen nutzen</li>
                <li><strong className="text-foreground/75">Einwilligung</strong> bei Bedarf dokumentieren</li>
              </ul>
              <p className="text-[12px] text-muted-foreground/60">
                Gilt insbesondere nach § 43a Abs. 2 BRAO, § 9 RAO, Art. 13 BGFA und Art. 50 AI Act.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-1.5 text-[12px]" onClick={downloadTemplatePDF}>
            <Download className="h-3.5 w-3.5" />
            Vorlage PDF
          </Button>
          <AlertDialogAction className="h-9 text-[13px]" onClick={() => { localStorage.setItem("lawyer_hint_dismissed", "true"); onOpenChange(false); }}>
            Verstanden
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
