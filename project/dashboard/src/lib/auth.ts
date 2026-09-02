import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, getSessionByToken, type SessionUser } from "./session";

/**
 * Gibt die aktuelle Session zurueck oder `null` wenn nicht eingeloggt.
 * Wird in Server-Komponenten/Route-Handlern verwendet.
 */
export async function requireAuth(): Promise<SessionUser> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = token ? await getSessionByToken(token) : null;
  if (!user) redirect("/login");
  return user;
}
