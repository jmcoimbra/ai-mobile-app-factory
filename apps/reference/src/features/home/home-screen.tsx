import { StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const APP_TITLE = 'Factory Reference';

// Interim palette. The design tokens package replaces it in slice 2.
const PALETTE = {
  light: { background: '#FFFFFF', text: '#111827' },
  dark: { background: '#0B1120', text: '#F9FAFB' },
} as const;

export function HomeScreen() {
  const colors = PALETTE[useColorScheme() === 'dark' ? 'dark' : 'light'];
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {APP_TITLE}
        </Text>
        <Text style={[styles.body, { color: colors.text }]}>
          The pipeline is running. Features arrive through the factory.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24 },
});
