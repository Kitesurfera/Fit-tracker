import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { auth } from "@/auth";
import { collections, type UserDoc } from "@/lib/db";
import { isValidTimeZone, todayIn, type ISODate } from "@/lib/dates";

/** Usuaria con sesión iniciada (o null). Se memoriza durante la petición. */
export const getCurrentUser = cache(async (): Promise<UserDoc | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id || !ObjectId.isValid(id)) return null;
  const { users } = await collections();
  return users.findOne({ _id: new ObjectId(id) });
});

export async function requireUser(): Promise<UserDoc> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  return user;
}

export const DEFAULT_TIMEZONE = "Europe/Madrid";

export async function getTimeZone(): Promise<string> {
  const tz = (await cookies()).get("tz")?.value;
  return tz && isValidTimeZone(tz) ? tz : DEFAULT_TIMEZONE;
}

/** "Hoy" en la zona horaria del navegador de quien mira (guardada en una cookie). */
export async function getToday(): Promise<ISODate> {
  return todayIn(await getTimeZone());
}
