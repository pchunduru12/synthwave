// mobile/app/(tabs)/_layout.tsx — drop-in replacement
import React from 'react';
import { Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { theme } from '../../src/theme';
import { useAuth } from '../../src/lib/auth';

export default function TabLayout() {
  const { user } = useAuth();
  const isAdmin = !!user?.isAdmin;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bg, borderBottomColor: theme.colors.border, borderBottomWidth: 1 },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          height: 60,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarActiveTintColor: theme.colors.magenta,
        tabBarInactiveTintColor: theme.colors.muted,
      }}
    >
      <Tabs.Screen name="create" options={{ title: 'Create', tabBarIcon: ({ color, size }) => <MaterialIcons name="auto-awesome" color={color} size={size} /> }} />
      <Tabs.Screen name="library" options={{ title: 'Library', tabBarIcon: ({ color, size }) => <MaterialIcons name="library-music" color={color} size={size} /> }} />
      <Tabs.Screen name="usage" options={{ title: 'Usage', tabBarIcon: ({ color, size }) => <MaterialIcons name="query-stats" color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <MaterialIcons name="person-outline" color={color} size={size} /> }} />
      {/*
        Admin tab is hidden from the tab bar when the user is not an admin.
        href: null prevents navigation to the route as well — non-admins
        can't reach it by URL even on web.
      */}
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="admin-panel-settings" color={color} size={size} />,
          href: isAdmin ? undefined : null,
        }}
      />
    </Tabs>
  );
}
