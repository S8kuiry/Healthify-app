import { createContext, useContext, useEffect, useState } from "react";
import { runMigrations } from '../db/schema';
import { getProfile, upsertProfile } from '../db/profileRepo';
import { getAllWeightEntries, upsertWeightEntryForToday } from '../db/weightRepo';
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
    weightHistory: WeightEntry[];
    saveProfile: (profile: NonNullable<Profile>) => Promise<void>;
    updateProfile: (profile: NonNullable<Profile>) => Promise<void>;
    updateGoals: (goals: { stepGoal?: number, calorieGoal?: number }) => Promise<void>;
    clearStepGoal: () => Promise<void>;
    clearCalorieGoal: () => Promise<void>;

}


const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
    const [profile, setProfile] = useState<Profile>(null);
    const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
    const [darkMode, setDarkMode] = useState(false);
    const [isLoading, setIsLoading] = useState(true);



    // NEW — put this in its place:
    useEffect(() => {
        (async () => {
            await runMigrations();
            const savedProfile = await getProfile();
            const history = await getAllWeightEntries();
            setProfile(savedProfile);
            setWeightHistory(history);
            setIsLoading(false);
        })();
    }, [])

    // NEW — put this in its place:
    const saveProfile = async (newProfile: NonNullable<Profile>) => {
        await upsertProfile(newProfile);
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
        const entry = await upsertWeightEntryForToday(newProfile.weightKg);
        setProfile(newProfile);
        setWeightHistory((prev) => {
            const withoutToday = prev.filter((e) => e.date !== entry.date);
            return [...withoutToday, entry];
        });
    };


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
            value={{ profile, weightHistory, isLoading, saveProfile, updateProfile, updateGoals, clearStepGoal, clearCalorieGoal }}>
            {children}
        </ProfileContext.Provider>
    );

}

export function useProfile() {
    const ctx = useContext(ProfileContext);
    if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
    return ctx;
}