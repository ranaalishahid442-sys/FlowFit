// TODO: API key is currently stored via prompt() into localStorage. This is insecure for production and should be moved to a backend proxy.
// TODO: Explore screen fetches 150 items at once. Implement pagination for better performance.
/* ═══════════════════════════════════════════════════════
   ZenFit — App Navigation & Interactivity
   ═══════════════════════════════════════════════════════ */


// ── Voice Guide Service ───────────────────────────────
const VoiceGuideService = {
  enabled: true,
  rate: 1.0,
  
  init() {
    if ('speechSynthesis' in window) {
      // Warm up voices
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  },

  speak(textOrPath, priority = 'normal') {
    if (!this.enabled) return;
    
    // Check if it's an audio file path (for future extensions)
    if (textOrPath.endsWith('.mp3') || textOrPath.endsWith('.wav') || textOrPath.endsWith('.m4a')) {
      const audio = new Audio(textOrPath);
      audio.play().catch(e => console.error("Audio play failed", e));
      return;
    }

    if (!('speechSynthesis' in window)) return;

    if (priority === 'high') {
      window.speechSynthesis.cancel(); // Interrupt current speech
    } else {
      // For normal priority, if something is speaking, we just queue it naturally.
      // But if we wanted to drop it, we could do: if (window.speechSynthesis.speaking) return;
    }

    const utterance = new SpeechSynthesisUtterance(textOrPath);
    utterance.rate = this.rate;

    utterance.onstart = () => {
      if (window.JamendoMusicService) window.JamendoMusicService.duck(true);
    };
    utterance.onend = () => {
      if (window.JamendoMusicService) window.JamendoMusicService.duck(false);
    };
    utterance.onerror = () => {
      if (window.JamendoMusicService) window.JamendoMusicService.duck(false);
    };

    // We could set a specific voice here if needed
    window.speechSynthesis.speak(utterance);
  },

  stop() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (window.JamendoMusicService) {
      window.JamendoMusicService.duck(false);
    }
  },
  
  setRate(rate) {
    this.rate = rate;
  },

  toggle(enabled) {
    this.enabled = enabled;
    if (!enabled) this.stop();
  },

  toggleUI(el) {
    const isNowOn = el.classList.toggle('toggle-switch--on');
    el.setAttribute('aria-checked', isNowOn);
    this.toggle(isNowOn);
  }
};
// Initialize on load
VoiceGuideService.init();



let pendingRoutineTitle = '';
let pendingRoutineExercises = [];

function showRoutinePreview(routineData, exercises) {
  pendingRoutineTitle = routineData.workoutTitle;
  pendingRoutineExercises = exercises;
  
  document.getElementById('preview-title').innerText = routineData.workoutTitle;
  document.getElementById('preview-duration').innerText = (routineData.estimatedDurationMinutes || '--') + ' min';
  document.getElementById('preview-reason').innerText = routineData.moodMatch || 'Here is your custom routine.';
  
  const listDiv = document.getElementById('preview-exercise-list');
  listDiv.innerHTML = '';
  
  exercises.forEach((ex, idx) => {
    const item = document.createElement('div');
    item.style.cssText = 'display:flex; gap:16px; background:var(--surface-1); padding:12px; border-radius:var(--r-md); align-items:center; box-shadow: var(--shadow-sm); border: 1px solid var(--border);';
    
    item.innerHTML = `
      <div style="width: 60px; height: 60px; border-radius: var(--r-sm); overflow: hidden; background: #fff; flex-shrink:0;">
        <img src="${ex.gifUrl}" style="width:100%; height:100%; object-fit:cover; mix-blend-mode:multiply;" loading="lazy" />
      </div>
      <div style="flex: 1;">
        <h4 style="font-size: 1.05rem; font-weight: 600; color: var(--text-1); margin: 0 0 4px 0; text-transform: capitalize;">${idx + 1}. ${ex.name}</h4>
        <p style="font-size: 0.85rem; color: var(--text-2); margin: 0;">${ex.aiSets} Sets x ${ex.aiReps}</p>
      </div>
    `;
    listDiv.appendChild(item);
  });
  
  navigate('routine-preview');
}

function confirmAndStartRoutine() {
  startRoutine(pendingRoutineTitle, pendingRoutineExercises);
}


function skipCurrentExercise() {
  clearInterval(timerInterval);
  VoiceGuideService.stop();
  if (isPlaylistMode) {
    workoutPlaylistIndex++;
    activeSessionState.index = workoutPlaylistIndex;
    saveSessionState();
    playNextExercise();
  } else {
    finishWorkoutSession(false);
  }
}


let activeSessionState = {
  active: false,
  title: '',
  exercises: [],
  index: 0,
  sessionStartMs: 0,
  currentExerciseStartMs: 0,
  pausedDurationMs: 0,
  pauseStartMs: 0
};

function saveSessionState() {
  if (activeSessionState.active) {
    localStorage.setItem('fitly_session', JSON.stringify(activeSessionState));
  } else {
    localStorage.removeItem('fitly_session');
  }
}

function resumeWorkoutSession() {
  const stateStr = localStorage.getItem('fitly_session');
  if (stateStr) {
    activeSessionState = JSON.parse(stateStr);
    isPlaylistMode = true;
    workoutPlaylistIndex = activeSessionState.index;
    pendingRoutineTitle = activeSessionState.title;
    pendingRoutineExercises = activeSessionState.exercises;
    playNextExercise();
  }
}

window.promptEndWorkout = function() {
  if (confirm("End workout early? Progress will be saved.")) {
    clearInterval(timerInterval);
    VoiceGuideService.stop();
    finishWorkoutSession(true);
  }
};

