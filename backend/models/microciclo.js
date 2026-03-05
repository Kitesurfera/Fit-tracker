import mongoose from 'mongoose';

const MicrocicloSchema = new mongoose.Schema({
  macrociclo_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Macrociclo', required: true },
  nombre: { type: String, required: true }, // Ej: "Semana 1: Carga"
  tipo: { type: String, enum: ['CARGA', 'RECUPERACION', 'TEST', 'COMPETICION'], default: 'CARGA' },
  fecha_inicio: { type: Date, required: true },
  fecha_fin: { type: Date, required: true },
  color: { type: String, default: '#34C759' },
  notas: { type: String }
}, { timestamps: true });

export default mongoose.model('Microciclo', MicrocicloSchema);
