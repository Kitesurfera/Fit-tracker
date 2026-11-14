"use server";

import { ObjectId, MongoServerError } from "mongodb";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { collections, type UserDoc } from "@/lib/db";
import { checkPeriod, computeStats, type PeriodInput } from "@/lib/cycle";
import { CARINOS, FLOWS, INVITE_DAYS, MOODS, SETTINGS_RANGE, SYMPTOMS, type FlowId, type MoodId, type SymptomId } from "@/lib/constants";
import { isISODate, type ISODate } from "@/lib/dates";
import { getPartnerDoc } from "@/lib/data";
import { newInviteCode, normalizeInviteCode } from "@/lib/invite";
import { getToday, requireUser } from "@/lib/session";

// Todas las acciones vuelven a comprobar la sesión y solo tocan datos de la usuaria actual.

export type ActionState = { error?: string; message?: string } | null;

function refreshAll() {
  revalidatePath("/", "layout");
}

function toDate(value: FormDataEntryValue | null): ISODate | null {
  return isISODate(value) ? value : null;
}

function toObjectId(value: FormDataEntryValue | null): ObjectId | null {
  return typeof value === "string" && ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function isDuplicateKey(err: unknown): boolean {
  return err instanceof MongoServerError && err.code === 11000;
}

async function myPeriods(user: UserDoc): Promise<PeriodInput[]> {
  const { periods } = await collections();
  const docs = await periods.find({ userId: user._id }).toArray();
  return docs.map((p) => ({ id: p._id.toHexString(), start: p.start, end: p.end }));
}

// ---------- Sesión ----------

export async function signInWithGoogle(formData: FormData) {
  const target = String(formData.get("redirectTo") || "/inicio");
  const redirectTo = target.startsWith("/") && !target.startsWith("//") ? target : "/inicio";
  await signIn("google", { redirectTo });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

// ---------- Reglas ----------

export async function startPeriod(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const today = await getToday();
  const start = toDate(formData.get("date")) ?? today;
  const existing = await myPeriods(user);
  const { periodLength } = computeStats(existing, user.settings);
  const check = checkPeriod(existing, { start, end: null }, today, periodLength);
  if (!check.ok) return { error: check.error };

  const { periods } = await collections();
  const now = new Date();
  if (check.autoClose) {
    await periods.updateOne(
      { _id: new ObjectId(check.autoClose.id), userId: user._id },
      { $set: { end: check.autoClose.end, updatedAt: now } },
    );
  }
  try {
    await periods.insertOne({ _id: new ObjectId(), userId: user._id, start, end: null, createdAt: now, updatedAt: now });
  } catch (err) {
    if (isDuplicateKey(err)) return { error: "Ya tienes una regla que empieza ese día." };
    throw err;
  }
  refreshAll();
  return { message: "Apuntado. ¡Cuídate mucho! 💜" };
}

export async function endPeriod(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const today = await getToday();
  const id = toObjectId(formData.get("id"));
  const end = toDate(formData.get("date")) ?? today;
  const { periods } = await collections();
  const doc = id ? await periods.findOne({ _id: id, userId: user._id }) : null;
  if (!doc) return { error: "No encuentro esa regla." };

  const existing = await myPeriods(user);
  const { periodLength } = computeStats(existing, user.settings);
  const check = checkPeriod(existing, { id: doc._id.toHexString(), start: doc.start, end }, today, periodLength);
  if (!check.ok) return { error: check.error };

  await periods.updateOne({ _id: doc._id, userId: user._id }, { $set: { end, updatedAt: new Date() } });
  refreshAll();
  return { message: "¡Listo! Regla terminada." };
}

export async function savePeriod(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const today = await getToday();
  const idRaw = formData.get("id");
  const id = idRaw ? toObjectId(idRaw) : null;
  if (idRaw && !id) return { error: "Regla no válida." };
  const start = toDate(formData.get("start"));
  if (!start) return { error: "Indica el primer día." };
  const endRaw = formData.get("end");
  const end = endRaw ? toDate(endRaw) : null;
  if (endRaw && !end) return { error: "El último día no es una fecha válida." };

  const existing = await myPeriods(user);
  if (id && !existing.some((p) => p.id === id.toHexString())) return { error: "No encuentro esa regla." };
  const { periodLength } = computeStats(existing, user.settings);
  const check = checkPeriod(existing, { id: id?.toHexString(), start, end }, today, periodLength);
  if (!check.ok) return { error: check.error };

  const { periods } = await collections();
  const now = new Date();
  try {
    if (check.autoClose) {
      await periods.updateOne(
        { _id: new ObjectId(check.autoClose.id), userId: user._id },
        { $set: { end: check.autoClose.end, updatedAt: now } },
      );
    }
    if (id) {
      await periods.updateOne({ _id: id, userId: user._id }, { $set: { start, end, updatedAt: now } });
    } else {
      await periods.insertOne({ _id: new ObjectId(), userId: user._id, start, end, createdAt: now, updatedAt: now });
    }
  } catch (err) {
    if (isDuplicateKey(err)) return { error: "Ya tienes una regla que empieza ese día." };
    throw err;
  }
  refreshAll();
  return { message: id ? "Cambios guardados." : "Regla añadida." };
}

export async function deletePeriod(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = toObjectId(formData.get("id"));
  if (!id) return { error: "Regla no válida." };
  const { periods } = await collections();
  await periods.deleteOne({ _id: id, userId: user._id });
  refreshAll();
  return { message: "Regla borrada." };
}

// ---------- Registro diario ----------

const FLOW_IDS = new Set<string>(FLOWS.map((f) => f.id));
const SYMPTOM_IDS = new Set<string>(SYMPTOMS.map((s) => s.id));
const MOOD_IDS = new Set<string>(MOODS.map((m) => m.id));

export async function saveLog(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const today = await getToday();
  const date = toDate(formData.get("date"));
  if (!date) return { error: "Fecha no válida." };
  if (date > today) return { error: "Todavía no ha llegado ese día 🙂" };

  const flowRaw = String(formData.get("flow") ?? "");
  const flow = FLOW_IDS.has(flowRaw) ? (flowRaw as FlowId) : null;
  const symptoms = [...new Set(formData.getAll("symptoms").map(String))].filter((s) => SYMPTOM_IDS.has(s)) as SymptomId[];
  const moods = [...new Set(formData.getAll("moods").map(String))].filter((m) => MOOD_IDS.has(m)) as MoodId[];
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);

  const { logs } = await collections();
  if (!flow && symptoms.length === 0 && moods.length === 0 && !note) {
    await logs.deleteOne({ userId: user._id, date });
  } else {
    await logs.updateOne(
      { userId: user._id, date },
      { $set: { flow, symptoms, moods, note, updatedAt: new Date() } },
      { upsert: true },
    );
  }
  refreshAll();
  return { message: "Guardado ✓" };
}

// ---------- Compañera ----------

export async function createInvite(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (await getPartnerDoc(user)) return { error: "Ya estás conectada con tu compañera." };
  const { invites } = await collections();
  await invites.deleteMany({ userId: user._id });
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await invites.insertOne({ _id: new ObjectId(), code: newInviteCode(), userId: user._id, createdAt: now, expiresAt });
      revalidatePath("/companera");
      return { message: "Invitación creada." };
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
    }
  }
  return { error: "No se pudo crear la invitación. Inténtalo de nuevo." };
}

