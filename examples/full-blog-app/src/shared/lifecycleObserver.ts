/**
 * Test-friendly observable shared between the BlogContext lifecycle hooks and
 * the example E2E test suite. The blog context's async postConstruct flips
 * `warmedUp` after a microtask; the async preDestroy flips `tornDown`. The
 * example E2E suite asserts these transitions to exercise the codegen + runtime
 * async lifecycle path end-to-end (T-100).
 *
 * Module-level state is intentional: the example app is a singleton fixture, so
 * a shared observer mirrors how a real app would expose readiness state.
 */
export const lifecycleObserver = {
  warmedUp: false,
  tornDown: false,
  reset(): void {
    this.warmedUp = false;
    this.tornDown = false;
  },
};
