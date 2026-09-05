/**
 * The stack the launcher sits at the bottom of.
 *
 * Settings sits above it and the app picker above that, each arriving the way a
 * pushed screen arrives on Android — sliding in from the right — which is the platform's own
 * transition rather than one of ours: `slide_from_right` is run natively by
 * react-native-screens, on the UI thread, and comes with the matching gesture
 * and the reverse animation on the way back for free.
 */
import React from 'react';
import {NavigationContainer, DefaultTheme} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {ChooseAppsScreen} from '../screens/ChooseAppsScreen';
import {LauncherScreen} from '../screens/LauncherScreen';
import {SettingsScreen} from '../screens/SettingsScreen';
import type {RootStackParamList} from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * The window is transparent and the device wallpaper is composited behind it,
 * so every layer the navigator would otherwise paint has to be cleared: a
 * navigation theme with an opaque background would put a solid colour between
 * the wallpaper and the launcher, which is exactly what the app has none of.
 */
const TRANSPARENT_THEME = {
  ...DefaultTheme,
  colors: {...DefaultTheme.colors, background: 'transparent'},
};

export function RootNavigator() {
  return (
    <NavigationContainer theme={TRANSPARENT_THEME}>
      <Stack.Navigator
        screenOptions={{
          // A home screen has no chrome of its own; each screen draws its own
          // heading in the launcher's one typeface.
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: {backgroundColor: 'transparent'},
        }}>
        <Stack.Screen name="Launcher" component={LauncherScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="ChooseApps" component={ChooseAppsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
