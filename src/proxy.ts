import { nanoid } from "nanoid";
import { type NextRequest, NextResponse } from "next/server";
import { redis } from "./lib/redis";

export const proxy = async (req: NextRequest) => {
  const pathname = req.nextUrl.pathname;

  const roomMatch = pathname.match(/^\/room\/([^/]+)$/);

  if (!roomMatch) return NextResponse.redirect(new URL("/", req.url));

  const roomId = roomMatch[1];

  const meta = await redis.hgetall<{
    connected: string | string[];
    createdAt: number;
  }>(`meta:${roomId}`);

  if (!meta) {
    return NextResponse.redirect(
      new URL("/?error=room-not-found", req.url)
    );
  }

  const existingToken = req.cookies.get("x-auth-token")?.value;

  // Parse connected field (handle both JSON string and array)
  let connectedUsers: string[] = [];
  if (typeof meta.connected === "string") {
    try {
      connectedUsers = JSON.parse(meta.connected);
    } catch {
      connectedUsers = [];
    }
  } else if (Array.isArray(meta.connected)) {
    connectedUsers = meta.connected;
  }

  // USER IS ALLOWED TO JOIN THE ROOM
  if (existingToken && connectedUsers.includes(existingToken)) {
    return NextResponse.next();
  }

  // USER IS NOT ALLOWED TO JOIN THE ROOM
  if (connectedUsers.length >= 2) {
    return NextResponse.redirect(
      new URL("/?error=room-full", req.url)
    );
  }

  const response = NextResponse.next();

  const token = nanoid();

  response.cookies.set("x-auth-token", token, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });

  await redis.hset(`meta:${roomId}`, {
    connected: JSON.stringify([...connectedUsers, token]),
  });

  return response;
};

export const config = {
  matcher: "/room/:path*",
};