function finishWorkoutSession(isPartial = false) {
  if (typeof timerInterval !== 'undefined' && timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (window.JamendoMusicService) {
    window.JamendoMusicService.onWorkoutEnd();
  }
  
  const now = Date.now();
  let netElapsedMs = 0;
  
  // Calculate real active duration
  if (activeSessionState.sessionStartMs && activeSessionState.sessionStartMs > 0) {
    const totalMs = now - activeSessionState.sessionStartMs;
    // Ignore absurd values (> 24 hours)
    if (totalMs > 0 && totalMs < 86400000) {
      netElapsedMs = totalMs - (activeSessionState.pausedDurationMs || 0);
    }
  }
  
  // If timer ran down from 45s, use at least the completed seconds
  if (netElapsedMs <= 0) {
    const elapsedSeconds = (typeof secondsLeft !== 'undefined') ? Math.max(15, 45 - secondsLeft) : 45;
    netElapsedMs = elapsedSeconds * 1000;
  }

  activeSessionState.active = false;
  saveSessionState();

  const durationSeconds = Math.max(20, Math.round(netElapsedMs / 1000));
  const durationMins = Math.max(1, Math.round(durationSeconds / 60));

  // Exercise Science MET-based Calories Burned Formula:
  // Calories = MET * Weight(kg) * (Duration in Hours)
  let userWeightKg = 70;
  if (window.DietService && window.DietService.profile && window.DietService.profile.weight) {
    userWeightKg = parseFloat(window.DietService.profile.weight) || 70;
  }

  // Determine MET based on exercise target and category:
  let met = 5.5; // Standard moderate strength / fitness
  const exName = (activeExercise && activeExercise.name || '').toLowerCase();
  const routineTitle = (activeSessionState.title || pendingRoutineTitle || '').toLowerCase();

  if (exName.includes('stretch') || exName.includes('yoga') || routineTitle.includes('yoga') || routineTitle.includes('calm')) {
    met = 3.2; // Yoga, stretching, flexibility
  } else if (exName.includes('burpee') || exName.includes('jump') || routineTitle.includes('hiit') || routineTitle.includes('cardio')) {
    met = 8.5; // High intensity interval training & cardio
  } else {
    met = 5.5; // Compound strength training
  }

  // Accurate active calorie burn
  const rawCalories = (met * userWeightKg * durationSeconds) / 3600;
  const calBurned = Math.max(6, Math.round(rawCalories));

  const exercisesCompleted = isPlaylistMode 
    ? (isPartial ? Math.max(1, activeSessionState.index) : Math.max(1, (workoutPlaylist && workoutPlaylist.length) || 1))
    : 1;

  const title = activeSessionState.title || pendingRoutineTitle || (activeExercise ? activeExercise.name : "Workout Session");

  if (window.AppDataService && typeof AppDataService.logCompletedWorkout === 'function') {
    AppDataService.logCompletedWorkout({
      title: title,
      durationMinutes: durationMins,
      exercisesCompleted: exercisesCompleted,
      estimatedCaloriesBurned: calBurned
    });
  }

  // Update session complete screen stats
  const elName = document.getElementById('complete-name');
  if (elName) elName.innerText = (window.AppDataService && AppDataService.profile) ? AppDataService.profile.username : "Athlete";
  
  const elRoutine = document.getElementById('complete-routine');
  if (elRoutine) elRoutine.innerText = title;

  const elTime = document.getElementById('complete-time');
  if (elTime) elTime.innerText = durationMins + " min";

  const elCal = document.getElementById('complete-cal');
  if (elCal) elCal.innerText = calBurned + " kcal";

  const elCount = document.getElementById('complete-count');
  if (elCount) elCount.innerText = exercisesCompleted;

  const elStreak = document.getElementById('complete-streak');
  if (elStreak && window.AppDataService) {
    elStreak.innerText = AppDataService.getCurrentStreak() + " days";
  }

  // Refresh Home Dashboard immediately so new stats appear
  if (window.AppDataUI && typeof window.AppDataUI.renderHome === 'function') {
    window.AppDataUI.renderHome();
  }

  navigate('session-complete');
}

// ── Workout Playlist Engine ───────────────────────────────────
let workoutPlaylist = [];
let workoutPlaylistIndex = 0;
let isPlaylistMode = false;
let workoutPlaylistTitle = '';

function startRoutine(title, exercises) {
  if (!exercises || exercises.length === 0) return;
  workoutPlaylist = exercises;
  workoutPlaylistIndex = 0;
  isPlaylistMode = true;
  workoutPlaylistTitle = title || "Custom Routine";

  activeSessionState = {
    active: true,
    title: workoutPlaylistTitle,
    exercises: workoutPlaylist,
    index: 0,
    sessionStartMs: Date.now(),
    currentExerciseStartMs: Date.now(),
    pausedDurationMs: 0,
    pauseStartMs: 0
  };
  saveSessionState();
  
  playNextExercise();
}

function playNextExercise() {
  if (workoutPlaylistIndex >= workoutPlaylist.length) {
    isPlaylistMode = false;
    VoiceGuideService.speak("Workout complete, great job!", "high");
    finishWorkoutSession(false);
    return;
  }
  
  const ex = workoutPlaylist[workoutPlaylistIndex];
  activeExercise = ex;
  
  navigate('get-ready');
  
  document.getElementById('ready-gif').src = ex.gifUrl;
  document.getElementById('ready-title').innerText = ex.name;
  
  VoiceGuideService.speak(`Get ready for ${ex.name}`, 'high');
  
  const tipsDiv = document.getElementById('ready-tips');
  tipsDiv.innerHTML = '';
  
  let tipText = ex.aiTip || (ex.instructions && ex.instructions[0]);
  if (tipText) {
    const p = document.createElement('div');
    p.style.cssText = 'background:#f8fafc; padding:12px 16px; border-radius:12px; display:flex; gap:12px; align-items:flex-start; border:1px solid #e2e8f0;';
    p.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#001F3F" stroke-width="2.5" style="flex-shrink:0; margin-top:1px;"><polyline points="20 6 9 17 4 12"/></svg><span style="color:#0f172a; font-size:0.95rem; font-weight:500; line-height:1.4;">${tipText}</span>`;
    tipsDiv.appendChild(p);
    
    setTimeout(() => VoiceGuideService.speak(tipText, 'normal'), 2500);
  }

  let restTime = 5; 
  if (workoutPlaylistIndex > 0 && ex.aiRest) restTime = ex.aiRest;

  const ring = document.getElementById('ready-ring');
  const cdTxt = document.getElementById('ready-countdown');
  let count = restTime;
  cdTxt.innerText = count;
  ring.style.strokeDashoffset = '0';
  
  clearInterval(getReadyInterval);
  void ring.offsetWidth;
  ring.style.strokeDashoffset = String(465 / restTime);
  
  getReadyInterval = setInterval(() => {
    count--;
    if (count > 0) {
      cdTxt.innerText = count;
      ring.style.strokeDashoffset = String(465 - (465 * (count / restTime)));
      
      if (count === 5) VoiceGuideService.speak("5 seconds left", "high");
      if (count <= 3) VoiceGuideService.speak(count.toString(), 'high');
    } else {
      clearInterval(getReadyInterval);
      VoiceGuideService.speak('Go!', 'high');
      beginSession();
    }
  }, 1000);
}

// ── Screen Navigation ─────────────────────────────────
const SCREENS = {
  'splash':           'screen-splash',
  'home':             'screen-home',
  'explore':          'screen-explore',
  'voice-assistant':  'screen-voice-assistant',
  'ai-workout':       'screen-ai-workout',
  'diet':             'screen-diet',
  'diet-scan':        'screen-diet-scan',
  'onboarding':       'screen-onboarding',
  'routine-preview':  'screen-routine-preview',
  'workout-detail':   'screen-workout-detail',
  'get-ready':        'screen-get-ready',
  'active-session':   'screen-active-session',
  'session-complete': 'screen-session-complete',
  'stats':            'screen-stats',
  'profile':          'screen-profile',
  'notifications':    'screen-home', 
  'program-detail':   'screen-workout-detail',
};

let currentScreen = 'home';
let timerInterval = null;
let isPaused = false;
let secondsLeft = 42;

function navigate(target) {
    const from = document.querySelector('.screen.active');
    const toId = SCREENS[target];
    if (!toId) return;
    const to = document.getElementById(toId);
    if (!to || from === to) return;

    if (from) {
      // Synchronously remove active class to prevent stacking
      from.classList.remove('active');
    }
    
    to.classList.add('active');

    currentScreen = target;
    
    if (target !== 'active-session' && target !== 'get-ready') {
      if (window.VoiceGuideService) VoiceGuideService.stop();
      if (window.JamendoMusicService) window.JamendoMusicService.onWorkoutEnd();
      isPlaylistMode = false;
    }
    if (target === 'home' && window.AppDataUI) AppDataUI.renderHome();
    if (target === 'profile' && window.AppDataUI) AppDataUI.renderProfile();
    if (target === 'diet' && window.DietUI) DietUI.renderDashboard();
    if (target === 'voice-assistant' && window.VoiceAssistant) VoiceAssistant.onOpen();
    if (target !== 'voice-assistant' && window.VoiceAssistant) VoiceAssistant.stopSpeaking();

    if (target === 'active-session') {
      secondsLeft = 45;
      if (typeof startSessionTimer === 'function') startSessionTimer();
    } else {
      if (typeof timerInterval !== 'undefined' && timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      isPaused = false;
      secondsLeft = 45;
      if (typeof updateTimerDisplay === 'function') updateTimerDisplay();
    }

    if (target === 'home') {
      if (typeof animateChartBars === 'function') setTimeout(animateChartBars, 400);
    }

    const globalNav = document.getElementById('global-nav');
    if (globalNav) {
      if (['splash', 'onboarding', 'active-session', 'get-ready', 'workout-detail', 'session-complete', 'ai-workout', 'diet-scan', 'routine-preview'].includes(target)) {
        globalNav.style.display = 'none';
      } else {
        globalNav.style.display = 'flex';
        document.querySelectorAll('#global-nav .nav-item').forEach(btn => {
          if (btn.getAttribute('data-tab') === target) {
            btn.classList.add('nav-item--active');
          } else {
            btn.classList.remove('nav-item--active');
          }
        });
      }
    }
  }

  // ── Session Timer ─────────────────────────────────────
function startSessionTimer() {
  clearInterval(timerInterval);
  updateTimerDisplay();
  
  let halfWayAnnounced = false;
  let countdownAnnounced = false;
  const initialSeconds = secondsLeft;
  
  timerInterval = setInterval(() => {
    if (isPaused) return;
    secondsLeft--;
    updateTimerDisplay();
    
    // Halfway point
    if (!halfWayAnnounced && secondsLeft === Math.floor(initialSeconds / 2)) {
      VoiceGuideService.speak("Halfway there", 'high');
      halfWayAnnounced = true;
    }
    
    // 5 seconds left
    if (!countdownAnnounced && secondsLeft === 5) {
      VoiceGuideService.speak("5 seconds left", 'high');
      countdownAnnounced = true;
    }
    
    // Final countdown
    if (secondsLeft > 0 && secondsLeft <= 3) {
      VoiceGuideService.speak(secondsLeft.toString(), 'high');
    }
    
    if (secondsLeft <= 0) {
      clearInterval(timerInterval);
      if (isPlaylistMode) {
        workoutPlaylistIndex++;
        playNextExercise();
      } else {
        VoiceGuideService.speak("Workout complete, great job!", 'high');
        setTimeout(() => finishWorkoutSession(false), 500);
      }
    }
  }, 1000);
}

function updateTimerDisplay() {
  const el = document.getElementById('sessionTimer');
  if (!el) return;
  const m = Math.floor(secondsLeft / 60).toString().padStart(2, '0');
  const s = (secondsLeft % 60).toString().padStart(2, '0');
  el.textContent = `${m}:${s}`;

  // Update timer bar
  const maxSeconds = 45;
  const pct = (secondsLeft / maxSeconds) * 100;
  const bar = document.querySelector('.timer-bar-fill');
  if (bar) bar.style.width = `${pct}%`;
}

function togglePause() {
  isPaused = !isPaused;
  const btn = document.getElementById('pauseBtn');
  if (isPaused) {
    activeSessionState.pauseStartMs = Date.now();
    if (window.JamendoMusicService) window.JamendoMusicService.onWorkoutPause();
    if(btn) {
      btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
      btn.setAttribute('aria-label', 'Resume');
    }
  } else {
    activeSessionState.pausedDurationMs += (Date.now() - activeSessionState.pauseStartMs);
    if (window.JamendoMusicService) window.JamendoMusicService.onWorkoutResume();
    if(btn) {
      btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
      btn.setAttribute('aria-label', 'Pause');
    }
  }
}

// ── Chart Bar Animations ──────────────────────────────
function animateChartBars() {
  const bars = document.querySelectorAll('#screen-home .bar');
  bars.forEach((bar, i) => {
    const targetHeight = bar.style.height;
    if (!targetHeight || targetHeight === '0%') return;
    bar.style.height = '0%';
    bar.style.transition = `height .6s cubic-bezier(.34,1.56,.64,1) ${i * 60}ms`;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bar.style.height = targetHeight;
      });
    });
  });
}

