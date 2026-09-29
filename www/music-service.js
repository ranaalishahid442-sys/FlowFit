/* ═══════════════════════════════════════════════════════
   ZenFit — Jamendo Workout Music Service & Dynamic Island
   Client ID: 1148a781
   ═══════════════════════════════════════════════════════ */

const JamendoMusicService = {
  clientId: '1148a781',
  audio: null,
  
  // Station definitions with curated Jamendo API filters
  stations: {
    gym: {
      id: 'gym',
      name: 'Gym & Energy',
      icon: '⚡',
      query: 'search=gym&boost=popularity_month'
    },
    fitness: {
      id: 'fitness',
      name: 'Fitness Beats',
      icon: '🔥',
      query: 'search=fitness&boost=popularity_month'
    },
    edm: {
      id: 'edm',
      name: 'EDM & Electro',
      icon: '🚀',
      query: 'tags=electronic&boost=popularity_month'
    },
    rock: {
      id: 'rock',
      name: 'Workout Rock',
      icon: '🎸',
      query: 'tags=rock&boost=popularity_month'
    },
    hiphop: {
      id: 'hiphop',
      name: 'Hip-Hop Pump',
      icon: '🎧',
      query: 'tags=hiphop&boost=popularity_month'
    },
    yoga: {
      id: 'yoga',
      name: 'Yoga & Zen',
      icon: '🧘',
      query: 'search=yoga'
    }
  },

  currentStationId: 'gym',
  playlist: [],
  currentIndex: -1,
  isLoading: false,
  isPlaying: false,
  
  // Volume & Ducking
  userVolume: 0.85,
  isDucked: false,
  duckInterval: null,
  
  // Dynamic Island state: 'hidden' | 'banner' | 'dot' | 'expanded'
  islandState: 'hidden',
  bannerTimer: null,
  isAutoPlayEnabled: true,
  
  init() {
    // Load saved settings
    try {
      const savedVol = localStorage.getItem('fitly_music_volume');
      if (savedVol !== null) this.userVolume = parseFloat(savedVol);
      const savedStation = localStorage.getItem('fitly_music_station');
      if (savedStation && this.stations[savedStation]) this.currentStationId = savedStation;
      const savedAuto = localStorage.getItem('fitly_music_autoplay');
      if (savedAuto !== null) this.isAutoPlayEnabled = (savedAuto === 'true');
    } catch (e) {}

    // Setup HTML5 Audio
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.volume = this.userVolume;
    this.audio.preload = 'auto';

    this.audio.addEventListener('ended', () => {
      this.playNext();
    });

    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.updateUI();
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.updateUI();
    });

    this.audio.addEventListener('timeupdate', () => {
      this.updateProgress();
    });

    this.audio.addEventListener('error', (e) => {
      console.warn('Jamendo audio stream error, skipping to next track...', e);
      setTimeout(() => this.playNext(), 1500);
    });

    // Render Dynamic Island DOM elements
    this.injectIslandDOM();
  },

  // Pick station based on workout category/name
  getRecommendedStation(categoryOrTitle) {
    const text = (categoryOrTitle || '').toLowerCase();
    if (text.includes('yoga') || text.includes('stretch') || text.includes('calm') || text.includes('relax')) {
      return 'yoga';
    }
    if (text.includes('hiit') || text.includes('cardio') || text.includes('jump') || text.includes('burpee')) {
      return 'edm';
    }
    if (text.includes('rock') || text.includes('metal') || text.includes('hardcore')) {
      return 'rock';
    }
    if (text.includes('dance') || text.includes('aerobic')) {
      return 'fitness';
    }
    return 'gym';
  },

  // Fetch playlist for a station from Jamendo API
  async fetchTracks(stationId, forceNew = false) {
    const station = this.stations[stationId] || this.stations.gym;
    if (!forceNew && this.playlist.length > 0 && this.currentStationId === stationId) {
      return this.playlist;
    }

    this.isLoading = true;
    this.currentStationId = stationId;
    try {
      localStorage.setItem('fitly_music_station', stationId);
    } catch (e) {}

    try {
      const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${this.clientId}&format=json&limit=15&audioformat=mp32&${station.query}`;
      const res = await fetch(url);
      const data = await res.json();
      
      if (data && data.results && data.results.length > 0) {
        // Map track data
        this.playlist = data.results.map(t => ({
          id: t.id,
          name: t.name,
          artist: t.artist_name,
          audio: t.audio,
          image: t.image || 'https://usercontent.jamendo.com?type=album&id=default&width=300',
          duration: t.duration || 180
        }));
        this.currentIndex = 0;
      } else {
        console.warn('Jamendo returned empty track list for station:', stationId);
      }
    } catch (err) {
      console.error('Failed to fetch Jamendo tracks:', err);
    } finally {
      this.isLoading = false;
      this.updateUI();
    }

    return this.playlist;
  },

  // Start music for a workout session
  async onWorkoutStart(workoutContext = '') {
    if (!this.isAutoPlayEnabled) return;
    
    // Choose appropriate station
    const recStation = this.getRecommendedStation(workoutContext);
    
    // If music is already playing smoothly on this station, do not cut off song
    if (this.isPlaying && this.currentStationId === recStation && this.audio && !this.audio.paused) {
      return;
    }

    if (this.playlist.length === 0 || this.currentStationId !== recStation) {
      await this.fetchTracks(recStation, true);
    }

    if (this.playlist.length > 0) {
      this.playCurrentTrack();
    }
  },

  // Play currently selected track
  playCurrentTrack() {
    if (this.playlist.length === 0 || this.currentIndex < 0) return;
    const track = this.playlist[this.currentIndex];
    if (!track || !track.audio) return;

    this.audio.src = track.audio;
    this.audio.volume = this.isDucked ? Math.min(0.18, this.userVolume * 0.25) : this.userVolume;
    
    const playPromise = this.audio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        this.isPlaying = true;
        // Trigger 5-Second iPhone Dynamic Island Banner
        this.triggerBannerNotice();
      }).catch(err => {
        console.warn('Playback prevented or awaiting user interaction:', err);
      });
    }

    this.updateUI();
  },

  // Skip to next track
  playNext() {
    if (this.playlist.length === 0) return;
    this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
    this.playCurrentTrack();
  },

  // Return to previous track
  playPrev() {
    if (this.playlist.length === 0) return;
    if (this.audio.currentTime > 4) {
      // If played more than 4s, restart song
      this.audio.currentTime = 0;
    } else {
      this.currentIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
      this.playCurrentTrack();
    }
  },

  // Play / Pause toggle
  togglePlay() {
    if (!this.audio.src && this.playlist.length > 0) {
      this.playCurrentTrack();
      return;
    }

    if (this.audio.paused) {
      this.audio.play().then(() => {
        this.isPlaying = true;
        this.updateUI();
      }).catch(console.error);
    } else {
      this.audio.pause();
      this.isPlaying = false;
      this.updateUI();
    }
  },

  // Pause when workout pauses
  onWorkoutPause() {
    if (this.isPlaying && this.audio) {
      this.audio.pause();
    }
  },

  // Resume when workout resumes
  onWorkoutResume() {
    if (this.playlist.length > 0 && this.audio && this.audio.paused && this.isAutoPlayEnabled) {
      this.audio.play().catch(() => {});
    }
  },

  // Stop music when workout ends
  onWorkoutEnd() {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    this.isPlaying = false;
    this.setIslandState('hidden');
  },

  // Studio Audio Ducking (for Voice Coach announcements)
  duck(duckOn) {
    if (!this.audio || this.audio.paused) return;
    this.isDucked = duckOn;
    
    clearInterval(this.duckInterval);
    const targetVolume = duckOn ? Math.min(0.18, this.userVolume * 0.25) : this.userVolume;
    const step = (targetVolume - this.audio.volume) / 6;

    let count = 0;
    this.duckInterval = setInterval(() => {
      count++;
      let newVol = this.audio.volume + step;
      if ((step > 0 && newVol >= targetVolume) || (step < 0 && newVol <= targetVolume) || count >= 6) {
        this.audio.volume = Math.max(0, Math.min(1, targetVolume));
        clearInterval(this.duckInterval);
      } else {
        this.audio.volume = Math.max(0, Math.min(1, newVol));
      }
    }, 40);
  },

  // Set user volume (0.0 to 1.0)
  setVolume(val) {
    this.userVolume = Math.max(0, Math.min(1, val));
    if (!this.isDucked && this.audio) {
      this.audio.volume = this.userVolume;
    }
    try {
      localStorage.setItem('fitly_music_volume', this.userVolume.toString());
    } catch (e) {}
    this.updateUI();
  },

  // Switch station
  async switchStation(stationId) {
    if (this.currentStationId === stationId && this.playlist.length > 0) return;
    await this.fetchTracks(stationId, true);
    if (this.playlist.length > 0) {
      this.playCurrentTrack();
    }
  },

  // ── Dynamic Island Lifecycle & States ──────────────────

  // Show 5-second track banner, then smoothly morph into compact dot
  triggerBannerNotice() {
    if (this.islandState === 'expanded') {
      // If user is already actively interacting with the full player, keep expanded and update content
      this.updateUI();
      return;
    }

    this.setIslandState('banner');
    
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      if (this.islandState === 'banner') {
        this.setIslandState('dot');
      }
    }, 5000);
  },

  setIslandState(state) {
    this.islandState = state;
    const island = document.getElementById('dynamic-music-island');
    const backdrop = document.getElementById('dynamic-island-backdrop');
    if (!island) return;

    island.classList.remove('island--hidden', 'island--banner', 'island--dot', 'island--expanded');
    
    if (state === 'hidden') {
      island.classList.add('island--hidden');
      if (backdrop) backdrop.classList.remove('backdrop--active');
    } else if (state === 'banner') {
      island.classList.add('island--banner');
      if (backdrop) backdrop.classList.remove('backdrop--active');
    } else if (state === 'dot') {
      island.classList.add('island--dot');
      if (backdrop) backdrop.classList.remove('backdrop--active');
    } else if (state === 'expanded') {
      island.classList.add('island--expanded');
      if (backdrop) backdrop.classList.add('backdrop--active');
      if (this.bannerTimer) clearTimeout(this.bannerTimer);
    }

    this.updateUI();
  },

  // Inject HTML structure into DOM
  injectIslandDOM() {
    if (document.getElementById('dynamic-music-island')) return;

    // Backdrop for expanded state
    const backdrop = document.createElement('div');
    backdrop.id = 'dynamic-island-backdrop';
    backdrop.className = 'dynamic-island-backdrop';
    backdrop.onclick = () => this.setIslandState('dot');
    document.body.appendChild(backdrop);

    // Dynamic Island container
    const island = document.createElement('div');
    island.id = 'dynamic-music-island';
    island.className = 'dynamic-island island--hidden';
    
    island.innerHTML = `
      <!-- 1. BANNER VIEW (5-Second Intro) -->
      <div class="island-view island-view--banner" onclick="JamendoMusicService.setIslandState('expanded')">
        <div class="island-banner-thumb">
          <img id="island-banner-art" src="" alt="Album Art" />
        </div>
        <div class="island-banner-info">
          <div class="island-banner-title-wrap">
            <span id="island-banner-title" class="island-banner-title">Loading track...</span>
          </div>
          <span id="island-banner-artist" class="island-banner-artist">Jamendo Artist</span>
        </div>
        <div class="island-wave-bars">
          <span class="bar bar-1"></span>
          <span class="bar bar-2"></span>
          <span class="bar bar-3"></span>
          <span class="bar bar-4"></span>
        </div>
      </div>

      <!-- 2. COMPACT MUSIC DOT VIEW (Idle Playing) -->
      <div class="island-view island-view--dot" onclick="JamendoMusicService.setIslandState('expanded')" title="Tap to expand music player">
        <div class="island-dot-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
          </svg>
        </div>
        <div class="island-dot-wave">
          <span class="dot-bar b1"></span>
          <span class="dot-bar b2"></span>
          <span class="dot-bar b3"></span>
        </div>
      </div>

      <!-- 3. EXPANDED FULL PLAYER VIEW (Interactive Card) -->
      <div class="island-view island-view--expanded">
        
        <!-- Header with Close & Station Indicator -->
        <div class="player-top-row">
          <div class="player-station-badge" id="player-active-station-name">
            <span>⚡</span> Gym & Energy
          </div>
          <button class="player-close-btn" onclick="JamendoMusicService.setIslandState('dot')" aria-label="Minimize">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
        </div>

        <!-- Track Main Info -->
        <div class="player-track-card">
          <div class="player-art-wrap">
            <img id="player-album-art" src="" alt="Album Cover" />
            <div class="player-art-glow"></div>
          </div>
          <div class="player-meta">
            <h4 id="player-track-title" class="player-title">Track Title</h4>
            <p id="player-track-artist" class="player-artist">Artist Name</p>
            
            <!-- Up Next preview pill -->
            <div class="player-upnext" id="player-upnext-container">
              <span class="upnext-tag">NEXT:</span>
              <span id="player-upnext-title" class="upnext-text">Next Song Title</span>
            </div>
          </div>
        </div>

        <!-- Progress Scrub Bar -->
        <div class="player-progress-section">
          <div class="player-progress-bar" onclick="JamendoMusicService.seekFromProgress(event)">
            <div class="player-progress-fill" id="player-progress-fill"></div>
          </div>
          <div class="player-time-row">
            <span id="player-time-curr">0:00</span>
            <span id="player-time-dur">3:00</span>
          </div>
        </div>

        <!-- Core Playback Controls -->
        <div class="player-controls-row">
          <button class="ctrl-btn ctrl-btn--secondary" onclick="JamendoMusicService.playPrev()" aria-label="Previous Track">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" stroke-width="3"></line></svg>
          </button>
          
          <button class="ctrl-btn ctrl-btn--play" id="player-play-btn" onclick="JamendoMusicService.togglePlay()" aria-label="Play/Pause">
            <svg id="player-play-icon" width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
          </button>
          
          <button class="ctrl-btn ctrl-btn--secondary" onclick="JamendoMusicService.playNext()" aria-label="Next Track">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="3"></line></svg>
          </button>
        </div>

        <!-- Station Selector Row -->
        <div class="player-stations-wrap">
          <p class="stations-label">VIBE & STATION</p>
          <div class="player-stations-chips" id="player-station-chips">
            <!-- Dynamic station chips -->
          </div>
        </div>

        <!-- Volume & Attribution Footer -->
        <div class="player-footer-row">
          <div class="player-vol-slider-wrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
            <input type="range" min="0" max="1" step="0.05" value="${this.userVolume}" class="player-vol-slider" oninput="JamendoMusicService.setVolume(this.value)" aria-label="Volume">
          </div>
          <div class="player-jamendo-badge">
            Powered by <strong>Jamendo</strong>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(island);
    this.renderStationChips();
  },

  renderStationChips() {
    const container = document.getElementById('player-station-chips');
    if (!container) return;

    container.innerHTML = '';
    Object.values(this.stations).forEach(st => {
      const chip = document.createElement('button');
      chip.className = `station-chip ${st.id === this.currentStationId ? 'station-chip--active' : ''}`;
      chip.innerHTML = `<span class="station-chip-icon">${st.icon}</span> ${st.name}`;
      chip.onclick = () => {
        this.switchStation(st.id);
        this.renderStationChips();
      };
      container.appendChild(chip);
    });
  },

  seekFromProgress(e) {
    if (!this.audio || !this.audio.duration) return;
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    this.audio.currentTime = pos * this.audio.duration;
  },

  updateProgress() {
    if (!this.audio || isNaN(this.audio.duration)) return;
    const current = this.audio.currentTime || 0;
    const dur = this.audio.duration || 180;
    const pct = (current / dur) * 100;

    const fill = document.getElementById('player-progress-fill');
    if (fill) fill.style.width = `${pct}%`;

    const elCurr = document.getElementById('player-time-curr');
    if (elCurr) elCurr.innerText = this.formatSeconds(current);

    const elDur = document.getElementById('player-time-dur');
    if (elDur) elDur.innerText = this.formatSeconds(dur);
  },

  formatSeconds(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  },

  // Update all UI elements based on state
  updateUI() {
    const track = (this.playlist.length > 0 && this.currentIndex >= 0) 
      ? this.playlist[this.currentIndex] 
      : null;

    const nextTrack = (this.playlist.length > 1 && this.currentIndex >= 0)
      ? this.playlist[(this.currentIndex + 1) % this.playlist.length]
      : null;

    const station = this.stations[this.currentStationId] || this.stations.gym;

    // 1. Banner Info
    const bannerTitle = document.getElementById('island-banner-title');
    const bannerArtist = document.getElementById('island-banner-artist');
    const bannerArt = document.getElementById('island-banner-art');
    if (track) {
      if (bannerTitle) bannerTitle.innerText = track.name;
      if (bannerArtist) bannerArtist.innerText = track.artist;
      if (bannerArt) bannerArt.src = track.image;
    }

    // 2. Expanded Player Info
    const playerTitle = document.getElementById('player-track-title');
    const playerArtist = document.getElementById('player-track-artist');
    const playerArt = document.getElementById('player-album-art');
    const playerStationName = document.getElementById('player-active-station-name');
    const upnextTitle = document.getElementById('player-upnext-title');

    if (track) {
      if (playerTitle) playerTitle.innerText = track.name;
      if (playerArtist) playerArtist.innerText = track.artist;
      if (playerArt) playerArt.src = track.image;
    }
    if (playerStationName) {
      playerStationName.innerHTML = `<span>${station.icon}</span> ${station.name}`;
    }
    if (upnextTitle && nextTrack) {
      upnextTitle.innerText = `${nextTrack.name} · ${nextTrack.artist}`;
    }

    // 3. Play/Pause Button in Player
    const playBtn = document.getElementById('player-play-btn');
    if (playBtn) {
      if (this.isPlaying) {
        playBtn.innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
        playBtn.setAttribute('aria-label', 'Pause');
      } else {
        playBtn.innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>`;
        playBtn.setAttribute('aria-label', 'Play');
      }
    }

    // 4. Equalizer soundwave animation classes
    const island = document.getElementById('dynamic-music-island');
    if (island) {
      if (this.isPlaying) {
        island.classList.add('island--playing');
      } else {
        island.classList.remove('island--playing');
      }
    }
  }
};

// Initialize on document load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => JamendoMusicService.init());
} else {
  JamendoMusicService.init();
}

window.JamendoMusicService = JamendoMusicService;
