import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { activeCalories } from '@/domain/calorie';
import { getCurrentWeekRange } from '@/domain/date';
import { getWeekActivity, type DailyActivity } from '@/db/dailyActivityRepo';
import { useProfile } from '@/context/profileContext';
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

  useEffect(() => {
    if (!profile || Platform.OS !== 'android') return;

    let sub: EventSubscription | undefined;
    let cancelled = false;

    (async () => {
      const stepTracker = await import('../../modules/step-tracker/src');

      if (cancelled) return;

      stepTracker.setActivityProfile(
        profile.heightCm,
        profile.weightKg,
        profile.stepGoal ?? 0,
        profile.calorieGoal ?? 0
      );

      // Register listener before starting the foreground service so native
      // step events don't hit an empty bridge during service startup.
      sub = stepTracker.addStepUpdateListener((evt: StepUpdateEvent) => {
        setSteps(evt.steps);
      });

      const ok = await stepTracker.initStepTracking();
      if (cancelled) return;

      setPermissionDenied(!ok);

      const raw = stepTracker.getTodayStepsRaw();
      setSensorMissing(raw === -1 && !stepTracker.hasStepSensor());
      setSteps(stepTracker.getTodaySteps());
      await refreshWeekFromDb();
    })();

    const appSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;

      void (async () => {
        const stepTracker = await import('../../modules/step-tracker/src');
        if (cancelled) return;

        stepTracker.setActivityProfile(
          profile.heightCm,
          profile.weightKg,
          profile.stepGoal ?? 0,
          profile.calorieGoal ?? 0
        );
        setSteps(stepTracker.getTodaySteps());
        await refreshWeekFromDb();
      })();
    });

    return () => {
      cancelled = true;
      sub?.remove();
      appSub.remove();
    };
  }, [profile, refreshWeekFromDb]);

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
