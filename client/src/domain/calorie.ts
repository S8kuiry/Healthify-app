/**
 * Pure calorie/distance math — no side effects, no dependencies on
 * React or the database. Kept separate so the formulas can be tested
 * or tuned in isolation without touching UI code.
 */

export type ProfileForCalc = {
    heightCm: number;
    weightKg: number;
  };
  
  // Standard walking-stride estimate: stride length ≈ 41.5% of height.
  export function strideLengthMeters(heightCm: number): number {
    return (heightCm * 0.415) / 100;
  }
  
  export function distanceKm(steps: number, heightCm: number): number {
    const stride = strideLengthMeters(heightCm);
    return (steps * stride) / 1000;
  }
  
  // Active calories burned purely from walking distance — 0 steps = 0 calories.
  // 0.5 is a standard walking MET-derived constant (kcal per kg per km).
  export function activeCalories(steps: number, profile: ProfileForCalc): number {
    if (steps <= 0) return 0;
    const dist = distanceKm(steps, profile.heightCm);
    return Math.round(dist * profile.weightKg * 0.5);
  }