// ── LIVE API EXERCISE SYSTEM ─────────────────────────────────
const API_BASE = 'https://oss.exercisedb.dev/api/v1';
let currentFilter = 'all';
let nextCursor = null;
let isLoading = false;

// Map our filter chip values to API query params
const FILTER_MAP = {
  all:       {},
  yoga:      { targetMuscles: 'spine' },
  strength:  { bodyParts: 'back,chest,shoulders,upper%20arms,upper%20legs,lower%20legs' },
  hiit:      { bodyParts: 'cardio,waist' },
  calm:      { name: 'stretch' },
  cardio:    { bodyParts: 'cardio' },
  core:      { bodyParts: 'waist' },
  equipment: { equipments: 'barbell,dumbbell,kettlebell,cable,resistance%20band' },
};

const BANNER_MAP = {
  all:       'Showing all 1,500+ curated exercises. Tap any to view demonstration and guide.',
  yoga:      '🧘 Showing Yoga Flow exercises. Focus on spinal mobility, breath, and posture.',
  strength:  '🏋️ Showing Strength exercises. Muscle-building compound & isolation movements.',
  hiit:      '⚡ Showing HIIT Burn exercises. High-intensity cardio & core movements.',
  calm:      '🌿 Showing Calm & Breathe exercises. Restorative stretches for relaxation & recovery.',
  cardio:    '🏃 Showing Cardio exercises. Boost stamina and cardiovascular endurance.',
  core:      '🎯 Showing Core exercises. Strengthen abdominals and core stability.',
  equipment: '🔩 Showing Equipment exercises. Using barbells, dumbbells, cables & bands.',
};