export async function cancelInvite(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { invites } = await collections();
  await invites.deleteMany({ userId: user._id });
  revalidatePath("/companera");
  return null;
}

export async function acceptInvite(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const code = normalizeInviteCode(formData.get("code"));
  if (!code) return { error: "Escribe el código de invitación." };
  const { invites, users } = await collections();
  const invite = await invites.findOne({ code, expiresAt: { $gt: new Date() } });
  if (!invite) return { error: "Esa invitación no existe o ha caducado. Pide un código nuevo." };
  if (invite.userId.equals(user._id)) return { error: "Esta invitación es tuya: compártela con tu compañera." };

  // Limpia una conexión rota (si la otra persona ya no apunta a ti)
  if (user.partnerId && !(await getPartnerDoc(user))) {
    await users.updateOne({ _id: user._id }, { $set: { partnerId: null } });
    user.partnerId = null;
  }
  if (user.partnerId) return { error: "Ya estás conectada con alguien. Desconéctate primero." };

  const inviter = await users.findOne({ _id: invite.userId });
  if (!inviter) return { error: "Quien te invitó ya no está en Lunas." };
  if (inviter.partnerId && !(await getPartnerDoc(inviter))) {
    await users.updateOne({ _id: inviter._id }, { $set: { partnerId: null } });
  }

  const first = await users.updateOne({ _id: inviter._id, partnerId: null }, { $set: { partnerId: user._id } });
  if (first.modifiedCount === 0) return { error: "Quien te invitó ya está conectada con otra persona." };
  const second = await users.updateOne({ _id: user._id, partnerId: null }, { $set: { partnerId: inviter._id } });
  if (second.modifiedCount === 0) {
    await users.updateOne({ _id: inviter._id, partnerId: user._id }, { $set: { partnerId: null } });
    return { error: "No se pudo completar la conexión. Inténtalo de nuevo." };
  }
  await invites.deleteMany({ userId: { $in: [inviter._id, user._id] } });
  refreshAll();
  redirect("/companera?conectadas=1");
}

