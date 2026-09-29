const AppDataService = {
  workoutHistory: [],
  profile: {
    username: "Athlete",
    avatar: "avatars/avatar1.jpg",
    dailyActiveMinutesTarget: 30,
    dailyCalorieBurnTarget: 300
  },

  init() {
    const history = localStorage.getItem('fitly_workout_history');
    if (history) {
      try { this.workoutHistory = JSON.parse(history); } catch (e) {}
    }
    
    const p = localStorage.getItem('fitly_user_info');
    if (p) {
      try {
        const parsed = JSON.parse(p);
        this.profile = { ...this.profile, ...parsed };
      } catch (e) {}
    }

    if (window.AvatarService && typeof AvatarService.resolveAvatar === 'function') {
      this.profile.avatar = AvatarService.resolveAvatar(this.profile.avatar);
    }
  },

  updateUsername(name) {
    this.profile.username = name || "Athlete";
    localStorage.setItem('fitly_user_info', JSON.stringify(this.profile));
  },

  updateAvatar(avatarVal) {
    const resolved = (window.AvatarService && typeof AvatarService.resolveAvatar === 'function')
      ? AvatarService.resolveAvatar(avatarVal)
      : (avatarVal || 'avatars/avatar1.jpg');
    this.profile.avatar = resolved;
    localStorage.setItem('fitly_user_info', JSON.stringify(this.profile));
    if (window.AppDataUI) {
      AppDataUI.renderHome();
      AppDataUI.renderProfile();
    }
  },

  updateGoals(mins, burn) {
    if (mins !== undefined && mins !== "") {
      this.profile.dailyActiveMinutesTarget = Math.max(1, parseInt(mins) || 30);
    }
    if (burn !== undefined && burn !== "") {
      this.profile.dailyCalorieBurnTarget = Math.max(10, parseInt(burn) || 300);
    }
    localStorage.setItem('fitly_user_info', JSON.stringify(this.profile));
    AppDataUI.renderHome();
  },

  logCompletedWorkout(routineData) {
    // Sanity check inputs to guarantee realistic data
    const duration = Math.min(360, Math.max(1, Math.round(Number(routineData.durationMinutes) || 1)));
    const calories = Math.min(3000, Math.max(5, Math.round(Number(routineData.estimatedCaloriesBurned) || 10)));
    const exercises = Math.max(1, Math.round(Number(routineData.exercisesCompleted) || 1));

    const entry = {
      id: Date.now().toString(),
      title: routineData.title || "Workout Session",
      dateISO: new Date().toISOString(),
      durationMinutes: duration,
      exercisesCompleted: exercises,
      estimatedCaloriesBurned: calories
    };
    this.workoutHistory.push(entry);
    localStorage.setItem('fitly_workout_history', JSON.stringify(this.workoutHistory));
  },

  getWorkoutHistory() {
    return this.workoutHistory;
  },

  getCurrentStreak() {
    if (this.workoutHistory.length === 0) return 0;
    
    // Extract unique local date strings
    const activeDates = [...new Set(this.workoutHistory.map(w => new Date(w.dateISO).toDateString()))];
    activeDates.sort((a, b) => new Date(b) - new Date(a)); // newest first

    let streak = 0;
    let checkDate = new Date(); // Start checking from today
    checkDate.setHours(0,0,0,0);

    // If no workout today, check if yesterday exists (streak remains active if they just haven't worked out yet today)
    const todayStr = checkDate.toDateString();
    const yesterday = new Date(checkDate);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (activeDates[0] !== todayStr && activeDates[0] !== yesterday.toDateString()) {
      return 0; // Streak broken
    }

    let currentDate = new Date(activeDates[0]);
    currentDate.setHours(0,0,0,0);
    
    for (let i = 0; i < activeDates.length; i++) {
      const logDate = new Date(activeDates[i]);
      logDate.setHours(0,0,0,0);
      
      if (logDate.getTime() === currentDate.getTime()) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1); // step back one day
      } else {
        break;
      }
    }
    return streak;
  },

  getTodayActivity() {
    const todayStr = new Date().toDateString();
    const todaysWorkouts = (this.workoutHistory || []).filter(w => {
      try {
        return new Date(w.dateISO).toDateString() === todayStr;
      } catch (e) {
        return false;
      }
    });
    
    const count = todaysWorkouts.length;
    // Filter out corrupted numbers (e.g. from 1970 epoch bugs)
    const activeMinutes = todaysWorkouts.reduce((sum, w) => {
      const m = Math.min(360, Math.max(0, Number(w.durationMinutes) || 0));
      return sum + m;
    }, 0);
    
    const caloriesBurned = todaysWorkouts.reduce((sum, w) => {
      const c = Math.min(3000, Math.max(0, Number(w.estimatedCaloriesBurned) || 0));
      return sum + c;
    }, 0);
    
    return { count, activeMinutes, caloriesBurned };
  },

  getRecentActivityChartData(days = 7) {
    const data = [];
    const today = new Date();
    today.setHours(0,0,0,0);

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toDateString();
      
      const dayWorkouts = this.workoutHistory.filter(w => new Date(w.dateISO).toDateString() === dateStr);
      const mins = dayWorkouts.reduce((sum, w) => sum + w.durationMinutes, 0);
      data.push({ date: d, mins });
    }
    return data;
  },

  getDietLogs() {
    let dietLog = null;
    if (window.DietService && Array.isArray(window.DietService.dietLog) && window.DietService.dietLog.length > 0) {
      dietLog = window.DietService.dietLog;
    } else {
      try {
        const stored = localStorage.getItem('fitly_diet');
        if (stored) dietLog = JSON.parse(stored);
      } catch (e) {}
    }
    return Array.isArray(dietLog) ? dietLog : [];
  },

  getLogEntryDate(entry) {
    if (!entry) return null;
    try {
      let d = entry.timestamp || entry.date || entry.dateISO;
      if (!d && entry.id && !isNaN(Number(entry.id)) && Number(entry.id) > 1000000000000) {
        d = Number(entry.id);
      }
      if (!d) return null;
      const parsed = new Date(isNaN(d) ? d : Number(d));
      return isNaN(parsed.getTime()) ? null : parsed;
    } catch (e) {
      return null;
    }
  },

  getLogEntryCalories(entry) {
    if (!entry) return 0;
    if (entry.totalCalories !== undefined && entry.totalCalories !== null && !isNaN(Number(entry.totalCalories))) {
      return Math.max(0, Math.round(Number(entry.totalCalories)));
    }
    if (entry.calories !== undefined && entry.calories !== null && !isNaN(Number(entry.calories))) {
      return Math.max(0, Math.round(Number(entry.calories)));
    }
    if (Array.isArray(entry.items)) {
      return entry.items.reduce((acc, it) => acc + Math.max(0, Math.round(Number(it.calories) || 0)), 0);
    }
    return 0;
  },

  getWeekData() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 is Sun, 1 is Mon, ..., 6 is Sat
    // Calculate distance to Monday of this week (Monday is first day)
    const diffToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const days = [];
    const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const fullNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    const targetMins = Math.max(1, (this.profile && this.profile.dailyActiveMinutesTarget) || 30);
    const targetBurn = Math.max(10, (this.profile && this.profile.dailyCalorieBurnTarget) || 300);

    const allDietLogs = this.getDietLogs();
    const todayStr = now.toDateString();

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toDateString();
      const isToday = (dateStr === todayStr);
      const isFuture = (d > now && !isToday);

      const dayWorkouts = (this.workoutHistory || []).filter(w => {
        try {
          return new Date(w.dateISO).toDateString() === dateStr;
        } catch (e) {
          return false;
        }
      });

      const activeMinutes = dayWorkouts.reduce((sum, w) => {
        return sum + Math.min(360, Math.max(0, Number(w.durationMinutes) || 0));
      }, 0);

      const caloriesBurned = dayWorkouts.reduce((sum, w) => {
        return sum + Math.min(3000, Math.max(0, Number(w.estimatedCaloriesBurned) || 0));
      }, 0);

      const dayDietLogs = allDietLogs.filter(l => {
        const logDate = AppDataService.getLogEntryDate(l);
        return logDate && logDate.toDateString() === dateStr;
      });

      const caloriesEaten = dayDietLogs.reduce((sum, l) => {
        return sum + AppDataService.getLogEntryCalories(l);
      }, 0);

      let heightPct = 0;
      if (activeMinutes > 0) {
        heightPct = Math.min(100, Math.max(18, Math.round((activeMinutes / targetMins) * 100)));
      } else {
        heightPct = 0;
      }

      days.push({
        date: d,
        dateStr: dateStr,
        dayLabel: dayLabels[i],
        dayName: dayNames[i],
        fullName: fullNames[i],
        formattedDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        isToday,
        isFuture,
        workouts: dayWorkouts,
        workoutCount: dayWorkouts.length,
        dietLogs: dayDietLogs,
        dietCount: dayDietLogs.length,
        activeMinutes,
        caloriesBurned,
        caloriesEaten,
        targetMins,
        targetBurn,
        heightPct
      });
    }

    return days;
  },

  getTodayDiet() {
    const allDietLogs = this.getDietLogs();
    const todayStr = new Date().toDateString();
    const todaysLogs = allDietLogs.filter(l => {
      const logDate = AppDataService.getLogEntryDate(l);
      return logDate && logDate.toDateString() === todayStr;
    });

    const calsEaten = todaysLogs.reduce((s, l) => {
      return s + AppDataService.getLogEntryCalories(l);
    }, 0);

    let target = 2000;
    if (window.DietService && window.DietService.profile && window.DietService.profile.dailyCalorieTarget) {
      target = Number(window.DietService.profile.dailyCalorieTarget) || 2000;
    } else {
      try {
        const pRaw = localStorage.getItem('fitly_profile');
        if (pRaw) {
          const p = JSON.parse(pRaw);
          if (p && p.dailyCalorieTarget) target = Number(p.dailyCalorieTarget) || 2000;
        }
      } catch (e) {}
    }

    return {
      calsEaten,
      target,
      remaining: Math.max(0, target - calsEaten)
    };
  }
};

