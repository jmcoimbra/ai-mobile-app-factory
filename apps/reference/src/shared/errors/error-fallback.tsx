import { toAppError, userMessageFor } from '@maf/error-contract';

import { AppText, Button, Screen } from '@/shared/ui';

/** The label of every button that repeats a failed request. */
export const RETRY_LABEL = 'Try again';

interface ErrorFallbackProps {
  error: unknown;
  /** Called when the person asks to try again. Omitted when retrying cannot help. */
  onRetry?: () => void;
}

/**
 * What a person sees when something fails. The text comes from the message
 * catalog, keyed by error code. The error's own message and detail are
 * never rendered.
 */
export function ErrorFallback({ error, onRetry }: ErrorFallbackProps) {
  const message = userMessageFor(toAppError(error).code);
  return (
    <Screen>
      <AppText variant="heading" accessibilityLiveRegion="assertive">
        {message.title}
      </AppText>
      <AppText tone="secondary">{message.body}</AppText>
      {message.canRetry && onRetry ? <Button label={RETRY_LABEL} onPress={onRetry} /> : null}
    </Screen>
  );
}
