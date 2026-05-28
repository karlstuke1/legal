import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase-safe";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Building2, ArrowRight, Eye, EyeOff } from "lucide-react";

interface InviteData {
  workspace_name: string;
  email: string;
  role: string;
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  // Signup form state
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signingUp, setSigningUp] = useState(false);

  useEffect(() => {
    if (!token) return;
    validateToken();
  }, [token]);

  const validateToken = async () => {
    try {
      const res = await supabase.functions.invoke("invite-member", {
        body: { action: "validate", token },
      });
      if (res.error) throw res.error;
      setInviteData(res.data);
    } catch (e: any) {
      setError(e.message || "Einladung ungültig oder abgelaufen.");
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    try {
      const res = await supabase.functions.invoke("invite-member", {
        body: { action: "accept", token },
      });
      if (res.error) throw res.error;
      toast({ title: "Beigetreten!", description: `Sie sind jetzt Mitglied von ${inviteData?.workspace_name}.` });
      navigate("/app/chat");
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setAccepting(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteData) return;
    setSigningUp(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: inviteData.email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/invite/${token}`,
          data: { full_name: name },
        },
      });
      if (error) throw error;
      toast({
        title: "Konto erstellt",
        description: "Bitte bestätigen Sie Ihre E-Mail, dann können Sie der Einladung folgen.",
      });
    } catch (error: any) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } finally {
      setSigningUp(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Einladung ungültig</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button variant="outline" onClick={() => navigate("/auth")}>
              Zur Anmeldung
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <Card className="border-border/60 shadow-lg">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 mb-3">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-xl">Einladung zu {inviteData?.workspace_name}</CardTitle>
            <CardDescription>
              Sie wurden als <strong>{inviteData?.role === "admin" ? "Admin" : inviteData?.role === "viewer" ? "Betrachter" : "Mitglied"}</strong> eingeladen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {user ? (
              // Logged-in user: just accept
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground text-center">
                  Angemeldet als <strong>{user.email}</strong>
                </p>
                <Button onClick={handleAccept} disabled={accepting} className="w-full h-11">
                  {accepting ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      Beitreten…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Beitreten
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  )}
                </Button>
              </div>
            ) : (
              // New user: signup form
              <form onSubmit={handleSignup} className="space-y-4">
                <p className="text-sm text-muted-foreground text-center">
                  Erstellen Sie ein Konto, um beizutreten.
                </p>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Name</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ihr Name"
                    required
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">E-Mail</label>
                  <Input
                    value={inviteData?.email || ""}
                    disabled
                    className="h-10 text-muted-foreground"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Passwort</label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="h-10 pr-10"
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
                <Button type="submit" className="w-full h-11" disabled={signingUp}>
                  {signingUp ? "Registrieren…" : (
                    <span className="flex items-center gap-2">
                      Registrieren & Beitreten
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  )}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Bereits registriert?{" "}
                  <button
                    type="button"
                    className="text-foreground font-medium hover:underline"
                    onClick={() => navigate("/auth")}
                  >
                    Anmelden
                  </button>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
