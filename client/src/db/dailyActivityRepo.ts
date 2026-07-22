import { getDb, getDbFresh } from './client';


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
    // getDbFresh: daily_activity rows are written by the NATIVE step tracker
    // through a different SQLite engine, so the long-lived JS connection can hold
    // a read snapshot taken before those writes. Only the connection differs -
    // the query and its results are unchanged. See getDbFresh's note in db/client.
    const db = await getDbFresh();
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
    // Fresh view of native writes - see getDailyActivity above.
    const db = await getDbFresh();
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
    // Fresh view of native writes - see getDailyActivity above.
    const db = await getDbFresh();
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
 * Fetch all snapshot rows for a given calendar year, e.g. '2026'.
 * Powers the monthly weight-trend chart, which aggregates these days by month.
 */
export async function getYearActivity(year: string): Promise<DailyActivity[]> {
    // Fresh view of native writes - see getDailyActivity above. This one powers
    // the profile page's activity/weight trend chart, which reads PAST days from
    // the DB (unlike the live dashboard count, which comes from native events).
    const db = await getDbFresh();
    const rows = await db.getAllAsync<any>(
        `SELECT date, steps, calories, step_goal, calorie_goal
         FROM daily_activity
         WHERE date LIKE ?
         ORDER BY date ASC;`,
        [`${year}-%`]
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
 * Year-rollover reset: delete every daily-activity snapshot from before the given
 * calendar year, e.g. pruneActivityBeforeYear('2027') drops all 2026-and-earlier
 * rows. Steps/calories history for past years is not carried over.
 */
export async function pruneActivityBeforeYear(year: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(`DELETE FROM daily_activity WHERE date < ?;`, [`${year}-01-01`]);
}

/**
 * Delete a snapshot row (rarely needed — e.g. debugging/testing).
 */
export async function deleteDailyActivity(date: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(`DELETE FROM daily_activity WHERE date = ?;`, [date]);
}

