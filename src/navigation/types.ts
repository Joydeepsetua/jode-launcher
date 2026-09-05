/**
 * The launcher's destinations.
 *
 * Declared globally as well as exported, so `useNavigation()` is typed
 * everywhere without each caller naming the param list again.
 */
export type RootStackParamList = {
  Launcher: undefined;
  Settings: undefined;
  ChooseApps: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
