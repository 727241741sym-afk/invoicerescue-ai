"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { sessionDb } from "@/lib/server/db";

export async function login(form: FormData) {
  const credentials = z
    .object({ email: z.email(), password: z.string().min(8).max(200) })
    .safeParse({ email: form.get("email"), password: form.get("password") });
  if (!credentials.success)
    redirect("/login?error=Enter+a+valid+email+and+password");
  const db = await sessionDb();
  const { error } = await db.auth.signInWithPassword(credentials.data);
  if (error) redirect("/login?error=Please+check+your+login+details");
  redirect("/?workspace=sandbox");
}

export async function localLogin() {
  if (
    process.env.NODE_ENV !== "development" ||
    !process.env.MERCHANT_LOGIN_EMAIL ||
    !process.env.MERCHANT_LOGIN_PASSWORD
  )
    redirect("/login");
  const db = await sessionDb();
  const { error } = await db.auth.signInWithPassword({
    email: process.env.MERCHANT_LOGIN_EMAIL,
    password: process.env.MERCHANT_LOGIN_PASSWORD,
  });
  if (error) redirect("/login?error=Local+merchant+login+failed");
  redirect("/?workspace=sandbox");
}

export async function logout() {
  const db = await sessionDb();
  await db.auth.signOut();
  redirect("/");
}
