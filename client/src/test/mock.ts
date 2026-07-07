import type { Reminder } from '@/domain/reminders/types';

export const MOCK_REMINDERS: Reminder[] = [
  {
    id: 'rem-001',
    label: 'LeetCode Daily Challenge',
    enabled: true,
    times: [
      {
        id: 't-101',
        reminderId: 'rem-001',
        time: '08:30',
        repeat: 'daily',
        date: null,
        fireCount: 1,
        fireIntervalSeconds: 60,
        repeatBurstDaily: true,
        notificationIds: ['notif-lc-1']
      }
    ]
  },
  {
    id: 'rem-002',
    label: 'Hydration Track',
    enabled: true,
    times: [
      {
        id: 't-201',
        reminderId: 'rem-002',
        time: '09:00',
        repeat: 'daily',
        date: null,
        fireCount: 1,
        fireIntervalSeconds: 60,
        repeatBurstDaily: true,
        notificationIds: ['notif-h2o-1']
      },
      {
        id: 't-202',
        reminderId: 'rem-002',
        time: '14:00',
        repeat: 'daily',
        date: null,
        fireCount: 1,
        fireIntervalSeconds: 60,
        repeatBurstDaily: true,
        notificationIds: ['notif-h2o-2']
      },
      {
        id: 't-203',
        reminderId: 'rem-002',
        time: '19:30',
        repeat: 'daily',
        date: null,
        fireCount: 1,
        fireIntervalSeconds: 60,
        repeatBurstDaily: true,
        notificationIds: ['notif-h2o-3']
      }
    ]
  },
  {
    id: 'rem-003',
    label: 'Computer Networks Lecture',
    enabled: true,
    times: [
      {
        id: 't-301',
        reminderId: 'rem-003',
        time: '10:00',
        repeat: 'daily',
        date: null,
        fireCount: 1,
        fireIntervalSeconds: 60,
        repeatBurstDaily: true,
        notificationIds: ['notif-cn-1']
      }
    ]
  },
  {
    id: 'rem-004',
    label: 'Posture Check & Stretch',
    enabled: true,
    times: [
      {
        id: 't-401',
        reminderId: 'rem-004',
        time: '13:00',
        repeat: 'daily',
        date: null,
        // Nagging mechanism: triggers 3 times spaced 5 minutes apart
        fireCount: 3,
        fireIntervalSeconds: 300,
        repeatBurstDaily: false,
        notificationIds: ['notif-p-1', 'notif-p-2', 'notif-p-3']
      }
    ]
  },
  {
    id: 'rem-005',
    label: 'Submit Compiler Design Lab',
    enabled: true,
    times: [
      {
        id: 't-501',
        reminderId: 'rem-005',
        time: '17:00',
        repeat: 'once',
        date: '2026-07-10',
        fireCount: 1,
        fireIntervalSeconds: 60,
        repeatBurstDaily: false,
        notificationIds: ['notif-cd-lab']
      }
    ]
  },
  {
    id: 'rem-006',
    label: 'Gym Session',
    enabled: false, 
    times: [
      {
        id: 't-601',
        reminderId: 'rem-006',
        time: '18:15',
        repeat: 'daily',
        date: null,
        fireCount: 1,
        fireIntervalSeconds: 60,
        repeatBurstDaily: true,
        notificationIds: ['notif-gym-1']
      }
    ]
  },
  {
    id: 'rem-007',
    label: 'Review DBMS Revision Notes',
    enabled: true,
    times: [
      {
        id: 't-701',
        reminderId: 'rem-007',
        time: '20:00',
        repeat: 'daily',
        date: null,
        fireCount: 1,
        fireIntervalSeconds: 60,
        repeatBurstDaily: true,
        notificationIds: ['notif-dbms-1']
      }
    ]
  },
  {
    id: 'rem-008',
    label: 'Call Parents',
    enabled: true,
    times: [
      {
        id: 't-801',
        reminderId: 'rem-008',
        time: '21:00',
        repeat: 'once',
        date: '2026-07-12',
        fireCount: 1,
        fireIntervalSeconds: 60,
        repeatBurstDaily: false,
        notificationIds: ['notif-call-fam']
      }
    ]
  },
  {
    id: 'rem-009',
    label: 'Sync Local Commits to GitHub',
    enabled: true,
    times: [
      {
        id: 't-901',
        reminderId: 'rem-009',
        time: '23:30',
        repeat: 'daily',
        date: null,
        // Triggers twice to make sure code is pushed before the end of day
        fireCount: 2,
        fireIntervalSeconds: 120,
        repeatBurstDaily: false,
        notificationIds: ['notif-git-1', 'notif-git-2']
      }
    ]
  },
  {
    id: 'rem-010',
    label: 'Pick up Semester Marksheet',
    enabled: false,
    times: [
      {
        id: 't-1001',
        reminderId: 'rem-010',
        time: '11:30',
        repeat: 'once',
        date: '2026-07-15',
        fireCount: 1,
        fireIntervalSeconds: 60,
        repeatBurstDaily: false,
        notificationIds: ['notif-docs-1']
      }
    ]
  }
];