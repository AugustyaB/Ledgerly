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
    this.#bindPersonModal();
    this.#bindManageProfilesModal();
    this.#bindProfileDropdown();
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

      if (status.rememberMe) {
        await this.showProfilePickerScreen();
      } else {
        this.showAuthScreen('login');
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

    if (errorBanner) {
      errorBanner.classList.add('hidden');
      errorBanner.textContent = '';
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

    const cardsHtml = profiles
      .map(p => {
        const count = p.expenseCount || 0;
        const color = p.color || p.avatar || safeAvatarColor(p.name);
        const initials = safeInitials(p.name);

        return `
        <div class="netflix-picker-card" data-action="select-profile" data-id="${p.id}">
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
      <div class="netflix-picker-card netflix-add-card" data-action="open-add-person">
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
    setTimeout(() => nameEl?.focus(), 50);
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
      btn.classList.toggle('active', btn.getAttribute('data-color') === color);
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
  async handleDeleteProfile(profileId, profileName) {
    const profiles = this.state?.get('profiles') || [];
    if (profiles.length <= 1) {
      if (typeof alert === 'function') alert('Cannot delete the only remaining profile in your account.');
      return;
    }

    if (
      typeof confirm === 'function' &&
      !confirm(
        `Are you sure you want to delete profile "${profileName}"? All associated personal records will be removed.`
      )
    ) {
      return;
    }

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
  // LOCKOUT COOLDOWN TIMER HELPER
  // ==========================================================================

  /**
   * Handle brute-force lockout message with visual live countdown timer.
   * @param {string} errorMessage
   * @private
   */
  #handleLockoutCooldown(errorMessage) {
    const errorBanner = document.getElementById('auth-error-banner');
    if (!errorBanner) return;

    errorBanner.textContent = errorMessage;
    errorBanner.classList.remove('hidden');

    // Parse seconds from "Please wait X seconds"
    const match = errorMessage.match(/(\d+)\s*second/i);
    if (!match) return;

    let seconds = parseInt(match[1], 10);
    if (isNaN(seconds) || seconds <= 0) return;

    const submitBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('auth-submit-btn'));
    if (submitBtn) submitBtn.disabled = true;

    if (this.#lockoutTimer) clearInterval(this.#lockoutTimer);

    this.#lockoutTimer = setInterval(() => {
      seconds--;
      if (seconds <= 0) {
        clearInterval(this.#lockoutTimer);
        this.#lockoutTimer = null;
        if (errorBanner) {
          errorBanner.textContent = 'Lockout expired. You may now try again.';
          errorBanner.style.borderColor = 'var(--accent-emerald)';
        }
        if (submitBtn) submitBtn.disabled = false;
      } else {
        if (errorBanner) {
          errorBanner.textContent = `Too many failed attempts. Please wait ${seconds} second${seconds === 1 ? '' : 's'}.`;
        }
      }
    }, 1000);
  }

  // ==========================================================================
  // EVENT BINDINGS (ZERO INLINE ONCLICK)
  // ==========================================================================

  /**
   * Bind Master Account form submit and tab switching.
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

    bindEl('auth-form', 'submit', async e => {
      e.preventDefault();
      const userId = /** @type {HTMLInputElement|null} */ (document.getElementById('auth-input-userid'))?.value.trim();
      const password = /** @type {HTMLInputElement|null} */ (document.getElementById('auth-input-password'))?.value;
      const rememberMe =
        /** @type {HTMLInputElement|null} */ (document.getElementById('auth-remember-me'))?.checked ?? true;
      const errorBanner = document.getElementById('auth-error-banner');

      if (errorBanner) {
        errorBanner.classList.add('hidden');
        errorBanner.textContent = '';
      }

      const authMode = this.state?.get('authMode') || 'login';

      if (authMode === 'signup') {
        const res = await this.api?.setupAccount({ userId, password, rememberMe });
        if (!res?.success) {
          if (errorBanner) {
            errorBanner.textContent = res?.error || 'Failed to create account';
            errorBanner.classList.remove('hidden');
          }
          return;
        }

        showToast(`Master account created for "${userId}"!`);
        if (this.api?.getAccountStatus) {
          const status = await this.api.getAccountStatus();
          if (this.state) this.state.set('account', status);
        }
        await this.showProfilePickerScreen();
      } else {
        const res = await this.api?.loginAccount({ userId, password, rememberMe });
        if (!res?.success) {
          if (res?.error && res.error.toLowerCase().includes('wait')) {
            this.#handleLockoutCooldown(res.error);
          } else if (errorBanner) {
            errorBanner.textContent = res?.error || 'Invalid credentials';
            errorBanner.classList.remove('hidden');
          }
          return;
        }

        showToast(`Welcome back, ${userId}!`);
        if (this.api?.getAccountStatus) {
          const status = await this.api.getAccountStatus();
          if (this.state) this.state.set('account', status);
        }
        await this.showProfilePickerScreen();
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
      if (!id) return;

      if (
        typeof confirm === 'function' &&
        !confirm('Are you sure you want to delete this profile and all its stored records?')
      ) {
        return;
      }

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
}
