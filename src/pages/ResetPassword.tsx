import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase-safe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { ArrowRight, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check for recovery token in URL hash
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setIsRecovery(true);
    }

    // Listen for PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Fehler", description: "Die Passwörter stimmen nicht überein.", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Fehler", description: "Das Passwort muss mindestens 6 Zeichen lang sein.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      toast({ title: "Passwort geändert", description: "Ihr Passwort wurde erfolgreich zurückgesetzt." });
      setTimeout(() => navigate("/app/chat"), 2000);
    } catch (error: any) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left panel */}
      <div className="hidden lg:flex lg:flex-1 lg:flex-col lg:justify-between bg-foreground p-12">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background/10 text-background text-sm font-bold">
            L
          </div>
          <span className="text-lg font-semibold text-background tracking-tight">Legal AI</span>
        </div>
        <div className="space-y-4">
          <h1 className="text-4xl font-bold text-background leading-tight tracking-tight">
            Neues Passwort<br />festlegen.
          </h1>
          <p className="text-background/50 text-lg max-w-md leading-relaxed">
            Wählen Sie ein sicheres Passwort für Ihr Konto.
          </p>
        </div>
        <div />
      </div>

      {/* Right panel */}
      <div className="flex flex-1 items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="w-full max-w-sm"
        >
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground text-background text-sm font-bold">
              L
            </div>
            <span className="text-lg font-semibold tracking-tight">Legal AI</span>
          </div>

          {success ? (
            <div className="text-center space-y-4">
              <div className="mx-auto h-14 w-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">Passwort geändert</h2>
              <p className="text-sm text-muted-foreground">Sie werden in Kürze weitergeleitet…</p>
            </div>
          ) : (
            <>
              <div className="space-y-2 mb-8">
                <h2 className="text-2xl font-semibold tracking-tight">Neues Passwort</h2>
                <p className="text-sm text-muted-foreground">
                  {isRecovery
                    ? "Geben Sie Ihr neues Passwort ein."
                    : "Bitte öffnen Sie den Link aus Ihrer E-Mail, um Ihr Passwort zurückzusetzen."}
                </p>
              </div>

              {isRecovery && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Neues Passwort</label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        className="h-11 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Passwort bestätigen</label>
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      className="h-11"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-11 font-medium bg-foreground text-background hover:bg-foreground/90"
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                        Laden...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        Passwort speichern
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    )}
                  </Button>
                </form>
              )}
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
