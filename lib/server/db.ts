import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function sessionDb() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(values) {
          try {
            values.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            /* Server components cannot write cookies. Route handlers refresh sessions. */
          }
        },
      },
    },
  );
}

export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function merchantContext() {
  const session = await sessionDb();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) throw new AppError("Sign in to open your Sandbox workspace.", 401);
  const db = adminDb();
  const { data, error } = await db
    .from("merchant_access")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data)
    throw new AppError(
      "This account has not been authorized for the configured Sandbox merchant.",
      403,
    );
  return { db, ownerId: user.id };
}

export function checkMutationOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.APP_URL || "http://127.0.0.1:3000")
    .origin;
  if (!origin || origin !== expected)
    throw new AppError("This request must come from the application.", 403);
}

export function apiError(error: unknown) {
  if (error instanceof AppError)
    return Response.json({ error: error.message }, { status: error.status });
  if (
    error &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "ZodError"
  )
    return Response.json(
      { error: "Please check the entered values." },
      { status: 400 },
    );
  console.error(
    "Application operation failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return Response.json(
    {
      error:
        "The operation could not be completed. Refresh its status before trying again.",
    },
    { status: 500 },
  );
}

export function assertDb(error: { message: string } | null) {
  if (error)
    throw new AppError(
      "The database could not save this operation. Refresh before trying again.",
      500,
    );
}