let loadedCategoryExercises = [];

// ── Chip click handlers ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const chips = document.querySelectorAll('#explore-chips .chip');
  chips.forEach(chip => {
    chip.addEventListener('click', function () {
      chips.forEach(c => c.classList.remove('chip--active'));
      this.classList.add('chip--active');
      currentFilter = this.getAttribute('data-filter');
      fetchAndRenderExercises(currentFilter, true);
    });
  });

  // Initial load
  fetchAndRenderExercises('all', true);
});

// ── Fetch from ExerciseDB API ─────────────────────────────────
async function fetchAndRenderExercises(filter, reset = false) {
  if (isLoading) return;
  isLoading = true;

  const container = document.getElementById('explore-cards');
  if (!container) return;

  // Update banner text
  const bannerText = document.getElementById('explore-banner-text');
  if (bannerText && BANNER_MAP[filter]) {
    bannerText.innerText = BANNER_MAP[filter];
  }

  if (reset) {
    container.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-3); font-size:0.95rem;">Loading ' + (filter.toUpperCase()) + ' exercises...</div>';
    nextCursor = null;
    loadedCategoryExercises = [];
  }

  try {
    const params = FILTER_MAP[filter] || {};
    let url = `${API_BASE}/exercises?limit=25`;
    Object.entries(params).forEach(([k, v]) => { url += `&${k}=${v}`; });
    if (nextCursor) url += `&after=${nextCursor}`;

    const res = await fetch(url);
    const json = await res.json();

    if (!json.success) throw new Error('API error');

    nextCursor = json.meta.nextCursor || null;

    if (reset) {
      container.innerHTML = '';
      loadedCategoryExercises = json.data || [];
    } else {
      loadedCategoryExercises = loadedCategoryExercises.concat(json.data || []);
    }
    window.loadedExercises = loadedCategoryExercises;

    renderCards(json.data, container);

    // Load more button
    const existingBtn = container.querySelector('.load-more-btn');
    if (existingBtn) existingBtn.remove();
    if (json.meta.hasNextPage) {
      const btn = document.createElement('button');
      btn.className = 'load-more-btn';
      btn.style.cssText = 'display:block; width:calc(100% - 40px); margin:16px 20px 24px; padding:14px; background:var(--purple); color:#fff; border:none; border-radius:var(--r-md); font-size:0.9rem; font-weight:600; cursor:pointer; letter-spacing:0.5px;';
      btn.textContent = 'Load More';
      btn.onclick = () => fetchAndRenderExercises(currentFilter, false);
      container.appendChild(btn);
    }
  } catch (e) {
    if (reset) container.innerHTML = '<div style="padding:40px; text-align:center; color:#E53E3E;">Failed to load exercises. Check your internet connection.</div>';
    console.error(e);
  }

  isLoading = false;
}

