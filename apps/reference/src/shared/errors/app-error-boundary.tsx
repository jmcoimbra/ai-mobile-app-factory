import { toAppError, type AppError } from '@maf/error-contract';
import { Component, type ReactNode } from 'react';

import { ErrorFallback } from './error-fallback';

interface AppErrorBoundaryProps {
  children: ReactNode;
  /** Receives every caught error, already normalised. Telemetry plugs in here. */
  onError?: (error: AppError) => void;
}

interface AppErrorBoundaryState {
  error: unknown;
  failed: boolean;
}

/** Catches render errors below it and shows the fallback instead of a blank screen. */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { error: null, failed: false };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { error, failed: true };
  }

  override componentDidCatch(error: unknown) {
    this.props.onError?.(toAppError(error));
  }

  private readonly reset = () => this.setState({ error: null, failed: false });

  override render() {
    if (this.state.failed) {
      return <ErrorFallback error={this.state.error} onRetry={this.reset} />;
    }
    return this.props.children;
  }
}
