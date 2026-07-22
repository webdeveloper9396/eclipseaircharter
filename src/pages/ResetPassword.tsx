import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle, ArrowLeft } from "lucide-react";
import { validatePassword, PASSWORD_REQUIREMENTS_TEXT } from "@/lib/password-validation";

const PASSWORD_RECOVERY_STORAGE_KEY = "oneway_password_recovery_in_progress";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mode, setMode] = useState<"request" | "reset">("request");

  useEffect(() => {
    // Supabase recovery links arrive in one of three shapes:
    // 1) Hash fragment: #access_token=...&type=recovery (implicit flow)
    // 2) Query string: ?code=... (PKCE flow) — must be exchanged for a session
    // 3) Query string: ?type=recovery&access_token=... (legacy)
    // In all cases, supabase-js fires an onAuthStateChange "PASSWORD_RECOVERY" event.
    const hash = window.location.hash.startsWith("#")
      ? new URLSearchParams(window.location.hash.slice(1))
      : null;
    const hashType = hash?.get("type");
    const hashToken = hash?.get("access_token");
    const queryType = searchParams.get("type");
    const queryToken = searchParams.get("access_token");
    const code = searchParams.get("code");

    const hasRecoveryFlag = sessionStorage.getItem(PASSWORD_RECOVERY_STORAGE_KEY) === "true";

    if (
      (hashType === "recovery" && hashToken) ||
      (queryType === "recovery" && queryToken) ||
      code ||
      hasRecoveryFlag
    ) {
      setMode("reset");
      setError(null);
    }

    if (code) {
      supabase.auth.exchangeCodeForSession(code).catch(() => {
        setError("This reset link is invalid or has expired. Please request a new one.");
      });
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        sessionStorage.setItem(PASSWORD_RECOVERY_STORAGE_KEY, "true");
        setMode("reset");
        setError(null);
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [searchParams]);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        setError(error.message);
        return;
      }

      setSuccess("Check your email for a password reset link");
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setError(passwordError);
      setIsLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setError(error.message);
        return;
      }

      sessionStorage.removeItem(PASSWORD_RECOVERY_STORAGE_KEY);
      setSuccess("Password updated successfully");
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm border-border bg-card">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl font-semibold text-foreground">
            {mode === "request" ? "Reset Password" : "Set New Password"}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {mode === "request"
              ? "Enter your email to receive a reset link"
              : "Enter your new password below"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "request" ? (
            <form onSubmit={handleRequestReset} className="space-y-4">
              {error && (
                <Alert variant="destructive" className="border-destructive/50">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert className="border-primary/50 bg-primary/10">
                  <CheckCircle className="h-4 w-4 text-primary" />
                  <AlertDescription className="text-foreground">{success}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  className="bg-background border-input"
                />
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Reset Link"
                )}
              </Button>

              <div className="text-center">
                <Link
                  to="/login"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Back to login
                </Link>
              </div>
            </form>
          ) : (
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              {error && (
                <Alert variant="destructive" className="border-destructive/50">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert className="border-primary/50 bg-primary/10">
                  <CheckCircle className="h-4 w-4 text-primary" />
                  <AlertDescription className="text-foreground">{success}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-foreground">
                  New Password
                </Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="bg-background border-input"
                />
                <p className="text-xs text-muted-foreground">{PASSWORD_REQUIREMENTS_TEXT}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-foreground">
                  Confirm Password
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="bg-background border-input"
                />
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Password"
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