// ── Render cards from API data ────────────────────────────────
function renderCards(exercises, container) {
  if (!exercises || exercises.length === 0) {
    container.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-3); font-size:0.9rem;">No exercises found for this category.</div>';
    return;
  }

  exercises.forEach(ex => {
    const card = document.createElement('div');
    card.className = 'list-card';
    card.onclick = () => openExerciseDetail(ex);

    const bp = ((ex.bodyParts && ex.bodyParts[0]) || '').toLowerCase();
    const tm = ((ex.targetMuscles && ex.targetMuscles[0]) || '').toLowerCase();
    const name = (ex.name || '').toLowerCase();
    
    let tagClass = 'strength';
    let tagLabel = 'Strength';

    if (currentFilter === 'yoga' || tm === 'spine' || bp === 'neck' || name.includes('yoga') || name.includes('stretch')) {
      tagClass = 'yoga';
      tagLabel = 'Yoga Flow';
    } else if (currentFilter === 'calm' || name.includes('stretch') || name.includes('breathe') || name.includes('relax')) {
      tagClass = 'calm';
      tagLabel = 'Calm & Breathe';
    } else if (currentFilter === 'hiit' || bp === 'cardio' || bp === 'waist' || name.includes('jump') || name.includes('burpee')) {
      tagClass = 'hiit';
      tagLabel = 'HIIT Burn';
    } else if (bp === 'cardio') {
      tagClass = 'cardio';
      tagLabel = 'Cardio';
    } else if (bp === 'waist') {
      tagClass = 'core';
      tagLabel = 'Core';
    } else if (bp) {
      tagClass = 'strength';
      tagLabel = bp;
    }

    const hasEquip = !['body weight'].includes(((ex.equipments && ex.equipments[0]) || '').toLowerCase());
    const equipLabel = (ex.equipments && ex.equipments[0]) || 'Bodyweight';
    const targetMuscle = (ex.targetMuscles && ex.targetMuscles[0]) || 'Full Body';

    card.innerHTML = `
      <div class="list-card-thumb" style="overflow:hidden; background:#f1f5f9; border-radius:10px;">
        <img
          src="${ex.gifUrl}"
          style="width:100%; height:100%; object-fit:cover;"
          alt="${ex.name}"
          loading="lazy"
          onerror="this.style.display='none'"
        >
      </div>
      <div class="list-card-info">
        <span class="tag tag--${tagClass}">${tagLabel}</span>
        <h4 style="text-transform:capitalize; font-weight:700; color:var(--text-1); margin: 3px 0 6px;">${ex.name}</h4>
        <div class="ex-meta-row">
          <span class="ex-meta-chip ${hasEquip ? 'ex-meta-chip--gear' : ''}" style="text-transform:capitalize;">${equipLabel}</span>
          <span class="ex-meta-chip" style="display:flex; align-items:center; gap:4px; text-transform:capitalize;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
            ${targetMuscle}
          </span>
        </div>
      </div>
      <div class="list-card-meta">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    `;
    container.appendChild(card);
  });
}

let activeExercise = null;
let getReadyInterval = null;

// ── Exercise Detail Screen ────────────────────────────────────
function openExerciseDetail(ex) {
  activeExercise = ex;

  // Title + chips
  document.getElementById('detail-title').innerText = ex.name;

  const levelEl = document.getElementById('detail-level');
  levelEl.innerText = ex.bodyParts.join(', ');
  levelEl.className = 'ex-meta-chip';

  const equipEl = document.getElementById('detail-equipment');
  equipEl.innerText = ex.equipments.join(', ') || 'Bodyweight';
  const hasEquip = !['body weight'].includes((ex.equipments[0] || '').toLowerCase());
  equipEl.className = `ex-meta-chip ${hasEquip ? 'ex-meta-chip--gear' : ''}`;

  const muscleEl = document.getElementById('detail-muscle');
  muscleEl.innerText = ex.targetMuscles.join(', ') || 'Full Body';

  // Native GIF
  const imgEl = document.getElementById('detail-anim-img');
  imgEl.src = '';                      
  imgEl.src = ex.gifUrl;              
  
  // Overlay Target Muscle directly on GIF
  const overlay = document.getElementById('detail-muscle-overlay');
  if (overlay) {
    overlay.innerText = `Target: ${ex.targetMuscles[0] || 'Full Body'}`;
  }

  // Muscles Targeted Chips
  const targetsDiv = document.getElementById('detail-targets');
  targetsDiv.innerHTML = '';
  const allMuscles = [...ex.targetMuscles, ...(ex.secondaryMuscles || [])].slice(0, 4);
  allMuscles.forEach(m => {
    const chip = document.createElement('span');
    chip.style.cssText = 'padding:4px 10px; background:rgba(0,31,63,0.06); color:var(--purple); border-radius:12px; font-size:0.75rem; font-weight:600; text-transform:capitalize;';
    chip.innerText = m;
    targetsDiv.appendChild(chip);
  });

  // Key Tips (max 3)
  const tipsDiv = document.getElementById('detail-tips');
  tipsDiv.innerHTML = '';
  const tips = (ex.instructions || []).slice(0, 3);
  tips.forEach(step => {
    const p = document.createElement('p');
    p.style.cssText = 'font-size:0.85rem; color:var(--text-2); line-height:1.45; background:var(--surface-1); padding:10px 14px; border-radius:var(--r-md); border-left:2px solid var(--purple); margin:0;';
    p.innerText = step;
    tipsDiv.appendChild(p);
  });

  navigate('workout-detail');
}

