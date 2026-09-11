/**
 * ============================================================================
 * Ledgerly — SyncEngine (Offline Vector Clock & Conflict Resolution Engine)
 * ============================================================================
 *
 * @fileoverview
 * Foundation for offline multi-device ledger reconciliation. Implements
 * Last-Write-Wins (LWW) timestamp comparisons, vector version incrementing,
 * soft-deletion tracking, and deterministic three-way merge resolution.
 *
 * ARCHITECTURAL PRINCIPLES:
 * - Deterministic Resolution: Same input states always produce identical merge output.
 * - Anti-Entropy: Prevents deleted records from resurrecting across sync intervals.
 * - Hermetic & Offline: Zero cloud dependencies, pure mathematical clock comparisons.
 */

'use strict';

class SyncEngine {
  /**
   * Generates initial sync metadata for a newly created domain record.
   *
   * @param {string} [originNodeId='desktop-primary'] - ID of the originating client.
   * @returns {{ updatedAt: string, version: number, originNodeId: string, deletedAt: null }}
   */
  static generateMeta(originNodeId = 'desktop-primary') {
    return {
      updatedAt: new Date().toISOString(),
      version: 1,
      originNodeId,
      deletedAt: null
    };
  }

  /**
   * Stamps or updates an existing entity with an incremented version and new timestamp.
   *
   * @param {object} entity - Entity object to stamp.
   * @param {string} [originNodeId='desktop-primary'] - ID of the editing client.
   * @returns {object} Mutated entity with updated sync stamps.
   */
  static stampEntity(entity, originNodeId = 'desktop-primary') {
    if (!entity || typeof entity !== 'object') return entity;

    const currentVersion = typeof entity.version === 'number' ? entity.version : 0;
    entity.version = currentVersion + 1;
    entity.updatedAt = new Date().toISOString();
    entity.originNodeId = originNodeId;
    if (entity.deletedAt === undefined) {
      entity.deletedAt = null;
    }
    return entity;
  }

  /**
   * Marks an entity as soft-deleted without physically removing its identity,
   * ensuring that deletion propagates cleanly to other nodes during peer sync.
   *
   * @param {object} entity - Entity object to soft-delete.
   * @param {string} [originNodeId='desktop-primary'] - ID of the client executing delete.
   * @returns {object} Entity marked with deletedAt timestamp and incremented version.
   */
  static softDelete(entity, originNodeId = 'desktop-primary') {
    if (!entity || typeof entity !== 'object') return entity;

    SyncEngine.stampEntity(entity, originNodeId);
    entity.deletedAt = new Date().toISOString();
    return entity;
  }

  /**
   * Compares two versions of the same entity using LWW rules.
   *
   * @param {object} a - First entity.
   * @param {object} b - Second entity.
   * @returns {number} 1 if a is newer, -1 if b is newer, 0 if identical.
   */
  static compareLWW(a, b) {
    if (!a && !b) return 0;
    if (a && !b) return 1;
    if (!a && b) return -1;

    const timeA = new Date(a.updatedAt || 0).getTime();
    const timeB = new Date(b.updatedAt || 0).getTime();

    if (timeA > timeB) return 1;
    if (timeB > timeA) return -1;

    // Tie-break with version number
    const verA = a.version || 0;
    const verB = b.version || 0;
    if (verA > verB) return 1;
    if (verB > verA) return -1;

    // Final tie-break with originNodeId string compare for deterministic convergence
    const nodeA = a.originNodeId || '';
    const nodeB = b.originNodeId || '';
    if (nodeA > nodeB) return 1;
    if (nodeB > nodeA) return -1;

    return 0;
  }

  /**
   * Executes a deterministic three-way merge across base, local, and remote entity collections.
   *
   * @param {Array<object>} baseList - Common ancestor state.
   * @param {Array<object>} localList - Current local state.
   * @param {Array<object>} remoteList - Incoming remote state.
   * @returns {{ merged: Array<object>, conflictsResolved: number, details: Array<{ id: string, resolution: string }> }}
   */
  static threeWayMerge(baseList = [], localList = [], remoteList = []) {
    const baseMap = new Map((baseList || []).map(item => [item.id, item]));
    const localMap = new Map((localList || []).map(item => [item.id, item]));
    const remoteMap = new Map((remoteList || []).map(item => [item.id, item]));

    const allIds = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);

    const merged = [];
    const details = [];
    let conflictsResolved = 0;

    for (const id of allIds) {
      if (!id) continue;

      const base = baseMap.get(id);
      const local = localMap.get(id);
      const remote = remoteMap.get(id);

      // Case 1: Added only locally
      if (!base && local && !remote) {
        if (!local.deletedAt) merged.push(local);
        continue;
      }

      // Case 2: Added only remotely
      if (!base && !local && remote) {
        if (!remote.deletedAt) merged.push(remote);
        continue;
      }

      // Case 3: Added concurrently on both (or identical addition)
      if (!base && local && remote) {
        const cmp = SyncEngine.compareLWW(local, remote);
        const winner = cmp >= 0 ? local : remote;
        if (!winner.deletedAt) merged.push(winner);
        conflictsResolved++;
        details.push({ id, resolution: cmp >= 0 ? 'kept_local_concurrent_add' : 'kept_remote_concurrent_add' });
        continue;
      }

      // Case 4: Deleted locally, unchanged remotely
      if (base && !local && remote) {
        if (SyncEngine.compareLWW(remote, base) === 0) {
          // Remote didn't change it; respect local deletion
          continue;
        } else {
          // Remote updated after base; remote wins over local delete
          if (!remote.deletedAt) merged.push(remote);
          conflictsResolved++;
          details.push({ id, resolution: 'resurrected_remote_edit_over_local_delete' });
          continue;
        }
      }

      // Case 5: Deleted remotely, unchanged locally
      if (base && local && !remote) {
        if (SyncEngine.compareLWW(local, base) === 0) {
          // Local didn't change it; respect remote deletion
          continue;
        } else {
          // Local updated after base; local wins over remote delete
          if (!local.deletedAt) merged.push(local);
          conflictsResolved++;
          details.push({ id, resolution: 'preserved_local_edit_over_remote_delete' });
          continue;
        }
      }

      // Case 6: Modified on both sides
      if (local && remote) {
        const localChanged = SyncEngine.compareLWW(local, base) !== 0;
        const remoteChanged = SyncEngine.compareLWW(remote, base) !== 0;

        if (!localChanged && remoteChanged) {
          if (!remote.deletedAt) merged.push(remote);
        } else if (localChanged && !remoteChanged) {
          if (!local.deletedAt) merged.push(local);
        } else if (localChanged && remoteChanged) {
          const cmp = SyncEngine.compareLWW(local, remote);
          const winner = cmp >= 0 ? local : remote;
          if (!winner.deletedAt) merged.push(winner);
          conflictsResolved++;
          details.push({ id, resolution: cmp >= 0 ? 'lww_local_winner' : 'lww_remote_winner' });
        } else {
          // Neither changed
          if (!local.deletedAt) merged.push(local);
        }
      }
    }

    return {
      merged,
      conflictsResolved,
      details
    };
  }
}

module.exports = SyncEngine;
