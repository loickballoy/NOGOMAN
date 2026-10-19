import { router } from 'expo-router';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { JobCard } from '@/components/JobCard';
import { Banner, Button, Card, Empty, Header, Loading, T } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { fcfa, todayIso } from '@/lib/format';
import { useEngagements, useMyJobs } from '@/lib/queries';
import { colors, space } from '@/lib/theme';

export default function FarmerHome() {
  const me = useMe();
  const jobs = useMyJobs();
  const engagements = useEngagements();

  const active = (engagements.data ?? []).filter((e) => e.status === 'ACTIVE');
  const held = active.reduce((s, e) => s + ('heldXof' in e.totals ? e.totals.heldXof : 0), 0);
  const today = todayIso();
  const toConfirm = active.filter((e) => e.units.some((u) => u.status === 'PENDING' && u.workDate <= today && e.payMode === 'DAILY'));
  const awaitingFunding = (engagements.data ?? []).filter((e) => e.status === 'AWAITING_FUNDING');
  const openJobs = (jobs.data ?? []).filter((j) => j.status !== 'COMPLETED' && j.status !== 'CANCELLED');

  const listen = [
    `Bonjour ${me.name}.`,
    held > 0 ? `${fcfa(held)} francs sont bloqués chez Nogoman pour vos missions.` : '',
    toConfirm.length > 0 ? `${toConfirm.length} mission${toConfirm.length > 1 ? 's' : ''} à confirmer aujourd'hui.` : '',
    awaitingFunding.length > 0 ? `${awaitingFunding.length} travailleur${awaitingFunding.length > 1 ? 's' : ''} attend${awaitingFunding.length > 1 ? 'ent' : ''} votre paiement.` : '',
    'Pour trouver des travailleurs, touchez Publier une offre.',
  ].filter(Boolean).join(' ');

  const refreshing = jobs.isRefetching || engagements.isRefetching;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { jobs.refetch(); engagements.refetch(); }} />}>
        <Header back={false} listen={listen} />
        <T variant="title">Bonjour {me.name?.split(' ')[0]}</T>

        <Card dark style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="shield" size={16} color={colors.green} strokeWidth={2.4} />
            <T variant="label" color={colors.onInkMuted}>Bloqué chez Nogoman</T>
          </View>
          <T style={{ fontSize: 30, fontWeight: '800' }} color={colors.white}>{fcfa(held)} <T variant="small" color={colors.white} style={{ fontWeight: '700' }}>FCFA</T></T>
          <T variant="tiny" color={colors.onInkMuted}>{active.length} mission{active.length > 1 ? 's' : ''} en cours</T>
        </Card>

        <Button label="Publier une offre" icon="plus" onPress={() => router.push('/post')} />

        {awaitingFunding.length > 0 && (
          <Banner tone="pending" title="Paiement à faire.">
            {awaitingFunding.length} travailleur{awaitingFunding.length > 1 ? 's' : ''} embauché{awaitingFunding.length > 1 ? 's' : ''} attend{awaitingFunding.length > 1 ? 'ent' : ''} que vous sécurisiez le paiement.
          </Banner>
        )}

        {toConfirm.length > 0 && (
          <View style={{ gap: space.sm }}>
            <T variant="h3">À confirmer aujourd’hui</T>
            {toConfirm.map((e) => (
              <Card key={e.id} onPress={() => router.push(`/mission/${e.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <T variant="bodyStrong">{e.worker.name}</T>
                  <T variant="small" color={colors.muted}>{e.job.title}</T>
                </View>
                <Icon name="chevron" color={colors.muted} />
              </Card>
            ))}
          </View>
        )}

        <T variant="h3">Mes offres</T>
        {jobs.isLoading ? <Loading /> : jobs.error ? <Banner tone="alert">{errorMessage(jobs.error)}</Banner>
          : openJobs.length === 0 ? <Empty icon="sprout" title="Aucune offre pour l'instant">Publiez une offre : les travailleurs proches la verront sur leur carte.</Empty>
          : openJobs.map((j) => <JobCard key={j.id} job={j} showNet={false} onPress={() => router.push(`/job/${j.id}`)} />)}
      </ScrollView>
    </SafeAreaView>
  );
}
