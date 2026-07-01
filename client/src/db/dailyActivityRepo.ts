import { getDb } from './client';


export type DailyActivity = {
    date: string;          // 'YYYY-MM-DD'
    steps: number;
    calories: number;
    stepGoal: number;
    calorieGoal: number;
};

/**
 * Snapshot (insert or overwrite) a single day's final steps/calories,
 * along with the goals that were active that day.
 * Called on day-rollover detection, just before the live sensor baseline resets.
 */
export async function upsertDailyActivity(
    date: string,
    steps: number,
    calories: number,
    stepGoal: number,
    calorieGoal: number
): Promise<void> {
    const db = await getDb();
    await db.runAsync(
        `INSERT INTO daily_activity (date, steps, calories, step_goal, calorie_goal)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET
           steps = excluded.steps,
           calories = excluded.calories,
           step_goal = excluded.step_goal,
           calorie_goal = excluded.calorie_goal;`,
        [date, steps, calories, stepGoal, calorieGoal]
    );
}

/**
 * Fetch a single day's snapshot, if it exists. Returns null if that day
 * was never closed out (e.g. before install, or today before rollover).
 */
export async function getDailyActivity(date: string): Promise<DailyActivity | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<any>(
        `SELECT date, steps, calories, step_goal, calorie_goal
         FROM daily_activity WHERE date = ?;`,
        [date]
    );
    if (!row) return null;
    return {
        date: row.date,
        steps: row.steps,
        calories: row.calories,
        stepGoal: row.step_goal,
        calorieGoal: row.calorie_goal,
    };
}

/**
 * Fetch all snapshot rows within an inclusive date range, e.g. for a
 * fixed Monday–Sunday week. Days with no row simply won't appear —
 * caller is responsible for filling gaps with 0.
 */
export async function getWeekActivity(startDate: string, endDate: string): Promise<DailyActivity[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<any>(
        `SELECT date, steps, calories, step_goal, calorie_goal
         FROM daily_activity
         WHERE date BETWEEN ? AND ?
         ORDER BY date ASC;`,
        [startDate, endDate]
    );
    return rows.map((row) => ({
        date: row.date,
        steps: row.steps,
        calories: row.calories,
        stepGoal: row.step_goal,
        calorieGoal: row.calorie_goal,
    }));
}

/**
 * Fetch all snapshot rows for a given month, e.g. '2026-06'.
 */
export async function getMonthActivity(yearMonth: string): Promise<DailyActivity[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<any>(
        `SELECT date, steps, calories, step_goal, calorie_goal
         FROM daily_activity
         WHERE date LIKE ?
         ORDER BY date ASC;`,
        [`${yearMonth}-%`]
    );
    return rows.map((row) => ({
        date: row.date,
        steps: row.steps,
        calories: row.calories,
        stepGoal: row.step_goal,
        calorieGoal: row.calorie_goal,
    }));
}

/**
 * Delete a snapshot row (rarely needed — e.g. debugging/testing).
 */
export async function deleteDailyActivity(date: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(`DELETE FROM daily_activity WHERE date = ?;`, [date]);
}