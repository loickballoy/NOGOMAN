import MapView, { Marker } from 'react-native-maps';
import { View } from 'react-native';
import { fcfa } from '@/lib/format';
import { colors } from '@/lib/theme';
import { Job } from '@/lib/types';
import { T } from './ui';

export interface JobMapProps {
  center: { lat: number; lng: number };
  /** Rough width of the area to show, in km. */
  spanKm: number;
  jobs: Job[];
  selectedId?: string;
  onSelect: (job: Job) => void;
}

/** Price pins on the map, like the design: black pills, the selected one in green. */
export function JobMap({ center, spanKm, jobs, selectedId, onSelect }: JobMapProps) {
  const delta = Math.min(spanKm / 111, 12);
  return (
    <MapView
      key={spanKm}
      style={{ flex: 1 }}
      initialRegion={{ latitude: center.lat, longitude: center.lng, latitudeDelta: delta, longitudeDelta: delta }}
      showsUserLocation
      toolbarEnabled={false}>
      {jobs.map((job) => (
        <Marker key={job.id} coordinate={{ latitude: job.lat, longitude: job.lng }} onPress={() => onSelect(job)}
          accessibilityLabel={`${job.title}, ${fcfa(job.workerNetXof)} francs`}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ paddingHorizontal: 12, height: 32, borderRadius: 16, justifyContent: 'center',
              backgroundColor: job.id === selectedId ? colors.green : colors.ink }}>
              <T style={{ fontSize: 15, fontWeight: '800' }} color={colors.white}>{fcfa(job.workerNetXof)}</T>
            </View>
          </View>
        </Marker>
      ))}
    </MapView>
  );
}
