import { NextResponse } from "next/server";
import { collections } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

// Descarga de todos tus datos en JSON (derecho de acceso / portabilidad).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No has iniciado sesión" }, { status: 401 });
  const { periods, logs } = await collections();
  const [periodDocs, logDocs] = await Promise.all([
    periods.find({ userId: user._id }).sort({ start: 1 }).toArray(),
    logs.find({ userId: user._id }).sort({ date: 1 }).toArray(),
  ]);
  const data = {
    exportadoEl: new Date().toISOString(),
    perfil: { nombre: user.name, email: user.email, creadaEl: user.createdAt, conectadaConCompanera: Boolean(user.partnerId) },
    ajustes: user.settings,
    reglas: periodDocs.map((p) => ({ inicio: p.start, fin: p.end })),
    registros: logDocs.map((l) => ({ fecha: l.date, flujo: l.flow, sintomas: l.symptoms, animo: l.moods, nota: l.note })),
  };
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="lunas-mis-datos.json"`,
      "Cache-Control": "no-store",
    },
  });
}
