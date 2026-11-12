import { connection } from "next/server";
import { getAuth } from "@/lib/auth";

// The auth library's own routes (sign-in, callback, session, sign-out). Request time only.
export async function GET(req: Request) {
  await connection();
  return getAuth().handler(req);
}
export async function POST(req: Request) {
  await connection();
  return getAuth().handler(req);
}