// ── Get Ready Screen Logic ────────────────────────────────────
function startGetReady() {
  if (!activeExercise) return;
  navigate('get-ready');
  
  // Set Background GIF
  document.getElementById('ready-gif').src = activeExercise.gifUrl;
  document.getElementById('ready-title').innerText = activeExercise.name;
  
  // Speak exercise name
  VoiceGuideService.speak(`Get ready for ${activeExercise.name}`, 'high');
  
  // Set Form Tips
  const tipsDiv = document.getElementById('ready-tips');
  tipsDiv.innerHTML = '';
  const tips = (activeExercise.instructions || []).slice(0, 2);
  tips.forEach((step, idx) => {
    const p = document.createElement('div');
    p.style.cssText = 'background:#f8fafc; padding:12px 16px; border-radius:12px; display:flex; gap:12px; align-items:flex-start; border:1px solid #e2e8f0;';
    p.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#001F3F" stroke-width="2.5" style="flex-shrink:0; margin-top:1px;"><polyline points="20 6 9 17 4 12"/></svg><span style="color:#0f172a; font-size:0.95rem; font-weight:500; line-height:1.4;">${step}</span>`;
    tipsDiv.appendChild(p);
  });

  // Speak first tip shortly after
  if (tips.length > 0) {
    setTimeout(() => VoiceGuideService.speak(tips[0], 'normal'), 2500);
  }

  // Start 5-second countdown
  const ring = document.getElementById('ready-ring');
  const cdTxt = document.getElementById('ready-countdown');
  let count = 5;
  cdTxt.innerText = count;
  ring.style.strokeDashoffset = '0';
  
  clearInterval(getReadyInterval);
  
  // Force reflow for animation
  void ring.offsetWidth;
  ring.style.strokeDashoffset = '93'; // 465 / 5
  
  getReadyInterval = setInterval(() => {
    count--;
    if (count > 0) {
      cdTxt.innerText = count;
      ring.style.strokeDashoffset = String(465 - (465 * (count / 5)));
      
      if (count <= 3) {
        VoiceGuideService.speak(count.toString(), 'high');
      }
    } else {
      clearInterval(getReadyInterval);
      VoiceGuideService.speak('Go!', 'high');
      beginSession();
    }
  }, 1000);
}

function skipReady() {
  clearInterval(getReadyInterval);
  beginSession();
}

function beginSession() {
  if (!activeExercise) return;
  
  // If not already in playlist mode, initialize a fresh single workout session
  if (!isPlaylistMode || !activeSessionState.active || !activeSessionState.sessionStartMs) {
    activeSessionState = {
      active: true,
      title: activeExercise.name || "Workout Session",
      exercises: [activeExercise],
      index: 0,
      sessionStartMs: Date.now(),
      currentExerciseStartMs: Date.now(),
      pausedDurationMs: 0,
      pauseStartMs: 0
    };
    saveSessionState();
  }

  document.getElementById('session-gif').src = activeExercise.gifUrl;
  document.getElementById('session-exercise-name').innerText = activeExercise.name;
  
  const setsText = activeExercise.aiSets 
    ? `Set 1 of ${activeExercise.aiSets} · ${activeExercise.aiReps}`
    : `Set 1 · ${(activeExercise.bodyParts && activeExercise.bodyParts[0]) || 'Full Body'}`;
    
  document.getElementById('session-exercise-label').innerText = setsText;
  document.getElementById('session-muscle-label').innerText = `Targeting: ${(activeExercise.targetMuscles || []).join(', ')}`;
  
  navigate('active-session');

  // Start Jamendo Workout Music
  if (window.JamendoMusicService) {
    const workoutContext = (activeSessionState && activeSessionState.title) || (activeExercise && activeExercise.name) || '';
    window.JamendoMusicService.onWorkoutStart(workoutContext);
  }
}

// ── Period Tabs ───────────────────────────────────────
document.querySelectorAll('.period-tabs').forEach(container => {
  container.addEventListener('click', e => {
    const tab = e.target.closest('.period-tab');
    if (!tab) return;
    container.querySelectorAll('.period-tab').forEach(t => t.classList.remove('period-tab--active'));
    tab.classList.add('period-tab--active');
  });
});

// ── Save / Heart button toggle ────────────────────────
document.addEventListener('click', e => {
  const saveBtn = e.target.closest('.save-btn');
  if (!saveBtn) return;
  const svg = saveBtn.querySelector('svg');
  if (!svg) return;
  const isFilled = svg.getAttribute('fill') === 'currentColor' && svg.getAttribute('stroke') !== 'currentColor';
  // Toggle heart fill
  if (svg.getAttribute('fill') === 'none') {
    svg.setAttribute('fill', '#FB7185');
    svg.setAttribute('stroke', '#FB7185');
    saveBtn.style.color = '#FB7185';
  } else {
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    saveBtn.style.color = '';
  }
});

// ── Mood button selection ─────────────────────────────
document.querySelectorAll('.mood-options').forEach(container => {
  container.addEventListener('click', e => {
    const btn = e.target.closest('.mood-btn');
    if (!btn) return;
    container.querySelectorAll('.mood-btn').forEach(b => {
      b.style.transform = '';
      b.style.filter = 'grayscale(1) opacity(.5)';
    });
    btn.style.transform = 'scale(1.3)';
    btn.style.filter = '';
  });
});

// ── Toggle switches ───────────────────────────────────
document.querySelectorAll('.toggle-switch').forEach(toggle => {
  toggle.addEventListener('click', () => {
    toggle.classList.toggle('toggle-switch--on');
    toggle.setAttribute('aria-checked', toggle.classList.contains('toggle-switch--on').toString());
  });
});

// ── Progress ring animation on load ──────────────────
function animateRing() {
  if (window.AppDataUI && typeof window.AppDataUI.renderHome === 'function') {
    window.AppDataUI.renderHome();
  }
}

// ── Onboarding auto-slide ─────────────────────────────
(function initOnboarding() {
  // Simple dot animation on splash
  const dots = document.querySelectorAll('#screen-splash .dot');
  let current = 0;
  setInterval(() => {
    dots.forEach(d => d.classList.remove('dot--active'));
    current = (current + 1) % dots.length;
    dots[current].classList.add('dot--active');
  }, 2500);
})();

