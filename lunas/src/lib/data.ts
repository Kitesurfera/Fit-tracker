import { collections, type UserDoc } from "@/lib/db";
import { cycleStatus, markDays, type CycleSettings, type CycleStatus, type DayMark, type PeriodInput } from "@/lib/cycle";
import type { CarinoId, FlowId, MoodId, SymptomId } from "@/lib/constants";
import type { ISODate } from "@/lib/dates";

// Aquí se decide qué ve cada una. Todo lo que sale de la base de datos hacia la compañera
// pasa por estas funciones, que respetan sus ajustes de privacidad.

export type Person = {
  id: string;
  name: string;
  firstName: string;
  image: string | null;
  isPartner: boolean;
  settings: CycleSettings;
  periods: (PeriodInput & { id: string })[];
  status: CycleStatus;
  shares: { symptoms: boolean; notes: boolean; fertility: boolean };
};

export type LogView = {
  date: ISODate;
  flow: FlowId | null;
  symptoms: SymptomId[];
  moods: MoodId[];
  note: string | null;
};

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** La compañera solo cuenta si la conexión es mutua. */
export async function getPartnerDoc(user: UserDoc): Promise<UserDoc | null> {
  if (!user.partnerId) return null;
  const { users } = await collections();
  return users.findOne({ _id: user.partnerId, partnerId: user._id });
}

export async function loadPerson(user: UserDoc, today: ISODate, isPartner: boolean): Promise<Person> {
  const { periods } = await collections();
  const docs = await periods.find({ userId: user._id }).sort({ start: 1 }).toArray();
  const list = docs.map((p) => ({ id: p._id.toHexString(), start: p.start, end: p.end }));
  const settings = { cycleLength: user.settings.cycleLength, periodLength: user.settings.periodLength };
  const shares = {
    symptoms: !isPartner || user.settings.shareSymptoms,
    notes: !isPartner || user.settings.shareNotes,
    fertility: !isPartner || user.settings.shareFertility,
  };

  let status = cycleStatus(list, settings, today);
  if (!shares.fertility) {
    const phase =
      status.phase === "ovulatoria" ? (status.ovulation && today <= status.ovulation ? "folicular" : "lutea") : status.phase;
    status = { ...status, phase, ovulation: null, fertileStart: null, fertileEnd: null };
  }

  return {
    id: user._id.toHexString(),
    name: user.name,
    firstName: firstName(user.name),
    image: user.image,
    isPartner,
    settings,
    periods: list,
    status,
    shares,
  };
}

export function personMarks(person: Person, today: ISODate, from: ISODate, to: ISODate): Map<ISODate, DayMark> {
  const marks = markDays(person.periods, person.settings, today, from, to);
  if (!person.shares.fertility) {
    for (const m of marks.values()) {
      m.fertile = false;
      m.ovulation = false;
    }
  }
  return marks;
}

export async function loadLogs(user: UserDoc, isPartner: boolean, from: ISODate, to: ISODate): Promise<Map<ISODate, LogView>> {
  const result = new Map<ISODate, LogView>();
  if (isPartner && !user.settings.shareSymptoms) return result;
  const { logs } = await collections();
  const docs = await logs.find({ userId: user._id, date: { $gte: from, $lte: to } }).toArray();
  for (const l of docs) {
    result.set(l.date, {
      date: l.date,
      flow: l.flow,
      symptoms: l.symptoms,
      moods: l.moods,
      note: !isPartner || user.settings.shareNotes ? l.note || null : null,
    });
  }
  return result;
}

export type CarinoView = { id: string; kind: CarinoId; createdAt: Date; fromName: string };

export async function loadReceivedCarinos(user: UserDoc, partner: UserDoc | null): Promise<CarinoView[]> {
  if (!partner) return [];
  const { carinos } = await collections();
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
  const docs = await carinos
    .find({ toId: user._id, fromId: partner._id, createdAt: { $gte: since } })
    .sort({ createdAt: -1 })
    .limit(5)
    .toArray();
  return docs.map((c) => ({ id: c._id.toHexString(), kind: c.kind, createdAt: c.createdAt, fromName: firstName(partner.name) }));
}
