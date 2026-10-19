import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheet, Snap } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { JobCard } from '@/components/JobCard';
import { JobMap } from '@/components/JobMap';
import { Banner, Button, Chip, Empty, ListenButton, Loading, styles as ui, T } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { CATEGORIES } from '@/lib/catalog';
import { fcfa, km } from '@/lib/format';
import { currentPlace, Place } from '@/lib/location';
import { useJobsNear } from '@/lib/queries';
import { colors, radius, space } from '@/lib/theme';
import { JobCategory } from '@/lib/types';

const PAGE = 30;
// Nearest first by default, but nothing is hidden: people move across the country for work.
const DISTANCES: { label: string; km: number | null }[] = [
  { label: 'Tout le pays', km: null },
  { label: '100 km', km: 100 },
  { label: '25 km', km: 25 },
];

export default function WorkerHome() {
  const [place, setPlace] = useState<Place | null>(null);
  const [filter, setFilter] = useState<JobCategory | null>(null);
  const [radiusKm, setRadiusKm] = useState<number | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [snap, setSnap] = useState<Snap>('half');
  const jobs = useJobsNear(place?.lat, place?.lng, radiusKm, limit);

  useEffect(() => { currentPlace().then(setPlace); }, []);

  const all = jobs.data ?? [];
  const list = filter ? all.filter((j) => j.category === filter) : all;
  const nearest = list[0];
  const scope = radiusKm ? `à moins de ${radiusKm} kilomètres` : 'dans tout le pays';
  const listen = list.length === 0
    ? `Il n'y a pas encore d'offre ${scope}. Revenez plus tard.`
    : `Il y a ${list.length} offre${list.length > 1 ? 's' : ''} ${scope}. La plus proche : ${nearest.title}, à ${km(nearest.distanceKm ?? 0).replace('\u00A0km', '')} kilomètres, ${fcfa(nearest.workerNetXof)} francs ${nearest.payMode === 'DAILY' ? 'par jour' : 'pour la tâche'}. Touchez une offre pour voir le détail. Pour voir la carte en grand, touchez Agrandir la carte.`;

  const mapFull = snap === 'map';
  const map = (
    <>
      {place ? <JobMap center={place} spanKm={(radiusKm ?? 150) * 2} jobs={list} onSelect={(j) => router.push(`/job/${j.id}`)} /> : <Loading />}
      <SafeAreaView edges={['top']} style={{ position: 'absolute', left: 16, right: 16, top: 0 }}>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          <View style={{ flex: 1, height: 52, borderRadius: radius.lg, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16,
            shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}>
            <Icon name="pin" />
            <T variant="bodyStrong">{radiusKm ? 'Travail près de vous' : 'Travail dans tout le pays'}</T>
          </View>
          <View style={{ borderRadius: 26, elevation: 4, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
            <ListenButton text={listen} compact surface={colors.white} />
          </View>
        </View>
      </SafeAreaView>
    </>
  );

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm }}>
      <View style={{ flex: 1 }}>
        <T variant="h2">{radiusKm ? 'Près de vous' : 'Offres'}</T>
        <T variant="label" color={colors.muted}>{list.length} offre{list.length > 1 ? 's' : ''} · {radiusKm ? `${radiusKm} km` : 'tout le pays'}</T>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={mapFull ? 'Voir la liste' : 'Agrandir la carte'}
        onPress={() => setSnap(mapFull ? 'half' : 'map')} hitSlop={8}
        style={({ pressed }) => [ui.chip, mapFull && ui.chipOn, pressed && ui.pressed]}>
        <Icon name={mapFull ? 'briefcase' : 'map'} size={18} color={mapFull ? colors.white : colors.ink} />
        <T variant="label" style={{ fontWeight: '700' }} color={mapFull ? colors.white : colors.ink}>{mapFull ? 'Voir la liste' : 'Agrandir la carte'}</T>
      </Pressable>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#ECEEEA' }}>
      <BottomSheet snap={snap} onSnap={setSnap} header={header} background={map}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.md, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={jobs.isRefetching} onRefresh={() => { jobs.refetch(); }} />}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {DISTANCES.map((d) => (
              <Chip key={d.label} label={d.label} icon={d.km ? undefined : 'map'} selected={radiusKm === d.km}
                onPress={() => { setRadiusKm(d.km); setLimit(PAGE); }} />
            ))}
          </View>
          {place && !place.fromGps && <Banner tone="info" icon="locate">Position non disponible : offres autour de Daloa.</Banner>}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Chip label="Tout" selected={!filter} onPress={() => setFilter(null)} />
            {CATEGORIES.map((c) => <Chip key={c.id} label={c.label} icon={c.icon} selected={filter === c.id} onPress={() => setFilter(c.id)} />)}
          </ScrollView>
          {jobs.isLoading || !place ? <Loading /> : jobs.error ? <Banner tone="alert">{errorMessage(jobs.error)}</Banner>
            : list.length === 0 ? <Empty icon="map" title="Pas encore d'offre ici">Tirez vers le bas pour actualiser.</Empty>
            : list.map((j) => <JobCard key={j.id} job={j} onPress={() => router.push(`/job/${j.id}`)} />)}
          {all.length === limit && (
            <Button variant="secondary" label="Voir plus d'offres" loading={jobs.isFetching} onPress={() => setLimit(limit + PAGE)} />
          )}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}
