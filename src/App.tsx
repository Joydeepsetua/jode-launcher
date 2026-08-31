import React from 'react';
import {StatusBar} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {LauncherScreen} from './screens/LauncherScreen';
import {WelcomeScreen} from './screens/WelcomeScreen';
import {useSetup} from './hooks/useSetup';
import {useTheme} from './theme';

function Root() {
  const theme = useTheme();
  const {needsSetup, finish} = useSetup();

  return (
    <>
      <StatusBar
        barStyle={
          needsSetup || theme.scheme === 'dark' ? 'light-content' : 'dark-content'
        }
      />
      {needsSetup ? <WelcomeScreen onDone={finish} /> : <LauncherScreen />}
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}
