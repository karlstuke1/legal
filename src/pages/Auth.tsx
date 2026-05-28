import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase-safe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { ArrowRight, Eye, EyeOff, ArrowLeft, Scale, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Checkbox } from "@/components/ui/checkbox";
import { Link, useSearchParams } from "react-router-dom";
import { storeReferralCode, getStoredReferralCode, trackReferral } from "@/lib/referral-api";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [consent, setConsent] = useState(false);
  const [signUpSuccess, setSignUpSuccess] = useState(false);
  const [searchParams] = useSearchParams();

  // Store referral code from URL
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      storeReferralCode(ref);
    }
  }, [searchParams]);

  // Track referral after successful signup
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === "SIGNED_IN") {
        const refCode = getStoredReferralCode();
        if (refCode) {
          try {
            await trackReferral(refCode);
          } catch {}
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName.trim() },
          },
        });
        if (error) throw error;
        setSignUpSuccess(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error: any) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:flex-1 lg:flex-col lg:justify-between bg-foreground p-14 relative overflow-hidden">
        {/* Subtle gradient orbs */}
        <div className="absolute inset-0 opacity-[0.04]">
          <div className="absolute top-[20%] left-[30%] w-[500px] h-[500px] rounded-full bg-primary-foreground blur-[120px]" />
          <div className="absolute bottom-[10%] right-[20%] w-[400px] h-[400px] rounded-full bg-primary-foreground blur-[100px]" />
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-foreground/10 backdrop-blur-sm">
            <Scale className="h-5 w-5 text-primary-foreground/80" />
          </div>
          <span className="text-lg font-semibold text-primary-foreground tracking-tight">Legal AI</span>
        </div>

        <div className="relative z-10 space-y-6">
          <h1 className="text-[42px] font-bold text-primary-foreground leading-[1.1] tracking-tight">
            Juristische<br />Recherche.<br />
            <span className="text-primary-foreground/40">Präzise. Schnell.</span>
          </h1>
          <p className="text-primary-foreground/35 text-base max-w-sm leading-relaxed">
            KI-gestützte Rechtsrecherche für österreichisches Recht — mit Zugriff auf offizielle Datenbanken.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-8">
          {["RIS", "FindOK", "Parlament"].map(src => (
            <span key={src} className="text-primary-foreground/20 text-xs font-medium tracking-wide uppercase">{src}</span>
          ))}
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 items-center justify-center px-6 lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-full max-w-[380px]"
        >
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground">
              <Scale className="h-5 w-5 text-background" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Legal AI</span>
          </div>

          <AnimatePresence mode="wait">
            {signUpSuccess ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className="text-center space-y-6"
              >
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <CheckCircle2 className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-[28px] font-bold tracking-tight">E-Mail bestätigen</h2>
                  <p className="text-[14px] text-muted-foreground leading-relaxed">
                    Wir haben eine Bestätigungs-E-Mail an <span className="font-semibold text-foreground">{email}</span> gesendet.
                    Bitte klicken Sie auf den Link in der E-Mail, um Ihr Konto zu aktivieren.
                  </p>
                </div>
                <div className="pt-2 space-y-3">
                  <p className="text-[12px] text-muted-foreground/50">
                    Keine E-Mail erhalten? Prüfen Sie Ihren Spam-Ordner.
                  </p>
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => { setSignUpSuccess(false); setIsSignUp(false); }}
                  >
                    Zurück zum Login
                  </Button>
                </div>
              </motion.div>
            ) : (
            <motion.div
              key={isSignUp ? "signup" : "login"}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.25 }}
            >
              <div className="space-y-1.5 mb-8">
                <h2 className="text-[28px] font-bold tracking-tight">
                  {isSignUp ? "Konto erstellen" : "Willkommen zurück"}
                </h2>
                <p className="text-[14px] text-muted-foreground/50">
                  {isSignUp ? "Erstellen Sie ein Konto, um loszulegen." : "Melden Sie sich an, um fortzufahren."}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {isSignUp && (
                  <div className="space-y-2">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">Vollständiger Name</label>
                    <Input
                      type="text"
                      placeholder="Max Mustermann"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      autoComplete="name"
                      className="h-12 rounded-xl border-border/50 bg-card/50 text-[14px] placeholder:text-muted-foreground/25 focus:border-foreground/20 focus:ring-foreground/5 transition-all"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">E-Mail</label>
                  <Input
                    type="email"
                    placeholder="name@kanzlei.de"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="h-12 rounded-xl border-border/50 bg-card/50 text-[14px] placeholder:text-muted-foreground/25 focus:border-foreground/20 focus:ring-foreground/5 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">Passwort</label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete={isSignUp ? "new-password" : "current-password"}
                      className="h-12 rounded-xl border-border/50 bg-card/50 text-[14px] pr-11 placeholder:text-muted-foreground/25 focus:border-foreground/20 focus:ring-foreground/5 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {isSignUp && (
                  <div className="flex items-start gap-2.5">
                    <Checkbox
                      id="consent"
                      checked={consent}
                      onCheckedChange={(v) => setConsent(v === true)}
                      className="mt-0.5"
                    />
                    <label htmlFor="consent" className="text-[12px] text-muted-foreground/60 leading-relaxed cursor-pointer">
                      Ich habe die{" "}
                      <Link to="/datenschutz" className="text-foreground hover:underline" target="_blank">
                        Datenschutzerklärung
                      </Link>{" "}
                      gelesen und akzeptiere die{" "}
                      <Link to="/agb" className="text-foreground hover:underline" target="_blank">
                        Nutzungsbedingungen
                      </Link>.
                    </label>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-12 font-semibold text-[14px] bg-foreground text-background hover:bg-foreground/90 rounded-xl shadow-none transition-all active:scale-[0.98]"
                  disabled={loading || (isSignUp && !consent)}
                >
                  {loading ? (
                    <span className="flex items-center gap-2.5">
                      <span className="h-4 w-4 border-[1.5px] border-background/20 border-t-background rounded-full animate-spin" />
                      <span>Laden...</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      {isSignUp ? "Registrieren" : "Anmelden"}
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  )}
                </Button>
              </form>

              {/* Divider */}
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-border/40" />
                <span className="text-[11px] font-medium text-muted-foreground/40 uppercase tracking-wider">oder</span>
                <div className="flex-1 h-px bg-border/40" />
              </div>

              {/* Google Sign-In */}
              <Button
                type="button"
                variant="outline"
                className="w-full h-12 rounded-xl border-border/50 bg-card/50 text-[14px] font-medium hover:bg-accent/50 transition-all active:scale-[0.98] disabled:opacity-40"
                disabled={loading || (isSignUp && !consent)}
                onClick={async () => {
                  if (isSignUp && !consent) {
                    toast({ title: "Einwilligung erforderlich", description: "Bitte akzeptieren Sie die Datenschutzerklärung und Nutzungsbedingungen.", variant: "destructive" });
                    return;
                  }
                  setLoading(true);
                  try {
                    const { error } = await supabase.auth.signInWithOAuth({
                      provider: "google",
                      options: {
                        redirectTo: window.location.origin,
                      },
                    });
                    if (error) throw error;
                  } catch (error: any) {
                    toast({ title: "Fehler", description: error.message, variant: "destructive" });
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Mit Google {isSignUp ? "registrieren" : "anmelden"}
              </Button>
              {isSignUp && !consent && (
                <p className="text-[11px] text-muted-foreground/40 text-center mt-2">
                  Bitte akzeptieren Sie zuerst die Datenschutzerklärung und Nutzungsbedingungen.
                </p>
              )}
            </motion.div>
            )}
          </AnimatePresence>

          {/* Forgot password link */}
          {!isSignUp && !forgotMode && (
            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => { setForgotMode(true); setForgotEmail(email); }}
                className="text-[13px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
              >
                Passwort vergessen?
              </button>
            </div>
          )}

          {/* Forgot password panel */}
          <AnimatePresence>
            {forgotMode && !forgotSent && (
              <motion.div
                initial={{ opacity: 0, y: 10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                transition={{ duration: 0.3 }}
                className="mt-6 overflow-hidden"
              >
                <div className="p-5 rounded-2xl border border-border/40 bg-card/40 glass-subtle space-y-4">
                  <div className="flex items-center gap-2.5">
                    <button type="button" onClick={() => setForgotMode(false)} className="text-muted-foreground/40 hover:text-foreground transition-colors">
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <h3 className="text-[14px] font-semibold">Passwort zurücksetzen</h3>
                  </div>
                  <p className="text-[12px] text-muted-foreground/40 leading-relaxed">
                    Geben Sie Ihre E-Mail-Adresse ein. Sie erhalten einen Link zum Zurücksetzen.
                  </p>
                  <Input
                    type="email"
                    placeholder="name@kanzlei.de"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="h-12 rounded-xl border-border/50 bg-card/50 text-[14px] placeholder:text-muted-foreground/25"
                  />
                  <Button
                    className="w-full h-12 font-semibold text-[14px] bg-foreground text-background hover:bg-foreground/90 rounded-xl shadow-none"
                    disabled={loading || !forgotEmail}
                    onClick={async () => {
                      setLoading(true);
                      try {
                        const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
                          redirectTo: `${window.location.origin}/reset-password`,
                        });
                        if (error) throw error;
                        setForgotSent(true);
                        toast({ title: "E-Mail gesendet", description: "Prüfen Sie Ihr Postfach." });
                      } catch (error: any) {
                        toast({ title: "Fehler", description: error.message, variant: "destructive" });
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    {loading ? "Senden..." : "Link senden"}
                  </Button>
                </div>
              </motion.div>
            )}

            {forgotSent && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-6 p-6 rounded-2xl border border-border/40 bg-card/40 glass-subtle text-center space-y-3"
              >
                <div className="mx-auto h-11 w-11 rounded-full bg-emerald-500/8 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-[14px] font-semibold">E-Mail gesendet</p>
                <p className="text-[12px] text-muted-foreground/40 leading-relaxed">
                  Prüfen Sie Ihr Postfach und klicken Sie auf den Link zum Zurücksetzen.
                </p>
                <button
                  type="button"
                  onClick={() => { setForgotMode(false); setForgotSent(false); }}
                  className="text-[12px] text-muted-foreground/40 hover:text-foreground transition-colors"
                >
                  Zurück zur Anmeldung
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Toggle signup/login */}
          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={() => { setIsSignUp(!isSignUp); setForgotMode(false); setForgotSent(false); setConsent(false); }}
              className="text-[13px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
            >
              {isSignUp ? (
                <>Bereits registriert? <span className="text-foreground font-medium">Anmelden</span></>
              ) : (
                <>Noch kein Konto? <span className="text-foreground font-medium">Registrieren</span></>
              )}
            </button>
          </div>

          {/* Legal links */}
          <div className="mt-6 flex items-center justify-center gap-4 text-[11px] text-muted-foreground/30">
            <Link to="/datenschutz" className="hover:text-muted-foreground/60 transition-colors">Datenschutz</Link>
            <span>·</span>
            <Link to="/impressum" className="hover:text-muted-foreground/60 transition-colors">Impressum</Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
