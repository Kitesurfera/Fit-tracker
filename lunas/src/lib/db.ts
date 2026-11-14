import { MongoClient, type Db, type ObjectId } from "mongodb";
import type { CarinoId, FlowId, MoodId, SymptomId } from "./constants.ts";
import type { ISODate } from "./dates.ts";

export type UserSettings = {
  cycleLength: number;
  periodLength: number;
  /** La compañera puede ver flujo, síntomas y ánimo. */
  shareSymptoms: boolean;
  /** La compañera puede ver las notas escritas. */
  shareNotes: boolean;
  /** La compañera puede ver la ventana fértil y la ovulación estimadas. */
  shareFertility: boolean;
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  cycleLength: 28,
  periodLength: 5,
  shareSymptoms: true,
  shareNotes: false,
  shareFertility: false,
};

export type UserDoc = {
  _id: ObjectId;
  googleSub: string;
  email: string;
  name: string;
  image: string | null;
  partnerId: ObjectId | null;
  settings: UserSettings;
  createdAt: Date;
  updatedAt: Date;
};

export type PeriodDoc = {
  _id: ObjectId;
  userId: ObjectId;
  start: ISODate;
  end: ISODate | null;
  createdAt: Date;
  updatedAt: Date;
};

export type LogDoc = {
  _id: ObjectId;
  userId: ObjectId;
  date: ISODate;
  flow: FlowId | null;
  symptoms: SymptomId[];
  moods: MoodId[];
  note: string;
  updatedAt: Date;
};

export type InviteDoc = {
  _id: ObjectId;
  code: string;
  userId: ObjectId;
  createdAt: Date;
  expiresAt: Date;
};

export type CarinoDoc = {
  _id: ObjectId;
  fromId: ObjectId;
  toId: ObjectId;
  kind: CarinoId;
  createdAt: Date;
};

// En desarrollo y en serverless reutilizamos la misma conexión entre peticiones.
const g = globalThis as unknown as {
  _lunasClient?: Promise<MongoClient>;
  _lunasIndexes?: Promise<void>;
};

function connect(): Promise<MongoClient> {
  if (!g._lunasClient) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("Falta la variable de entorno MONGODB_URI (mira .env.example).");
    const client = new MongoClient(uri, { appName: "lunas", maxPoolSize: 10 });
    g._lunasClient = client.connect().catch((err) => {
      g._lunasClient = undefined;
      throw err;
    });
  }
  return g._lunasClient;
}

async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection("users").createIndex({ googleSub: 1 }, { unique: true }),
    db.collection("users").createIndex({ partnerId: 1 }),
    db.collection("periods").createIndex({ userId: 1, start: 1 }, { unique: true }),
    db.collection("logs").createIndex({ userId: 1, date: 1 }, { unique: true }),
    db.collection("invites").createIndex({ code: 1 }, { unique: true }),
    db.collection("invites").createIndex({ userId: 1 }),
    // Las invitaciones caducadas se borran solas
    db.collection("invites").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("carinos").createIndex({ toId: 1, createdAt: -1 }),
    // Los mensajitos de cariño se borran solos a los 30 días
    db.collection("carinos").createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }),
  ]);
}

export async function getDb(): Promise<Db> {
  const client = await connect();
  const db = client.db(process.env.MONGODB_DB || "lunas");
  if (!g._lunasIndexes) {
    g._lunasIndexes = ensureIndexes(db).catch((err) => {
      g._lunasIndexes = undefined;
      throw err;
    });
  }
  await g._lunasIndexes;
  return db;
}

export async function collections() {
  const db = await getDb();
  return {
    users: db.collection<UserDoc>("users"),
    periods: db.collection<PeriodDoc>("periods"),
    logs: db.collection<LogDoc>("logs"),
    invites: db.collection<InviteDoc>("invites"),
    carinos: db.collection<CarinoDoc>("carinos"),
  };
}
