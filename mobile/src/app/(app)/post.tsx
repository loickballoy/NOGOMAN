import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Calendar } from '@/components/Calendar';
import { Icon } from '@/components/Icon';
import { PlacePicker } from '@/components/PlacePicker';
import { Banner, Button, Chip, Header, Progress, Screen, Stepper, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { CATEGORIES, CROPS, jobTitle } from '@/lib/catalog';
import { addDaysIso, fcfa, relativeDay, shortDate, todayIso } from '@/lib/format';
import { useApiMutation } from '@/lib/queries';
import { colors, radius, space } from '@/lib/theme';
import { Job, JobCategory, PayMode, Place } from '@/lib/types';

const TOTAL = 5;
// How far ahead a job can be posted.
const MAX_DAYS_AHEAD = 180;
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
  const today = todayIso();
  const [start, setStart] = useState(addDaysIso(today, 1));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);

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
      startDate: start,
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

  if (step === 4) {
    const quick = [0, 1, 2, 7].map((d) => addDaysIso(today, d));
    const isQuick = quick.includes(start);
    const quickLabel = (d: number) => (d === 0 ? "Aujourd'hui" : d === 1 ? 'Demain' : d === 7 ? 'Dans 1 semaine' : `Dans ${d} jours`);
    return (
      <Screen footer={<Button label="Continuer" onPress={() => setStep(5)} />}>
        <StepHeader step={4} back={back}
          listen={`Quand commence le travail ? Choisissez aujourd'hui, demain, ou une autre date dans le calendrier. Début choisi : ${relativeDay(start)}, ${shortDate(start)}.`} />
        <T variant="title">Quand commence le travail ?</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[0, 1, 2, 7].map((d, i) => (
            <Chip key={d} label={quickLabel(d)} selected={start === quick[i] && !calendarOpen} onPress={() => { setStart(quick[i]); setCalendarOpen(false); }} />
          ))}
          <Chip icon="calendar" label={!isQuick ? shortDate(start) : 'Autre date'} selected={calendarOpen || !isQuick} onPress={() => setCalendarOpen(true)} />
        </View>
        {calendarOpen && (
          <Calendar value={start} min={today} max={addDaysIso(today, MAX_DAYS_AHEAD)}
            onChange={(d) => setStart(d)} />
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.field, borderRadius: radius.lg, padding: space.lg }}>
          <Icon name="calendar" />
          <T variant="bodyStrong">Début : {shortDate(start)} ({relativeDay(start)})</T>
        </View>
      </Screen>
    );
  }

  return (
    <Screen footer={<Button label="Publier l'offre" loading={create.isPending} disabled={!place} onPress={publish} />}>
      <StepHeader step={5} back={back}
        listen={place
          ? `La plantation est à ${place.locality}. Vérifiez le repère sur la carte, puis touchez Publier l'offre. Total : ${fcfa(total)} francs.`
          : "Où est la plantation ? Si vous y êtes, touchez Je suis à la plantation. Sinon, écrivez le nom du village ou de la ville."} />
      <T variant="title">Où est la plantation ?</T>
      <PlacePicker value={place} onChange={setPlace} />
      {place && (
        <View style={{ backgroundColor: colors.field, borderRadius: radius.lg, padding: space.lg, gap: 6 }}>
          <T variant="bodyStrong">{cat ? jobTitle(cat, crop) : ''} · {place.locality}</T>
          <T variant="small" color={colors.ink2}>
            {people} personne{people > 1 ? 's' : ''} · {mode === 'DAILY' ? `${days} jours à ${fcfa(rate)} FCFA` : `${fcfa(taskRate)} FCFA par personne`} · début {shortDate(start)}
          </T>
          <T variant="h3">{fcfa(total)} FCFA au total</T>
          <T variant="tiny" color={colors.muted}>Vous payez seulement quand vous embauchez quelqu’un. Les travailleurs voient le village ; l’adresse exacte seulement une fois embauchés.</T>
        </View>
      )}
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
