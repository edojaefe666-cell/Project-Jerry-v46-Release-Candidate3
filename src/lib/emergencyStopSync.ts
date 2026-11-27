export interface SharedStopSnapshot {
  stopped: boolean;
  epoch: number;
  reason: string;
  updatedBy: string;
}

export interface LocalStopStore {
  getEmergencyStop(): {
    stopped: boolean; reason: string; updatedAt: string; ownerUid: string; sharedEpoch: number;
  };
  synchronizeEmergencyStop(
    stopped: boolean, ownerUid: string, reason: string, sharedEpoch: number,
  ): ReturnType<LocalStopStore['getEmergencyStop']>;
}

/**
 * PostgreSQL is authoritative across instances. SQLite applies only strictly
 * newer shared epochs inside its own transaction, so delayed poll results
 * cannot roll a newer local stop or recovery backwards.
 */
export function synchronizeLocalEmergencyControl(
  shared: SharedStopSnapshot,
  localStore: LocalStopStore,
): ReturnType<LocalStopStore['getEmergencyStop']> {
  const reason = shared.reason.trim().length >= 5
    ? shared.reason.trim()
    : shared.stopped
      ? 'Shared owner emergency stop synchronized'
      : 'Shared owner emergency stop recovery synchronized';
  return localStore.synchronizeEmergencyStop(
    shared.stopped,
    shared.updatedBy.trim() || 'system',
    reason,
    shared.epoch,
  );
}
