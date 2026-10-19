/**
 * LEDGERLY — AUTH SCREEN & PROFILE PICKER COMPONENT
 *
 * Standalone security and user session manager:
 * - Master Household Account Gate (Sign In / Sign Up with PBKDF2 verification)
 * - Brute-Force Rate Limiting & Lockout Cooldown Timer Display
 * - Netflix-Style "Who is tracking today?" Profile Picker Grid
 * - Profile Creation, Editing, Color Selection & Deletion Modals
 * - Session State Persistence & Multi-Profile Switching
 *
 * @module src/ui/components/AuthScreen
 */

// ============================================================================
// EXTERNAL DEPENDENCIES & HELPERS
// ============================================================================

import { escapeHTML, delegateEvent } from '../helpers/dom.js';
import { showToast, showActionToast } from '../helpers/toast.js';

// ============================================================================
// SAFE ICON & MONOGRAM HELPERS
// ============================================================================

function safeIcon(name, size = 16) {
  if (typeof icon === 'function') {
    return icon(name, size);
  }
  return `<i data-icon="${escapeHTML(name)}" data-icon-size="${size}"></i>`;
}

function safeInitials(name) {
  if (typeof getInitials === 'function') {
    return getInitials(name);
  }
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function safeAvatarColor(name) {
  if (typeof getAvatarColor === 'function') {
    return getAvatarColor(name);
  }
  return '#D9822B';
}

function safeMonogram(name, size = 36, color = null) {
  if (typeof renderMonogram === 'function') {
    return renderMonogram(name, size, color);
  }
  const initials = safeInitials(name);
  const borderCol = color || safeAvatarColor(name);
  return `<span class="monogram-avatar" style="width:${size}px;height:${size}px;border-radius:50%;border:2px solid ${borderCol};color:${borderCol};display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.round(size * 0.4)}px;">${escapeHTML(initials)}</span>`;
}

// ============================================================================
// AUTH SCREEN COMPONENT CLASS
// ============================================================================

export class AuthScreen {
  /**
   * Reactive state store adapter.
   * @type {any}
   */
  state = null;

  /**
   * Electron IPC bridge.
   * @type {any}
   */
  api = null;

  /**
   * Session ready callback.
   * @type {(() => Promise<void>)|null}
   */
  onSessionReady = null;

  /**
   * Active countdown interval timer ID.
   * @type {number|null}
   * @private
   */
  #lockoutTimer = null;

  /**
   * Event listener cleanup callbacks.
   * @type {Array<() => void>}
   * @private
   */
  #cleanups = [];

  /**
   * Currently generated or displayed Emergency Recovery Key.
   * @type {string|null}
   * @private
   */
  #currentRecoveryKey = null;

  /**
   * Current user ID for recovery kit generation.
   * @type {string|null}
   * @private
   */
  #currentUserId = null;

  /**
   * Construct AuthScreen instance.
   * @param {Object} [options={}]
   * @param {any} [options.state] - Reactive state store adapter
   * @param {any} [options.api] - Electron IPC bridge
   * @param {() => Promise<void>} [options.onSessionReady] - Hook called when profile enters dashboard
   */
  constructor(options = {}) {
    this.state = options.state || null;
    this.api = options.api || (typeof window !== 'undefined' ? window.electronAPI : null);
    this.onSessionReady = options.onSessionReady || null;
  }

  // ==========================================================================
  // LIFECYCLE & INITIALIZATION
  // ==========================================================================

  /**
   * Mount DOM event listeners for auth forms, profile picker, and modals.
   */
  mount() {
    if (typeof document === 'undefined') return;

    this.#bindAuthForm();
    this.#bindProfilePickerActions();
    this.#bindProfilePickerKeyboard();
    this.#bindPersonModal();
    this.#bindManageProfilesModal();
    this.#bindDeleteProfileConfirmModal();
    this.#bindProfileDropdown();
    this.#bindRecoveryKitModal();
    this.#bindRecoveryFlowModal();
    this.#bindHardWallModal();
  }

  /**
   * Clean up all attached event listeners and active timers.
   */
  unmount() {
    if (this.#lockoutTimer) {
      clearInterval(this.#lockoutTimer);
      this.#lockoutTimer = null;
    }

    this.#cleanups.forEach(cleanup => {
      try {
        cleanup();
      } catch (err) {
        console.warn('AuthScreen cleanup error:', err);
      }
    });
    this.#cleanups = [];
  }

  /**
   * Initialize or resume app session on startup.
   * Checks master account status from backend.
   * @returns {Promise<void>}
   */
  async initAppSession() {
    if (!this.api?.getAccountStatus) return;

    try {
      const status = await this.api.getAccountStatus();
      if (this.state) this.state.set('account', status);

      if (!status.isConfigured) {
        this.showAuthScreen('signup');
        return;
      }

      if (status.rememberMe && (!status.isVaultEncrypted || status.isVaultUnlocked)) {
        await this.showProfilePickerScreen();
      } else {
        this.showAuthScreen('login');
        if (status.rememberMe && status.userId && typeof document !== 'undefined') {
          const userInput = /** @type {HTMLInputElement|null} */ (document.getElementById('auth-input-userid'));
          if (userInput) {
            userInput.value = status.userId;
          }
        }
      }
    } catch (err) {
      console.error('Error initializing app session:', err);
      this.showAuthScreen('login');
    }
  }

  // ==========================================================================
  // SCREEN PRESENTATION CONTROLLERS
  // ==========================================================================

  /**
   * Reveal master authentication split screen (Sign In vs Sign Up).
   * @param {'login'|'signup'} [mode='login']
   */
  showAuthScreen(mode = 'login') {
    if (this.state) this.state.set('authMode', mode);
    if (typeof document === 'undefined') return;

    const authScreen = document.getElementById('screen-auth');
    const pickerScreen = document.getElementById('screen-profile-picker');
    const appContainer = document.getElementById('main-app-container');
    const loginTab = document.getElementById('auth-tab-login');
    const signupTab = document.getElementById('auth-tab-signup');
    const submitBtn = document.getElementById('auth-submit-btn');
    const errorBanner = document.getElementById('auth-error-banner');
    const formPanel = document.querySelector('.auth-form-panel');
    const pwdInput = /** @type {HTMLInputElement|null} */ (document.getElementById('auth-input-password'));
    const pwdToggle = document.getElementById('auth-pwd-toggle');

    if (errorBanner) {
      errorBanner.classList.add('hidden');
      errorBanner.classList.remove('lockout-active', 'lockout-expired');
      errorBanner.textContent = '';
    }

    if (formPanel) {
      formPanel.classList.remove('auth-shake');
    }
    if (pwdInput) {
      pwdInput.classList.remove('auth-input-error');
      pwdInput.type = 'password';
    }
    if (pwdToggle) {
      pwdToggle.setAttribute('title', 'Show password');
      pwdToggle.setAttribute('aria-label', 'Show password');
      pwdToggle.innerHTML = safeIcon('eye', 16);
    }

    authScreen?.classList.remove('hidden');
    pickerScreen?.classList.add('hidden');
    appContainer?.classList.add('hidden');

    const greetingTitle = document.getElementById('auth-greeting-title');
    const greetingSubtitle = document.getElementById('auth-greeting-subtitle');

    if (mode === 'signup') {
      loginTab?.classList.remove('active');
      signupTab?.classList.add('active');
      if (submitBtn) submitBtn.textContent = 'CREATE ACCOUNT';
      if (greetingTitle) greetingTitle.textContent = 'Welcome';
      if (greetingSubtitle) greetingSubtitle.textContent = 'Create your account to get started';
    } else {
      signupTab?.classList.remove('active');
      loginTab?.classList.add('active');
      if (submitBtn) submitBtn.textContent = 'SIGN IN';
      if (greetingTitle) greetingTitle.textContent = 'Welcome Back';
      if (greetingSubtitle) greetingSubtitle.textContent = 'Sign in to access your workspaces';
    }

    // Auto-focus input when screen renders
    setTimeout(() => {
      const userInput = document.getElementById('auth-input-userid');
      if (userInput && !userInput.value.trim()) {
        userInput.focus();
      } else if (pwdInput) {
        pwdInput.focus();
        pwdInput.select();
      }
    }, 50);
  }

  /**
   * Reveal Emergency Recovery Kit modal displaying the generated recovery key (Slot 2).
   *
   * @param {string} userId - User ID or account name
   * @param {string} recoveryKey - Formatted recovery key (`LEDG-XXXX-XXXX-XXXX-XXXX`)
   */
  showEmergencyRecoveryKitModal(userId, recoveryKey) {
    if (typeof document === 'undefined') return;
    this.#currentRecoveryKey = recoveryKey;
    this.#currentUserId = userId;

    const modal = document.getElementById('modal-auth-recovery-kit');
    const keyText = document.getElementById('recovery-kit-key-text');
    const ackCheckbox = /** @type {HTMLInputElement|null} */ (document.getElementById('recovery-kit-ack-checkbox'));
    const continueBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('btn-recovery-kit-continue'));

    if (keyText) keyText.textContent = recoveryKey;
    if (ackCheckbox) ackCheckbox.checked = false;
    if (continueBtn) continueBtn.disabled = true;

    if (modal) {
      modal.classList.add('active');
      if (typeof window !== 'undefined' && typeof window.hydrateIcons === 'function') {
        window.hydrateIcons(modal);
      }
    }
  }

  /**
   * Reveal full-screen Netflix-style profile picker ("Who is tracking today?").
   * @returns {Promise<void>}
   */
  async showProfilePickerScreen() {
    if (this.state) this.state.set('isManageProfiles', false);
    if (typeof document === 'undefined') return;

    const authScreen = document.getElementById('screen-auth');
    const pickerScreen = document.getElementById('screen-profile-picker');
    const appContainer = document.getElementById('main-app-container');
    const badgeEl = document.getElementById('picker-account-badge');

    const account = this.state?.get('account');
    if (badgeEl) {
      badgeEl.textContent = `Account: ${account?.userId || 'Admin'}`;
    }

    authScreen?.classList.add('hidden');
    appContainer?.classList.add('hidden');
    pickerScreen?.classList.remove('hidden');

    const manageBtn = document.getElementById('btn-picker-manage');
    if (manageBtn) manageBtn.innerHTML = `${safeIcon('settings', 14)} Manage Profiles`;

    await this.renderProfilePickerGrid();

    // If no profiles exist, prompt immediately to add first profile
    const profiles = (await this.api?.getProfiles()) || [];
    if (profiles.length === 0) {
      this.openPersonModal();
    }
  }

  /**
   * Render profile cards and "+ Add Profile" in Netflix grid.
   * @returns {Promise<void>}
   */
  async renderProfilePickerGrid() {
    const profiles = (await this.api?.getProfiles()) || [];
    if (this.state) this.state.set('profiles', profiles);

    if (typeof document === 'undefined') return;

    const grid = document.getElementById('netflix-picker-grid');
    if (!grid) return;

    const activeProfile = this.state?.get('activeProfile');

    const cardsHtml = profiles
      .map((p, index) => {
        const count = p.expenseCount || 0;
        const color = p.color || p.avatar || safeAvatarColor(p.name);
        const initials = safeInitials(p.name);
        const isActive = activeProfile && activeProfile.id === p.id;
        const keyDigit = index < 9 ? index + 1 : null;
        const keyHintHtml = keyDigit
          ? `<span class="netflix-picker-key-hint" title="Press ${keyDigit} to select">${keyDigit}</span>`
          : '';
        const activePillHtml = isActive
          ? `<span class="netflix-picker-active-pill">${safeIcon('check', 10)} Active</span>`
          : '';

        return `
        <div class="netflix-picker-card${isActive ? ' is-active' : ''}" data-action="select-profile" data-id="${p.id}" tabindex="0" role="button" aria-label="Select profile ${escapeHTML(p.name)}">
          ${keyHintHtml}
          ${activePillHtml}
          <div class="netflix-picker-avatar" style="border-color: ${color}; color: ${color}; font-weight: 700; font-size: 36px;">
            ${escapeHTML(initials)}
          </div>
          <div class="netflix-picker-name">${escapeHTML(p.name)}</div>
          <div class="netflix-picker-badge">${count} ${count === 1 ? 'expense' : 'expenses'}</div>
        </div>
      `;
      })
      .join('');

    const addCardHtml = `
      <div class="netflix-picker-card netflix-add-card" data-action="open-add-person" tabindex="0" role="button" aria-label="Add new profile">
        <div class="netflix-picker-avatar netflix-add-avatar">${safeIcon('plus', 32)}</div>
        <div class="netflix-picker-name" style="color: var(--accent-primary);">Add Profile</div>
        <div class="netflix-picker-badge">New Profile</div>
      </div>
    `;

    grid.innerHTML = cardsHtml + addCardHtml;
  }

  /**
   * Switch into active profile and enter the main application cockpit.
   * @param {string} profileId - ID of profile to activate
   * @returns {Promise<void>}
   */
  async enterUserDashboard(profileId) {
    if (!this.api?.switchProfile) return;

    const res = await this.api.switchProfile(profileId);
    if (res?.success) {
      if (typeof document !== 'undefined') {
        document.getElementById('screen-profile-picker')?.classList.add('hidden');
        document.getElementById('screen-auth')?.classList.add('hidden');
        document.getElementById('main-app-container')?.classList.remove('hidden');
      }

      showToast(`Logged in as "${res.activeProfile?.name || 'User'}"`);

      if (this.onSessionReady) {
        await this.onSessionReady();
      }
    } else {
      if (typeof alert === 'function') {
        alert(res?.error || 'Failed to switch profile');
      }
    }
  }

  // ==========================================================================
  // PERSON MODAL (ADD / EDIT PROFILE)
  // ==========================================================================

  /**
   * Open modal to create or edit a user profile.
   * @param {string|null} [id=null] - Profile ID if editing, null if creating
   */
  openPersonModal(id = null) {
    if (typeof document === 'undefined') return;

    const modal = document.getElementById('person-modal');
    if (!modal) return;

    const headingEl = document.getElementById('person-modal-heading');
    const idEl = /** @type {HTMLInputElement|null} */ (document.getElementById('person-form-id'));
    const nameEl = /** @type {HTMLInputElement|null} */ (document.getElementById('person-form-name'));
    const deleteBtn = document.getElementById('btn-delete-person');

    const profiles = this.state?.get('profiles') || [];

    if (id) {
      const p = profiles.find(prof => prof.id === id);
      if (!p) return;

      if (headingEl) headingEl.innerHTML = `${safeIcon('pencil', 18)} Edit Profile: ${escapeHTML(p.name)}`;
      if (idEl) idEl.value = p.id;
      if (nameEl) nameEl.value = p.name;
      this.selectAvatarColor(p.color || p.avatar || '#D9822B');
      if (deleteBtn) {
        deleteBtn.classList.toggle('hidden', profiles.length <= 1);
      }
    } else {
      if (headingEl) headingEl.innerHTML = `${safeIcon('plus', 18)} Add Profile`;
      if (idEl) idEl.value = '';
      if (nameEl) nameEl.value = '';
      this.selectAvatarColor('#D9822B');
      if (deleteBtn) deleteBtn.classList.add('hidden');
    }

    this.updatePersonAvatarPreview();
    modal.classList.add('active');
    setTimeout(() => {
      nameEl?.focus();
      nameEl?.select();
    }, 50);
  }

  /**
   * Close person profile modal.
   */
  closePersonModal() {
    if (typeof document === 'undefined') return;
    document.getElementById('person-modal')?.classList.remove('active');
  }

  /**
   * Select an avatar accent color and refresh dots/preview.
   * @param {string} color - Hex color code
   */
  selectAvatarColor(color) {
    if (typeof document === 'undefined') return;

    const hiddenInput = /** @type {HTMLInputElement|null} */ (document.getElementById('person-form-avatar'));
    if (hiddenInput) hiddenInput.value = color;

    document.querySelectorAll('#avatar-color-strip .color-dot-opt').forEach(btn => {
      const isMatch = btn.getAttribute('data-color') === color;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-selected', isMatch ? 'true' : 'false');
    });
    this.updatePersonAvatarPreview();
  }

  /**
   * Update live monogram avatar preview inside person modal.
   */
  updatePersonAvatarPreview() {
    if (typeof document === 'undefined') return;

    const name = /** @type {HTMLInputElement|null} */ (document.getElementById('person-form-name'))?.value || '';
    const color =
      /** @type {HTMLInputElement|null} */ (document.getElementById('person-form-avatar'))?.value || '#D9822B';
    const previewEl = document.getElementById('person-avatar-preview');

    if (previewEl) {
      previewEl.textContent = safeInitials(name || 'New Profile');
      previewEl.style.borderColor = color;
      previewEl.style.color = color;
      previewEl.classList.remove('pulse-react');
      void previewEl.offsetWidth;
      previewEl.classList.add('pulse-react');
    }
  }

  // ==========================================================================
  // MANAGE PROFILES MODAL
  // ==========================================================================

  /**
   * Open full Manage Profiles list modal with edit/delete actions.
   * @returns {Promise<void>}
   */
  async openManageProfilesModal() {
    if (typeof document === 'undefined') return;

    const profiles = (await this.api?.getProfiles()) || [];
    if (this.state) this.state.set('profiles', profiles);

    const listEl = document.getElementById('manage-profiles-list');
    if (listEl) {
      listEl.innerHTML = profiles
        .map(p => {
          const count = p.expenseCount || 0;
          const color = p.color || p.avatar || safeAvatarColor(p.name);
          const monogramHtml = safeMonogram(p.name, 36, color);

          return `
          <div class="manage-profile-row">
            <div class="manage-profile-info">
              <div class="manage-profile-avatar">${monogramHtml}</div>
              <div class="manage-profile-details">
                <div class="manage-profile-name">${escapeHTML(p.name)}</div>
                <div class="manage-profile-stat">${count} ${count === 1 ? 'expense logged' : 'expenses logged'}</div>
              </div>
            </div>
            <div class="manage-profile-actions">
              <button type="button" class="btn-row-action" data-action="edit-manage-profile" data-id="${p.id}">
                ${safeIcon('pencil', 12)} Edit
              </button>
              <button type="button" class="btn-row-action btn-row-danger" data-action="delete-manage-profile" data-id="${p.id}" data-name="${escapeHTML(p.name)}">
                ${safeIcon('trash-2', 12)}
              </button>
            </div>
          </div>
        `;
        })
        .join('');
    }

    document.getElementById('manage-profiles-modal')?.classList.add('active');
  }

  /**
   * Close Manage Profiles modal.
   */
  closeManageProfilesModal() {
    if (typeof document === 'undefined') return;
    document.getElementById('manage-profiles-modal')?.classList.remove('active');
  }

  /**
   * Delete a profile with confirmation guard.
   * @param {string} profileId - ID to delete
   * @param {string} profileName - Display name
   * @returns {Promise<void>}
   */
  /**
   * Show dedicated profile deletion confirmation modal.
   * @param {string} profileName
   * @returns {Promise<boolean>}
   */
  confirmProfileDeletion(profileName) {
    if (typeof document === 'undefined') return Promise.resolve(true);

    const modal = document.getElementById('delete-profile-confirm-modal');
    const nameEl = document.getElementById('delete-profile-confirm-name');
    const confirmBtn = document.getElementById('btn-confirm-delete-profile');
    const cancelBtn = document.getElementById('btn-cancel-delete-profile');
    const closeBtn = document.getElementById('btn-close-delete-profile-modal');

    if (!modal || !confirmBtn) {
      if (typeof confirm === 'function') {
        return Promise.resolve(
          confirm(
            `Are you sure you want to delete profile "${profileName}"? All associated personal records will be removed.`
          )
        );
      }
      return Promise.resolve(true);
    }

    if (nameEl) nameEl.textContent = `"${profileName}"`;
    modal.classList.add('active');

    return new Promise(resolve => {
      let resolved = false;

      const finish = result => {
        if (resolved) return;
        resolved = true;
        modal.classList.remove('active');
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn?.removeEventListener('click', onCancel);
        closeBtn?.removeEventListener('click', onCancel);
        resolve(result);
      };

      const onConfirm = () => finish(true);
      const onCancel = () => finish(false);

      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn?.addEventListener('click', onCancel);
      closeBtn?.addEventListener('click', onCancel);
    });
  }

  /**
   * Delete a profile with confirmation guard.
   * @param {string} profileId - ID to delete
   * @param {string} profileName - Display name
   * @returns {Promise<void>}
   */
  async handleDeleteProfile(profileId, profileName) {
    const profiles = this.state?.get('profiles') || [];
    if (profiles.length <= 1) {
      if (typeof alert === 'function') alert('Cannot delete the only remaining profile in your account.');
      return;
    }

    const confirmed = await this.confirmProfileDeletion(profileName);
    if (!confirmed) return;

    const res = await this.api?.deleteProfile(profileId);
    if (res?.success) {
      showToast(`Deleted profile "${profileName}"`);
      await this.renderProfilePickerGrid();
      await this.openManageProfilesModal();
    } else {
      if (typeof alert === 'function') alert(res?.error || 'Failed to delete profile');
    }
  }

  /**
   * Logout current user session and return to master account login screen.
   * @returns {Promise<void>}
   */
  async logoutUserSession() {
    if (this.api?.logoutAccount) {
      await this.api.logoutAccount();
    }

    if (this.api?.getAccountStatus) {
      const status = await this.api.getAccountStatus();
      if (this.state) this.state.set('account', status);
    }

    showToast('Logged out of master account');
    this.showAuthScreen('login');
  }

  // ==========================================================================
  // LOCKOUT COOLDOWN TIMER HELPER & VISUAL FEEDBACK
  // ==========================================================================

  /**
   * Trigger subtle shake animation and highlight input on invalid credentials.
   * @param {string} errorMessage
   * @private
   */
  #triggerAuthShake(errorMessage) {
    const formPanel = document.querySelector('.auth-form-panel') || document.getElementById('auth-form');
    const pwdInput = document.getElementById('auth-input-password');
    const errorBanner = document.getElementById('auth-error-banner');

    if (errorBanner) {
      errorBanner.textContent = errorMessage;
      errorBanner.classList.remove('hidden', 'lockout-active', 'lockout-expired');
    }

    if (formPanel) {
      formPanel.classList.remove('auth-shake');
      void formPanel.offsetWidth;
      formPanel.classList.add('auth-shake');
      setTimeout(() => formPanel.classList.remove('auth-shake'), 450);
    }

    if (pwdInput) {
      pwdInput.classList.add('auth-input-error');
      pwdInput.focus();
      pwdInput.select();
    }
  }

  /**
   * Handle brute-force lockout message with visual live countdown timer.
   * @param {string} errorMessage
   * @private
   */
  #handleLockoutCooldown(errorMessage) {
    const errorBanner = document.getElementById('auth-error-banner');
    if (!errorBanner) return;

    // Parse seconds from "Please wait X seconds"
    const match = errorMessage.match(/(\d+)\s*(?:second|sec|s)/i);
    const initialSeconds = match ? parseInt(match[1], 10) : 60;
    let seconds = isNaN(initialSeconds) || initialSeconds <= 0 ? 60 : initialSeconds;
    const totalSeconds = seconds;

    const submitBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('auth-submit-btn'));
    const userIdInput = /** @type {HTMLInputElement|null} */ (document.getElementById('auth-input-userid'));
    const pwdInput = /** @type {HTMLInputElement|null} */ (document.getElementById('auth-input-password'));
    const pwdToggle = /** @type {HTMLButtonElement|null} */ (document.getElementById('auth-pwd-toggle'));

    if (submitBtn) submitBtn.disabled = true;
    if (userIdInput) userIdInput.disabled = true;
    if (pwdInput) pwdInput.disabled = true;
    if (pwdToggle) pwdToggle.disabled = true;

    if (this.#lockoutTimer) {
      clearInterval(this.#lockoutTimer);
      this.#lockoutTimer = null;
    }

    errorBanner.classList.remove('hidden', 'lockout-expired');
    errorBanner.classList.add('lockout-active');

    const renderCountdown = remaining => {
      const pct = Math.max(0, Math.min(100, Math.round((remaining / totalSeconds) * 100)));
      errorBanner.innerHTML = `
        <div class="lockout-card">
          <div class="lockout-header">
            ${safeIcon('shield-alert', 16)} <span>Security Lockout Active</span>
          </div>
          <div class="lockout-timer-display">
            Cooldown remaining: <strong class="lockout-countdown-digits">${remaining}s</strong>
          </div>
          <div class="lockout-progress-track">
            <div class="lockout-progress-bar" style="width: ${pct}%"></div>
          </div>
          <div class="lockout-guidance">
            Too many failed attempts. Input is temporarily locked to protect your offline financial vault from brute-force guessing.
          </div>
        </div>
      `;
    };

    renderCountdown(seconds);

    this.#lockoutTimer = setInterval(() => {
      seconds--;
      if (seconds <= 0) {
        clearInterval(this.#lockoutTimer);
        this.#lockoutTimer = null;

        if (submitBtn) submitBtn.disabled = false;
        if (userIdInput) userIdInput.disabled = false;
        if (pwdInput) {
          pwdInput.disabled = false;
          pwdInput.classList.remove('auth-input-error');
          pwdInput.focus();
        }
        if (pwdToggle) pwdToggle.disabled = false;

        errorBanner.classList.remove('lockout-active');
        errorBanner.classList.add('lockout-expired');
        errorBanner.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;">
            ${safeIcon('check-circle', 16)} <strong>Lockout expired. You may now enter your password.</strong>
          </div>
        `;
      } else {
        renderCountdown(seconds);
      }
    }, 1000);
  }

  // ==========================================================================
  // EVENT BINDINGS (ZERO INLINE ONCLICK)
  // ==========================================================================

  /**
   * Bind Master Account form submit, tab switching, and password toggle.
   * @private
   */
  #bindAuthForm() {
    const bindEl = (id, event, handler) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener(event, handler);
        this.#cleanups.push(() => el.removeEventListener(event, handler));
      }
    };

    bindEl('auth-tab-login', 'click', () => this.showAuthScreen('login'));
    bindEl('auth-tab-signup', 'click', () => this.showAuthScreen('signup'));

    // Password visibility toggle
    const pwdToggle = document.getElementById('auth-pwd-toggle');
    const pwdInput = /** @type {HTMLInputElement|null} */ (document.getElementById('auth-input-password'));
    if (pwdToggle && pwdInput) {
      const toggleHandler = () => {
        const isPassword = pwdInput.type === 'password';
        pwdInput.type = isPassword ? 'text' : 'password';
        pwdToggle.setAttribute('title', isPassword ? 'Hide password' : 'Show password');
        pwdToggle.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
        pwdToggle.innerHTML = safeIcon(isPassword ? 'eye-off' : 'eye', 16);
        pwdInput.focus();
      };
      pwdToggle.addEventListener('click', toggleHandler);
      this.#cleanups.push(() => pwdToggle.removeEventListener('click', toggleHandler));

      const inputHandler = () => {
        pwdInput.classList.remove('auth-input-error');
        const errorBanner = document.getElementById('auth-error-banner');
        if (errorBanner && !this.#lockoutTimer) {
          errorBanner.classList.add('hidden');
          errorBanner.textContent = '';
        }
      };
      pwdInput.addEventListener('input', inputHandler);
      this.#cleanups.push(() => pwdInput.removeEventListener('input', inputHandler));
    }

    bindEl('auth-form', 'submit', async e => {
      e.preventDefault();
      const userId = /** @type {HTMLInputElement|null} */ (document.getElementById('auth-input-userid'))?.value.trim();
      const password = /** @type {HTMLInputElement|null} */ (document.getElementById('auth-input-password'))?.value;
      const rememberMe =
        /** @type {HTMLInputElement|null} */ (document.getElementById('auth-remember-me'))?.checked ?? true;
      const errorBanner = document.getElementById('auth-error-banner');

      if (errorBanner && !this.#lockoutTimer) {
        errorBanner.classList.add('hidden');
        errorBanner.textContent = '';
      }

      const authMode = this.state?.get('authMode') || 'login';

      if (authMode === 'signup') {
        const setupFn = this.api?.setupVault
          ? this.api.setupVault.bind(this.api)
          : this.api?.setupAccount?.bind(this.api);
        const res = await setupFn?.({ userId, password, rememberMe });
        if (!res?.success) {
          this.#triggerAuthShake(res?.error || 'Failed to create account');
          return;
        }

        if (this.api?.getAccountStatus) {
          const status = await this.api.getAccountStatus();
          if (this.state) this.state.set('account', status);
        }

        if (res?.recoveryKey) {
          this.showEmergencyRecoveryKitModal(userId, res.recoveryKey);
        } else {
          showToast(`Master account created for "${userId}"!`);
          await this.showProfilePickerScreen();
        }
      } else {
        const res = await this.api?.loginAccount({ userId, password, rememberMe });
        if (!res?.success) {
          if (
            res?.locked ||
            (res?.error && (res.error.toLowerCase().includes('wait') || res.error.toLowerCase().includes('locked')))
          ) {
            this.#handleLockoutCooldown(res.error || 'Locked for 30 seconds.');
          } else {
            this.#triggerAuthShake(res?.error || 'Invalid credentials');
          }
          return;
        }

        if (this.api?.getAccountStatus) {
          const status = await this.api.getAccountStatus();
          if (this.state) this.state.set('account', status);
        }

        if (res?.migratedToVault && res?.recoveryKey) {
          this.showEmergencyRecoveryKitModal(userId, res.recoveryKey);
        } else {
          showToast(`Welcome back, ${userId}!`);
          await this.showProfilePickerScreen();
        }
      }
    });
  }

  /**
   * Bind Profile Picker screen actions (delegated clicks).
   * @private
   */
  #bindProfilePickerActions() {
    const pickerScreen = document.getElementById('screen-profile-picker');
    if (pickerScreen) {
      const unbind = delegateEvent(pickerScreen, 'click', '[data-action]', async (event, target) => {
        const action = target.getAttribute('data-action');
        if (!action) return;

        switch (action) {
          case 'select-profile': {
            const id = target.getAttribute('data-id');
            if (id) await this.enterUserDashboard(id);
            break;
          }
          case 'open-add-person': {
            this.openPersonModal();
            break;
          }
          default:
            break;
        }
      });
      this.#cleanups.push(unbind);
    }

    const bindEl = (id, event, handler) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener(event, handler);
        this.#cleanups.push(() => el.removeEventListener(event, handler));
      }
    };

    bindEl('btn-picker-signout', 'click', () => this.logoutUserSession());
    bindEl('btn-picker-add-person', 'click', () => this.openPersonModal());
    bindEl('btn-picker-manage', 'click', () => this.openManageProfilesModal());
  }

  /**
   * Bind Profile Picker keyboard navigation (1-9 digit selection, '+', 'n', 'm').
   * @private
   */
  #bindProfilePickerKeyboard() {
    const keyHandler = e => {
      const pickerScreen = document.getElementById('screen-profile-picker');
      if (!pickerScreen || pickerScreen.classList.contains('hidden')) return;

      // Skip if any modal is currently active or user is typing in an input field
      if (
        document.querySelector('.modal-overlay.active') ||
        ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)
      ) {
        return;
      }

      const key = e.key;
      const profiles = this.state?.get('profiles') || [];

      // 1-9 digit selection
      if (/^[1-9]$/.test(key)) {
        const index = parseInt(key, 10) - 1;
        if (profiles[index]) {
          e.preventDefault();
          this.enterUserDashboard(profiles[index].id);
          return;
        }
      }

      // '+' or 'n' or 'N' for Add Profile
      if (key === '+' || key.toLowerCase() === 'n') {
        e.preventDefault();
        this.openPersonModal();
        return;
      }

      // 'm' or 'M' for Manage Profiles
      if (key.toLowerCase() === 'm') {
        e.preventDefault();
        this.openManageProfilesModal();
      }
    };

    window.addEventListener('keydown', keyHandler);
    this.#cleanups.push(() => window.removeEventListener('keydown', keyHandler));
  }

  /**
   * Bind backdrop click dismiss on dedicated profile delete confirmation modal.
   * @private
   */
  #bindDeleteProfileConfirmModal() {
    const modal = document.getElementById('delete-profile-confirm-modal');
    if (modal) {
      const closeHandler = e => {
        if (e.target === modal) {
          modal.classList.remove('active');
        }
      };
      modal.addEventListener('click', closeHandler);
      this.#cleanups.push(() => modal.removeEventListener('click', closeHandler));
    }
  }

  /**
   * Bind Person Profile Modal submission and controls.
   * @private
   */
  #bindPersonModal() {
    const bindEl = (id, event, handler) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener(event, handler);
        this.#cleanups.push(() => el.removeEventListener(event, handler));
      }
    };

    bindEl('person-modal-close', 'click', () => this.closePersonModal());
    bindEl('btn-cancel-person', 'click', () => this.closePersonModal());

    const nameInput = document.getElementById('person-form-name');
    if (nameInput) {
      const inputHandler = () => this.updatePersonAvatarPreview();
      nameInput.addEventListener('input', inputHandler);
      this.#cleanups.push(() => nameInput.removeEventListener('input', inputHandler));
    }

    // Avatar Color Dots
    const strip = document.getElementById('avatar-color-strip');
    if (strip) {
      const unbind = delegateEvent(strip, 'click', '.color-dot-opt', (e, target) => {
        e.preventDefault();
        const color = target.getAttribute('data-color') || '#D9822B';
        this.selectAvatarColor(color);
      });
      this.#cleanups.push(unbind);
    }

    bindEl('person-form', 'submit', async e => {
      e.preventDefault();
      const id = /** @type {HTMLInputElement|null} */ (document.getElementById('person-form-id'))?.value;
      const name = /** @type {HTMLInputElement|null} */ (document.getElementById('person-form-name'))?.value.trim();
      const avatar =
        /** @type {HTMLInputElement|null} */ (document.getElementById('person-form-avatar'))?.value || '#D9822B';
      const color = avatar;

      if (!name) return;

      if (id) {
        const res = await this.api?.updateProfile({ id, name, color, avatar });
        if (res?.success) {
          showToast(`Profile "${name}" updated!`);
        } else {
          if (typeof alert === 'function') alert(res?.error || 'Failed to update profile');
        }
      } else {
        const res = await this.api?.createProfile({ name, color, avatar });
        if (res?.success && res.profile) {
          showToast(`Welcome, ${name}! Profile created.`);
          this.closePersonModal();
          await this.enterUserDashboard(res.profile.id);
          return;
        } else {
          if (typeof alert === 'function') alert(res?.error || 'Failed to create profile');
        }
      }

      this.closePersonModal();
      await this.renderProfilePickerGrid();
    });

    bindEl('btn-delete-person', 'click', async () => {
      const id = /** @type {HTMLInputElement|null} */ (document.getElementById('person-form-id'))?.value;
      const name =
        /** @type {HTMLInputElement|null} */ (document.getElementById('person-form-name'))?.value.trim() || 'Profile';
      if (!id) return;

      const profiles = this.state?.get('profiles') || [];
      if (profiles.length <= 1) {
        if (typeof alert === 'function') alert('Cannot delete the only remaining profile in your account.');
        return;
      }

      const confirmed = await this.confirmProfileDeletion(name);
      if (!confirmed) return;

      const res = await this.api?.deleteProfile(id);
      if (res?.success) {
        showToast('Profile deleted');
        this.closePersonModal();
        await this.renderProfilePickerGrid();
      } else {
        if (typeof alert === 'function') alert(res?.error || 'Failed to delete profile');
      }
    });
  }

  /**
   * Bind Manage Profiles modal actions and buttons.
   * @private
   */
  #bindManageProfilesModal() {
    const bindEl = (id, event, handler) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener(event, handler);
        this.#cleanups.push(() => el.removeEventListener(event, handler));
      }
    };

    bindEl('btn-manage-profiles-close', 'click', () => this.closeManageProfilesModal());
    bindEl('btn-manage-profiles-done', 'click', () => this.closeManageProfilesModal());
    bindEl('btn-manage-add-person', 'click', () => {
      this.closeManageProfilesModal();
      this.openPersonModal();
    });

    const listEl = document.getElementById('manage-profiles-list');
    if (listEl) {
      const unbind = delegateEvent(listEl, 'click', '[data-action]', async (event, target) => {
        const action = target.getAttribute('data-action');
        if (!action) return;

        if (action === 'edit-manage-profile') {
          const id = target.getAttribute('data-id');
          this.closeManageProfilesModal();
          this.openPersonModal(id);
        } else if (action === 'delete-manage-profile') {
          const id = target.getAttribute('data-id');
          const name = target.getAttribute('data-name') || 'User';
          if (id) await this.handleDeleteProfile(id, name);
        }
      });
      this.#cleanups.push(unbind);
    }
  }

  // ==========================================================================
  // IN-APP PROFILE SWITCHER & WORKSPACE MODE DROPDOWN (Phase 4.11)
  // ==========================================================================

  /**
   * Bind top-left in-app profile switcher dropdown and workspace mode toggle.
   * @private
   */
  #bindProfileDropdown() {
    const profileChip = document.getElementById('btn-open-profile-switcher');
    const profileDropdown = document.getElementById('profile-quick-dropdown');

    if (profileChip && profileDropdown) {
      const toggleDropdown = e => {
        e.stopPropagation();
        profileDropdown.classList.toggle('hidden');
      };
      profileChip.addEventListener('click', toggleDropdown);
      this.#cleanups.push(() => profileChip.removeEventListener('click', toggleDropdown));

      const closeDropdownOutside = e => {
        if (!profileDropdown.contains(e.target) && !profileChip.contains(e.target)) {
          profileDropdown.classList.add('hidden');
        }
      };
      window.addEventListener('click', closeDropdownOutside);
      this.#cleanups.push(() => window.removeEventListener('click', closeDropdownOutside));
    }

    const bindEl = (id, event, handler) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener(event, handler);
        this.#cleanups.push(() => el.removeEventListener(event, handler));
      }
    };

    bindEl('menu-switch-person', 'click', async () => {
      profileDropdown?.classList.add('hidden');
      await this.showProfilePickerScreen();
    });

    bindEl('menu-add-person', 'click', () => {
      profileDropdown?.classList.add('hidden');
      this.openPersonModal();
    });

    bindEl('menu-sign-out', 'click', async () => {
      profileDropdown?.classList.add('hidden');
      await this.logoutUserSession();
    });

    bindEl('menu-toggle-workspace-mode', 'click', async () => {
      const current = this.state?.get('workspaceMode') || 'household';
      const nextMode = current === 'household' ? 'solo' : 'household';
      if (this.api?.setWorkspaceMode) {
        await this.api.setWorkspaceMode(nextMode);
      }
      if (this.state) {
        this.state.set('workspaceMode', nextMode);
      }
      document.body.classList.toggle('mode-solo', nextMode === 'solo');
      profileDropdown?.classList.add('hidden');

      const modeText = document.getElementById('menu-mode-text');
      const modeIcon = document.getElementById('menu-mode-icon');
      if (modeText) modeText.textContent = nextMode === 'solo' ? 'Switch to Household Mode' : 'Switch to Solo Mode';
      if (modeIcon && typeof icon === 'function')
        modeIcon.innerHTML = nextMode === 'solo' ? icon('users', 14) : icon('user', 14);

      showActionToast({
        icon: nextMode === 'solo' ? 'user' : 'users',
        title: nextMode === 'solo' ? 'Solo Workspace Activated' : 'Household Workspace Activated',
        subtext:
          nextMode === 'solo'
            ? 'Streamlined 100% full-width ledger view'
            : 'Shared balances & multi-party split enabled'
      });

      if (this.onSessionReady) await this.onSessionReady();
    });
  }

  // ==========================================================================
  // RECOVERY KIT, FORGOT PASSWORD & HARD WALL MODAL BINDINGS (ADR-014)
  // ==========================================================================

  /**
   * Bind Emergency Recovery Kit modal actions (Copy, Download, Continue).
   * @private
   */
  #bindRecoveryKitModal() {
    const bindEl = (id, event, handler) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener(event, handler);
        this.#cleanups.push(() => el.removeEventListener(event, handler));
      }
    };

    // Copy recovery key to clipboard
    bindEl('btn-copy-recovery-key', 'click', async () => {
      const domKey = document.getElementById('recovery-kit-key-text')?.textContent?.trim();
      const key = this.#currentRecoveryKey || domKey;
      if (!key) return;
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(key);
        } else {
          const ta = document.createElement('textarea');
          ta.value = key;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        showToast('Emergency Recovery Key copied to clipboard');
      } catch (err) {
        console.warn('Failed to copy key:', err);
        showToast('Failed to copy recovery key');
      }
    });

    // Save recovery key as text file
    bindEl('btn-download-recovery-key', 'click', () => {
      const domKey = document.getElementById('recovery-kit-key-text')?.textContent?.trim();
      const key = this.#currentRecoveryKey || domKey || 'UNKNOWN';
      const user = this.#currentUserId || this.state?.get?.('account')?.userId || 'User';
      const fileContent = [
        '================================================================================',
        'LEDGERLY EMERGENCY RECOVERY KIT',
        '================================================================================',
        `Account User ID: ${user}`,
        `Created Date:    ${new Date().toISOString()}`,
        '',
        'YOUR EMERGENCY RECOVERY KEY (SLOT 2):',
        key,
        '',
        'CRITICAL ZERO-KNOWLEDGE SECURITY NOTICE:',
        '- Ledgerly stores your financial ledger with bank-grade AES-256-GCM envelope',
        '  encryption at rest on your local device.',
        '- All keys are derived with PBKDF2-HMAC-SHA512 (310,000 iterations).',
        '- There are NO cloud servers, backdoors, or remote account resets.',
        '- If you lose your master password, THIS KEY IS THE ONLY WAY TO RESTORE ACCESS.',
        '- Keep this file on an encrypted flash drive or in your password manager vault.',
        '================================================================================'
      ].join('\n');

      try {
        const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ledgerly_emergency_recovery_kit_${user.replace(/[^a-zA-Z0-9_-]/g, '_')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Emergency Recovery Kit saved as text file');
      } catch (err) {
        console.warn('Failed to save text file:', err);
        showToast('Failed to save recovery file');
      }
    });

    // Acknowledge checkbox enables Continue button
    bindEl('recovery-kit-ack-checkbox', 'change', e => {
      const target = /** @type {HTMLInputElement} */ (e.target);
      const continueBtn = /** @type {HTMLButtonElement|null} */ (
        document.getElementById('btn-recovery-kit-continue')
      );
      if (continueBtn) {
        continueBtn.disabled = !target.checked;
      }
    });

    // Close or Continue to Profile Picker
    const finishRecoveryKit = async () => {
      const modal = document.getElementById('modal-auth-recovery-kit');
      modal?.classList.remove('active');
      modal?.classList.add('hidden');
      const appContainer = document.getElementById('main-app-container');
      if (appContainer && !appContainer.classList.contains('hidden')) {
        return;
      }
      showToast('Master vault configured successfully!');
      await this.showProfilePickerScreen();
    };

    bindEl('btn-recovery-kit-continue', 'click', finishRecoveryKit);
    bindEl('btn-close-recovery-kit', 'click', finishRecoveryKit);
  }

  /**
   * Bind Master Password Recovery modal flow (Forgot password link, form submit).
   * @private
   */
  #bindRecoveryFlowModal() {
    const bindEl = (id, event, handler) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener(event, handler);
        this.#cleanups.push(() => el.removeEventListener(event, handler));
      }
    };

    // Open recovery modal from auth screen
    bindEl('auth-forgot-link', 'click', () => {
      const modal = document.getElementById('modal-auth-recovery');
      const errorBanner = document.getElementById('auth-recovery-error-banner');
      const keyInput = /** @type {HTMLInputElement|null} */ (document.getElementById('recovery-input-key'));
      const newPwdInput = /** @type {HTMLInputElement|null} */ (document.getElementById('recovery-input-new-password'));
      const confirmPwdInput = /** @type {HTMLInputElement|null} */ (
        document.getElementById('recovery-input-confirm-password')
      );

      if (errorBanner) {
        errorBanner.classList.add('hidden');
        errorBanner.textContent = '';
      }
      if (keyInput) keyInput.value = '';
      if (newPwdInput) newPwdInput.value = '';
      if (confirmPwdInput) confirmPwdInput.value = '';

      modal?.classList.add('active');
      if (typeof window !== 'undefined' && typeof window.hydrateIcons === 'function') {
        window.hydrateIcons(modal);
      }

      setTimeout(() => keyInput?.focus(), 50);
    });

    // Password visibility toggle in recovery modal
    const pwdToggle = document.getElementById('recovery-pwd-toggle');
    const pwdInput = /** @type {HTMLInputElement|null} */ (document.getElementById('recovery-input-new-password'));
    if (pwdToggle && pwdInput) {
      const toggleHandler = () => {
        const isPassword = pwdInput.type === 'password';
        pwdInput.type = isPassword ? 'text' : 'password';
        pwdToggle.setAttribute('title', isPassword ? 'Hide password' : 'Show password');
        pwdToggle.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
        pwdToggle.innerHTML = safeIcon(isPassword ? 'eye-off' : 'eye', 16);
        pwdInput.focus();
      };
      pwdToggle.addEventListener('click', toggleHandler);
      this.#cleanups.push(() => pwdToggle.removeEventListener('click', toggleHandler));
    }

    // Close recovery modal
    const closeRecoveryModal = () => {
      document.getElementById('modal-auth-recovery')?.classList.remove('active');
    };
    bindEl('btn-close-auth-recovery', 'click', closeRecoveryModal);
    bindEl('btn-cancel-auth-recovery', 'click', closeRecoveryModal);

    // Submit recovery form
    bindEl('auth-recovery-form', 'submit', async e => {
      e.preventDefault();
      const errorBanner = document.getElementById('auth-recovery-error-banner');
      const keyInput = /** @type {HTMLInputElement|null} */ (document.getElementById('recovery-input-key'));
      const newPwdInput = /** @type {HTMLInputElement|null} */ (document.getElementById('recovery-input-new-password'));
      const confirmPwdInput = /** @type {HTMLInputElement|null} */ (
        document.getElementById('recovery-input-confirm-password')
      );
      const modalForm = document.getElementById('auth-recovery-form');

      const recoveryKey = keyInput?.value.trim() || '';
      const newPassword = newPwdInput?.value || '';
      const confirmPassword = confirmPwdInput?.value || '';

      const showError = msg => {
        if (errorBanner) {
          errorBanner.textContent = msg;
          errorBanner.classList.remove('hidden');
        }
        if (modalForm) {
          modalForm.classList.remove('auth-shake');
          void modalForm.offsetWidth;
          modalForm.classList.add('auth-shake');
          setTimeout(() => modalForm.classList.remove('auth-shake'), 450);
        }
      };

      if (!recoveryKey) {
        showError('Emergency Recovery Key is required.');
        keyInput?.focus();
        return;
      }

      if (!newPassword || newPassword.length < 4) {
        showError('New password must be at least 4 characters long.');
        newPwdInput?.focus();
        return;
      }

      if (newPassword !== confirmPassword) {
        showError('Passwords do not match. Please re-enter.');
        confirmPwdInput?.focus();
        return;
      }

      const res = await this.api?.recoverVault?.({ recoveryKey, newPassword });
      if (!res?.success) {
        showError(res?.error || 'Invalid Emergency Recovery Key');
        return;
      }

      closeRecoveryModal();
      showToast('Master password reset successfully! Please sign in.');
      this.showAuthScreen('login');
    });
  }

  /**
   * Bind Cryptographic Hard Wall dialog actions (Factory Reset).
   * @private
   */
  #bindHardWallModal() {
    const bindEl = (id, event, handler) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener(event, handler);
        this.#cleanups.push(() => el.removeEventListener(event, handler));
      }
    };

    // Transition from recovery modal to hard wall modal
    bindEl('link-lost-recovery-key', 'click', () => {
      document.getElementById('modal-auth-recovery')?.classList.remove('active');
      const hardWallModal = document.getElementById('modal-auth-hard-wall');
      const confirmInput = /** @type {HTMLInputElement|null} */ (document.getElementById('hard-wall-confirm-input'));
      const resetBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('btn-confirm-factory-reset'));

      if (confirmInput) confirmInput.value = '';
      if (resetBtn) resetBtn.disabled = true;

      hardWallModal?.classList.add('active');
      if (typeof window !== 'undefined' && typeof window.hydrateIcons === 'function') {
        window.hydrateIcons(hardWallModal);
      }
      setTimeout(() => confirmInput?.focus(), 50);
    });

    // Enable reset button only when input is "RESET"
    bindEl('hard-wall-confirm-input', 'input', e => {
      const target = /** @type {HTMLInputElement} */ (e.target);
      const resetBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('btn-confirm-factory-reset'));
      if (resetBtn) {
        resetBtn.disabled = target.value.trim() !== 'RESET';
      }
    });

    // Close / Cancel hard wall modal
    const closeHardWall = () => {
      document.getElementById('modal-auth-hard-wall')?.classList.remove('active');
      document.getElementById('modal-auth-recovery')?.classList.add('active');
    };
    bindEl('btn-close-hard-wall', 'click', closeHardWall);
    bindEl('btn-cancel-hard-wall', 'click', closeHardWall);

    // Execute Factory Reset
    bindEl('btn-confirm-factory-reset', 'click', async () => {
      const resetBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('btn-confirm-factory-reset'));
      if (resetBtn) resetBtn.disabled = true;

      const res = await this.api?.factoryResetVault?.();
      if (!res?.success) {
        if (resetBtn) resetBtn.disabled = false;
        showToast(res?.error || 'Failed to factory reset vault');
        return;
      }

      document.getElementById('modal-auth-hard-wall')?.classList.remove('active');
      showToast('Vault factory reset complete. Database has been reset.');

      if (this.state) {
        this.state.set('account', { isConfigured: false, rememberMe: false });
        this.state.set('profiles', []);
        this.state.set('activeProfile', null);
      }

      const userIdInput = /** @type {HTMLInputElement|null} */ (document.getElementById('auth-input-userid'));
      const pwdInput = /** @type {HTMLInputElement|null} */ (document.getElementById('auth-input-password'));
      if (userIdInput) userIdInput.value = '';
      if (pwdInput) pwdInput.value = '';

      this.showAuthScreen('signup');
    });
  }
}
