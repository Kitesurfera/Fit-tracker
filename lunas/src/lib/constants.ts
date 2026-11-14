import type { Phase } from "./cycle.ts";

export const APP_NAME = "Lunas";

export const FLOWS = [
  { id: "manchado", label: "Manchado", drops: 0 },
  { id: "ligero", label: "Ligero", drops: 1 },
  { id: "medio", label: "Medio", drops: 2 },
  { id: "abundante", label: "Abundante", drops: 3 },
] as const;
export type FlowId = (typeof FLOWS)[number]["id"];

export const SYMPTOMS = [
  { id: "colicos", label: "Dolor de ovarios", emoji: "🌀" },
  { id: "cabeza", label: "Dolor de cabeza", emoji: "🤕" },
  { id: "espalda", label: "Dolor de espalda", emoji: "🦴" },
  { id: "hinchazon", label: "Hinchazón", emoji: "🎈" },
  { id: "pecho", label: "Pecho sensible", emoji: "💗" },
  { id: "cansancio", label: "Cansancio", emoji: "😴" },
  { id: "granitos", label: "Granitos", emoji: "🔴" },
  { id: "antojos", label: "Antojos", emoji: "🍫" },
  { id: "nauseas", label: "Náuseas", emoji: "🤢" },
  { id: "insomnio", label: "Insomnio", emoji: "🌙" },
] as const;
export type SymptomId = (typeof SYMPTOMS)[number]["id"];

export const MOODS = [
  { id: "feliz", label: "Feliz", emoji: "😊" },
  { id: "tranquila", label: "Tranquila", emoji: "😌" },
  { id: "con-energia", label: "Con energía", emoji: "⚡" },
  { id: "sensible", label: "Sensible", emoji: "🥺" },
  { id: "irritable", label: "Irritable", emoji: "😤" },
  { id: "triste", label: "Triste", emoji: "😢" },
  { id: "ansiosa", label: "Ansiosa", emoji: "😰" },
  { id: "cariñosa", label: "Cariñosa", emoji: "🥰" },
] as const;
export type MoodId = (typeof MOODS)[number]["id"];

export const CARINOS = [
  { id: "abrazo", emoji: "🫂", text: "Te mando un abrazo enorme" },
  { id: "chocolate", emoji: "🍫", text: "¿Te llevo chocolate?" },
  { id: "manta", emoji: "🛋️", text: "Plan de manta y peli cuando quieras" },
  { id: "calor", emoji: "♨️", text: "¿Te preparo la bolsa de agua caliente?" },
  { id: "infusion", emoji: "🫖", text: "Te invito a una infusión" },
  { id: "animo", emoji: "💜", text: "¡Ánimo! Estoy contigo" },
] as const;
export type CarinoId = (typeof CARINOS)[number]["id"];

export const PHASES: Record<Phase, { name: string; short: string; tip: string; partnerTip: string }> = {
  menstrual: {
    name: "Fase menstrual",
    short: "Con la regla",
    tip: "Escucha a tu cuerpo: descansa, hidrátate y date calor si hay dolor.",
    partnerTip: "Un buen momento para mandarle un cariño o preguntarle qué necesita.",
  },
  folicular: {
    name: "Fase folicular",
    short: "Folicular",
    tip: "Suele subir la energía: buen momento para planes y ejercicio más intenso.",
    partnerTip: "Suele tener más energía: proponle un plan.",
  },
  ovulatoria: {
    name: "Días fértiles",
    short: "Fértil",
    tip: "Estás en tu ventana fértil estimada. Recuerda: es una estimación, no un anticonceptivo.",
    partnerTip: "Está en su ventana fértil estimada.",
  },
  lutea: {
    name: "Fase lútea",
    short: "Lútea",
    tip: "Es normal tener más hambre, hinchazón o estar más sensible antes de la regla.",
    partnerTip: "Puede estar más sensible o cansada: un poco de mimo nunca sobra.",
  },
};

export const SETTINGS_RANGE = {
  cycleLength: { min: 21, max: 45 },
  periodLength: { min: 2, max: 10 },
} as const;

export const INVITE_DAYS = 7;