// ── Authentication Service (Prepared for Database Integration) ──
const AuthService = {
  mode: 'signin', // 'signin' or 'signup'
  
  getUser() {
    try {
      const u = localStorage.getItem('fitly_auth_user');
      return u ? JSON.parse(u) : null;
    } catch (e) {
      return null;
    }
  },

  openSignInModal(mode = 'signin') {
    this.mode = mode;
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.add('active');
    this.updateModalUI();
  },

  closeSignInModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.remove('active');
  },

  setMode(mode) {
    this.mode = mode;
    this.updateModalUI();
  },

  updateModalUI() {
    const title = document.getElementById('auth-modal-title');
    const sub = document.getElementById('auth-modal-sub');
    const btn = document.getElementById('auth-submit-btn');
    const tabIn = document.getElementById('auth-tab-signin');
    const tabUp = document.getElementById('auth-tab-signup');
    
    if (this.mode === 'signup') {
      if (title) title.innerText = 'Create Account';
      if (sub) sub.innerText = 'Sign up to sync your workouts & nutrition';
      if (btn) btn.innerText = 'Create Account & Continue';
      if (tabUp) tabUp.classList.add('auth-tab--active');
      if (tabIn) tabIn.classList.remove('auth-tab--active');
    } else {
      if (title) title.innerText = 'Sign In';
      if (sub) sub.innerText = 'Access your synced workouts & nutrition';
      if (btn) btn.innerText = 'Sign In & Continue';
      if (tabIn) tabIn.classList.add('auth-tab--active');
      if (tabUp) tabUp.classList.remove('auth-tab--active');
    }
  },

  togglePasswordVisibility() {
    const pwInput = document.getElementById('auth-password');
    if (!pwInput) return;
    pwInput.type = pwInput.type === 'password' ? 'text' : 'password';
  },

  handleAuthSubmit() {
    const email = (document.getElementById('auth-email').value || '').trim();
    const password = (document.getElementById('auth-password').value || '').trim();

    if (!email) {
      alert('Please enter your email or username.');
      return;
    }
    if (!password || password.length < 4) {
      alert('Please enter a password with at least 4 characters.');
      return;
    }

    const username = email.includes('@') ? email.split('@')[0] : email;
    const formattedName = username.charAt(0).toUpperCase() + username.slice(1);
    
    const authUser = {
      type: 'registered',
      email: email,
      name: formattedName,
      loggedInAt: new Date().toISOString()
    };

    localStorage.setItem('fitly_auth_user', JSON.stringify(authUser));
    this.closeSignInModal();

    // Auto-assign one of the 5 fitness avatars for new profile
    const assignedAvatar = (window.AvatarService && typeof AvatarService.getRandomAvatar === 'function')
      ? AvatarService.getRandomAvatar()
      : 'avatars/avatar1.jpg';
    if (window.AppDataService) {
      AppDataService.updateAvatar(assignedAvatar);
    }
    if (window.AvatarService) {
      AvatarService.activeDraftAvatar = assignedAvatar;
    }

    // Pre-fill name and avatar in onboarding questions
    const obName = document.getElementById('ob-name');
    if (obName) obName.value = formattedName;

    const obAvatarPreview = document.getElementById('ob-avatar-preview');
    if (obAvatarPreview && window.AvatarService) {
      AvatarService.renderAvatar(obAvatarPreview, assignedAvatar, formattedName);
    }

    // Advance to basic profile questions
    navigate('onboarding');
  },

  continueAsGuest() {
    const assignedAvatar = (window.AvatarService && typeof AvatarService.getRandomAvatar === 'function')
      ? AvatarService.getRandomAvatar()
      : 'avatars/avatar1.jpg';

    const authUser = {
      type: 'guest',
      name: 'Guest Athlete',
      loggedInAt: new Date().toISOString()
    };
    localStorage.setItem('fitly_auth_user', JSON.stringify(authUser));

    if (window.AppDataService) {
      AppDataService.updateAvatar(assignedAvatar);
    }
    if (window.AvatarService) {
      AvatarService.activeDraftAvatar = assignedAvatar;
    }

    const obName = document.getElementById('ob-name');
    if (obName && !obName.value) obName.value = 'Athlete';

    const obAvatarPreview = document.getElementById('ob-avatar-preview');
    if (obAvatarPreview && window.AvatarService) {
      AvatarService.renderAvatar(obAvatarPreview, assignedAvatar, 'A');
    }

    // Advance to basic profile questions
    navigate('onboarding');
  },

  signOut() {
    if (confirm('Sign out and return to the login screen?')) {
      localStorage.removeItem('fitly_setup_complete');
      localStorage.removeItem('fitly_auth_user');
      document.documentElement.classList.add('user-new');
      document.documentElement.classList.remove('user-returning');
      navigate('splash');
    }
  }
};

window.AuthService = AuthService;
window.logout = () => AuthService.signOut();