export async function unlinkPartner(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (formData.get("confirm") !== "on") return { error: "Marca la casilla para confirmar." };
  const { users } = await collections();
  if (user.partnerId) {
    await users.updateOne({ _id: user.partnerId, partnerId: user._id }, { $set: { partnerId: null } });
  }
  await users.updateOne({ _id: user._id }, { $set: { partnerId: null } });
  refreshAll();
  redirect("/companera?desconectada=1");
}

const CARINO_IDS = new Set<string>(CARINOS.map((c) => c.id));

export async function sendCarino(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const kind = String(formData.get("kind") ?? "");
  if (!CARINO_IDS.has(kind)) return { error: "Mensaje no válido." };
  const partner = await getPartnerDoc(user);
  if (!partner) return { error: "Primero conecta con tu compañera." };
  const { carinos } = await collections();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sentToday = await carinos.countDocuments({ fromId: user._id, createdAt: { $gte: since } });
  if (sentToday >= 30) return { error: "¡Cuánto cariño! Por hoy ya está bien 😄" };
  await carinos.insertOne({
    _id: new ObjectId(),
    fromId: user._id,
    toId: partner._id,
    kind: kind as (typeof CARINOS)[number]["id"],
    createdAt: new Date(),
  });
  return { message: "¡Enviado! 💜" };
}

// ---------- Ajustes ----------

function intInRange(value: FormDataEntryValue | null, min: number, max: number): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export async function saveSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { cycleLength: cr, periodLength: pr } = SETTINGS_RANGE;
  const cycleLength = intInRange(formData.get("cycleLength"), cr.min, cr.max);
  const periodLength = intInRange(formData.get("periodLength"), pr.min, pr.max);
  if (cycleLength === null) return { error: `La duración del ciclo debe estar entre ${cr.min} y ${cr.max} días.` };
  if (periodLength === null) return { error: `La duración de la regla debe estar entre ${pr.min} y ${pr.max} días.` };
  const { users } = await collections();
  await users.updateOne(
    { _id: user._id },
    {
      $set: {
        settings: {
          cycleLength,
          periodLength,
          shareSymptoms: formData.get("shareSymptoms") === "on",
          shareNotes: formData.get("shareNotes") === "on",
          shareFertility: formData.get("shareFertility") === "on",
        },
        updatedAt: new Date(),
      },
    },
  );
  refreshAll();
  return { message: "Ajustes guardados ✓" };
}

export async function deleteAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "BORRAR") {
    return { error: "Escribe BORRAR para confirmar." };
  }
  const { users, periods, logs, invites, carinos } = await collections();
  if (user.partnerId) {
    await users.updateOne({ _id: user.partnerId, partnerId: user._id }, { $set: { partnerId: null } });
  }
  await Promise.all([
    periods.deleteMany({ userId: user._id }),
    logs.deleteMany({ userId: user._id }),
    invites.deleteMany({ userId: user._id }),
    carinos.deleteMany({ $or: [{ fromId: user._id }, { toId: user._id }] }),
  ]);
  await users.deleteOne({ _id: user._id });
  await signOut({ redirectTo: "/?cuenta=borrada" });
  return null;
}
