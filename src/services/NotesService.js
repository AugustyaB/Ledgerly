/**
 * ============================================================================
 * Ledgerly — NotesService (Contextual Journaling & Annotation Engine)
 * ============================================================================
 * 
 * @fileoverview
 * Domain service managing contextual notes and memos attached to transactions,
 * individual days, ISO calendar weeks, and monthly planning periods.
 * 
 * ARCHITECTURAL PRINCIPLES:
 * - Single Responsibility: Manages multi-dimensional financial annotations.
 * - Encapsulation: Insulates relation types, validation, and multi-profile note lookups.
 * - Dependency Injection: Operates through injected JsonDatabase and ProfileService.
 * - Extensibility: Supports future markdown formatting, pin priority, and member mentions.
 */

'use strict';

const { NoteRelation } = require('../constants');

const VALID_RELATIONS = Object.freeze(Object.values(NoteRelation));

/**
 * @class NotesService
 * Provides CRUD operations and dimensional query filters for contextual notes.
 */
class NotesService {
  /**
   * Initializes NotesService with injected persistence and profile services.
   * 
   * @param {import('./JsonDatabase')} db - Database persistence service.
   * @param {import('./ProfileService')} profileService - Profile management service.
   */
  constructor(db, profileService) {
    if (!db || !profileService) {
      throw new Error('NotesService requires valid JsonDatabase and ProfileService instances.');
    }

    /** @private */
    this._db = db;

    /** @private */
    this._profiles = profileService;
  }

  // ==========================================================================
  // 1. Internal Validation & Array Normalization Helpers
  // ==========================================================================

  /**
   * Ensures the notes array exists in the given data partition.
   * 
   * @private
   * @param {object} data - Profile data object.
   * @returns {object} Normalized data object.
   */
  _ensureNotes(data) {
    if (!data || typeof data !== 'object') {
      return { notes: [] };
    }
    if (!Array.isArray(data.notes)) {
      data.notes = [];
    }
    return data;
  }

  // ==========================================================================
  // 2. Querying & Filtering Operations
  // ==========================================================================

  /**
   * Retrieves notes for the active profile, optionally filtered by relation type or ID.
   * 
   * @param {{ relation?: string, relationId?: string }} [filters={}] - Query filters.
   * @returns {import('../types').Note[]} Notes matching the filters.
   */
  getNotes(filters = {}) {
    const data = this._ensureNotes(this._profiles.getActiveData());
    let result = data.notes;

    if (filters.relation) {
      result = result.filter(n => n.relation === filters.relation);
    }

    if (filters.relationId) {
      result = result.filter(n => n.relationId === filters.relationId);
    }

    return result;
  }

  /**
   * Retrieves all notes attached to a specific transaction ID.
   * 
   * @param {string} expenseId - Expense transaction ID.
   * @returns {import('../types').Note[]} Notes attached to the expense.
   */
  getNotesForExpense(expenseId) {
    return this.getNotes({ relation: NoteRelation.TRANSACTION, relationId: expenseId });
  }

  /**
   * Retrieves all notes attached to a specific date (YYYY-MM-DD).
   * 
   * @param {string} dateStr - Target date string.
   * @returns {import('../types').Note[]} Notes attached to the date.
   */
  getNotesForDate(dateStr) {
    return this.getNotes({ relation: NoteRelation.DAY, relationId: dateStr });
  }

  /**
   * Retrieves all notes attached to a specific ISO week (e.g., "2026-W34").
   * 
   * @param {string} weekStr - Target ISO week string.
   * @returns {import('../types').Note[]} Notes attached to the week.
   */
  getNotesForWeek(weekStr) {
    return this.getNotes({ relation: NoteRelation.WEEK, relationId: weekStr });
  }

  /**
   * Retrieves all notes attached to a specific calendar month (e.g., "2026-08").
   * 
   * @param {string} monthStr - Target month string.
   * @returns {import('../types').Note[]} Notes attached to the month.
   */
  getNotesForMonth(monthStr) {
    return this.getNotes({ relation: NoteRelation.MONTH, relationId: monthStr });
  }

  // ==========================================================================
  // 3. Note Lifecycle Management (CRUD)
  // ==========================================================================

