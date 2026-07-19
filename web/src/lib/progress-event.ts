// The ONE name of the cross-module progress channel. Store writes, Rep
// widgets, the sync debounce and every useSyncExternalStore subscriber all
// meet on this string, so it lives in this dependency-free leaf where BOTH
// sides of the progress-store <-> progress-merge import edge can reach it
// without a cycle. progress-store re-exports it — existing importers keep
// their import path; only modules progress-store itself depends on (or that
// must stay below it) import from here directly.
export const PROGRESS_EVENT_NAME = "qc-progress";
