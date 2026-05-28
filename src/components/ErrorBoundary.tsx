import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 min-h-[200px]">
          <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-destructive/70" />
          </div>
          <div className="text-center space-y-1">
            <h3 className="text-[15px] font-semibold text-foreground/80">
              {this.props.fallbackTitle || "Etwas ist schiefgelaufen"}
            </h3>
            <p className="text-[13px] text-muted-foreground/60 max-w-sm">
              {this.state.error?.message || "Ein unerwarteter Fehler ist aufgetreten."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={this.handleRetry}
            className="gap-1.5 rounded-lg"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Erneut versuchen
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
