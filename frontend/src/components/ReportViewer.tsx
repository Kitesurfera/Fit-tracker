// Informe de rendimiento a pantalla completa DENTRO de la app (antes se abría en otra ventana y en el iPhone
// no había forma de volver). Arriba siempre está el botón "Volver".
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, TextInput, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { api } from '../api';
import { buildReportHtml, computeReportStats, buildAiPayload, ReportAi, ReportInput } from '../utils/reportBuilder';
import { buildReportPdf, deliverPdf, prefersShareSheet } from '../utils/reportPdf';

export type ReportBaseInput = Omit<ReportInput, 'periodDays' | 'ai' | 'coachComment'>;

type Props = {
  visible: boolean;
  onClose: () => void;
  athleteId: string;
  base: ReportBaseInput;
  isTrainer: boolean;
  colors: any;
};

const PERIODS = [
  { days: 7, label: '7 días' },
  { days: 30, label: '30 días' },
  { days: 90, label: '3 meses' },
];

const isWeb = Platform.OS === 'web';

const cleanAi = (r: any): ReportAi => {
  if (!r || typeof r !== 'object') return null;
  const text = (v: any) => (typeof v === 'string' ? v.trim() : '');
  const recs = Array.isArray(r.recommendations) ? r.recommendations.map(text).filter(Boolean).slice(0, 6) : [];
  const out = { workload_analysis: text(r.workload_analysis), progress_analysis: text(r.progress_analysis), recommendations: recs };
  return out.workload_analysis || out.progress_analysis || recs.length ? out : null;
};

