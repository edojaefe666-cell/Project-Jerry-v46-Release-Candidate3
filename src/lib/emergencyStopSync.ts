export interface SharedStopSnapshot {
  stopped: boolean;
  reason: string;
  updatedBy: string;
}

export interface LocalStopStore {
  getEmergencyStop(): { stopped: boolean; reason: string; updatedAt: string; ownerUid: string };
  setEmergencyStop(stopped: boolean, ownerUid: string, reason: string): {
    stopped: boolean; reason: string; updatedAt: string; ownerUid: string;
  };
}

/**
 * The shared PostgreSQL latch is authoritative across application instances.
 * SQLite is a durable local mirror/audit record. Reconcile it before deriving
 * this instance's execution latch; a failed local write must fail closed.
 */
export function synchronizeLocalEmergencyControl(
  shared: SharedStopSnapshot,
  localStore: LocalStopStore,
): ReturnType<LocalStopStore['getEmergencyStop']> {
  const local = localStore.getEmergencyStop();
  if (local.stopped === shared.stopped) return local;
  const reason = shared.reason.trim().length >= 5
    ? shared.reason.trim()
    : shared.stopped
      ? 'Shared owner emergency stop synchronized'
      : 'Shared owner emergency stop recovery synchronized';
  return localStore.setEmergencyStop(shared.stopped, shared.updatedBy.trim() || 'system', reason);
}
