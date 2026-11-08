import { Component, type ReactNode } from "react";

/** Keeps one broken view from blanking the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null; key?: string }> {
  state: { error: Error | null; key?: string } = { error: null, key: this.props.resetKey };
  static getDerivedStateFromError(error: Error) { return { error }; }
  static getDerivedStateFromProps(props: { resetKey?: string }, state: { error: Error | null; key?: string }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }
  componentDidCatch(error: Error) { console.error("[bookkit] view error", error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="view-error" role="alert">
        <h2>Something went wrong showing this page</h2>
        <p>Your saved work is safe. {this.state.error.message}</p>
        <button className="btn" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}
