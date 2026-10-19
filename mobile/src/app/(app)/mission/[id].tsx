import { useLocalSearchParams } from 'expo-router';
import { ReactElement, useState } from 'react';
import { View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Avatar, Banner, Button, Card, Chip, Header, Loading, Pill, Screen, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { fcfa, initials, relativeDay, shortDate, todayIso } from '@/lib/format';
import { precisePlace } from '@/lib/location';
import { useApiMutation, useEngagement } from '@/lib/queries';
import { colors, radius, space } from '@/lib/theme';
import { Engagement, UnitStatus, WorkUnit } from '@/lib/types';

const UNIT: Record<UnitStatus, { label: string; tone: 'neutral' | 'success' | 'pending' | 'alert' }> = {
  PENDING: { label: 'À venir', tone: 'neutral' },
  RELEASED: { label: 'Payé', tone: 'success' },
  DISPUTED: { label: 'Litige', tone: 'alert' },
  MISSED: { label: 'Non travaillé', tone: 'neutral' },
  CANCELLED: { label: 'Annulé', tone: 'neutral' },
  REFUNDED: { label: 'Remboursé', tone: 'neutral' },
};

export default function MissionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const e = useEngagement(id);
  if (e.isLoading) return <Screen><Loading /></Screen>;
  if (!e.data) return <Screen><Header listen="Mission introuvable." /><Banner tone="alert">{errorMessage(e.error)}</Banner></Screen>;
  return e.data.worker.id === me.id ? <WorkerMission e={e.data} /> : <FarmerMission e={e.data} />;
}

/** The unit for today (daily) or the single task unit. */
function currentUnit(e: Engagement): WorkUnit | undefined {
  if (e.payMode === 'TASK') return e.units[0];
  const today = todayIso();
  return e.units.find((u) => u.workDate === today) ?? e.units.find((u) => u.status === 'PENDING' && u.workDate < today);
}

function DayBars({ units }: { units: WorkUnit[] }) {
  const today = todayIso();
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {units.map((u) => (
        <View key={u.id} style={{ flex: 1, height: 8, borderRadius: 4,
          backgroundColor: u.status === 'RELEASED' ? colors.green : u.workDate === today ? colors.white : u.status === 'DISPUTED' ? colors.pendingText : '#3C4240' }} />
      ))}
    </View>
  );
}

