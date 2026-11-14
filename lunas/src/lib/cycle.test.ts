import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPeriod, computeStats, cycleStatus, DEFAULT_SETTINGS, markDays, syncDistance } from "./cycle.ts";
import { addDays, monthGrid, todayIn, formatMonth, isISODate, addMonths } from "./dates.ts";

const S = DEFAULT_SETTINGS;

test("sin datos no hay predicción", () => {
  const s = cycleStatus([], S, "2026-11-14");
  assert.equal(s.hasData, false);
  assert.equal(s.nextStart, null);
});

test("usa los valores por defecto con una sola regla", () => {
  const s = cycleStatus([{ start: "2026-11-01", end: "2026-11-05" }], S, "2026-11-14");
  assert.equal(s.cycleDay, 14);
  assert.equal(s.nextStart, "2026-11-29");
  assert.equal(s.daysUntilNext, 15);
  assert.equal(s.ovulation, "2026-11-15");
  assert.equal(s.phase, "ovulatoria");
  assert.equal(s.stats.periodLength, 5);
  assert.equal(s.stats.cycleFromHistory, false);
});

test("calcula la media con el historial", () => {
  const periods = [
    { start: "2026-08-01", end: "2026-08-04" },
    { start: "2026-08-31", end: "2026-09-03" },
    { start: "2026-09-30", end: "2026-10-03" },
  ];
  const st = computeStats(periods, S);
  assert.equal(st.cycleLength, 30);
  assert.equal(st.periodLength, 4);
  assert.equal(st.cyclesCounted, 2);
  assert.equal(st.cycleLengthByStart["2026-08-01"], 30);
});

test("ignora ciclos imposibles al calcular la media", () => {
  const st = computeStats(
    [
      { start: "2026-01-01", end: "2026-01-05" },
      { start: "2026-01-06", end: "2026-01-07" }, // 5 días: se ignora
      { start: "2026-02-03", end: "2026-02-07" }, // 28 días
    ],
    S,
  );
  assert.equal(st.cycleLength, 28);
});

test("regla en curso sin fecha de fin", () => {
  const s = cycleStatus([{ start: "2026-11-12", end: null }], S, "2026-11-14");
  assert.equal(s.onPeriod, true);
  assert.equal(s.periodDay, 3);
  assert.equal(s.phase, "menstrual");
  assert.equal(s.lastPeriod?.ongoing, true);
});

test("una regla abierta muy antigua se cierra con la duración habitual", () => {
  const s = cycleStatus([{ start: "2026-10-20", end: null }], S, "2026-11-14");
  assert.equal(s.onPeriod, false);
  assert.equal(s.lastPeriod?.end, "2026-10-24");
  assert.equal(s.lastPeriod?.estimatedEnd, true);
});

test("detecta el retraso", () => {
  const s = cycleStatus([{ start: "2026-10-10", end: "2026-10-14" }], S, "2026-11-10");
  assert.equal(s.lateDays, 3);
  assert.equal(s.phase, "lutea");
});

test("datos muy antiguos: no predice", () => {
  const s = cycleStatus([{ start: "2025-01-10", end: "2025-01-14" }], S, "2026-11-10");
  assert.equal(s.stale, true);
  assert.equal(s.nextStart, null);
});

test("marca reglas, predicciones y días fértiles en el calendario", () => {
  const marks = markDays([{ start: "2026-11-01", end: "2026-11-05" }], S, "2026-11-14", "2026-11-01", "2026-12-31");
  assert.equal(marks.get("2026-11-03")?.period, true);
  assert.equal(marks.get("2026-11-15")?.ovulation, true);
  assert.equal(marks.get("2026-11-10")?.fertile, true);
  assert.equal(marks.get("2026-11-29")?.predictedPeriod, true);
  assert.equal(marks.get("2026-12-03")?.predictedPeriod, true);
  assert.equal(marks.get("2026-12-04")?.predictedPeriod ?? false, false);
  assert.equal(marks.get("2026-12-27")?.predictedPeriod, true);
});

test("con retraso, la regla prevista se espera desde hoy", () => {
  const marks = markDays([{ start: "2026-10-10", end: "2026-10-14" }], S, "2026-11-10", "2026-11-01", "2026-11-30");
  assert.equal(marks.get("2026-11-07")?.predictedPeriod ?? false, false);
  assert.equal(marks.get("2026-11-10")?.predictedPeriod, true);
});

test("no permite reglas en el futuro ni solapadas", () => {
  const existing = [{ id: "a", start: "2026-10-01", end: "2026-10-05" }];
  assert.equal(checkPeriod(existing, { start: "2026-11-20", end: null }, "2026-11-14", 5).ok, false);
  assert.equal(checkPeriod(existing, { start: "2026-10-04", end: "2026-10-06" }, "2026-11-14", 5).ok, false);
  assert.equal(checkPeriod(existing, { start: "2026-10-06", end: "2026-10-01" }, "2026-11-14", 5).ok, false);
  assert.equal(checkPeriod(existing, { start: "2026-10-29", end: null }, "2026-11-14", 5).ok, true);
  // editar la misma regla no choca consigo misma
  assert.equal(checkPeriod(existing, { id: "a", start: "2026-10-02", end: "2026-10-06" }, "2026-11-14", 5).ok, true);
});

test("cierra automáticamente una regla abierta anterior", () => {
  const existing = [{ id: "a", start: "2026-10-01", end: null }];
  const r = checkPeriod(existing, { start: "2026-10-29", end: null }, "2026-11-14", 5);
  assert.deepEqual(r, { ok: true, autoClose: { id: "a", end: "2026-10-05" } });
});

test("pide fecha de fin si se registra una regla antigua antes de otras", () => {
  const existing = [{ id: "a", start: "2026-10-29", end: "2026-11-02" }];
  const r = checkPeriod(existing, { start: "2026-10-01", end: null }, "2026-11-14", 5);
  assert.equal(r.ok, false);
  assert.equal(checkPeriod(existing, { start: "2026-10-01", end: "2026-10-05" }, "2026-11-14", 5).ok, true);
});

test("distancia entre ciclos de dos personas", () => {
  assert.equal(syncDistance("2026-11-01", "2026-11-03", 28), 2);
  assert.equal(syncDistance("2026-11-01", "2026-11-27", 28), 2);
  assert.equal(syncDistance("2026-11-01", "2026-11-15", 28), 14);
});

test("utilidades de fechas", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(isISODate("2026-02-30"), false);
  assert.equal(isISODate("2026-02-28"), true);
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2026-01", -1), "2025-12");
  const grid = monthGrid("2026-11"); // 1 de nov de 2026 es domingo
  assert.equal(grid.length % 7, 0);
  assert.equal(grid[0].date, "2026-10-26");
  assert.equal(grid.find((c) => c.inMonth)?.date, "2026-11-01");
  assert.equal(todayIn("Europe/Madrid", new Date("2026-11-14T23:30:00Z")), "2026-11-15");
  assert.equal(todayIn("America/Mexico_City", new Date("2026-11-14T03:00:00Z")), "2026-11-13");
  assert.equal(formatMonth("2026-11"), "noviembre 2026");
});
