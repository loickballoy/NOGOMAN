import { router } from 'expo-router';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Avatar, Banner, Card, Empty, Header, Loading, Pill, T } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { fcfa, initials, relativeDay } from '@/lib/format';
import { useEngagements, useMyApplications } from '@/lib/queries';
import { colors, space } from '@/lib/theme';
import { Engagement } from '@/lib/types';

const STATUS: Record<Engagement['status'], { label: string; tone: 'neutral' | 'success' | 'pending' }> = {
  AWAITING_FUNDING: { label: 'Paiement en attente', tone: 'pending' },
  ACTIVE: { label: 'En cours', tone: 'success' },
  COMPLETED: { label: 'Terminée', tone: 'neutral' },
  CANCELLED: { label: 'Arrêtée', tone: 'neutral' },
};

export default function Missions() {
  const me = useMe();
  const isWorker = me.role === 'WORKER';
  const engagements = useEngagements();
  const applications = useMyApplications(isWorker);
  const list = engagements.data ?? [];
  const pendingApps = (applications.data ?? []).filter((a) => a.status === 'PENDING');
  const running = list.filter((e) => e.status === 'ACTIVE' || e.status === 'AWAITING_FUNDING');
  const past = list.filter((e) => e.status === 'COMPLETED' || e.status === 'CANCELLED');

  const listen = `${running.length} mission${running.length > 1 ? 's' : ''} en cours.`
    + (isWorker ? ` ${pendingApps.length} candidature${pendingApps.length > 1 ? 's' : ''} en attente de réponse.` : '');

  const row = (e: Engagement) => {
    const other = isWorker ? e.farmer : e.worker;
    const amount = 'earnedXof' in e.totals ? e.totals.earnedXof : e.totals.releasedXof;
    return (
      <Card key={e.id} onPress={() => router.push(`/mission/${e.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={initials(other.name)} />
        <View style={{ flex: 1, gap: 4 }}>
          <T variant="bodyStrong" numberOfLines={1}>{e.job.title}</T>
          <T variant="tiny" color={colors.muted}>{other.name} · {isWorker ? 'reçu' : 'versé'} {fcfa(amount)} FCFA</T>
          <Pill label={STATUS[e.status].label} tone={STATUS[e.status].tone} />
        </View>
        <Icon name="chevron" color={colors.muted} />
      </Card>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.md, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={engagements.isRefetching} onRefresh={() => { engagements.refetch(); applications.refetch(); }} />}>
        <Header back={false} listen={listen} />
        <T variant="title">Missions</T>
        {engagements.isLoading ? <Loading /> : engagements.error ? <Banner tone="alert">{errorMessage(engagements.error)}</Banner> : (
          <>
            {running.length === 0 && pendingApps.length === 0 && past.length === 0 && (
              <Empty icon="briefcase" title="Pas encore de mission">
                {isWorker ? 'Postulez à une offre sur la carte.' : 'Embauchez des travailleurs depuis vos offres.'}
              </Empty>
            )}
            {running.map(row)}
            {isWorker && pendingApps.length > 0 && (
              <>
                <T variant="h3" style={{ marginTop: space.md }}>Candidatures envoyées</T>
                {pendingApps.map((a) => (
                  <Card key={a.id} onPress={() => router.push(`/job/${a.job.id}`)} style={{ gap: 4 }}>
                    <T variant="bodyStrong">{a.job.title}</T>
                    <T variant="tiny" color={colors.muted}>{a.job.locality} · début {relativeDay(a.job.startDate)}</T>
                    <Pill label="En attente du planteur" tone="pending" />
                  </Card>
                ))}
              </>
            )}
            {past.length > 0 && <T variant="h3" style={{ marginTop: space.md }}>Terminées</T>}
            {past.map(row)}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
