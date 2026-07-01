import { getDb } from "./client";


export type Profile={
    heightCm: number;
  weightKg: number;
  age: number;
  sex: 'male' | 'female';
  stepGoal: number;
  calorieGoal: number;
}

export async function getProfile(): Promise<Profile | null>{
    const db = await getDb()
    const row = await db.getFirstAsync<{
        height_cm: number;
        weight_kg: number;
        age: number;
        sex: string;
        step_goal: number;
        calorie_goal: number;
    }>('SELECT height_cm, weight_kg, age, sex, step_goal, calorie_goal FROM user_profile WHERE id = 1;');

    if (!row) return null;

    return {
        heightCm: row.height_cm,
        weightKg: row.weight_kg,
        age: row.age,
        sex: row.sex as 'male' | 'female',
        stepGoal: row.step_goal,
        calorieGoal: row.calorie_goal,
    };

}


export async function upsertProfile(profile: Profile): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO user_profile (id, height_cm, weight_kg, age, sex)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         height_cm = excluded.height_cm,
         weight_kg = excluded.weight_kg,
         age = excluded.age,
         sex = excluded.sex,
         step_goal = excluded.step_goal,
         calorie_goal = excluded.calorie_goal;`,
      [profile.heightCm, profile.weightKg, profile.age, profile.sex]
    );
}

export async function updateGoals(stepGoal: number, calorieGoal: number): Promise<void> {
  const db = await getDb(); // however you access your db instance in this file — match existing pattern
  await db.runAsync(
      `UPDATE user_profile SET step_goal = ?, calorie_goal = ? WHERE id = 1;`,
      [stepGoal, calorieGoal]
  );
}