import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Icon, IconName } from '@/components/Icon';
import { Avatar, Banner, Button, Card, Empty, Header, Loading, Pill, Screen, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { category } from '@/lib/catalog';
import { capitalize, fcfa, initials, km, relativeDay, shortDate } from '@/lib/format';
import { useApiMutation, useApplications, useEngagements, useJob, useMyApplications } from '@/lib/queries';
import { colors, radius, space } from '@/lib/theme';
import { Job } from '@/lib/types';

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const job = useJob(id);
  if (job.isLoading) return <Screen><Loading /></Screen>;
  if (!job.data) return <Screen><Header listen="Offre introuvable." /><Banner tone="alert">{errorMessage(job.error)}</Banner></Screen>;
  return job.data.farmer.id === me.id ? <FarmerView job={job.data} /> : <WorkerView job={job.data} />;
}

function Facts({ job }: { job: Job }) {
  const facts: { icon: IconName; value: string; label: string }[] = [
    { icon: 'calendar', value: capitalize(relativeDay(job.startDate)), label: `Début · ${shortDate(job.startDate)}` },
    { icon: 'clock', value: job.payMode === 'DAILY' ? `${job.durationDays} jours` : `≈ ${job.durationDays} jours`, label: job.payMode === 'DAILY' ? 'Durée' : 'À la tâche' },
    { icon: 'users', value: `${job.slotsLeft} place${job.slotsLeft > 1 ? 's' : ''}`, label: `Sur ${job.workersNeeded}` },
    { icon: 'pin', value: job.distanceKm !== undefined ? km(job.distanceKm) : job.locality, label: job.distanceKm !== undefined ? job.locality : 'Lieu' },
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {facts.map((f) => (
        <View key={f.label} style={{ width: '48%', flexGrow: 1, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Icon name={f.icon} />
          <View style={{ flex: 1 }}>
            <T variant="bodyStrong" numberOfLines={2}>{f.value}</T>
            <T variant="tiny" color={colors.muted} numberOfLines={2}>{f.label}</T>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Village for everyone; the full address only for the farmer and hired workers. */
function Location({ job }: { job: Job }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line }}>
      <Icon name="pin" color={job.locationVerified ? colors.green : colors.ink} />
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="bodyStrong">{job.locality}</T>
        <T variant="tiny" color={colors.muted} numberOfLines={3}>
          {job.address ?? 'L’adresse exacte est donnée une fois embauché.'}
        </T>
      </View>
      {job.locationVerified && <Pill label="Lieu vérifié" tone="success" />}
    </View>
  );
}

function TitleBlock({ job }: { job: Job }) {
  return (
    <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
      <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: colors.field, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={category(job.category).icon} size={34} strokeWidth={1.7} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="title">{job.title}</T>
        {job.description ? <T variant="small" color={colors.muted}>{job.description}</T> : null}
      </View>
    </View>
  );
}

function WorkerView({ job }: { job: Job }) {
  const mine = useMyApplications();
  const application = mine.data?.find((a) => a.job.id === job.id);
  const apply = useApiMutation(() => api(`/jobs/${job.id}/applications`, { method: 'POST', body: {} }));
  const perDay = job.payMode === 'DAILY';
  const listen = `${job.title}, à ${job.locality}. Vous gagnez ${fcfa(job.workerNetXof)} francs ${perDay ? 'par jour' : 'pour la tâche'}`
    + `${perDay ? `, soit ${fcfa(job.workerTotalNetXof)} francs pour ${job.durationDays} jours` : ''}. Début ${relativeDay(job.startDate)}. `
    + `Il reste ${job.slotsLeft} place${job.slotsLeft > 1 ? 's' : ''}. Le paiement est garanti par Nogoman. Pour postuler, touchez le bouton en bas.`;

  const footer = application ? (
    <Button variant="secondary" label={application.engagement ? 'Voir ma mission' : 'Candidature envoyée'} icon={application.engagement ? 'arrow' : 'check'}
      disabled={!application.engagement} onPress={() => application.engagement && router.push(`/mission/${application.engagement.id}`)} />
  ) : (
    <Button label="Postuler" loading={apply.isPending} disabled={job.slotsLeft === 0} onPress={() => apply.mutate()} />
  );

  return (
    <Screen footer={footer}>
      <Header listen={listen} />
      <TitleBlock job={job} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line }}>
        <Avatar name={initials(job.farmer.name)} dark />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T variant="bodyStrong">{job.farmer.name}</T>
            {job.farmer.verified && <Icon name="shield" size={17} color={colors.green} strokeWidth={2.4} />}
          </View>
          <T variant="tiny" color={colors.ink2}>
            {job.farmer.rating.average ? `★ ${String(job.farmer.rating.average).replace('.', ',')} · ${job.farmer.rating.count} avis` : 'Nouveau sur Nogoman'}
          </T>
        </View>
      </View>
      <View style={{ backgroundColor: colors.field, borderRadius: radius.xl, padding: 18, gap: 4 }}>
        <T variant="label" color={colors.muted}>Vous gagnez</T>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <T variant="amount">{fcfa(job.workerNetXof)}</T>
          <T variant="h3">{perDay ? 'FCFA / jour' : 'FCFA'}</T>
        </View>
        <T variant="small" color={colors.ink2}>
          {fcfa(job.rateXof)} FCFA moins les frais Nogoman{perDay ? ` · ${fcfa(job.workerTotalNetXof)} FCFA pour ${job.durationDays} jours` : ''}
        </T>
      </View>
      <Facts job={job} />
      <Location job={job} />
      <Banner tone="success" title="Paiement garanti.">
        Le planteur paie Nogoman avant votre premier jour. {perDay ? 'Vous êtes payé chaque soir' : 'Vous êtes payé à la fin de la tâche'} sur votre mobile money.
      </Banner>
      {application?.status === 'PENDING' && <Banner tone="pending">Le planteur a reçu votre candidature. Vous serez prévenu s’il vous embauche.</Banner>}
      {application?.status === 'REJECTED' && <Banner tone="info">Le planteur a choisi d’autres travailleurs pour cette offre.</Banner>}
      {apply.error && <Banner tone="alert">{errorMessage(apply.error)}</Banner>}
    </Screen>
  );
}

const APP_STATUS: Record<string, { label: string; tone: 'neutral' | 'success' | 'pending' | 'alert' }> = {
  PENDING: { label: 'Nouvelle', tone: 'pending' },
  HIRED: { label: 'Embauché', tone: 'success' },
  REJECTED: { label: 'Refusée', tone: 'neutral' },
  WITHDRAWN: { label: 'Retirée', tone: 'neutral' },
};

function FarmerView({ job }: { job: Job }) {
  const applications = useApplications(job.id, true);
  const engagements = useEngagements();
  const hire = useApiMutation((appId: string) => api(`/applications/${appId}/hire`, { method: 'POST' }));
  const reject = useApiMutation((appId: string) => api(`/applications/${appId}/reject`, { method: 'POST' }));
  const cancel = useApiMutation(() => api(`/jobs/${job.id}/cancel`, { method: 'POST' }));

  const forJob = (engagements.data ?? []).filter((e) => e.job.id === job.id);
  const awaiting = forJob.filter((e) => e.status === 'AWAITING_FUNDING');
  const active = forJob.filter((e) => e.status === 'ACTIVE');
  const pending = (applications.data ?? []).filter((a) => a.status === 'PENDING');
  const ended = job.status === 'COMPLETED' || job.status === 'CANCELLED';

  const listen = `Votre offre ${job.title}. ${pending.length} candidature${pending.length > 1 ? 's' : ''} à regarder. `
    + (awaiting.length ? `${awaiting.length} travailleur${awaiting.length > 1 ? 's' : ''} embauché${awaiting.length > 1 ? 's' : ''} : sécurisez le paiement pour qu'ils commencent.` : '');

  const footer = awaiting.length > 0
    ? <Button label="Sécuriser le paiement" icon="lock" sublabel={`${awaiting.length} travailleur${awaiting.length > 1 ? 's' : ''} embauché${awaiting.length > 1 ? 's' : ''}`} onPress={() => router.push(`/fund/${job.id}`)} />
    : undefined;

  return (
    <Screen footer={footer}>
      <Header listen={listen} />
      <TitleBlock job={job} />
      <Card style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <T variant="label" color={colors.muted}>{job.payMode === 'DAILY' ? 'Prix par jour' : 'Prix de la tâche'}</T>
          <T style={{ fontSize: 26, fontWeight: '800' }}>{fcfa(job.rateXof)} FCFA</T>
        </View>
        <Pill label={STATUS_LABEL[job.status]} tone={job.status === 'OPEN' ? 'pending' : job.status === 'IN_PROGRESS' ? 'success' : 'neutral'} />
      </Card>
      <Facts job={job} />
      <Location job={job} />

      {active.length > 0 && (
        <View style={{ gap: space.sm }}>
          <T variant="h3">En mission</T>
          {active.map((e) => (
            <Card key={e.id} onPress={() => router.push(`/mission/${e.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={initials(e.worker.name)} />
              <T variant="bodyStrong" style={{ flex: 1 }}>{e.worker.name}</T>
              <Icon name="chevron" color={colors.muted} />
            </Card>
          ))}
        </View>
      )}

      <T variant="h3">Candidatures</T>
      {applications.isLoading ? <Loading /> : (applications.data ?? []).length === 0
        ? <Empty icon="users" title="Pas encore de candidature">Les travailleurs proches voient votre offre sur leur carte.</Empty>
        : (applications.data ?? []).map((a) => (
          <Card key={a.id} style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={initials(a.worker.name)} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <T variant="bodyStrong">{a.worker.name}</T>
                  {a.worker.verified && <Icon name="shield" size={16} color={colors.green} strokeWidth={2.4} />}
                </View>
                <T variant="tiny" color={colors.muted}>
                  {a.worker.rating.average ? `★ ${String(a.worker.rating.average).replace('.', ',')} · ${a.worker.rating.count} avis` : 'Nouveau'}
                  {a.worker.locality ? ` · ${a.worker.locality}` : ''}
                </T>
              </View>
              <Pill label={APP_STATUS[a.status].label} tone={APP_STATUS[a.status].tone} />
            </View>
            {a.status === 'PENDING' && !ended && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button variant="secondary" label="Refuser" style={{ flex: 1, minHeight: 48 }} loading={reject.isPending && reject.variables === a.id} onPress={() => reject.mutate(a.id)} />
                <Button label="Embaucher" style={{ flex: 1, minHeight: 48 }} disabled={job.slotsLeft === 0} loading={hire.isPending && hire.variables === a.id} onPress={() => hire.mutate(a.id)} />
              </View>
            )}
          </Card>
        ))}
      {(hire.error || reject.error || cancel.error) && <Banner tone="alert">{errorMessage(hire.error ?? reject.error ?? cancel.error)}</Banner>}
      {!ended && active.length === 0 && (
        <Button variant="ghost" label="Annuler l'offre" loading={cancel.isPending} onPress={() => cancel.mutate()} />
      )}
    </Screen>
  );
}

const STATUS_LABEL: Record<Job['status'], string> = {
  OPEN: 'Ouverte',
  FILLED: 'Complète',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
};