  /**
   * Creates a new contextual note in the active profile's journal.
   * 
   * @param {Partial<import('../types').Note>} note - Note input data.
   * @returns {import('../types').OperationResult & { note?: import('../types').Note }}
   */
  addNote(note = {}) {
    if (!note.content || typeof note.content !== 'string' || !note.content.trim()) {
      return { success: false, error: 'Note content is required' };
    }

    if (!VALID_RELATIONS.includes(note.relation)) {
      return {
        success: false,
        error: `Invalid relation type. Must be one of: ${VALID_RELATIONS.join(', ')}`
      };
    }

    if (!note.relationId) {
      return {
        success: false,
        error: 'Relation ID is required (expense ID, date, week, or month string)'
      };
    }

    const data = this._ensureNotes(this._profiles.getActiveData());
    const now = new Date().toISOString();

    const newNote = {
      id: 'note-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      content: note.content.trim(),
      relation: note.relation,
      relationId: note.relationId,
      createdAt: now,
      updatedAt: now,

      // Extensibility slots
      tags: Array.isArray(note.tags) ? note.tags : [],
      isPinned: Boolean(note.isPinned),
      mentions: Array.isArray(note.mentions) ? note.mentions : [],
      metadata: note.metadata || {}
    };

    data.notes.unshift(newNote);
    this._profiles.saveActiveData(data);

    return { success: true, note: newNote };
  }

  /**
   * Updates an existing note's content by ID.
   * Checks the active profile first, then searches secondary profiles if needed.
   * 
   * @param {{ id: string, content: string }} updated - Note ID and new text content.
   * @returns {import('../types').OperationResult & { note?: import('../types').Note }}
   */
  updateNote(updated = { id: '', content: '' }) {
    if (!updated.id) {
      return { success: false, error: 'Note ID is required' };
    }

    if (!updated.content || typeof updated.content !== 'string' || !updated.content.trim()) {
      return { success: false, error: 'Note content is required' };
    }

    const root = this._db.read();

    // 1. Search active profile
    let targetProfile = root.profiles.find(p => p.id === root.activeProfileId);
    let targetIndex = -1;

    if (targetProfile && Array.isArray(targetProfile.data?.notes)) {
      targetIndex = targetProfile.data.notes.findIndex(n => n.id === updated.id);
    }

    // 2. Search secondary profiles if not found in active profile
    if (targetIndex === -1) {
      for (const p of root.profiles || []) {
        if (Array.isArray(p.data?.notes)) {
          const idx = p.data.notes.findIndex(n => n.id === updated.id);
          if (idx !== -1) {
            targetProfile = p;
            targetIndex = idx;
            break;
          }
        }
      }
    }

    if (targetProfile && targetIndex !== -1) {
      targetProfile.data.notes[targetIndex].content = updated.content.trim();
      targetProfile.data.notes[targetIndex].updatedAt = new Date().toISOString();
      this._db.write(root);
      return { success: true, note: targetProfile.data.notes[targetIndex] };
    }

    return { success: false, error: 'Note not found' };
  }

  /**
   * Deletes a note by ID across active and secondary profiles.
   * 
   * @param {string} id - Note unique identifier.
   * @returns {import('../types').OperationResult & { id?: string }}
   */
  deleteNote(id) {
    if (!id) {
      return { success: false, error: 'Note ID is required' };
    }

    const root = this._db.read();

    // 1. Search active profile first
    const active = root.profiles.find(p => p.id === root.activeProfileId);
    if (active && Array.isArray(active.data?.notes)) {
      const idx = active.data.notes.findIndex(n => n.id === id);
      if (idx !== -1) {
        active.data.notes.splice(idx, 1);
        this._db.write(root);
        return { success: true, id };
      }
    }

    // 2. Search secondary profiles
    for (const p of root.profiles || []) {
      if (Array.isArray(p.data?.notes)) {
        const idx = p.data.notes.findIndex(n => n.id === id);
        if (idx !== -1) {
          p.data.notes.splice(idx, 1);
          this._db.write(root);
          return { success: true, id };
        }
      }
    }

    return { success: false, error: 'Note not found' };
  }
}

module.exports = NotesService;
