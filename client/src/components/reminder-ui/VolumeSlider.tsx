import { useRef, useState } from 'react';
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  View,
} from 'react-native';
import { useAppColors } from '@/hooks/use-app-colors';

const THUMB_SIZE = 24;
const TRACK_HEIGHT = 6;

type Props = {
  /** Current value, 0–100. */
  value: number;
  /** Called continuously while dragging with the new 0–100 value. */
  onChange: (value: number) => void;
  /** Called once when the gesture ends — the place to persist. */
  onCommit?: (value: number) => void;
};

/**
 * Modern, dependency-free volume slider built from RN primitives + PanResponder,
 * so it works in the existing build without adding a native slider package.
 *
 * The value is 0–100. Note the alarm is never truly silent even at 0 — the native
 * AlarmService floors STREAM_ALARM to the lowest audible step (see AlarmService.kt);
 * muting a reminder is done by deactivating its card, not by dragging this to zero.
 */
export default function VolumeSlider({ value, onChange, onCommit }: Props) {
  const colors = useAppColors();
  const [trackWidth, setTrackWidth] = useState(0);
  // Live refs so the gesture callbacks read current values without waiting for
  // React state to propagate (the first drag frame maps correctly).
  const widthRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;

  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

  const pctFromTouch = (evt: GestureResponderEvent) => {
    const w = widthRef.current;
    if (w <= 0) return valueRef.current;
    // locationX is relative to the track view; convert to 0–100 across usable width.
    const usable = w - THUMB_SIZE;
    const x = evt.nativeEvent.locationX - THUMB_SIZE / 2;
    return clamp((x / usable) * 100);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => onChange(pctFromTouch(evt)),
      onPanResponderMove: (evt) => onChange(pctFromTouch(evt)),
      onPanResponderRelease: () => onCommit?.(valueRef.current),
      onPanResponderTerminate: () => onCommit?.(valueRef.current),
    })
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    widthRef.current = w;
    setTrackWidth(w);
  };

  const usable = Math.max(0, trackWidth - THUMB_SIZE);
  const thumbLeft = (value / 100) * usable;
  const fillWidth = thumbLeft + THUMB_SIZE / 2;

  return (
    <View
      onLayout={onLayout}
      hitSlop={{ top: 12, bottom: 12 }}
      style={{ height: THUMB_SIZE, justifyContent: 'center' }}
      {...panResponder.panHandlers}
    >
      {/* Track background */}
      <View
        style={{
          height: TRACK_HEIGHT,
          borderRadius: TRACK_HEIGHT / 2,
          backgroundColor: colors.backgroundElement,
          overflow: 'hidden',
        }}
      >
        {/* Filled portion */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: fillWidth,
            borderRadius: TRACK_HEIGHT / 2,
            backgroundColor: colors.accent,
          }}
        />
      </View>

      {/* Thumb */}
      <View
        style={{
          position: 'absolute',
          left: thumbLeft,
          height: THUMB_SIZE,
          width: THUMB_SIZE,
          borderRadius: THUMB_SIZE / 2,
          backgroundColor: colors.cardBackground,
          borderWidth: 3,
          borderColor: colors.accent,
          // Subtle lift so the thumb reads above the track.
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 3,
          shadowOffset: { width: 0, height: 1 },
          elevation: 3,
        }}
      />
    </View>
  );
}
