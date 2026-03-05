import mongoose from 'mongoose';

const MacrocicloSchema = new mongoose.Schema({
  nombre: { type: String, required: true }, // Ej: "Preparación General 2026"
  fecha_inicio: { type: Date, required: true },
  fecha_fin: { type: Date, required: true },
  color: { type: String, default: '#4A90E2' },
  objetivo: { type: String },
  athlete_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

export default mongoose.model('Macrociclo', MacrocicloSchema);
