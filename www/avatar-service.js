/* ═══════════════════════════════════════════════════════
   ZenFit / FITLY — Modern Profile Avatar Service
   ═══════════════════════════════════════════════════════ */

const AvatarService = {
  // 5 Curated 3D Fitness Profile Avatars
  presets: {
    'avatars/avatar1.jpg': {
      id: 'avatars/avatar1.jpg',
      name: 'Alex (Elite Runner)',
      img: 'avatars/avatar1.jpg'
    },
    'avatars/avatar2.jpg': {
      id: 'avatars/avatar2.jpg',
      name: 'Maya (Zen Athlete)',
      img: 'avatars/avatar2.jpg'
    },
    'avatars/avatar3.jpg': {
      id: 'avatars/avatar3.jpg',
      name: 'Marcus (Power Lifter)',
      img: 'avatars/avatar3.jpg'
    },
    'avatars/avatar4.jpg': {
      id: 'avatars/avatar4.jpg',
      name: 'Elena (Cardio & Crossfit)',
      img: 'avatars/avatar4.jpg'
    },
    'avatars/avatar5.jpg': {
      id: 'avatars/avatar5.jpg',
      name: 'Jordan (Pro Coach)',
      img: 'avatars/avatar5.jpg'
    }
  },

  activeDraftAvatar: 'avatars/avatar1.jpg',

  init() {
    this.injectModalDOM();
  },

  // Helper to pick a random avatar from the 5 for new profiles
  getRandomAvatar() {
    const keys = Object.keys(this.presets);
    const index = Math.floor(Math.random() * keys.length);
    return keys[index];
  },

  // Resolve legacy preset keys or fallback to valid avatar
  resolveAvatar(avatarVal) {
    if (!avatarVal) return 'avatars/avatar1.jpg';
    if (avatarVal.startsWith('data:image/') || avatarVal.startsWith('http')) return avatarVal;
    if (this.presets[avatarVal]) return avatarVal;
    if (avatarVal.includes('lifter')) return 'avatars/avatar3.jpg';
    if (avatarVal.includes('yogi')) return 'avatars/avatar2.jpg';
    if (avatarVal.includes('runner')) return 'avatars/avatar4.jpg';
    if (avatarVal.includes('boxer') || avatarVal.includes('cyclist')) return 'avatars/avatar5.jpg';
    return 'avatars/avatar1.jpg';
  },

  // Render avatar into any container element (handles custom photo or image path)
  renderAvatar(containerEl, avatarVal, fallbackLetter = 'A') {
    if (!containerEl) return;
    
    containerEl.innerHTML = '';
    containerEl.style.overflow = 'hidden';
    containerEl.style.position = 'relative';

    const resolved = this.resolveAvatar(avatarVal);

    if (resolved && (resolved.startsWith('avatars/') || resolved.startsWith('data:image/') || resolved.startsWith('http'))) {
      const img = document.createElement('img');
      img.src = resolved;
      img.alt = 'User Avatar';
      img.style.cssText = 'width:100%; height:100%; object-fit:cover; border-radius:50%; display:block;';
      img.onerror = () => {
        containerEl.innerHTML = '';
        this.renderFallbackLetter(containerEl, fallbackLetter);
      };
      containerEl.appendChild(img);
      return;
    }

    this.renderFallbackLetter(containerEl, fallbackLetter);
  },

  renderFallbackLetter(containerEl, fallbackLetter) {
    const char = (fallbackLetter || 'A').charAt(0).toUpperCase();
    containerEl.style.background = '#001F3F';
    containerEl.style.color = '#ffffff';
    containerEl.style.fontWeight = '800';
    containerEl.style.display = 'flex';
    containerEl.style.alignItems = 'center';
    containerEl.style.justifyContent = 'center';
    containerEl.innerText = char;
  },

  // Open Avatar Selection Modal
  openModal() {
    const currentAvatar = (window.AppDataService && AppDataService.profile && AppDataService.profile.avatar) || 'avatars/avatar1.jpg';
    this.activeDraftAvatar = this.resolveAvatar(currentAvatar);

    const modal = document.getElementById('avatar-picker-modal');
    if (modal) {
      modal.classList.add('active');
      this.renderPresetsGrid();
      this.updateCustomBtnState();
    }
  },

  // Close Avatar Selection Modal
  closeModal() {
    const modal = document.getElementById('avatar-picker-modal');
    if (modal) modal.classList.remove('active');
  },

  // Select a preset avatar
  selectPreset(presetId) {
    if (!this.presets[presetId]) return;
    this.activeDraftAvatar = presetId;
    this.renderPresetsGrid();
    this.updateCustomBtnState();
  },

  // Handle custom photo upload from device camera/gallery
  handleFileSelect(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Compress & crop to centered 1:1 square canvas (256x256)
        const canvas = document.createElement('canvas');
        const size = 256;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const minDim = Math.min(img.width, img.height);
        const startX = (img.width - minDim) / 2;
        const startY = (img.height - minDim) / 2;

        ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, size, size);
        
        // Export compressed JPEG
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        this.activeDraftAvatar = compressedDataUrl;
        this.renderPresetsGrid();
        this.updateCustomBtnState();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  },

  // Trigger file input dialog
  triggerFileUpload() {
    const input = document.getElementById('avatar-file-input');
    if (input) {
      input.value = ''; // reset
      input.click();
    }
  },

  // Save selection and update profile across the app
  saveSelection() {
    if (window.AppDataService && typeof AppDataService.updateAvatar === 'function') {
      AppDataService.updateAvatar(this.activeDraftAvatar);
    }
    const obPreview = document.getElementById('ob-avatar-preview');
    if (obPreview) {
      this.renderAvatar(obPreview, this.activeDraftAvatar, 'A');
    }
    this.closeModal();
  },

  // Update button state if custom photo is loaded
  updateCustomBtnState() {
    const customBtn = document.getElementById('modal-custom-photo-btn');
    if (!customBtn) return;

    if (this.activeDraftAvatar && this.activeDraftAvatar.startsWith('data:image/')) {
      customBtn.classList.add('custom-active');
      customBtn.innerHTML = `
        <div style="width:22px; height:22px; border-radius:50%; overflow:hidden; border:1.5px solid #001F3F; display:inline-block; vertical-align:middle; margin-right:4px;">
          <img src="${this.activeDraftAvatar}" style="width:100%; height:100%; object-fit:cover; display:block;" />
        </div>
        <span>✓ Custom Photo Selected</span>
        <span style="font-size:0.75rem; color:#dc2626; margin-left:8px; cursor:pointer;" onclick="event.stopPropagation(); AvatarService.selectPreset('avatars/avatar1.jpg');">Remove</span>
      `;
    } else {
      customBtn.classList.remove('custom-active');
      customBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        <span>Upload Your Picture</span>
      `;
    }
  },

  // Render 5 presets in a compact row
  renderPresetsGrid() {
    const gridEl = document.getElementById('modal-presets-grid');
    if (!gridEl) return;

    gridEl.innerHTML = '';
    Object.values(this.presets).forEach(preset => {
      const chip = document.createElement('div');
      const isSelected = (this.activeDraftAvatar === preset.id);
      chip.className = `avatar-preset-chip ${isSelected ? 'selected' : ''}`;
      chip.title = preset.name;
      chip.innerHTML = `<img src="${preset.img}" alt="${preset.name}" />`;
      chip.onclick = () => this.selectPreset(preset.id);
      gridEl.appendChild(chip);
    });
  },

  // Inject sleek compact modal DOM into body
  injectModalDOM() {
    if (document.getElementById('avatar-picker-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'avatar-picker-modal';
    modal.className = 'avatar-modal';
    modal.innerHTML = `
      <div class="avatar-modal-backdrop" onclick="AvatarService.closeModal()"></div>
      <div class="avatar-modal-card">
        
        <div class="avatar-modal-header">
          <h4>Choose Avatar</h4>
          <button type="button" class="avatar-modal-close" onclick="AvatarService.closeModal()" title="Close">✕</button>
        </div>

        <p class="avatar-modal-sub">Select your athlete persona or use your photo</p>

        <!-- Compact 5-avatar row -->
        <div class="avatar-row-presets" id="modal-presets-grid"></div>

        <!-- Custom Upload button -->
        <input type="file" id="avatar-file-input" accept="image/*" style="display:none;" onchange="AvatarService.handleFileSelect(event)" />
        <button type="button" class="avatar-upload-btn" id="modal-custom-photo-btn" onclick="AvatarService.triggerFileUpload()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          <span>Upload Your Picture</span>
        </button>

        <!-- Compact Save button -->
        <button type="button" class="avatar-save-btn" onclick="AvatarService.saveSelection()">
          Save Avatar
        </button>

      </div>
    `;

    document.body.appendChild(modal);
  }
};

// Initialize on DOM load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => AvatarService.init());
} else {
  AvatarService.init();
}

window.AvatarService = AvatarService;
