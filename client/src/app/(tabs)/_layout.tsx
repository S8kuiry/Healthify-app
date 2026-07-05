import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: 'rgb(5, 150, 105)',
        tabBarInactiveTintColor: '#5C6470',
        tabBarStyle: {
          backgroundColor: '#161A1F',
          borderTopColor: '#262B31',
          borderTopWidth: 1,
          height: 84,
          paddingBottom: 20,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="pulse-outline" size={18} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reminders"
        options={{
          title: 'Reminders',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" size={18} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="screentime"
        options={{
          title: 'Screen Time',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="phone-portrait-outline" size={18} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={18} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}