function WorkerMission({ e }: { e: Engagement }) {
  const totals = e.totals as { earnedXof: number; upcomingXof: number };
  const unit = currentUnit(e);
  const [gpsError, setGpsError] = useState<string | null>(null);
  // Ids go in as mutation variables: the React Compiler would otherwise read them during render.
  const checkIn = useApiMutation(async (unitId: string) => {
    const pos = await precisePlace();
    if (!pos) throw new Error('gps');
    return api(`/work-units/${unitId}/check-in`, { method: 'POST', body: pos });
  });
  const done = useApiMutation((unitId: string) => api(`/work-units/${unitId}/done`, { method: 'POST' }));
  const paidDays = e.units.filter((u) => u.status === 'RELEASED').length;

  let action: ReactElement | undefined;
  let note: string;
  if (e.status !== 'ACTIVE' && e.status !== 'CANCELLED') {
    note = e.status === 'AWAITING_FUNDING' ? 'Le planteur doit encore sécuriser le paiement. Vous serez prévenu.' : 'Mission terminée.';
  } else if (unit?.status === 'RELEASED' && unit.workDate === todayIso()) {
    note = 'Journée payée. Revenez demain à la plantation.';
  } else if (!unit || unit.status !== 'PENDING') {
    note = "Rien à faire aujourd'hui.";
  } else if (e.payMode === 'TASK') {
    note = unit.completedAt ? `Le planteur a jusqu'au ${shortDate(unit.autoReleaseAt ?? unit.workDate)} pour vérifier. Sans réponse, vous êtes payé.` : 'Quand le travail est fini, dites-le ici.';
    if (!unit.completedAt) action = <Button label="Travail terminé" icon="check" loading={done.isPending} onPress={() => done.mutate(unit.id)} />;
  } else if (unit.workDate !== todayIso()) {
    note = 'Journée passée, en attente de confirmation du planteur.';
  } else if (unit.checkedInAt) {
    note = 'Arrivée enregistrée. Vous êtes payé ce soir quand le planteur confirme, ou demain à 9 h au plus tard.';
  } else {
    note = 'Une fois à la plantation, touchez « Je suis arrivé ». Sans pointage, la journée ne peut pas être payée automatiquement.';
    action = <Button label="Je suis arrivé" icon="pin" loading={checkIn.isPending}
      onPress={() => { setGpsError(null); checkIn.mutate(unit.id, { onError: (err) => err.message === 'gps' && setGpsError('Activez la localisation pour pointer.') }); }} />;
  }

  const listen = `Mission ${e.job.title}, chez ${e.farmer.name}. Vous avez reçu ${fcfa(totals.earnedXof)} francs. Encore ${fcfa(totals.upcomingXof)} francs à venir. ${note}`;
  const err = gpsError ?? (checkIn.error && checkIn.error.message !== 'gps' ? errorMessage(checkIn.error) : done.error ? errorMessage(done.error) : null);

  return (
    <Screen footer={action}>
      <Header listen={listen} />
      <View style={{ gap: 4 }}>
        <T variant="label" color={colors.greenText}>{e.status === 'ACTIVE' ? 'Mission en cours' : e.status === 'COMPLETED' ? 'Mission terminée' : 'Mission'}</T>
        <T variant="title">{e.job.title}</T>
        <T color={colors.ink2}>{e.farmer.name} · {e.job.locality}</T>
      </View>
      <Card dark style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View>
            <T variant="label" color={colors.onInkMuted}>Déjà reçu</T>
            <T style={{ fontSize: 30, fontWeight: '800' }} color={colors.white}>{fcfa(totals.earnedXof)} <T variant="label" color={colors.white}>FCFA</T></T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T variant="label" color={colors.onInkMuted}>À venir</T>
            <T style={{ fontSize: 20, fontWeight: '800' }} color={colors.white}>{fcfa(totals.upcomingXof)}</T>
          </View>
        </View>
        {e.payMode === 'DAILY' && <DayBars units={e.units} />}
        {e.payMode === 'DAILY' && <T variant="tiny" color={colors.onInkMuted}>{paidDays} jour{paidDays > 1 ? 's' : ''} payé{paidDays > 1 ? 's' : ''} sur {e.units.length}</T>}
      </Card>
      <Banner tone={unit?.checkedInAt ? 'success' : 'info'} icon={unit?.checkedInAt ? 'check' : 'clock'}>{note}</Banner>
      {err && <Banner tone="alert">{err}</Banner>}
      <UnitList e={e} />
    </Screen>
  );
}

const REASONS = ['Absent', 'Travail mal fait', 'Parti trop tôt', 'Autre problème'];