window.setObGender = function(val, btn) {
  const hidden = document.getElementById('ob-gender');
  if (hidden) hidden.value = val;
  document.querySelectorAll('.ob-gender-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
};

// ── Kickoff ───────────────────────────────────────────
function initAppLaunch() {
  animateRing();
  
  // Resolve legacy avatar if any
  if (window.AvatarService && window.AppDataService && AppDataService.profile) {
    AppDataService.profile.avatar = AvatarService.resolveAvatar(AppDataService.profile.avatar);
    localStorage.setItem('fitly_user_info', JSON.stringify(AppDataService.profile));
  }

  const isSetup = (localStorage.getItem('fitly_setup_complete') === 'true');
  if (isSetup) {
    document.documentElement.classList.add('user-returning');
    document.documentElement.classList.remove('user-new');
    if (currentScreen !== 'home') navigate('home');
    if (window.AppDataUI && typeof window.AppDataUI.renderHome === 'function') {
      window.AppDataUI.renderHome();
    }
    if (typeof animateChartBars === 'function') {
      setTimeout(animateChartBars, 300);
    }
  } else {
    document.documentElement.classList.add('user-new');
    document.documentElement.classList.remove('user-returning');
    navigate('splash');
  }

  // Initialize onboarding avatar preview
  const obAvatarPreview = document.getElementById('ob-avatar-preview');
  if (obAvatarPreview && window.AvatarService) {
    const curAvatar = (window.AppDataService && AppDataService.profile && AppDataService.profile.avatar) || 'avatars/avatar1.jpg';
    AvatarService.renderAvatar(obAvatarPreview, curAvatar, 'A');
    AvatarService.activeDraftAvatar = curAvatar;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAppLaunch);
} else {
  initAppLaunch();
}

window.submitOnboarding = function() {
  const name = document.getElementById('ob-name').value.trim() || "Athlete";
  const age = parseInt(document.getElementById('ob-age').value) || 25;
  const gender = document.getElementById('ob-gender').value || 'male';
  const height = parseInt(document.getElementById('ob-height').value) || 170;
  const weight = parseFloat(document.getElementById('ob-weight').value) || 70;
  const target = parseFloat(document.getElementById('ob-target').value) || 65;
  const activity = document.getElementById('ob-activity').value;
  const goal = document.getElementById('ob-goal').value;

  if (window.AppDataService) {
    AppDataService.updateUsername(name);
    const chosenAvatar = (window.AvatarService && AvatarService.activeDraftAvatar) || (AppDataService.profile && AppDataService.profile.avatar) || 'avatars/avatar1.jpg';
    AppDataService.updateAvatar(chosenAvatar);
  }

  // Update auth user name if exists
  const auth = AuthService.getUser();
  if (auth) {
    auth.name = name;
    localStorage.setItem('fitly_auth_user', JSON.stringify(auth));
  }

  if (window.DietService) {
    DietService.profile = {
      age, gender, height, weight, targetWeight: target, activity, goal, dailyCalorieTarget: 2000
    };
    
    DietService.weightHistory = [{ date: new Date().toISOString(), weight: weight }];
    localStorage.setItem('fitly_weights', JSON.stringify(DietService.weightHistory));
    
    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v;
    };
    setVal('prof-age', age);
    setVal('prof-gender', gender);
    setVal('prof-height', height);
    setVal('prof-target', target);
    setVal('prof-activity', activity);
    setVal('prof-goal', goal);
    
    DietService.updateProfile(); 
  }
  
  // Mark setup as complete and switch document class
  localStorage.setItem('fitly_setup_complete', 'true');
  document.documentElement.classList.add('user-returning');
  document.documentElement.classList.remove('user-new');
  
  navigate('home');
};

// ── Search in Explore ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('explore-search');
  let searchDebounce = null;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(async () => {
        const container = document.getElementById('explore-cards');
        if (!container) return;

        if (!q) {
          container.innerHTML = '';
          renderCards(loadedCategoryExercises, container);
          const bannerText = document.getElementById('explore-banner-text');
          if (bannerText && BANNER_MAP[currentFilter]) {
            bannerText.innerText = BANNER_MAP[currentFilter];
          }
          return;
        }

        try {
          container.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-3); font-size:0.9rem;">Searching exercises...</div>';
          const res = await fetch(`${API_BASE}/exercises?name=${encodeURIComponent(q)}&limit=25`);
          const json = await res.json();
          if (json.success && json.data && json.data.length > 0) {
            container.innerHTML = '';
            renderCards(json.data, container);
            const bannerText = document.getElementById('explore-banner-text');
            if (bannerText) bannerText.innerText = `Found ${json.meta?.total || json.data.length} exercises matching "${q}"`;
          } else {
            // Local fallback filter
            const local = loadedCategoryExercises.filter(ex => 
              (ex.name && ex.name.toLowerCase().includes(q)) ||
              (ex.bodyParts && ex.bodyParts.some(bp => bp.toLowerCase().includes(q))) ||
              (ex.targetMuscles && ex.targetMuscles.some(tm => tm.toLowerCase().includes(q)))
            );
            container.innerHTML = '';
            if (local.length > 0) {
              renderCards(local, container);
            } else {
              container.innerHTML = `<div style="padding:40px; text-align:center; color:var(--text-3); font-size:0.9rem;">No exercises found matching "${q}".</div>`;
            }
          }
        } catch (err) {
          console.error(err);
        }
      }, 350);
    });
  }
});

// ── Open Category Exercises from Home Quick Cards ─────────────
function openCategoryExercises(category) {
  navigate('explore');

  currentFilter = category;

  // Highlight the matching chip on explore screen
  const chips = document.querySelectorAll('#explore-chips .chip');
  chips.forEach(chip => {
    if (chip.getAttribute('data-filter') === category) {
      chip.classList.add('chip--active');
      chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    } else {
      chip.classList.remove('chip--active');
    }
  });

  // Clear search box
  const searchInput = document.getElementById('explore-search');
  if (searchInput) searchInput.value = '';

  // Fetch exercises for this category
  fetchAndRenderExercises(category, true);
}
window.openCategoryExercises = openCategoryExercises;
window.triggerQuickAI = openCategoryExercises;


window.logoutApp = function() {
  if (confirm("Log out and clear all data? This cannot be undone.")) {
    localStorage.clear();
    location.reload();
  }
};


function cancelWorkoutSession() {
  if (confirm("Are you sure you want to end this workout early? Progress will not be saved.")) {
    if (typeof timerInterval !== 'undefined') clearInterval(timerInterval);
    VoiceGuideService.stop();
    activeSessionState.active = false;
    saveSessionState();
    navigate('home');
  }
}

function logout() {
  if (confirm("Are you sure you want to log out? All local data will be permanently deleted.")) {
    localStorage.clear();
    location.reload();
  }
}
