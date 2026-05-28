import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetClose, SheetTitle } from "@/components/ui/sheet";
import { Menu } from "lucide-react";

export function NavigationHeader() {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-foreground text-background text-sm font-bold" aria-label="Legal AI Logo">L</div>
          <span className="text-[16px] font-semibold tracking-tight">Legal AI</span>
        </div>
        <span className="sr-only">Legal AI – Juristischer KI-Assistent</span>
        <nav className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-[13px] text-muted-foreground/60 hover:text-foreground transition-colors">Features</a>
          <a href="#sources" className="text-[13px] text-muted-foreground/60 hover:text-foreground transition-colors">Quellen</a>
          <a href="#preview" className="text-[13px] text-muted-foreground/60 hover:text-foreground transition-colors">Produkt</a>
          <a href="#pricing" className="text-[13px] text-muted-foreground/60 hover:text-foreground transition-colors">Preise</a>
          <a href="/blog" className="text-[13px] text-muted-foreground/60 hover:text-foreground transition-colors">Blog</a>
          <a href="#partner" className="text-[13px] text-muted-foreground/60 hover:text-foreground transition-colors">Partner</a>
        </nav>
        <div className="flex items-center gap-3">
          <Sheet>
            <SheetTrigger asChild>
              <button className="md:hidden h-9 w-9 flex items-center justify-center rounded-xl hover:bg-muted/50 transition-colors">
                <Menu className="h-5 w-5 text-foreground/60" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px] p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-foreground text-background text-sm font-bold">L</div>
                    <span className="text-[16px] font-semibold tracking-tight">Legal AI</span>
                  </div>
                </div>
                <nav className="flex flex-col gap-1 px-3 py-4">
                  {[
                    { href: "#features", label: "Features" },
                    { href: "#sources", label: "Quellen" },
                    { href: "#preview", label: "Produkt" },
                    { href: "#pricing", label: "Preise" },
                    { href: "/blog", label: "Blog" },
                    { href: "#partner", label: "Partner" },
                  ].map(link => (
                    <SheetClose asChild key={link.href}>
                      <a href={link.href} className="flex items-center px-3 py-2.5 rounded-xl text-[14px] font-medium text-foreground/70 hover:bg-muted/40 hover:text-foreground transition-colors">
                        {link.label}
                      </a>
                    </SheetClose>
                  ))}
                </nav>
                <div className="mt-auto px-4 pb-6 space-y-2">
                  <SheetClose asChild>
                    <Button variant="outline" className="w-full rounded-xl text-[13px]" onClick={() => navigate("/auth")}>Anmelden</Button>
                  </SheetClose>
                  <SheetClose asChild>
                    <Button className="w-full rounded-xl text-[13px]" onClick={() => navigate("/auth")}>Kostenlos starten</Button>
                  </SheetClose>
                </div>
              </div>
            </SheetContent>
          </Sheet>
          <Button variant="ghost" size="sm" className="hidden sm:inline-flex text-[13px] text-muted-foreground/60" onClick={() => navigate("/auth")}>Anmelden</Button>
          <Button size="sm" className="text-[13px] rounded-xl px-4" onClick={() => navigate("/auth")}>Kostenlos starten</Button>
        </div>
      </div>
    </header>
  );
}
