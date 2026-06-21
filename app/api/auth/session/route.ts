import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, email } = body || {};

    const response = NextResponse.json({ success: true });

    if (userId) {
      response.cookies.set("syncwave-session", JSON.stringify({ userId, email }), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
    } else {
      response.cookies.set("syncwave-session", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
    }

    return response;
  } catch (err) {
    return NextResponse.json({ error: "Invalid session request payload" }, { status: 400 });
  }
}
