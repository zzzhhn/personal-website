import { Component, Suspense, type ReactNode } from 'react';
import { reportRegionLoadFailure } from './region-load-failure';

/** Keep other districts running if an independently loaded scene fails. */
export default class RegionSceneBoundary extends Component<{ id: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  private release?: () => void;
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) {
    console.error(`[world-${this.props.id}] scene could not load`, error);
    this.release ??= reportRegionLoadFailure(this.props.id);
  }
  componentWillUnmount() { this.release?.(); }
  render() { return this.state.failed ? null : <Suspense fallback={null}>{this.props.children}</Suspense>; }
}
