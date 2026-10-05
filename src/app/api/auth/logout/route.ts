import { NextResponse, type NextRequest } from "next/server";
import { userDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  const db = await userDb();
  await db.auth.signOut();
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}
