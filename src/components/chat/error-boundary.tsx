"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div role="alert" className="flex flex-1 items-center justify-center p-8">
          <div className="space-y-2 text-center">
            <h2 className="text-sm font-medium">Something went wrong</h2>
            <p className="text-xs text-muted-foreground">{this.state.error.message}</p>
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
