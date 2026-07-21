import { createContext, useContext, useEffect, useState } from "react";
import { runMigrations } from '../db/schema';
import { isCorruptionError, recoverCorruptDatabase } from '../db/client';
import { getProfile, upsertProfile } from '../db/profileRepo';
import { getAllWeightEntries, upsertWeightEntry, upsertWeightEntryForToday, deleteWeightEntry, pruneWeightsBeforeYear } from '../db/weightRepo';
import { pruneActivityBeforeYear } from '../db/dailyActivityRepo';
import { getMeta, setMeta } from '../db/appMetaRepo';
import { updateGoals as updateGoalsRepo } from '../db/profileRepo';

type Profile = {
    heightCm: number;
    weightKg: number;
    age: number;
    sex: 'male' | 'female';
    stepGoal: number;
    calorieGoal: number;
} | null;

export type WeightEntry = {
    id: string;
    date: string; // ISO date string, e.g. '2026-06-28'
    weightKg: number;
};

type ProfileContextValue = {
    profile: Profile;
    isLoading: boolean;
    /** True after runMigrations() completes — safe for native SQLite writes. */
    dbReady: boolean;
    weightHistory: WeightEntry[];
    saveProfile: (profile: NonNullable<Profile>) => Promise<void>;
    updateProfile: (profile: NonNullable<Profile>) => Promise<void>;
    updateGoals: (goals: { stepGoal?: number, calorieGoal?: number }) => Promise<void>;
    clearStepGoal: () => Promise<void>;
    clearCalorieGoal: () => Promise<void>;
    updateWeight: (weight: NonNullable<WeightEntry>) => Promise<void>;
    deleteWeight: (id: string) => Promise<void>;
    /** True right after a new-year rollover reset, until the user dismisses the banner. */
    showNewYearBanner: boolean;
    dismissNewYearBanner: () => void;

}


const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
    const [profile, setProfile] = useState<Profile>(null);
    const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
    const [darkMode, setDarkMode] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [dbReady, setDbReady] = useState(false);
    const [showNewYearBanner, setShowNewYearBanner] = useState(false);

    useEffect(() => {
        (async () => {
            await runMigrations();
            setDbReady(true);

            // New-year rollover reset: runs once per calendar year. On first-ever
            // launch we just record the year (nothing to prune). When the year has
            // advanced, silently drop past-year activity + all but the most recent
            // weigh-in, and flag the "new year" banner.
            const currentYear = String(new Date().getFullYear());
            const lastPruneYear = await getMeta('last_prune_year');
            if (lastPruneYear === null) {
                await setMeta('last_prune_year', currentYear);
            } else if (currentYear > lastPruneYear) {
                await pruneActivityBeforeYear(currentYear);
                await pruneWeightsBeforeYear(currentYear);
                await setMeta('last_prune_year', currentYear);
                await setMeta('newyear_banner_year', currentYear);
            }
            setShowNewYearBanner((await getMeta('newyear_banner_year')) === currentYear);

            const savedProfile = await getProfile();
            const history = await getAllWeightEntries();
            setProfile(savedProfile);
            setWeightHistory(history);
            setIsLoading(false);
        })();
    }, [])

    const dismissNewYearBanner = () => {
        setShowNewYearBanner(false);
        void setMeta('newyear_banner_year', '');
    };

    // NEW — put this in its place:
    const saveProfile = async (newProfile: NonNullable<Profile>) => {
        try {
            await upsertProfile(newProfile);
        } catch (err) {
            // Corruption can surface at WRITE time, not just on open: getDb()
            // probes once when the connection is created and runMigrations()
            // self-heals during migration, but a malformed image discovered on
            // this first real insert fell through both. That is the onboarding
            // "Continue does nothing on first launch, works after a restart"
            // bug - the restart merely let the open-time probe run the recovery.
            // Recover and retry here so the very first save succeeds.
            if (!isCorruptionError(err)) throw err;
            console.warn('[profileContext] Corrupt DB on first save; recreating and retrying.');
            await recoverCorruptDatabase();
            await runMigrations();
            await upsertProfile(newProfile);
        }

        const entry = await upsertWeightEntryForToday(newProfile.weightKg);
        setProfile(newProfile);
        setWeightHistory((prev) => {
            const withoutToday = prev.filter((e) => e.date !== entry.date);
            return [...withoutToday, entry];
        });
    };


    // Used from the Edit screen, any time after onboarding.
    // Updates the snapshot AND logs a new dated weight entry,
    // per the decision that editing weight = logging weight.
    // NEW — put this in its place:
    const updateProfile = async (newProfile: NonNullable<Profile>) => {
        await upsertProfile(newProfile);
        // const entry = await upsertWeightEntryForToday(newProfile.weightKg);
        setProfile(newProfile);
        // setWeightHistory((prev) => {
        //     const withoutToday = prev.filter((e) => e.date !== entry.date);
        //     return [...withoutToday, entry];
        // });
    };

    const updateWeight = async (newWeight: NonNullable<WeightEntry>) => {
        const entry = await upsertWeightEntry(newWeight.date, newWeight.weightKg);
        setWeightHistory((prev) => {
            const withoutDate = prev.filter((e) => e.date !== entry.date);
            return [...withoutDate, entry];
        });
    }

    const deleteWeight = async (id: string) => {
        await deleteWeightEntry(id);
        setWeightHistory((prev) => prev.filter((e) => e.id !== id));
    }


    // goals section

    const updateGoals = async (goals:{stepGoal?: number, calorieGoal?: number}) => {
        if(!profile) return;
        const nextStepGoal = goals.stepGoal ?? profile.stepGoal;
        const nextCalorieGoal = goals.calorieGoal ?? profile.calorieGoal;
        await updateGoalsRepo(nextStepGoal, nextCalorieGoal);
        setProfile({ ...profile, stepGoal: nextStepGoal, calorieGoal: nextCalorieGoal });



    }

    const clearStepGoal = async () => {
        if (!profile) return;
        await updateGoalsRepo(0, profile.calorieGoal);
        setProfile({ ...profile, stepGoal: 0 });
    };
    
    const clearCalorieGoal = async () => {
        if (!profile) return;
        await updateGoalsRepo(profile.stepGoal, 0);
        setProfile({ ...profile, calorieGoal: 0 });
    };


    return (
        <ProfileContext.Provider
            value={{ profile, weightHistory, isLoading, dbReady, saveProfile, updateProfile, updateGoals, clearStepGoal, clearCalorieGoal, updateWeight, deleteWeight, showNewYearBanner, dismissNewYearBanner  }}>
            {children}
        </ProfileContext.Provider>
    );

}

export function useProfile() {
    const ctx = useContext(ProfileContext);
    if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
    return ctx;
}