import { AppText, Screen } from '@/shared/ui';

export const APP_TITLE = 'Factory Reference';

export function HomeScreen() {
  return (
    <Screen>
      <AppText variant="title">{APP_TITLE}</AppText>
      <AppText tone="secondary">
        The pipeline is running. Features arrive through the factory.
      </AppText>
    </Screen>
  );
}
