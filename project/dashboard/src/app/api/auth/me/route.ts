import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, getSessionByToken } from "@/lib/session";

export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = token ? await getSessionByToken(token) : null;

  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({ user });
}
