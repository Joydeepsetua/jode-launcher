import React from 'react';
import {StatusBar} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {RootNavigator} from './navigation/RootNavigator';
import {WelcomeScreen} from './screens/WelcomeScreen';
import {useSetup} from './hooks/useSetup';
import {PreferencesProvider} from './preferences';
import {useTheme} from './theme';

function Root() {
  const theme = useTheme();
  const {needsSetup, finish} = useSetup();

  return (
    <>
      <StatusBar
        barStyle={
          needsSetup || theme.scheme === 'dark'
            ? 'light-content'
            : 'dark-content'
        }
      />
      {/* First run stays outside the stack: it is the app introducing itself,
          and it has one way out — forwards. */}
      {needsSetup ? <WelcomeScreen onDone={finish} /> : <RootNavigator />}
    </>
  );
}

export default function App() {
  return (
    <PreferencesProvider>
      <SafeAreaProvider>
        <Root />
      </SafeAreaProvider>
    </PreferencesProvider>
  );
}
