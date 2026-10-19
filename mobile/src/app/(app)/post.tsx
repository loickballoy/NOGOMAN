import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Banner, Button, Chip, Header, Progress, Screen, Stepper, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { CATEGORIES, CROPS, jobTitle, nearestTownLabel, TOWNS } from '@/lib/catalog';
import { addDaysIso, fcfa, relativeDay, shortDate, todayIso } from '@/lib/format';
import { currentPlace } from '@/lib/location';
import { useApiMutation } from '@/lib/queries';
import { colors, radius, space } from '@/lib/theme';
import { Job, JobCategory, PayMode } from '@/lib/types';

const TOTAL = 4;
// Mirrors the backend default (2 %) so the farmer sees the real total before paying.
const FEE = 0.02;

export default function PostJob() {
  const [step, setStep] = useState(1);
  const [cat, setCat] = useState<JobCategory | null>(null);
  const [crop, setCrop] = useState<string | null>(null);
  const [mode, setMode] = useState<PayMode>('DAILY');
  const [rate, setRate] = useState(4500);
  const [taskRate, setTaskRate] = useState(25000);
  const [people, setPeople] = useState(3);
  const [days, setDays] = useState(7);
  const [startOffset, setStartOffset] = useState(1);
  const [place, setPlace] = useState<{ lat: number; lng: number; locality: string; fromGps: boolean } | null>(null);

  useEffect(() => {
    currentPlace().then((p) => setPlace({ lat: p.lat, lng: p.lng, fromGps: p.fromGps, locality: p.fromGps ? nearestTownLabel(p.lat, p.lng) : TOWNS[0].name }));
  }, []);

  const create = useApiMutation((body: Record<string, unknown>) => api<Job>('/jobs', { method: 'POST', body }));

  function publish() {
    if (!cat || !place) return;
    create.mutate({
      title: jobTitle(cat, crop),
      category: cat,
      crop: crop ?? undefined,
      payMode: mode,
      rateXof: mode === 'DAILY' ? rate : taskRate,
      workersNeeded: people,
      durationDays: days,
      startDate: addDaysIso(todayIso(), startOffset),
      locality: place.locality,
      lat: place.lat,
      lng: place.lng,
    }, { onSuccess: (job) => router.replace(`/job/${job.id}`) });
  }

  const back = () => (step === 1 ? router.back() : setStep(step - 1));
  const subtotal = mode === 'DAILY' ? rate * people * days : taskRate * people;
  const total = Math.round(subtotal * (1 + FEE));

  if (step === 1) {
    return (
      <Screen footer={<Button label="Continuer" disabled={!cat} onPress={() => setStep(2)} />}>
        <StepHeader step={1} back={back} listen="Quel travail ? Choisissez : récolte, plantation, désherbage, défrichage, traitement ou transport." />
        <T variant="title">Quel travail ?</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {CATEGORIES.map((c) => {
            const on = cat === c.id;
            return (
              <Pressable key={c.id} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setCat(c.id)}
                style={({ pressed }) => [{ width: '48%', flexGrow: 1, height: 104, borderRadius: radius.lg, padding: 14, justifyContent: 'space-between',
                  borderWidth: on ? 2 : 1.5, borderColor: on ? colors.ink : colors.line, backgroundColor: on ? colors.field : colors.white }, pressed && { opacity: 0.7 }]}>
                <Icon name={c.icon} size={30} strokeWidth={1.7} />
                <T variant="bodyStrong">{c.label}</T>
                {on && <View style={{ position: 'absolute', top: 12, right: 12, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="check" size={14} color={colors.white} strokeWidth={3} />
                </View>}
              </Pressable>
            );
          })}
        </View>
      </Screen>
    );
  }

  if (step === 2) {
    return (
      <Screen footer={<Button label="Continuer" onPress={() => setStep(3)} />}>
        <StepHeader step={2} back={back} listen={`Quelle culture ? Choisissez dans la liste, ou continuez sans choisir.`} />
        <T variant="title">Quelle culture ?</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CROPS.map((c) => <Chip key={c} label={c} selected={crop === c} onPress={() => setCrop(crop === c ? null : c)} />)}
        </View>
        {cat && <Banner tone="info" icon="sprout">L’offre s’appellera « {jobTitle(cat, crop)} ».</Banner>}
      </Screen>
    );
  }

  if (step === 3) {
    const perDay = mode === 'DAILY';
    return (
      <Screen footer={<Button label="Continuer" sublabel={`${fcfa(total)} FCFA avec les frais`} onPress={() => setStep(4)} />}>
        <StepHeader step={3} back={back}
          listen={`Comment payer ? Par jour : chaque soir, vous confirmez la journée et chacun est payé. À la tâche : un prix fixe, payé quand le travail est fini. Puis réglez le prix et le nombre de personnes avec les boutons plus et moins. Total : ${fcfa(total)} francs.`} />
        <T variant="title">Comment payer ?</T>
        <ModeCard on={perDay} icon="calendar" title="Par jour" recommended sub="Chaque soir, vous confirmez la journée et chacun est payé." onPress={() => setMode('DAILY')} />
        <ModeCard on={!perDay} icon="task" title="À la tâche" sub="Un prix fixe, payé quand le travail est terminé." onPress={() => setMode('TASK')} />
        <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg }}>
          {perDay
            ? <Stepper label="Prix par jour" value={`${fcfa(rate)} FCFA`} onMinus={() => setRate(Math.max(500, rate - 250))} onPlus={() => setRate(rate + 250)} />
            : <Stepper label="Prix de la tâche, par personne" value={`${fcfa(taskRate)} FCFA`} onMinus={() => setTaskRate(Math.max(1000, taskRate - 1000))} onPlus={() => setTaskRate(taskRate + 1000)} />}
          <Divider />
          <Stepper label="Personnes" value={String(people)} onMinus={() => setPeople(Math.max(1, people - 1))} onPlus={() => setPeople(Math.min(50, people + 1))} />
          <Divider />
          <Stepper label={perDay ? 'Nombre de jours' : 'Durée estimée'} value={`${days} jour${days > 1 ? 's' : ''}`} onMinus={() => setDays(Math.max(1, days - 1))} onPlus={() => setDays(Math.min(90, days + 1))} />
        </View>
        <Banner tone="info">
          {perDay ? 'Sans réponse de votre part avant 9 h le lendemain, la journée est payée si le travailleur a pointé.' : 'Sans réponse 48 h après que le travailleur a terminé, la tâche est payée.'}
        </Banner>
      </Screen>
    );
  }

  const start = addDaysIso(todayIso(), startOffset);
  return (
    <Screen footer={<Button label="Publier l'offre" loading={create.isPending} disabled={!place} onPress={publish} />}>
      <StepHeader step={4} back={back}
        listen={`Quand et où ? Début ${relativeDay(start)}. Lieu : ${place?.locality ?? ''}. Vérifiez le résumé, puis touchez Publier l'offre.`} />
      <T variant="title">Quand et où ?</T>
      <T variant="label" color={colors.muted}>Début</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[0, 1, 2, 3, 7].map((d) => (
          <Chip key={d} label={d === 0 ? "Aujourd'hui" : d === 1 ? 'Demain' : d === 7 ? 'Dans 1 semaine' : `Dans ${d} jours`}
            selected={startOffset === d} onPress={() => setStartOffset(d)} />
        ))}
      </View>
      <T variant="label" color={colors.muted}>Lieu de la plantation</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip icon="locate" label="Ma position" selected={!!place?.fromGps}
          onPress={() => currentPlace().then((p) => p.fromGps && setPlace({ ...p, locality: nearestTownLabel(p.lat, p.lng) }))} />
        {TOWNS.map((t) => <Chip key={t.name} label={t.name} selected={!place?.fromGps && place?.locality === t.name}
          onPress={() => setPlace({ lat: t.lat, lng: t.lng, locality: t.name, fromGps: false })} />)}
      </View>
      <View style={{ backgroundColor: colors.field, borderRadius: radius.lg, padding: space.lg, gap: 6 }}>
        <T variant="bodyStrong">{cat ? jobTitle(cat, crop) : ''}</T>
        <T variant="small" color={colors.ink2}>
          {people} personne{people > 1 ? 's' : ''} · {mode === 'DAILY' ? `${days} jours à ${fcfa(rate)} FCFA` : `${fcfa(taskRate)} FCFA par personne`} · {shortDate(start)}
        </T>
        <T variant="h3">{fcfa(total)} FCFA au total</T>
        <T variant="tiny" color={colors.muted}>Vous payez seulement quand vous embauchez quelqu’un.</T>
      </View>
      {create.error && <Banner tone="alert">{errorMessage(create.error)}</Banner>}
    </Screen>
  );
}

