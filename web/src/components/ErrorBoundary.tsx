// React error boundary that shows a friendly recovery screen instead of a blank page.
import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Keeps one broken screen from blanking the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Screen crashed", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="container-page py-16">
        <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-soft">
          <AlertTriangle aria-hidden="true" className="mx-auto h-8 w-8 text-high" />
          <div className="te mt-3 text-lg font-bold">ఈ విభాగం లోడ్ కాలేదు</div>
          <div className="text-sm text-slate-500">This section failed to load. Please refresh the page.</div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-700"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }
}