const AppDataUI = {
  selectedWeeklyDateStr: null,

  selectWeeklyDay(dateStr) {
    this.selectedWeeklyDateStr = dateStr;
    this.renderWeeklyChart();
  },

  renderHome() {
    const today = AppDataService.getTodayActivity();
    const streak = AppDataService.getCurrentStreak();
    
    // User Profile Greeting & Avatar
    const name = (AppDataService.profile && AppDataService.profile.username) || "Athlete";
    const elGreeting = document.getElementById('home-greeting-name');
    if (elGreeting) elGreeting.innerText = name;
    const elAvatar = document.getElementById('home-greeting-avatar');
    if (elAvatar) {
      if (window.AvatarService && typeof AvatarService.renderAvatar === 'function') {
        AvatarService.renderAvatar(elAvatar, AppDataService.profile.avatar, name.charAt(0));
      } else {
        elAvatar.innerText = name.charAt(0).toUpperCase();
      }
    }

    // Streak Pill in header
    const elStreakPill = document.getElementById('home-streak-pill');
    if (elStreakPill) elStreakPill.innerText = streak + "-day streak";
    const elStreakTag = document.getElementById('home-streak-tag');
    if (elStreakTag) elStreakTag.innerText = streak + "d streak";

    // Date in card
    const elDate = document.getElementById('home-card-date');
    if (elDate) {
      const now = new Date();
      elDate.innerText = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    // Workout Metrics
    const elBurn = document.getElementById('home-stat-burn');
    if (elBurn) elBurn.innerText = today.caloriesBurned || 0;
    const elMins = document.getElementById('home-stat-mins');
    if (elMins) elMins.innerText = today.activeMinutes || 0;
    const elCount = document.getElementById('home-stat-count');
    if (elCount) elCount.innerText = today.count || 0;

    // Diet / Calorie Tracking
    const diet = AppDataService.getTodayDiet();

    const elEaten = document.getElementById('home-cal-eaten');
    if (elEaten) elEaten.innerText = diet.calsEaten.toLocaleString();
    const elTarget = document.getElementById('home-cal-target');
    if (elTarget) elTarget.innerText = diet.target.toLocaleString();
    const elRem = document.getElementById('home-cal-remaining');
    if (elRem) elRem.innerText = diet.remaining.toLocaleString();

    // Calorie Progress Bar
    const elDietBar = document.getElementById('home-diet-progress');
    if (elDietBar) {
      const intakePct = Math.min(100, Math.round((diet.calsEaten / (diet.target || 1)) * 100));
      elDietBar.style.width = intakePct + '%';
      if (intakePct > 100) {
        elDietBar.style.background = 'linear-gradient(90deg, #F59E0B, #EF4444)';
      } else {
        elDietBar.style.background = 'linear-gradient(90deg, #38BDF8, #818CF8)';
      }
    }

    // Progress Ring: Calculated from user's custom daily targets
    const targetMins = Math.max(1, (AppDataService.profile && AppDataService.profile.dailyActiveMinutesTarget) || 30);
    const targetBurn = Math.max(10, (AppDataService.profile && AppDataService.profile.dailyCalorieBurnTarget) || 300);

    const timeRatio = Math.min(1, (today.activeMinutes || 0) / targetMins);
    const burnRatio = Math.min(1, (today.caloriesBurned || 0) / targetBurn);

    const finalPct = Math.min(100, Math.round(((timeRatio + burnRatio) / 2) * 100));

    const elRingPct = document.getElementById('home-ring-pct');
    if (elRingPct) elRingPct.innerText = String(finalPct);

    const ringFill = document.getElementById('home-ring-fill') || document.querySelector('.ring-fill--workout');
    if (ringFill) {
      const radius = 50;
      const circumference = radius * 2 * Math.PI; // ~314.16
      const offset = circumference * (1 - (finalPct / 100));
      ringFill.style.strokeDasharray = String(circumference);
      ringFill.style.strokeDashoffset = String(offset);
      ringFill.style.transition = 'stroke-dashoffset 0.8s cubic-bezier(.4,0,.2,1)';
    }

    this.renderWeeklyChart();
  },

  renderWeeklyChart() {
    const barsContainer = document.getElementById('weekly-chart-bars');
    const detailsContainer = document.getElementById('weekly-day-details');
    if (!barsContainer) return;

    const weekDays = AppDataService.getWeekData();
    const todayStr = new Date().toDateString();

    // Default selected day to today if not set or if not in current week
    if (!this.selectedWeeklyDateStr || !weekDays.some(d => d.dateStr === this.selectedWeeklyDateStr)) {
      this.selectedWeeklyDateStr = todayStr;
    }

    // Update range header if present
    const rangeEl = document.getElementById('weekly-chart-range');
    if (rangeEl && weekDays.length === 7) {
      rangeEl.innerText = `${weekDays[0].formattedDate} – ${weekDays[6].formattedDate}`;
    }

    // Render bars
    barsContainer.innerHTML = weekDays.map(day => {
      const isSelected = (day.dateStr === this.selectedWeeklyDateStr);
      let barClass = 'bar';
      let barHeight = day.heightPct;

      if (day.isToday) {
        barClass = 'bar bar--active';
        if (barHeight === 0) barHeight = 8; // Visible base height for today
      } else if (day.workoutCount > 0) {
        barClass = 'bar bar--done';
      } else {
        barClass = 'bar';
        barHeight = 4; // Rest day base
      }

      return `
        <div class="chart-col ${isSelected ? 'selected' : ''} ${day.isToday ? 'is-today' : ''}"
             onclick="AppDataUI.selectWeeklyDay('${day.dateStr}')"
             role="button"
             tabindex="0"
             title="${day.fullName}, ${day.formattedDate}: ${day.activeMinutes} mins active, ${day.caloriesBurned} kcal">
          <div class="bar-wrap">
            <div class="${barClass}" style="height:${barHeight}%"></div>
          </div>
          <span class="bar-label">${day.dayLabel}</span>
          ${day.isToday ? '<span class="today-indicator-dot"></span>' : ''}
        </div>
      `;
    }).join('');

    // Render selected day details
    if (detailsContainer) {
      const selectedDay = weekDays.find(d => d.dateStr === this.selectedWeeklyDateStr) || weekDays.find(d => d.isToday) || weekDays[0];
      
      let badgeHtml = '';
      if (selectedDay.isToday) {
        badgeHtml = '<span class="wdd-badge wdd-badge--today">Today</span>';
      } else if (selectedDay.activeMinutes >= selectedDay.targetMins && selectedDay.targetMins > 0) {
        badgeHtml = '<span class="wdd-badge wdd-badge--done">Goal Met</span>';
      } else if (selectedDay.workoutCount > 0) {
        badgeHtml = `<span class="wdd-badge wdd-badge--active">${selectedDay.workoutCount} Workout${selectedDay.workoutCount > 1 ? 's' : ''}</span>`;
      } else if (selectedDay.isFuture) {
        badgeHtml = '<span class="wdd-badge wdd-badge--rest">Upcoming</span>';
      } else {
        badgeHtml = '<span class="wdd-badge wdd-badge--rest">Rest Day</span>';
      }

      let workoutListHtml = '';
      if (selectedDay.workouts && selectedDay.workouts.length > 0) {
        workoutListHtml = `
          <div class="wdd-section-header">
            <span class="wdd-section-title">Workouts (${selectedDay.workouts.length})</span>
            <span class="wdd-section-total">${selectedDay.activeMinutes} min • ${selectedDay.caloriesBurned} kcal</span>
          </div>
          <div class="wdd-workout-list">
            ${selectedDay.workouts.map(w => {
              const title = w.title || w.routineTitle || 'Workout Session';
              const mins = w.durationMinutes || 0;
              const cals = w.estimatedCaloriesBurned || 0;
              const count = w.exercisesCompleted || 1;
              return `
                <div class="wdd-workout-item">
                  <div class="wdd-wi-info">
                    <div class="wdd-wi-title">🏋️ ${title}</div>
                    <div class="wdd-wi-meta">${mins} min • ${cals} kcal • ${count} exercise${count > 1 ? 's' : ''}</div>
                  </div>
                  <span style="font-size:0.85rem; color:#059669; font-weight:700;">✓</span>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

      let dietListHtml = '';
      if (selectedDay.dietLogs && selectedDay.dietLogs.length > 0) {
        dietListHtml = `
          <div class="wdd-section-header">
            <span class="wdd-section-title">Meals Logged (${selectedDay.dietLogs.length})</span>
            <span class="wdd-section-total">${selectedDay.caloriesEaten.toLocaleString()} kcal</span>
          </div>
          <div class="wdd-meal-list">
            ${selectedDay.dietLogs.map(m => {
              const names = (Array.isArray(m.items) && m.items.map(i => i.name).filter(Boolean).join(', ')) || 'Logged Meal';
              const cals = AppDataService.getLogEntryCalories(m);
              const macros = [];
              if (m.totalPro) macros.push(`${m.totalPro}g Pro`);
              if (m.totalCarb) macros.push(`${m.totalCarb}g Carb`);
              if (m.totalFat) macros.push(`${m.totalFat}g Fat`);
              const macroStr = macros.length > 0 ? ` • ${macros.join(', ')}` : '';
              return `
                <div class="wdd-meal-item">
                  <div class="wdd-mi-info">
                    <div class="wdd-mi-title">🥗 ${names}</div>
                    <div class="wdd-mi-meta">${cals} kcal${macroStr}</div>
                  </div>
                  <span class="wdd-mi-tag">${cals} kcal</span>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

      let emptyMsgHtml = '';
      if ((!selectedDay.workouts || selectedDay.workouts.length === 0) && (!selectedDay.dietLogs || selectedDay.dietLogs.length === 0)) {
        const emptyText = selectedDay.isToday 
          ? 'No workouts or meals logged yet today. Track a workout or log a meal to see your stats!'
          : (selectedDay.isFuture ? 'Upcoming day — your planned rest, diet, or workout day.' : 'Rest day — No workouts or meals recorded.');
        emptyMsgHtml = `<div class="wdd-empty-msg">${emptyText}</div>`;
      }

      detailsContainer.innerHTML = `
        <div class="wdd-header">
          <div class="wdd-title-wrap">
            <span class="wdd-day-name">${selectedDay.fullName}, ${selectedDay.formattedDate}</span>
            ${badgeHtml}
          </div>
        </div>
        <div class="wdd-stats-grid">
          <div class="wdd-stat-box">
            <div class="wdd-stat-val">${selectedDay.activeMinutes} <span class="wdd-stat-unit">min</span></div>
            <div class="wdd-stat-label">Active Time</div>
          </div>
          <div class="wdd-stat-box">
            <div class="wdd-stat-val">${selectedDay.caloriesBurned} <span class="wdd-stat-unit">kcal</span></div>
            <div class="wdd-stat-label">Burned</div>
          </div>
          <div class="wdd-stat-box">
            <div class="wdd-stat-val">${selectedDay.workoutCount}</div>
            <div class="wdd-stat-label">Workouts</div>
          </div>
          <div class="wdd-stat-box">
            <div class="wdd-stat-val">${selectedDay.caloriesEaten.toLocaleString()} <span class="wdd-stat-unit">kcal</span></div>
            <div class="wdd-stat-label">Diet Eaten</div>
          </div>
        </div>
        ${workoutListHtml}
        ${dietListHtml}
        ${emptyMsgHtml}
      `;
    }
  },

  renderChart() {
    this.renderWeeklyChart();
  },

  renderContinueCard() {
    const card = document.getElementById('home-continue-card');
    if (!card) return;
    
    const stateStr = localStorage.getItem('fitly_session');
    let state = null;
    if (stateStr) state = JSON.parse(stateStr);
    
    if (state && state.active && state.exercises.length > 0) {
      // Resume state
      card.innerHTML = `
        <div style="flex:1;">
          <h4 style="margin:0 0 6px; font-size:1.1rem; color:var(--text-1); font-weight:700;">Resume ${state.title}</h4>
          <p style="margin:0; font-size:0.85rem; color:var(--text-2);">Exercise ${state.index + 1} of ${state.exercises.length}</p>
        </div>
        <button onclick="resumeWorkoutSession()" style="background:var(--purple); color:#fff; border:none; padding:10px 20px; border-radius:8px; font-weight:700; cursor:pointer;">Resume</button>
      `;
    } else {
      // Empty state
      card.innerHTML = `
        <div style="flex:1;">
          <h4 style="margin:0 0 6px; font-size:1.1rem; color:var(--text-1); font-weight:700;">Start a Workout</h4>
          <p style="margin:0; font-size:0.85rem; color:var(--text-2);">Let your AI Coach build your perfect routine today.</p>
        </div>
        <button onclick="navigate('ai-workout')" style="background:#001F3F; color:#fff; border:none; padding:10px 20px; border-radius:8px; font-weight:700; cursor:pointer;">Build</button>
      `;
    }
  },

  showSyncToast(msg = '✓ Profile synced') {
    const toast = document.getElementById('prof-sync-toast');
    if (!toast) return;
    toast.innerText = msg;
    toast.classList.add('show');
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2200);
  },

  setQuickTargetMins(mins) {
    const el = document.getElementById('prof-target-mins');
    if (el) el.value = mins;
    const prev = document.getElementById('preview-target-mins');
    if (prev) prev.innerText = `${mins} min`;
  },

  setQuickTargetBurn(burn) {
    const el = document.getElementById('prof-target-burn');
    if (el) el.value = burn;
    const prev = document.getElementById('preview-target-burn');
    if (prev) prev.innerText = `${burn} kcal`;
  },

  previewMetabolicCalculation() {
    const getVal = (id, fallback) => {
      const el = document.getElementById(id);
      return el ? el.value : fallback;
    };

    const age = parseInt(getVal('prof-age', 30)) || 30;
    const gender = getVal('prof-gender', 'male') || 'male';
    const height = parseInt(getVal('prof-height', 175)) || 175;
    const activity = getVal('prof-activity', 'active') || 'active';
    const goal = getVal('prof-goal', 'lose') || 'lose';

    let weight = 75;
    if (window.DietService) {
      if (window.DietService.weightHistory && window.DietService.weightHistory.length > 0) {
        weight = window.DietService.weightHistory[window.DietService.weightHistory.length - 1].weight;
      } else if (window.DietService.profile && window.DietService.profile.weight) {
        weight = window.DietService.profile.weight;
      }
    }

    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
    bmr += (gender === 'male') ? 5 : -161;

    const mults = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very: 1.9 };
    let tdee = bmr * (mults[activity] || 1.2);

    let targetCal = tdee;
    if (goal === 'lose') targetCal -= 500;
    if (goal === 'gain') targetCal += 300;
    targetCal = Math.max(1200, Math.round(targetCal));

    const elMetaBmr = document.getElementById('prof-meta-bmr');
    if (elMetaBmr) elMetaBmr.innerText = `${Math.round(bmr).toLocaleString()} kcal`;
    const elMetaTdee = document.getElementById('prof-meta-tdee');
    if (elMetaTdee) elMetaTdee.innerText = `${Math.round(tdee).toLocaleString()} kcal`;
    const elMetaTarget = document.getElementById('prof-meta-target');
    if (elMetaTarget) elMetaTarget.innerText = `${Math.round(targetCal).toLocaleString()} kcal`;
  },

  triggerButtonFeedback(targetSelector) {
    const selector = targetSelector || '.prof-btn-confirm, .prof-card-save-btn';
    const btns = document.querySelectorAll(selector);
    btns.forEach(btn => {
      const origHtml = btn.innerHTML;
      btn.classList.add('btn-saved-success');
      btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Saved!`;
      setTimeout(() => {
        btn.classList.remove('btn-saved-success');
        btn.innerHTML = origHtml;
      }, 1800);
    });
  },

  saveGoalsChanges() {
    try {
      const minsEl = document.getElementById('prof-target-mins');
      const burnEl = document.getElementById('prof-target-burn');
      const minsVal = minsEl ? parseInt(minsEl.value) || 30 : 30;
      const burnVal = burnEl ? parseInt(burnEl.value) || 300 : 300;
      AppDataService.updateGoals(minsVal, burnVal);

      this.renderHome();
      this.renderProfile();

      this.triggerButtonFeedback('#prof-save-goals-btn');
      this.showSyncToast('✓ Daily fitness goals updated');
    } catch (err) {
      console.error('saveGoalsChanges error:', err);
      this.showSyncToast('✓ Goals updated');
    }
  },

  saveProfileStatsChanges() {
    this.saveAllProfileChanges('#prof-btn-confirm');
  },

  saveAllProfileChanges(targetSelector) {
    try {
      // 1. Save Username
      const userEl = document.getElementById('prof-username');
      const newName = userEl ? userEl.value.trim() : '';
      if (newName) {
        AppDataService.updateUsername(newName);
      } else {
        AppDataService.updateUsername('Athlete');
        if (userEl) userEl.value = 'Athlete';
      }

      // 2. Save Goals (mins & burn)
      const minsEl = document.getElementById('prof-target-mins');
      const burnEl = document.getElementById('prof-target-burn');
      const minsVal = minsEl ? parseInt(minsEl.value) || 30 : 30;
      const burnVal = burnEl ? parseInt(burnEl.value) || 300 : 300;
      AppDataService.updateGoals(minsVal, burnVal);

      // 3. Save Nutrition & Body Profile
      if (window.DietService && typeof window.DietService.updateProfile === 'function') {
        try {
          window.DietService.updateProfile();
        } catch (e) {
          console.warn('DietService.updateProfile error:', e);
        }
      }

      // 4. Force immediate update of Hero Header elements
      const activeName = (AppDataService.profile && AppDataService.profile.username) || 'Athlete';
      const elProfName = document.getElementById('prof-header-name');
      if (elProfName) elProfName.innerText = activeName;
      
      const elProfAvatar = document.getElementById('prof-header-avatar');
      if (elProfAvatar) {
        if (window.AvatarService && typeof AvatarService.renderAvatar === 'function') {
          AvatarService.renderAvatar(elProfAvatar, AppDataService.profile.avatar, activeName.charAt(0));
        } else {
          elProfAvatar.innerText = activeName.charAt(0).toUpperCase();
        }
      }

      // 5. Update Home greeting & avatar
      const elHomeGreeting = document.getElementById('home-greeting-name');
      if (elHomeGreeting) elHomeGreeting.innerText = activeName;

      const elHomeAvatar = document.getElementById('home-greeting-avatar');
      if (elHomeAvatar) {
        if (window.AvatarService && typeof AvatarService.renderAvatar === 'function') {
          AvatarService.renderAvatar(elHomeAvatar, AppDataService.profile.avatar, activeName.charAt(0));
        } else {
          elHomeAvatar.innerText = activeName.charAt(0).toUpperCase();
        }
      }

      // 6. Re-render affected screens & components
      this.renderProfile();
      this.renderHome();
      if (window.DietUI && typeof window.DietUI.renderDashboard === 'function') {
        try { window.DietUI.renderDashboard(); } catch (e) {}
      }

      // 7. Visual confirmation directly on button(s) & floating toast
      this.triggerButtonFeedback(targetSelector || '#prof-btn-confirm');
      this.showSyncToast('✓ Profile updated successfully');
    } catch (err) {
      console.error('saveAllProfileChanges error:', err);
      this.showSyncToast('✓ Profile updated');
    }
  },

  // Backwards compatibility wrappers
  handleUsernameChange(name) {
    this.saveAllProfileChanges();
  },

  handleTargetMinsChange(val) {
    this.saveAllProfileChanges();
  },

  handleTargetBurnChange(val) {
    this.saveAllProfileChanges();
  },

  handleNutritionProfileChange() {
    this.saveAllProfileChanges();
  },

  clearActiveSession() {
    localStorage.removeItem('fitly_session');
    this.renderContinueCard();
    this.showSyncToast('✓ Active session reset');
  },

  renderProfile() {
    // 1. Display Name & Avatar
    const name = (AppDataService.profile && AppDataService.profile.username) || "Athlete";
    const elProfUser = document.getElementById('prof-username');
    if (elProfUser && document.activeElement !== elProfUser) elProfUser.value = name;
    
    const elProfName = document.getElementById('prof-header-name');
    if (elProfName) elProfName.innerText = name;
    
    const elProfAvatar = document.getElementById('prof-header-avatar');
    if (elProfAvatar) {
      if (window.AvatarService && typeof AvatarService.renderAvatar === 'function') {
        AvatarService.renderAvatar(elProfAvatar, AppDataService.profile.avatar, name.charAt(0));
      } else {
        elProfAvatar.innerText = name.charAt(0).toUpperCase();
      }
    }
    
    // 2. Streak & Hero Badge/Subtitle
    const streak = AppDataService.getCurrentStreak();
    const elProfBadge = document.getElementById('prof-header-badge');
    if (elProfBadge) {
      elProfBadge.innerText = streak >= 7 ? "FlowFit Pro" : "FlowFit Member";
    }
    const elProfSub = document.getElementById('prof-header-subtitle');
    if (elProfSub) {
      elProfSub.innerText = streak > 0 
        ? `${streak}-day streak · Keep crushing it!` 
        : "Consistent & Goal-Driven";
    }

    // 3. Nutrition & Weight data
    let dietProf = (window.DietService && window.DietService.profile) ? window.DietService.profile : null;
    if (!dietProf) {
      try {
        const rawP = localStorage.getItem('fitly_profile');
        if (rawP) dietProf = JSON.parse(rawP);
      } catch (e) {}
    }
    if (!dietProf) {
      dietProf = { age: 30, gender: 'male', height: 175, weight: 75, targetWeight: 68, activity: 'active', goal: 'lose', dailyCalorieTarget: 2200 };
    }

    // Latest weight from weightHistory if available
    let currentWeight = dietProf.weight || 75;
    if (window.DietService && window.DietService.weightHistory && window.DietService.weightHistory.length > 0) {
      currentWeight = window.DietService.weightHistory[window.DietService.weightHistory.length - 1].weight;
    } else {
      try {
        const wHist = JSON.parse(localStorage.getItem('fitly_weights') || '[]');
        if (wHist.length > 0) currentWeight = wHist[wHist.length - 1].weight;
      } catch (e) {}
    }
    const targetWeight = Number(dietProf.targetWeight) || 68;
    const height = Number(dietProf.height) || 175;
    const age = Number(dietProf.age) || 30;
    const gender = dietProf.gender || 'male';
    const activity = dietProf.activity || 'active';
    const goal = dietProf.goal || 'lose';

    // Scientific Calculations
    let bmr = (10 * currentWeight) + (6.25 * height) - (5 * age);
    bmr += (gender === 'male') ? 5 : -161;

    const mults = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very: 1.9 };
    let tdee = bmr * (mults[activity] || 1.2);

    let targetCal = tdee;
    if (goal === 'lose') targetCal -= 500;
    if (goal === 'gain') targetCal += 300;
    targetCal = Math.max(1200, Math.round(targetCal));

    // Update Strip Grid
    const elStripStreak = document.getElementById('prof-strip-streak');
    if (elStripStreak) elStripStreak.innerText = streak + 'd';

    const elStripWeight = document.getElementById('prof-strip-weight');
    if (elStripWeight) elStripWeight.innerText = currentWeight + ' kg';

    const elStripTarget = document.getElementById('prof-strip-target');
    if (elStripTarget) elStripTarget.innerText = targetWeight + ' kg';

    const elStripCal = document.getElementById('prof-strip-cal');
    if (elStripCal) elStripCal.innerText = targetCal.toLocaleString();

    // 4. Weight KPIs
    const elKpiCurr = document.getElementById('prof-kpi-curr');
    if (elKpiCurr) elKpiCurr.innerHTML = `${currentWeight} <small>kg</small>`;

    const elKpiTarget = document.getElementById('prof-kpi-target');
    if (elKpiTarget) elKpiTarget.innerHTML = `${targetWeight} <small>kg</small>`;

    const diff = Number((currentWeight - targetWeight).toFixed(1));
    const elKpiDiff = document.getElementById('prof-kpi-diff');
    if (elKpiDiff) {
      if (diff > 0) {
        elKpiDiff.innerHTML = `+${diff} <small>kg</small>`;
      } else if (diff < 0) {
        elKpiDiff.innerHTML = `${diff} <small>kg</small>`;
      } else {
        elKpiDiff.innerHTML = `0 <small>kg</small>`;
      }
    }

    const elWeightSub = document.getElementById('prof-weight-sub');
    if (elWeightSub) {
      if (diff > 0) {
        elWeightSub.innerText = `${diff} kg left to reach your target weight`;
      } else if (diff < 0) {
        elWeightSub.innerText = `${Math.abs(diff)} kg under target weight`;
      } else {
        elWeightSub.innerText = `Goal weight reached! Excellent job.`;
      }
    }

    // BMI calculation
    const heightInMeters = height / 100;
    const bmi = heightInMeters > 0 ? (currentWeight / (heightInMeters * heightInMeters)).toFixed(1) : "24.0";
    const elKpiBmi = document.getElementById('prof-kpi-bmi');
    if (elKpiBmi) elKpiBmi.innerText = bmi;

    const elKpiBmiTag = document.getElementById('prof-kpi-bmi-tag');
    if (elKpiBmiTag) {
      const bmiNum = parseFloat(bmi);
      if (bmiNum < 18.5) {
        elKpiBmiTag.innerText = 'Underweight';
        elKpiBmiTag.style.background = '#EFF6FF';
        elKpiBmiTag.style.color = '#2563EB';
      } else if (bmiNum < 25) {
        elKpiBmiTag.innerText = 'Normal';
        elKpiBmiTag.style.background = '#ECFDF5';
        elKpiBmiTag.style.color = '#059669';
      } else if (bmiNum < 30) {
        elKpiBmiTag.innerText = 'Overweight';
        elKpiBmiTag.style.background = '#FFFBEB';
        elKpiBmiTag.style.color = '#D97706';
      } else {
        elKpiBmiTag.innerText = 'Obese';
        elKpiBmiTag.style.background = '#FEF2F2';
        elKpiBmiTag.style.color = '#DC2626';
      }
    }

    // Render SVG weight chart
    if (window.DietUI && typeof window.DietUI.renderWeightChart === 'function') {
      window.DietUI.renderWeightChart();
    }

    // 5. Daily Fitness Goals
    const targetMins = (AppDataService.profile && AppDataService.profile.dailyActiveMinutesTarget) || 30;
    const targetBurn = (AppDataService.profile && AppDataService.profile.dailyCalorieBurnTarget) || 300;

    const elTargetMins = document.getElementById('prof-target-mins');
    if (elTargetMins && document.activeElement !== elTargetMins) elTargetMins.value = targetMins;
    const elPrevMins = document.getElementById('preview-target-mins');
    if (elPrevMins) elPrevMins.innerText = `${targetMins} min`;

    const elTargetBurn = document.getElementById('prof-target-burn');
    if (elTargetBurn && document.activeElement !== elTargetBurn) elTargetBurn.value = targetBurn;
    const elPrevBurn = document.getElementById('preview-target-burn');
    if (elPrevBurn) elPrevBurn.innerText = `${targetBurn} kcal`;

    // 6. Body stats form inputs (only update if not currently focused by user)
    const elAge = document.getElementById('prof-age');
    if (elAge && document.activeElement !== elAge) elAge.value = age;
    const elGender = document.getElementById('prof-gender');
    if (elGender && document.activeElement !== elGender) elGender.value = gender;
    const elHeight = document.getElementById('prof-height');
    if (elHeight && document.activeElement !== elHeight) elHeight.value = height;
    const elTarget = document.getElementById('prof-target');
    if (elTarget && document.activeElement !== elTarget) elTarget.value = targetWeight;
    const elActivity = document.getElementById('prof-activity');
    if (elActivity && document.activeElement !== elActivity) elActivity.value = activity;
    const elGoal = document.getElementById('prof-goal');
    if (elGoal && document.activeElement !== elGoal) elGoal.value = goal;

    // 7. Metabolic Banner
    const elMetaBmr = document.getElementById('prof-meta-bmr');
    if (elMetaBmr) elMetaBmr.innerText = `${Math.round(bmr).toLocaleString()} kcal`;
    const elMetaTdee = document.getElementById('prof-meta-tdee');
    if (elMetaTdee) elMetaTdee.innerText = `${Math.round(tdee).toLocaleString()} kcal`;
    const elMetaTarget = document.getElementById('prof-meta-target');
    if (elMetaTarget) elMetaTarget.innerText = `${Math.round(targetCal).toLocaleString()} kcal`;

    // 8. Gemini API Key Status
    const elApiStatus = document.getElementById('prof-api-status');
    if (elApiStatus) {
      const apiKey = localStorage.getItem('gemini_api_key');
      if (apiKey && apiKey.trim().length > 0) {
        elApiStatus.innerHTML = `<span style="color:#059669; font-weight:600;">✓ Connected &amp; Ready</span>`;
      } else {
        elApiStatus.innerHTML = `<span style="color:#94a3b8;">Not Configured (Tap to setup)</span>`;
      }
    }

    // 9. Account Auth Status
    const elAccType = document.getElementById('prof-account-type');
    const elAccDetail = document.getElementById('prof-account-detail');
    if (elAccType && elAccDetail) {
      const auth = (window.AuthService && typeof AuthService.getUser === 'function') ? AuthService.getUser() : null;
      if (auth && auth.type === 'registered') {
        elAccType.innerText = "Registered Account";
        elAccDetail.innerText = auth.email || auth.name || "Active";
      } else {
        elAccType.innerText = "Guest Account";
        elAccDetail.innerText = "Data stored on this device · Tap below to switch";
      }
    }
  }
};

window.AppDataUI = AppDataUI;
window.AppDataService = AppDataService;
window.saveGoalsChanges = () => AppDataUI.saveGoalsChanges();
window.saveProfileStatsChanges = () => AppDataUI.saveProfileStatsChanges();
window.saveAllProfileChanges = () => AppDataUI.saveAllProfileChanges();
window.saveProfile = () => AppDataUI.saveAllProfileChanges();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    AppDataService.init();
    AppDataUI.renderHome();
    AppDataUI.renderProfile();
  });
} else {
  AppDataService.init();
  AppDataUI.renderHome();
  AppDataUI.renderProfile();
}
