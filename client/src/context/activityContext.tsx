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
  const { profile, dbReady } = useProfile();

  const [steps, setSteps] = useState<number | null>(null);
  const [weekData, setWeekData] = useState<DailyActivity[]>([]);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [sensorMissing, setSensorMissing] = useState(false);

  const refreshWeekFromDb = useCallback(async () => {
    const { start, end } = getCurrentWeekRange();
    const rows = await getWeekActivity(start, end);
    setWeekData(rows);
  }, []);

  // Initialize step tracking once both the DB is ready AND the profile has loaded.
  // IMPORTANT: profile loads asynchronously, so on a cold start dbReady often becomes
  // true while profile is still null. This effect must therefore depend on the profile
  // becoming available (profile?.id) — otherwise it bails on the null-profile pass and,
  // with profile absent from the deps, never re-runs, so the foreground service never
  // starts (no notification, no step counting). Keyed on profile?.id so it runs once
  // per profile, not on every goal/metric edit (those are handled by the effect below).
  useEffect(() => {
    console.log('[StepDiag] effect fired. dbReady=', dbReady, 'hasProfile=', !!profile, 'platform=', Platform.OS);
    if (!profile || !dbReady || Platform.OS !== 'android') {
      console.log('[StepDiag] BAILED early (profile/dbReady/platform guard)');
      return;
    }

    let sub: EventSubscription | undefined;
    let cancelled = false;

    (async () => {
      console.log('[StepDiag] importing step-tracker module...');
      const stepTracker = await import('../../modules/step-tracker/src');

      if (cancelled) return;

      console.log('[StepDiag] native available=', stepTracker.isStepTrackerNativeAvailable());

      stepTracker.setActivityProfile(
        profile.heightCm,
        profile.weightKg,
        profile.stepGoal ?? 0,
        profile.calorieGoal ?? 0
      );

      // Register listener before starting the foreground service so native
      // step events don't hit an empty bridge during service startup.
      sub = stepTracker.addStepUpdateListener((evt: StepUpdateEvent) => {
        console.log('[StepDiag] step update received:', evt.steps);
        setSteps(evt.steps);
      });

      console.log('[StepDiag] calling initStepTracking()...');
      const ok = await stepTracker.initStepTracking();
      console.log('[StepDiag] initStepTracking() returned:', ok);
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
    // Depend on whether a profile exists (not the object) so this re-runs once when
    // the profile finishes loading after a cold start, but not on every goal/metric
    // edit. profile has no stable id field, so a boolean is the correct key here.
  }, [dbReady, !!profile, refreshWeekFromDb]);

  // Separate effect: update goals without reinitializing listener
  useEffect(() => {
    if (!profile || !dbReady || Platform.OS !== 'android') return;

    (async () => {
      const stepTracker = await import('../../modules/step-tracker/src');
      stepTracker.setActivityProfile(
        profile.heightCm,
        profile.weightKg,
        profile.stepGoal ?? 0,
        profile.calorieGoal ?? 0
      );
    })();
  }, [profile?.stepGoal, profile?.calorieGoal, profile?.heightCm, profile?.weightKg, dbReady]);

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
