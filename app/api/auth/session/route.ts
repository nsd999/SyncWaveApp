import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const accessToken =
      typeof body?.accessToken === "string" ? body.accessToken.trim() : "";

    // An empty payload is the sign-out path and only clears the app cookie.
    if (!accessToken) {
      const response = NextResponse.json({ success: true, signedOut: true });
      response.cookies.set("syncwave-session", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
      return response;
    }

    // Never trust a userId supplied by the browser. Ask Supabase to validate
    // the actual access token and derive identity from its response.
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data.user) {
      const response = NextResponse.json(
        { error: "The sign-in token could not be verified. Please sign in again." },
        { status: 401 }
      );
      response.cookies.set("syncwave-session", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
      return response;
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(
      "syncwave-session",
      JSON.stringify({
        userId: data.user.id,
        email: data.user.email || "",
      }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      }
    );

    return response;
  } catch {
    return NextResponse.json(
      { error: "Invalid session request. Please sign in again." },
      { status: 400 }
    );
  }
}
