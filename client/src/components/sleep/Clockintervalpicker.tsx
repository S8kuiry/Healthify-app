import { useRef, useMemo, useCallback } from 'react';
import { View, Text, PanResponder } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

const SIZE = 240;
const RADIUS = 100;
const CENTER = SIZE / 2;
const TRACK_WIDTH = 14;
const HANDLE_SIZE = 26;

// The dial only ever represents a standard 12-hour face (like a normal
// clock) - a full revolution = 12 hours, not 24. AM/PM is tracked
// separately (see the toggle in SleepWindowPicker) since a 12-number face
// can't distinguish 3am from 3pm on its own.
export const HALF_DAY_MINUTES = 12 * 60;

function angleForMinutes(minutesOfDay: number): number {
  const modMinutes = minutesOfDay % HALF_DAY_MINUTES;
  return (modMinutes / HALF_DAY_MINUTES) * 2 * Math.PI;
}

/** Converts a raw angle (radians, 0 = top/12, clockwise-positive) to the
 *  nearest 1-minute mark within a single 12-hour lap (0-719). Rounding to 1
 *  (not 5) lets the user pick any minute, e.g. 3:42 / 3:43. */
function minutesWithinHalfDayForAngle(angleRad: number): number {
  const normalized = ((angleRad % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const raw = (normalized / (2 * Math.PI)) * HALF_DAY_MINUTES;
  return Math.round(raw) % HALF_DAY_MINUTES;
}

function pointOnCircle(angleRad: number, radius: number) {
  return {
    x: CENTER + radius * Math.sin(angleRad),
    y: CENTER - radius * Math.cos(angleRad),
  };
}

interface ClockIntervalPickerProps {
  /** Minutes since midnight, 0-1439 (full day value - AM/PM is baked in here) */
  bedMinutes: number;
  wakeMinutes: number;
  onChangeBed: (minutesOfDay: number) => void;
  onChangeWake: (minutesOfDay: number) => void;
  accent: string;
  track: string;
  cardBackground: string;
  centerLabel?: string;
  centerSubLabel?: string;
}

export default function ClockIntervalPicker({
  bedMinutes,
  wakeMinutes,
  onChangeBed,
  onChangeWake,
  accent,
  track,
  cardBackground,
  centerLabel,
  centerSubLabel,
}: ClockIntervalPickerProps) {
  const containerRef = useRef<View>(null);
  const centerPage = useRef({ x: 0, y: 0 });

  // Refs so the stable PanResponders (created once) always read the latest
  // callbacks AND the latest full-day values - the latter is needed to know
  // which AM/PM half to preserve while the user drags around the 12h face.
  const onChangeBedRef = useRef(onChangeBed);
  const onChangeWakeRef = useRef(onChangeWake);
  const bedMinutesRef = useRef(bedMinutes);
  const wakeMinutesRef = useRef(wakeMinutes);
  onChangeBedRef.current = onChangeBed;
  onChangeWakeRef.current = onChangeWake;
  bedMinutesRef.current = bedMinutes;
  wakeMinutesRef.current = wakeMinutes;

  const measureCenter = useCallback(() => {
    containerRef.current?.measureInWindow((x, y, width, height) => {
      centerPage.current = { x: x + width / 2, y: y + height / 2 };
    });
  }, []);

  const angleFromTouch = useCallback((pageX: number, pageY: number): number => {
    const dx = pageX - centerPage.current.x;
    const dy = pageY - centerPage.current.y;
    return Math.atan2(dx, -dy);
  }, []);

  const bedResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const withinHalfDay = minutesWithinHalfDayForAngle(
            angleFromTouch(evt.nativeEvent.pageX, evt.nativeEvent.pageY)
          );
          const isPM = bedMinutesRef.current >= HALF_DAY_MINUTES;
          onChangeBedRef.current(withinHalfDay + (isPM ? HALF_DAY_MINUTES : 0));
        },
        onPanResponderMove: (evt) => {
          const withinHalfDay = minutesWithinHalfDayForAngle(
            angleFromTouch(evt.nativeEvent.pageX, evt.nativeEvent.pageY)
          );
          const isPM = bedMinutesRef.current >= HALF_DAY_MINUTES;
          onChangeBedRef.current(withinHalfDay + (isPM ? HALF_DAY_MINUTES : 0));
        },
      }),
    [angleFromTouch]
  );

  const wakeResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const withinHalfDay = minutesWithinHalfDayForAngle(
            angleFromTouch(evt.nativeEvent.pageX, evt.nativeEvent.pageY)
          );
          const isPM = wakeMinutesRef.current >= HALF_DAY_MINUTES;
          onChangeWakeRef.current(withinHalfDay + (isPM ? HALF_DAY_MINUTES : 0));
        },
        onPanResponderMove: (evt) => {
          const withinHalfDay = minutesWithinHalfDayForAngle(
            angleFromTouch(evt.nativeEvent.pageX, evt.nativeEvent.pageY)
          );
          const isPM = wakeMinutesRef.current >= HALF_DAY_MINUTES;
          onChangeWakeRef.current(withinHalfDay + (isPM ? HALF_DAY_MINUTES : 0));
        },
      }),
    [angleFromTouch]
  );

  const bedAngle = angleForMinutes(bedMinutes);
  const wakeAngle = angleForMinutes(wakeMinutes);
  const bedPoint = pointOnCircle(bedAngle, RADIUS);
  const wakePoint = pointOnCircle(wakeAngle, RADIUS);

  const bedDeg = (bedAngle * 180) / Math.PI;
  const wakeDeg = (wakeAngle * 180) / Math.PI;
  const spanDeg = ((wakeDeg - bedDeg) + 360) % 360;
  const largeArcFlag = spanDeg > 180 ? 1 : 0;

  const arcPath = `M ${bedPoint.x} ${bedPoint.y} A ${RADIUS} ${RADIUS} 0 ${largeArcFlag} 1 ${wakePoint.x} ${wakePoint.y}`;

  // Standard analog clock numbers - 12 positions, one per hour.
  const tickLabels = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];

  return (
    <View ref={containerRef} onLayout={measureCenter} style={{ width: SIZE, height: SIZE, alignSelf: 'center' }}>
      <Svg width={SIZE} height={SIZE}>
        <Circle cx={CENTER} cy={CENTER} r={RADIUS} stroke={track} strokeWidth={TRACK_WIDTH} fill="none" />
        <Path d={arcPath} stroke={accent} strokeWidth={TRACK_WIDTH} strokeLinecap="round" fill="none" />
      </Svg>

      {tickLabels.map((label, hour) => {
        const pt = pointOnCircle(angleForMinutes(hour * 60), RADIUS + 20);
        return (
          <Text
            key={hour}
            style={{
              position: 'absolute',
              left: pt.x - 12,
              top: pt.y - 8,
              width: 24,
              textAlign: 'center',
              fontSize: 11,
              fontWeight: '600',
              color: track,
            }}
          >
            {label}
          </Text>
        );
      })}

      {(centerLabel || centerSubLabel) && (
        <View
          style={{ position: 'absolute', left: 0, right: 0, top: CENTER - 20, alignItems: 'center' }}
          pointerEvents="none"
        >
          {centerLabel && (
            <Text style={{ fontWeight: '800', fontSize: 20, color: accent }}>{centerLabel}</Text>
          )}
          {centerSubLabel && (
            <Text style={{ fontSize: 10, fontWeight: '600', color: track, marginTop: 2 }}>
              {centerSubLabel}
            </Text>
          )}
        </View>
      )}

      {/* Bedtime handle - filled with accent */}
      <View
        {...bedResponder.panHandlers}
        style={{
          position: 'absolute',
          left: bedPoint.x - HANDLE_SIZE / 2,
          top: bedPoint.y - HANDLE_SIZE / 2,
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
          borderRadius: HANDLE_SIZE / 2,
          backgroundColor: accent,
          borderWidth: 3,
          borderColor: cardBackground,
          elevation: 4,
        }}
      />

      {/* Wake time handle - outlined so the two are visually distinct */}
      <View
        {...wakeResponder.panHandlers}
        style={{
          position: 'absolute',
          left: wakePoint.x - HANDLE_SIZE / 2,
          top: wakePoint.y - HANDLE_SIZE / 2,
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
          borderRadius: HANDLE_SIZE / 2,
          backgroundColor: cardBackground,
          borderWidth: 3,
          borderColor: accent,
          elevation: 4,
        }}
      />
    </View>
  );
}