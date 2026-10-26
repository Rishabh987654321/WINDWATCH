import { Component, type ReactNode } from "react";
import { Callout } from "../ui/Callout";
import { Button } from "../ui/Button";
import { ApiError } from "../../api/client";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("ErrorBoundary caught an unhandled error:", error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const { error } = this.state;
      const isApiError = error instanceof ApiError;
      const requestId = isApiError ? error.requestId : undefined;

      return (
        <div className="max-w-xl mx-auto my-12 p-4">
          <Callout
            variant="pink"
            title={this.props.fallbackTitle || "Something went wrong"}
            icon="⚠"
            action={
              <Button
                variant="primary"
                size="sm"
                onClick={this.handleRetry}
                className="mt-2"
              >
                RETRY
              </Button>
            }
          >
            <p className="font-bold mb-2">
              {error?.message || "An unexpected error occurred."}
            </p>
            {requestId && (
              <p className="font-mono text-xs text-[#5A5A5A] pt-1 border-t border-[#111]/20">
                Request ID: {requestId}
              </p>
            )}
          </Callout>
        </div>
      );
    }

    return this.props.children;
  }
}
