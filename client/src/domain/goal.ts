import { activeCalories } from './calorie';

type Profile = {
    heightCm: number;
    weightKg: number;
    age: number;
    sex: 'male' | 'female';
    stepGoal: number;
    calorieGoal: number;
};

const STEP_GOAL_MIN = 500;
const STEP_GOAL_MAX = 100000;
const CALORIE_GOAL_MIN = 50;
const CALORIE_GOAL_MAX = 5000;

export function validateStepGoal(value: number): boolean {
    if (value === 0) return false; // 0 is "unset", not a valid save value
    return value >= STEP_GOAL_MIN && value <= STEP_GOAL_MAX;
}

export function validateCalorieGoal(value: number): boolean {
    if (value === 0) return false;
    return value >= CALORIE_GOAL_MIN && value <= CALORIE_GOAL_MAX;
}

export function hasStepGoal(profile: Profile): boolean {
    return profile.stepGoal > 0;
}

export function hasCalorieGoal(profile: Profile): boolean {
    return profile.calorieGoal > 0;
}

export function hasAnyGoal(profile: Profile): boolean {
    return hasStepGoal(profile) || hasCalorieGoal(profile);
}

function clamp01(value: number): number {
    if (Number.isNaN(value) || !Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
}

export function stepProgress(steps: number, stepGoal: number): number {
    if (stepGoal <= 0) return 0;
    return clamp01(steps / stepGoal);
}

export function calorieProgress(steps: number, profile: Profile): number {
    if (profile.calorieGoal <= 0) return 0;
    const calories = activeCalories(steps, profile);
    return clamp01(calories / profile.calorieGoal);
}

export function primaryProgress(steps: number, profile: Profile): number {
    if (hasStepGoal(profile)) return stepProgress(steps, profile.stepGoal);
    if (hasCalorieGoal(profile)) return calorieProgress(steps, profile);
    return 0;
}