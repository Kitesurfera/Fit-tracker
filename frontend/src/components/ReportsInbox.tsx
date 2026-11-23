// Ajustes > Problemas reportados (entrenador: los de sus deportistas y los suyos; puede responder y marcarlos
// como resueltos) o Mis informes (deportista: estado y respuesta del entrenador).
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView, Image, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';

type Props = { visible: boolean; onClose: () => void; colors: any; role: 'athlete' | 'trainer'; userId: string; onChanged?: (reports: any[]) => void };

const CAT: Record<string, { label: string; icon: any; color: string }> = {
  bug: { label: 'Algo no funciona', icon: 'bug', color: '#EF4444' },
  idea: { label: 'Sugerencia', icon: 'bulb', color: '#F59E0B' },
  other: { label: 'Otra cosa', icon: 'chatbubble-ellipses', color: '#3B82F6' },
};

const when = (iso: string) => {
  try { return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
};

export default function ReportsInbox({ visible, onClose, colors, role, userId, onChanged }: Props) {
  const insets = useSafeAreaInsets();
  const isTrainer = role === 'trainer';
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [shots, setShots] = useState<Record<string, string | 'loading' | 'error'>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await api.getProblemReports();
      setReports(list);
      onChanged?.(list);
    } catch (e: any) {
      setError(e?.message === 'NETWORK_ERROR' ? 'Sin conexión. Inténtalo de nuevo cuando tengas internet.' : 'No se pudieron cargar los informes.');
    } finally {
      setLoading(false);
    }
  }, [onChanged]);

  useEffect(() => { if (visible) load(); }, [visible, load]);

  const replace = (r: any) => setReports(prev => { const next = prev.map(x => (x.id === r.id ? { ...x, ...r } : x)); onChanged?.(next); return next; });

  const update = async (r: any, data: { status?: 'open' | 'resolved'; reply?: string }) => {
    setBusyId(r.id);
    try {
      const updated = await api.updateProblemReport(r.id, data);
      replace(updated);
      if (data.reply !== undefined) setDrafts(d => ({ ...d, [r.id]: '' }));
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo guardar.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = (r: any) => {
    Alert.alert('Eliminar informe', '¿Seguro que quieres eliminar este informe? No se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try {
          await api.deleteProblemReport(r.id);
          setReports(prev => { const next = prev.filter(x => x.id !== r.id); onChanged?.(next); return next; });
        } catch (e: any) { Alert.alert('Error', e?.message || 'No se pudo eliminar.'); }
      } },
    ]);
  };

  const showShot = async (r: any) => {
    if (shots[r.id] && shots[r.id] !== 'error') { setShots(s => { const n = { ...s }; delete n[r.id]; return n; }); return; }
    setShots(s => ({ ...s, [r.id]: 'loading' }));
    try {
      const { data } = await api.getProblemReportScreenshot(r.id);
      setShots(s => ({ ...s, [r.id]: data }));
    } catch {
      setShots(s => ({ ...s, [r.id]: 'error' }));
    }
  };

  const openCount = reports.filter(r => r.status !== 'resolved').length;
  const shown = isTrainer ? reports.filter(r => filter === 'all' || (filter === 'resolved' ? r.status === 'resolved' : r.status !== 'resolved')) : reports;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[styles.toolbar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Volver a Ajustes" onPress={onClose} style={[styles.backBtn, { backgroundColor: colors.surfaceHighlight }]}>
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
            <Text style={{ color: colors.textPrimary, fontWeight: '800' }}>Volver</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{isTrainer ? 'Problemas reportados' : 'Mis informes'}</Text>
        </View>

        {isTrainer && (
          <View style={styles.filters}>
            {([['open', `Abiertos (${openCount})`], ['resolved', `Resueltos (${reports.length - openCount})`], ['all', 'Todos']] as const).map(([k, label]) => (
              <TouchableOpacity key={k} accessibilityRole="button" accessibilityState={{ selected: filter === k }} onPress={() => setFilter(k)}
                style={[styles.chip, { backgroundColor: filter === k ? colors.primary : colors.surfaceHighlight }]}>
                <Text style={{ color: filter === k ? '#FFF' : colors.textSecondary, fontWeight: '800', fontSize: 13 }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 30 }]} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
          {!!error && <Text style={{ color: colors.error, fontWeight: '700', marginBottom: 12 }}>{error}</Text>}
          {!loading && !error && shown.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name={isTrainer ? 'checkmark-done-circle-outline' : 'document-text-outline'} size={48} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 10 }}>
                {isTrainer ? (filter === 'open' ? 'No hay problemas pendientes.' : 'No hay informes aquí.') : 'Todavía no has enviado ningún informe.'}
              </Text>
            </View>
          )}

          {shown.map(r => {
            const cat = CAT[r.category] || CAT.other;
            const resolved = r.status === 'resolved';
            const mine = r.user_id === userId;
            const shot = shots[r.id];
            return (
              <View key={r.id} accessibilityLabel={`Informe ${r.ref}`} style={[styles.card, { backgroundColor: colors.surface, borderColor: resolved ? colors.border : cat.color + '55' }]}>
                <View style={styles.cardHead}>
                  <View style={[styles.catIcon, { backgroundColor: cat.color + '18' }]}><Ionicons name={cat.icon} size={18} color={cat.color} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '900', fontSize: 15 }}>{isTrainer ? (mine ? 'Tú' : r.user_name) : cat.label}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      {[isTrainer ? cat.label : null, r.area, when(r.created_at), `#${r.ref}`].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: resolved ? '#D1FAE5' : '#FEF3C7' }]}>
                    <Text style={{ color: resolved ? '#047857' : '#B45309', fontWeight: '900', fontSize: 11 }}>{resolved ? 'Resuelto' : isTrainer ? 'Abierto' : 'Recibido'}</Text>
                  </View>
                </View>

                <Text style={[styles.desc, { color: colors.textPrimary }]}>{r.description}</Text>

                {!!r.reply && (
                  <View style={[styles.reply, { backgroundColor: colors.primary + '12', borderLeftColor: colors.primary }]}>
                    <Text style={{ color: colors.primary, fontWeight: '900', fontSize: 12, marginBottom: 2 }}>Respuesta{r.replied_by ? ` de ${r.replied_by}` : ''}</Text>
                    <Text style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 20 }}>{r.reply}</Text>
                  </View>
                )}

                <View style={styles.actions}>
                  {r.has_screenshot && (
                    <TouchableOpacity accessibilityRole="button" onPress={() => showShot(r)} style={styles.action}>
                      <Ionicons name="image-outline" size={16} color={colors.primary} />
                      <Text style={[styles.actionText, { color: colors.primary }]}>{shot && shot !== 'error' && shot !== 'loading' ? 'Ocultar captura' : 'Ver captura'}</Text>
                    </TouchableOpacity>
                  )}
                  {isTrainer && (
                    <TouchableOpacity accessibilityRole="button" onPress={() => setExpanded(e => ({ ...e, [r.id]: !e[r.id] }))} style={styles.action}>
                      <Ionicons name="hardware-chip-outline" size={16} color={colors.primary} />
                      <Text style={[styles.actionText, { color: colors.primary }]}>{expanded[r.id] ? 'Ocultar datos técnicos' : 'Datos técnicos'}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {shot === 'loading' && <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />}
                {shot === 'error' && <Text style={{ color: colors.error, marginTop: 6 }}>No se pudo cargar la captura.</Text>}
                {shot && shot !== 'loading' && shot !== 'error' && (
                  <Image accessibilityLabel={`Captura del informe ${r.ref}`} source={{ uri: shot }} style={styles.shot} resizeMode="contain" />
                )}

                {isTrainer && expanded[r.id] && (
                  <View style={[styles.diag, { backgroundColor: colors.surfaceHighlight }]}>
                    {Object.entries(r.diagnostics || {}).map(([k, v]) => (
                      <Text key={k} style={{ color: colors.textPrimary, fontSize: 12, lineHeight: 18 }}>
                        <Text style={{ fontWeight: '800' }}>{k}: </Text>{Array.isArray(v) ? (v as any[]).join(' | ') : String(v)}
                      </Text>
                    ))}
                    {!!r.user_email && <Text style={{ color: colors.textPrimary, fontSize: 12, lineHeight: 18 }}><Text style={{ fontWeight: '800' }}>Email: </Text>{r.user_email}</Text>}
                  </View>
                )}

                {isTrainer && !mine && (
                  <View style={styles.replyRow}>
                    <TextInput
                      accessibilityLabel={`Responder al informe ${r.ref}`}
                      value={drafts[r.id] || ''} onChangeText={t => setDrafts(d => ({ ...d, [r.id]: t }))}
                      placeholder={r.reply ? 'Cambiar la respuesta…' : 'Responder a la deportista…'} placeholderTextColor={colors.textSecondary} multiline maxLength={2000}
                      style={[styles.replyInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}
                    />
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Enviar respuesta al informe ${r.ref}`}
                      disabled={!drafts[r.id]?.trim() || busyId === r.id} onPress={() => update(r, { reply: drafts[r.id] })}
                      style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: drafts[r.id]?.trim() ? 1 : 0.4 }]}>
                      <Ionicons name="send" size={16} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                )}

                <View style={[styles.footer, { borderTopColor: colors.border }]}>
                  {isTrainer && (
                    <TouchableOpacity accessibilityRole="button" disabled={busyId === r.id} onPress={() => update(r, { status: resolved ? 'open' : 'resolved' })} style={styles.action}>
                      {busyId === r.id ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name={resolved ? 'refresh' : 'checkmark-circle'} size={18} color={resolved ? colors.textSecondary : colors.success} />}
                      <Text style={[styles.actionText, { color: resolved ? colors.textSecondary : colors.success }]}>{resolved ? 'Reabrir' : 'Marcar como resuelto'}</Text>
                    </TouchableOpacity>
                  )}
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Eliminar informe ${r.ref}`} onPress={() => remove(r)} style={styles.action}>
                    <Ionicons name="trash-outline" size={16} color={colors.error} />
                    <Text style={[styles.actionText, { color: colors.error }]}>Eliminar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12 },
  title: { fontSize: 17, fontWeight: '900', flex: 1 },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, width: '100%', maxWidth: 760, alignSelf: 'center' },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16 },
  body: { padding: 16, width: '100%', maxWidth: 760, alignSelf: 'center' },
  empty: { alignItems: 'center', paddingVertical: 60 },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  desc: { fontSize: 15, lineHeight: 21, marginTop: 10 },
  reply: { borderLeftWidth: 3, borderRadius: 8, padding: 10, marginTop: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 },
  actionText: { fontWeight: '800', fontSize: 13 },
  shot: { width: '100%', height: 320, marginTop: 10, borderRadius: 10, backgroundColor: '#0001' },
  diag: { borderRadius: 10, padding: 10, marginTop: 10 },
  replyRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 12 },
  replyInput: { flex: 1, minHeight: 42, maxHeight: 120, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  sendBtn: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, marginTop: 12, paddingTop: 8 },
});