export default function ReportViewer({ visible, onClose, athleteId, base, isTrainer, colors }: Props) {
  const insets = useSafeAreaInsets();
  const [periodDays, setPeriodDays] = useState(30);
  const [useAi, setUseAi] = useState(true);
  const [aiResults, setAiResults] = useState<Record<string, ReportAi>>({});
  const [aiErrors, setAiErrors] = useState<Record<string, string>>({});
  const [aiLoadingKeys, setAiLoadingKeys] = useState<string[]>([]);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState('');
  const [previewComment, setPreviewComment] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [readyBlob, setReadyBlob] = useState<Blob | null>(null);   // PDF hecho, a falta de un toque para compartir
  const [notice, setNotice] = useState('');
  const [frameHeight, setFrameHeight] = useState(900);
  const frameRef = useRef<any>(null);
  const shareSheetRef = useRef<boolean | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const aiKey = `${athleteId}|${periodDays}`;
  const aiLoading = aiLoadingKeys.includes(aiKey);
  const aiError = aiErrors[aiKey];

  // El comentario se aplica al informe al dejar de escribir (si no, la vista previa parpadearía con cada letra)
  useEffect(() => {
    const t = setTimeout(() => setPreviewComment(comment), 500);
    return () => clearTimeout(t);
  }, [comment]);

  const stats = useMemo(() => computeReportStats({ ...base, periodDays }), [base, periodDays]);
  const input: ReportInput = useMemo(() => ({
    ...base, periodDays,
    ai: useAi ? aiResults[aiKey] || null : null,
    coachComment: isTrainer ? previewComment : '',
  }), [base, periodDays, useAi, aiResults, aiKey, isTrainer, previewComment]);
  const html = useMemo(() => buildReportHtml(input, stats), [input, stats]);
  const safeName = (base.athleteName || 'Deportista').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Deportista';
  const fileName = `Informe_${safeName}_${base.today}.pdf`;

  // Si cambia el contenido, el PDF preparado ya no vale
  useEffect(() => { setReadyBlob(null); }, [html]);
  useEffect(() => { if (!visible) { setNotice(''); setReadyBlob(null); } }, [visible]);

  // Análisis con IA del periodo elegido (se guarda: cambiar de periodo y volver no lo repite)
  const requestAi = useCallback(async (key: string, payload: any) => {
    setAiLoadingKeys(prev => (prev.includes(key) ? prev : [...prev, key]));
    setAiErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
    try {
      const res = cleanAi(await api.analyzeAnalytics(payload));
      if (!res) throw new Error('La IA no devolvió un análisis válido.');
      setAiResults(prev => ({ ...prev, [key]: res }));
    } catch (e: any) {
      const msg = String(e?.message || '');
      setAiErrors(prev => ({ ...prev, [key]: msg && msg !== 'SERVER_ERROR' ? msg : 'No se pudo hacer el análisis con IA.' }));
    } finally {
      setAiLoadingKeys(prev => prev.filter(k => k !== key));
    }
  }, []);

  useEffect(() => {
    if (!visible || !useAi || aiResults[aiKey] || aiErrors[aiKey] || aiLoading) return;
    if (stats.done === 0 && stats.wellnessDays === 0 && stats.testsInPeriod.length === 0) return; // nada que analizar
    requestAi(aiKey, buildAiPayload({ ...base, periodDays }, stats));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, useAi, aiKey]);

  const retryAi = () => requestAi(aiKey, buildAiPayload({ ...base, periodDays }, stats));

  // Botón/gesto "atrás" del móvil (Android) o del navegador: cierra el informe en vez de salir de la pantalla
  useEffect(() => {
    if (!isWeb || !visible || typeof window === 'undefined') return;
    let closedByPop = false;
    try { window.history.pushState({ ...(window.history.state || {}), amReport: true }, ''); } catch {}
    const onPop = () => { closedByPop = true; onCloseRef.current(); };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (!closedByPop && window.history.state?.amReport) { try { window.history.back(); } catch {} }
    };
  }, [visible]);

  // Altura de la vista previa = altura del informe (así se desplaza con el dedo como el resto de la app)
  const measureFrame = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (doc?.documentElement) setFrameHeight(Math.max(400, doc.documentElement.scrollHeight));
  }, []);
  useEffect(() => {
    if (!isWeb || !visible) return;
    window.addEventListener('resize', measureFrame);
    return () => window.removeEventListener('resize', measureFrame);
  }, [visible, measureFrame]);

  const useShareSheet = () => {
    if (shareSheetRef.current === null) {
      shareSheetRef.current = isWeb ? prefersShareSheet() : true;
    }
    return shareSheetRef.current;
  };

  const shareReady = async () => {
    if (!readyBlob) return;
    try {
      const r = await deliverPdf(readyBlob, fileName, `Informe de ${base.athleteName}`);
      if (r === 'shared' || r === 'downloaded') { setReadyBlob(null); setNotice(r === 'shared' ? 'PDF compartido.' : 'PDF descargado.'); }
    } catch (e: any) {
      setNotice(`No se pudo compartir: ${e?.message || e}`);
    }
  };

  const makePdf = async () => {
    if (readyBlob) return shareReady();
    setNotice('');
    setPdfBusy(true);
    try {
      if (!isWeb) {
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: fileName });
        return;
      }
      const blob: Blob = await buildReportPdf(html);
      const r = await deliverPdf(blob, fileName, `Informe de ${base.athleteName}`);
      if (r === 'needs-tap') { setReadyBlob(blob); setNotice('PDF listo. Pulsa «Compartir PDF» para guardarlo o enviarlo.'); }
      else if (r === 'downloaded') setNotice(`PDF descargado: ${fileName}`);
      else if (r === 'shared') setNotice('PDF compartido.');
    } catch (e: any) {
      console.log('Error creando el PDF', e);
      setNotice(`No se pudo crear el PDF (${e?.message || 'error desconocido'}). Inténtalo de nuevo.`);
    } finally {
      setPdfBusy(false);
    }
  };

  const printReport = () => {
    try { frameRef.current?.contentWindow?.focus(); frameRef.current?.contentWindow?.print(); } catch {}
  };

  const waitingAi = useAi && aiLoading;
  const shareLabel = useShareSheet() ? 'Compartir PDF' : 'Descargar PDF';
  const pdfLabel = pdfBusy ? 'Creando PDF…' : waitingAi ? 'Esperando a la IA…' : readyBlob ? 'Compartir PDF' : shareLabel;
  const isDesktopWeb = isWeb && !useShareSheet();

  const chip = (key: string, active: boolean, label: string, onPress: () => void, icon?: any, a11y?: string) => (
    <TouchableOpacity key={key} accessibilityRole="button" accessibilityLabel={a11y || label} accessibilityState={{ selected: active }} onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? colors.primary : colors.surfaceHighlight }]}>
      {icon && <Ionicons name={icon} size={14} color={active ? '#FFF' : colors.textSecondary} style={{ marginRight: 4 }} />}
      <Text style={[styles.chipText, { color: active ? '#FFF' : colors.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[styles.toolbar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={styles.row}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Volver a la app" onPress={onClose} style={[styles.backBtn, { backgroundColor: colors.surfaceHighlight }]}>
              <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
              <Text style={[styles.backText, { color: colors.textPrimary }]}>Volver</Text>
            </TouchableOpacity>
            <View style={{ flex: 1, marginHorizontal: 10 }}>
              <Text numberOfLines={1} style={[styles.title, { color: colors.textPrimary }]}>Informe</Text>
              <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 12 }}>{base.athleteName}</Text>
            </View>
            {isDesktopWeb && (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Imprimir informe" onPress={printReport} style={[styles.iconBtn, { backgroundColor: colors.surfaceHighlight }]}>
                <Ionicons name="print-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={pdfLabel} onPress={makePdf} disabled={pdfBusy || waitingAi}
              style={[styles.pdfBtn, { backgroundColor: readyBlob ? colors.success : colors.primary, opacity: pdfBusy || waitingAi ? 0.6 : 1 }]}>
              {pdfBusy || waitingAi ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name={useShareSheet() ? 'share-outline' : 'download-outline'} size={18} color="#FFF" />}
              <Text style={styles.pdfText}>{pdfLabel}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {PERIODS.map(p => chip(`p${p.days}`, periodDays === p.days, p.label, () => setPeriodDays(p.days), undefined, `Periodo: ${p.label}`))}
            <View style={[styles.sep, { backgroundColor: colors.border }]} />
            {chip('ai', useAi, 'Análisis IA', () => setUseAi(v => !v), 'sparkles')}
            {isTrainer && chip('comment', showComment || !!comment.trim(), 'Comentario', () => setShowComment(v => !v), 'create-outline')}
          </ScrollView>

          {isTrainer && showComment && (
            <TextInput
              accessibilityLabel="Comentario del entrenador para el informe"
              value={comment} onChangeText={setComment} multiline maxLength={1500}
              placeholder="Comentario para la deportista (aparece en el informe y en el PDF)"
              placeholderTextColor={colors.textSecondary}
              style={[styles.comment, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}
            />
          )}

          {useAi && aiLoading && (
            <Text style={[styles.status, { color: colors.textSecondary }]}>Analizando con IA… se añadirá al informe sola (puede tardar hasta un minuto). Si no quieres esperar, desactiva «Análisis IA».</Text>
          )}
          {useAi && !aiLoading && aiError && (
            <View style={styles.row}>
              <Text style={[styles.status, { color: colors.error, flex: 1 }]}>{aiError} El informe se puede guardar sin el análisis.</Text>
              <TouchableOpacity accessibilityRole="button" onPress={retryAi} style={[styles.smallBtn, { borderColor: colors.primary }]}>
                <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          )}
          {!!notice && <Text accessibilityLiveRegion="polite" style={[styles.status, { color: readyBlob ? colors.success : colors.textSecondary }]}>{notice}</Text>}
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          {isWeb ? (
            <View style={styles.previewWrap}>
              {React.createElement('iframe', {
                ref: frameRef,
                title: 'Vista previa del informe',
                srcDoc: html,
                scrolling: 'no',
                onLoad: () => {
                  measureFrame();
                  // Si cambian las fuentes o la anchura, volvemos a medir
                  const win = frameRef.current?.contentWindow;
                  const doc = frameRef.current?.contentDocument;
                  if (win?.ResizeObserver && doc?.body) new win.ResizeObserver(() => measureFrame()).observe(doc.body);
                },
                style: { width: '100%', height: frameHeight, border: 0, display: 'block', background: '#f8fafc' },
              })}
            </View>
          ) : (
            <View style={{ padding: 20, gap: 8 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '800' }}>{stats.done}/{stats.due} sesiones hechas · {Math.round(stats.totalMinutes)} min</Text>
              <Text style={{ color: colors.textSecondary }}>Pulsa «Compartir PDF» para ver el informe completo, guardarlo o enviarlo.</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  toolbar: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, borderBottomWidth: 1, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12 },
  backText: { fontWeight: '800', fontSize: 14 },
  title: { fontSize: 17, fontWeight: '900' },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  pdfBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12 },
  pdfText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  chips: { gap: 8, alignItems: 'center', paddingVertical: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 12, borderRadius: 16 },
  chipText: { fontSize: 13, fontWeight: '800' },
  sep: { width: 1, height: 20, marginHorizontal: 2 },
  comment: { minHeight: 64, maxHeight: 140, borderWidth: 1, borderRadius: 12, padding: 10, fontSize: 14, textAlignVertical: 'top' },
  status: { fontSize: 12, lineHeight: 17 },
  smallBtn: { borderWidth: 1, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, marginLeft: 8 },
  previewWrap: { width: '100%', maxWidth: 860, alignSelf: 'center' },
});
