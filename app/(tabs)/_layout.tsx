import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useThemeColor } from '@/hooks/use-theme-color';

export default function TabsLayout() {
  const tint = useThemeColor({}, 'tint');
  const inactive = useThemeColor({}, 'tabIconDefault');

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tint,
        tabBarInactiveTintColor: inactive,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Reports',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="medications"
        options={{
          title: 'Medications',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="medkit-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
