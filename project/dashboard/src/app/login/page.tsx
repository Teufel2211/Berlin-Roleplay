import Link from "next/link";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-[--bg-primary] text-[--text-primary]">
      <div className="w-full max-w-md">
        <Link href="/" className="inline-flex items-center gap-2 mb-8 text-sm text-[--text-muted] hover:text-[--text-primary] transition-colors">
          ← Zurück zur Startseite
        </Link>

        <div className="rounded-2xl border border-[--border] bg-[--bg-secondary] p-8 shadow-xl">
          <h1 className="text-2xl font-bold mb-2">Dashboard Login</h1>
          <p className="text-sm text-[--text-muted] mb-6">
            Melde dich mit deinem Discord-Account an. Nur Mitglieder mit
            Staff- oder Admin-Rolle erhalten Zugriff.
          </p>

          {error ? (
            <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {loginErrorMessage(error)}
            </div>
          ) : null}

          <a
            href="/api/auth/login"
            className="w-full flex items-center justify-center gap-3 rounded-xl bg-[--accent] px-4 py-3 font-semibold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <DiscordIcon />
            Mit Discord anmelden
          </a>
        </div>
      </div>
    </main>
  );
}

function loginErrorMessage(error: string): string {
  switch (error) {
    case "missing_code":
      return "Anmeldung abgebrochen.";
    case "access_denied":
      return "Die Discord-Anmeldung wurde abgebrochen oder nicht bestätigt.";
    case "dashboard_access_denied":
      return "Dein Discord-Konto hat keine Staff- oder Admin-Berechtigung für dieses Dashboard.";
    case "invalid_oauth_state":
      return "Die Anmeldung ist abgelaufen. Bitte erneut versuchen.";
    case "callback_failed":
      return "Die Anmeldung konnte serverseitig nicht abgeschlossen werden. Bitte später erneut versuchen.";
    default:
      return "Die Anmeldung ist fehlgeschlagen. Bitte erneut versuchen.";
  }
}

function DiscordIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}
