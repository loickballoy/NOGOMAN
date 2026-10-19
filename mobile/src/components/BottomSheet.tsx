import { ReactNode, useEffect, useState } from 'react';
import { Animated, LayoutChangeEvent, PanResponder, Platform, View } from 'react-native';
import { colors } from '@/lib/theme';

export type Snap = 'map' | 'half' | 'list';

/** How much of the sheet stays visible when the map is full screen. */
const PEEK = 128;

function positions(height: number): Record<Snap, number> {
  return { list: Math.round(height * 0.1), half: Math.round(height * 0.42), map: Math.max(0, height - PEEK) };
}

/**
 * A sheet over the map with three resting positions. Drag the header, or use the
 * header's buttons (not everyone thinks of dragging).
 */
export function BottomSheet({ snap, onSnap, header, children, background }: {
  snap: Snap;
  /** Must be stable, e.g. the setter from useState. */
  onSnap: (s: Snap) => void;
  header: ReactNode;
  children: ReactNode;
  /** Shown behind the sheet: the map. */
  background: ReactNode;
}) {
  const [height, setHeight] = useState(0);
  const [top] = useState(() => new Animated.Value(10_000));
  // Mutable box the gesture callbacks read, so the responder is created once.
  // `onSnap` is captured here, so it must be stable (a useState setter).
  const [box] = useState(() => {
    const b = { height: 0, start: 0, current: 10_000, onSnap, setHeight: (h: number) => { b.height = h; } };
    return b;
  });

  useEffect(() => {
    const id = top.addListener(({ value }) => { box.current = value; });
    return () => top.removeListener(id);
  }, [top, box]);

  useEffect(() => {
    if (!height) return;
    Animated.spring(top, { toValue: positions(height)[snap], useNativeDriver: false, bounciness: 2, speed: 14 }).start();
  }, [snap, height, top]);

  const [responder] = useState(() => PanResponder.create({
    // The header is a drag handle: claim the touch right away. The header's own buttons sit
    // deeper in the tree, so they still get taps first.
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      top.stopAnimation();
      box.start = box.current;
    },
    onPanResponderMove: (_, g) => {
      const p = positions(box.height);
      top.setValue(Math.min(p.map, Math.max(p.list, box.start + g.dy)));
    },
    onPanResponderRelease: (_, g) => {
      const p = positions(box.height);
      // Where the flick would take it, then the nearest resting position.
      const projected = box.current + g.vy * 180;
      const next = (Object.keys(p) as Snap[]).reduce((a, b) => (Math.abs(p[b] - projected) < Math.abs(p[a] - projected) ? b : a));
      Animated.spring(top, { toValue: p[next], useNativeDriver: false, bounciness: 2, speed: 14 }).start();
      box.onSnap(next);
    },
  }));

  function onLayout(e: LayoutChangeEvent) {
    const h = Math.round(e.nativeEvent.layout.height);
    box.setHeight(h);
    setHeight(h);
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>{background}</View>
      {height > 0 && (
        <Animated.View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top, backgroundColor: colors.white,
          borderTopLeftRadius: 24, borderTopRightRadius: 24, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16,
          shadowOffset: { width: 0, height: -6 }, elevation: 12 }}>
          {/* userSelect: dragging on web would otherwise select the header text instead. */}
          <View {...responder.panHandlers} style={[{ paddingTop: 10 }, Platform.OS === 'web' && ({ userSelect: 'none' } as object)]}>
            <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: '#C9CDCB', alignSelf: 'center' }} />
            {header}
          </View>
          <View style={{ flex: 1 }}>{children}</View>
        </Animated.View>
      )}
    </View>
  );
}
