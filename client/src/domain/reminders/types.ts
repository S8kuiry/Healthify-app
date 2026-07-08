export type RepeatMode = 'daily' | 'once';

export type ReminderTime = {
    id:string;
    reminderId:string;
    time: string | null;          // "HH:mm", 24-hour
    repeat: RepeatMode;
    date: string | null;   // only set when repeat === 'once'
    fireCount: number;
    fireIntervalSeconds: number;
    repeatBurstDaily: boolean; // only meaningful when repeat === 'daily' && fireCount > 1
    notificationIds: string[]; // parsed from JSON on read

}

export type Reminder = {
    id: string;
    label: string;
    enabled: boolean;
    times: ReminderTime[];
};

// What a single time looks like BEFORE it's saved (no id, no notificationIds yet)
export type ParsedTimeDraft = {
    time: string | null;
    repeat: RepeatMode;
    date: string | null;
    fireCount: number;
    fireIntervalSeconds: number;
    repeatBurstDaily: boolean; // only meaningful when repeat === 'daily' && fireCount > 1
    meridiemAmbiguous: boolean; // true when chrono guessed AM/PM rather than being told

};

// What the parser (Phase R4) hands to the editor (Phase R5)
export type ParsedReminderDraft = {
    label: string;
    times: ParsedTimeDraft[];
    needsEventClarification: boolean;
  };