function FarmerMission({ e }: { e: Engagement }) {
  const totals = e.totals as { heldXof: number; releasedXof: number; refundedXof: number };
  const today = todayIso();
  const due = e.units.filter((u) => u.status === 'PENDING' && (e.payMode === 'TASK' || u.workDate <= today));
  const unit = due[0];
  const [reporting, setReporting] = useState(false);
  const confirm = useApiMutation((unitId: string) => api(`/work-units/${unitId}/confirm`, { method: 'POST' }));
  const dispute = useApiMutation((v: { unitId: string; reason: string }) =>
    api(`/work-units/${v.unitId}/dispute`, { method: 'POST', body: { reason: v.reason } }));
  const cancel = useApiMutation(() => api(`/engagements/${e.id}/cancel`, { method: 'POST' }));

  const dayLabel = unit ? (e.payMode === 'TASK' ? 'la tâche' : relativeDay(unit.workDate) === "aujourd'hui" ? "la journée d'aujourd'hui" : `la journée du ${shortDate(unit.workDate)}`) : '';
  const listen = `Mission de ${e.worker.name}, ${e.job.title}. ${fcfa(totals.heldXof)} francs sont bloqués chez Nogoman. `
    + (unit ? `Si le travail est fait, touchez Confirmer pour payer ${dayLabel}. Sinon, touchez Signaler un problème.` : "Rien à confirmer pour l'instant.");

  const footer = unit && !reporting ? (
    <>
      <Button label={e.payMode === 'TASK' ? 'Confirmer la tâche' : 'Confirmer la journée'} sublabel={`Verse ${fcfa(e.rateXof)} FCFA à ${e.worker.name}`}
        loading={confirm.isPending} onPress={() => confirm.mutate(unit.id)} />
      <Button variant="ghost" label="Signaler un problème" onPress={() => setReporting(true)} />
    </>
  ) : undefined;

  return (
    <Screen footer={footer}>
      <Header listen={listen} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={initials(e.worker.name)} size={52} />
        <View style={{ flex: 1 }}>
          <T variant="h2">{e.worker.name}</T>
          <T color={colors.ink2}>{e.job.title}</T>
        </View>
      </View>
      <Card dark style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="shield" size={16} color={colors.green} strokeWidth={2.4} />
              <T variant="label" color={colors.onInkMuted}>Bloqué chez Nogoman</T>
            </View>
            <T style={{ fontSize: 30, fontWeight: '800' }} color={colors.white}>{fcfa(totals.heldXof)} <T variant="label" color={colors.white}>FCFA</T></T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T variant="label" color={colors.onInkMuted}>Déjà versé</T>
            <T style={{ fontSize: 20, fontWeight: '800' }} color={colors.white}>{fcfa(totals.releasedXof)}</T>
          </View>
        </View>
        {e.payMode === 'DAILY' && <DayBars units={e.units} />}
      </Card>
      {unit && e.payMode === 'DAILY' && (
        <Banner tone={unit.checkedInAt ? 'success' : 'pending'} icon={unit.checkedInAt ? 'pin' : 'clock'}>
          {unit.checkedInAt ? `${e.worker.name} est arrivé à la plantation.` : `${e.worker.name} n'a pas encore pointé.`}
          {' '}Sans réponse de votre part, la journée est payée demain à 9 h si le travailleur a pointé.
        </Banner>
      )}
      {reporting && unit && (
        <Card style={{ gap: 12 }}>
          <T variant="h3">Quel problème ?</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {REASONS.map((r) => <Chip key={r} label={r} onPress={() => dispute.mutate({ unitId: unit.id, reason: r }, { onSuccess: () => setReporting(false) })} />)}
          </View>
          <T variant="small" color={colors.muted}>La journée est bloquée. L’équipe Nogoman vous appelle pour régler le problème.</T>
          <Button variant="ghost" label="Annuler" onPress={() => setReporting(false)} />
        </Card>
      )}
      {(confirm.error || dispute.error || cancel.error) && <Banner tone="alert">{errorMessage(confirm.error ?? dispute.error ?? cancel.error)}</Banner>}
      <UnitList e={e} />
      {e.status === 'ACTIVE' && <Button variant="danger" label="Arrêter la mission" loading={cancel.isPending} onPress={() => cancel.mutate()} />}
      {e.status === 'ACTIVE' && <T variant="tiny" color={colors.muted} style={{ textAlign: 'center' }}>Les jours pas encore commencés vous sont remboursés.</T>}
    </Screen>
  );
}

function UnitList({ e }: { e: Engagement }) {
  return (
    <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, overflow: 'hidden' }}>
      {e.units.map((u, i) => (
        <View key={u.id} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.lg,
          borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line }}>
          <View style={{ flex: 1 }}>
            <T variant="bodyStrong">{e.payMode === 'TASK' ? 'Tâche' : `Jour ${u.index + 1}`}</T>
            <T variant="tiny" color={colors.muted}>{shortDate(u.workDate)}{u.checkedInAt ? ' · pointé' : ''}</T>
          </View>
          <T variant="bodyStrong">{fcfa(u.amountXof)}</T>
          <View style={{ minWidth: 76, alignItems: 'flex-end' }}><Pill label={UNIT[u.status].label} tone={UNIT[u.status].tone} /></View>
        </View>
      ))}
    </View>
  );
}
