import MapView, { Marker } from 'react-native-maps';
import { colors, radius } from '@/lib/theme';

export interface PlaceMapProps {
  lat: number;
  lng: number;
  onMove: (lat: number, lng: number) => void;
}

/** Preview of the chosen spot; drag the pin or tap the map to adjust it. */
export function PlaceMap({ lat, lng, onMove }: PlaceMapProps) {
  return (
    <MapView
      style={{ height: 200, borderRadius: radius.lg }}
      region={{ latitude: lat, longitude: lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
      onPress={(e) => onMove(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
      toolbarEnabled={false}>
      <Marker coordinate={{ latitude: lat, longitude: lng }} draggable pinColor={colors.green}
        onDragEnd={(e) => onMove(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)} />
    </MapView>
  );
}
