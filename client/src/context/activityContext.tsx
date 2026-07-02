import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { activeCalories } from '@/domain/calorie';
import { getCurrentWeekRange } from '@/domain/date';
import { getWeekActivity, type DailyActivity } from '@/db/dailyActivityRepo';
import { useProfile } from '@/context/profileContext';
import {
  addStepUpdateListener,
  getTodaySteps,
  getTodayStepsRaw,
  hasStepSensor,
  initStepTracking,
  setActivityProfile,
} from '../../modules/step-tracker/src';
import type { StepUpdateEvent } from '../../modules/step-tracker/src/StepTrackerModule';
import type { EventSubscription } from 'expo-modules-core';

type ActivityContextValue = {
  steps: number | null;
  calories: number | null;
  weekData: DailyActivity[];
  permissionDenied: boolean;
  sensorMissing: boolean;
  refreshWeekFromDb: () => Promise<void>;
};

const ActivityContext = createContext<ActivityContextValue | undefined>(undefined);

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useProfile();

  const [steps, setSteps] = useState<number | null>(null);
  const [weekData, setWeekData] = useState<DailyActivity[]>([]);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [sensorMissing, setSensorMissing] = useState(false);

  const refreshWeekFromDb = useCallback(async () => {
    const { start, end } = getCurrentWeekRange();
    const rows = await getWeekActivity(start, end);
    setWeekData(rows);
  }, []);

  const syncProfileToNative = useCallback(() => {
    if (Platform.OS !== 'android') return;
    if (!profile) return;
    setActivityProfile(profile.heightCm, profile.weightKg, profile.stepGoal, profile.calorieGoal);
  }, [profile]);

  useEffect(() => {
    if (!profile) return;

    let sub: EventSubscription | undefined;

    (async () => {
      // Ensure native has current profile/goals for notification + DB snapshots.
      syncProfileToNative();

      // Start foreground service after permissions (Android only).
      const ok = await initStepTracking();
      setPermissionDenied(!ok);

      // Initialize UI state from current native store.
      const raw = getTodayStepsRaw();
      setSensorMissing(raw === -1 && !hasStepSensor());
      setSteps(getTodaySteps());
      await refreshWeekFromDb();

      // Subscribe to native updates (event-driven, no polling).
      sub = addStepUpdateListener((evt: StepUpdateEvent) => {
        setSteps(evt.steps);
      });
    })();

    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        syncProfileToNative();
        setSteps(getTodaySteps());
        refreshWeekFromDb();
      }
    });

    return () => {
      sub?.remove();
      appSub.remove();
    };
  }, [profile, refreshWeekFromDb, syncProfileToNative]);

  const calories = useMemo(() => {
    if (!profile || steps === null) return null;
    return activeCalories(steps, profile);
  }, [profile, steps]);

  const value: ActivityContextValue = useMemo(
    () => ({
      steps,
      calories,
      weekData,
      permissionDenied,
      sensorMissing,
      refreshWeekFromDb,
    }),
    [steps, calories, weekData, permissionDenied, sensorMissing, refreshWeekFromDb]
  );

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}

export function useActivity() {
  const ctx = useContext(ActivityContext);
  if (!ctx) throw new Error('useActivity must be used within ActivityProvider');
  return ctx;
}

