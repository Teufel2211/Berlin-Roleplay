import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { SESSION_COOKIE, deleteSession } from "@/lib/session";

export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) {
    await deleteSession(token);
  }
  const res = NextResponse.redirect(`${env.appBaseUrl}/login`);
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return res;
}
