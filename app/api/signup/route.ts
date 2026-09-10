import { NextRequest, NextResponse } from "next/server";
import { POST as authSignupPOST, OPTIONS as authSignupOPTIONS } from "@/app/api/auth/signup/route";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return authSignupOPTIONS();
}

export async function POST(req: NextRequest) {
  return authSignupPOST(req);
}