function StepHeader({ step, back, listen }: { step: number; back: () => void; listen: string }) {
  return (
    <View style={{ gap: space.lg }}>
      <Header listen={listen} onBack={back} />
      <Progress step={step} total={TOTAL} />
    </View>
  );
}

function ModeCard({ on, icon, title, sub, recommended, onPress }: { on: boolean; icon: 'calendar' | 'task'; title: string; sub: string; recommended?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={onPress}
      style={({ pressed }) => [{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: radius.lg,
        borderWidth: on ? 2 : 1.5, borderColor: on ? colors.ink : colors.line, backgroundColor: on ? colors.canvas : colors.white }, pressed && { opacity: 0.7 }]}>
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: on ? colors.ink : colors.field, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} color={on ? colors.white : colors.ink} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T style={{ fontSize: 18, fontWeight: '800' }}>{title}</T>
          {recommended && <View style={{ paddingHorizontal: 8, height: 22, borderRadius: 11, backgroundColor: colors.greenSoft, justifyContent: 'center' }}>
            <T variant="tiny" color={colors.greenText} style={{ fontWeight: '700' }}>Conseillé</T>
          </View>}
        </View>
        <T variant="small" color={colors.ink2}>{sub}</T>
      </View>
    </Pressable>
  );
}

const Divider = () => <View style={{ height: 1, backgroundColor: colors.line }} />;
