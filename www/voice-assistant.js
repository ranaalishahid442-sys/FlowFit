/* ═══════════════════════════════════════════════════════
   ZenFit — Gemini-Powered Voice Assistant
   ═══════════════════════════════════════════════════════ */

const VoiceAssistant = {
  recognition: null,
  isListening: false,
  isSpeaking: false,
  hasGreeted: false,
  currentRoutine: null,
  currentExercises: [],

  init() {
    this.setupSpeechRecognition();
  },

  setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Speech recognition not supported in this browser.");
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => {
      this.isListening = true;
      this.updateOrbState('listening');
      this.setStatus('Listening... Tell me how you feel or what you want to do.');
      const micBtn = document.getElementById('voice-mic-btn');
      if (micBtn) micBtn.classList.add('voice-mic-btn--active');
    };

    this.recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const input = document.getElementById('voice-text-input');
      if (input) {
        input.value = finalTranscript || interimTranscript;
      }
    };

    this.recognition.onerror = (event) => {
      console.warn("Speech recognition error:", event.error);
      this.isListening = false;
      this.updateOrbState('idle');
      const micBtn = document.getElementById('voice-mic-btn');
      if (micBtn) micBtn.classList.remove('voice-mic-btn--active');
      
      if (event.error === 'not-allowed') {
        this.setStatus('Microphone access blocked. You can type below or allow mic permissions in browser settings.');
      } else if (event.error === 'no-speech') {
        this.setStatus("Didn't catch that. Tap the mic to try again or type below.");
      } else {
        this.setStatus('Voice input error. You can type your request below.');
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      const micBtn = document.getElementById('voice-mic-btn');
      if (micBtn) micBtn.classList.remove('voice-mic-btn--active');

      const input = document.getElementById('voice-text-input');
      const query = input ? input.value.trim() : '';

      if (query && query.length > 3) {
        this.updateOrbState('thinking');
        this.setStatus('Crafting your personalized workout routine...');
        this.askGemini(query);
      } else {
        this.updateOrbState('idle');
        this.setStatus('Tap the mic or select a quick option below.');
      }
    };
  },

  onOpen() {
    this.updateKeyBadge();
    
    // Initial greeting prompt
    const greeting = "What do you want to do today, or how are you feeling?";
    const statusEl = document.getElementById('voice-assistant-question');
    if (statusEl) statusEl.innerText = greeting;

    this.setStatus('Tap the mic or speak, or type your goal below.');
    this.updateOrbState('idle');

    // Assistant speaks greeting aloud
    setTimeout(() => {
      this.speak(greeting);
    }, 400);
  },

  toggleListen() {
    if (!this.recognition) {
      this.setupSpeechRecognition();
      if (!this.recognition) {
        alert("Speech recognition is not supported in this browser. Please type your workout request below.");
        return;
      }
    }

    if (this.isListening) {
      this.recognition.stop();
    } else {
      this.stopSpeaking();
      const input = document.getElementById('voice-text-input');
      if (input) input.value = '';
      try {
        this.recognition.start();
      } catch (e) {
        console.warn("Recognition start error:", e);
      }
    }
  },

  submitText() {
    const input = document.getElementById('voice-text-input');
    if (!input) return;
    const query = input.value.trim();
    if (!query) {
      alert("Please tell me how you are feeling or what you want to work on.");
      return;
    }
    this.stopSpeaking();
    this.updateOrbState('thinking');
    this.setStatus('Crafting your personalized workout routine...');
    this.askGemini(query);
  },

  useQuickPrompt(text) {
    const input = document.getElementById('voice-text-input');
    if (input) input.value = text;
    this.submitText();
  },

  async askGemini(userQuery) {
    let apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
      apiKey = prompt('Please enter your AI API Key to activate the Voice Assistant:');
      if (apiKey) {
        localStorage.setItem('gemini_api_key', apiKey.trim());
        this.updateKeyBadge();
      } else {
        this.updateOrbState('idle');
        this.setStatus('API key is required to recommend exercises.');
        return;
      }
    }

    this.showLoading(true);
    this.updateOrbState('thinking');

    try {
      const candidates = await this.fetchExercisePool();
      if (!candidates || candidates.length === 0) {
        throw new Error("Could not load exercise library.");
      }

      const exerciseDBForGemini = candidates.slice(0, 70).map(c => ({
        id: c.exerciseId,
        name: c.name,
        target: (c.targetMuscles || []).join(', '),
        bodyPart: (c.bodyParts || []).join(', '),
        equipment: (c.equipments || []).join(', ')
      }));

      let userGoal = 'general fitness';
      let userWeight = 70;
      if (window.DietService && window.DietService.profile) {
        userGoal = window.DietService.profile.goal || userGoal;
        userWeight = window.DietService.profile.weight || userWeight;
      }

      const systemPrompt = `You are an elite, empathetic AI Fitness & Yoga Voice Coach.
The user will tell you how they are feeling (e.g. stressed, energetic, sore, tired) or what they want to do today.
Your job:
1. Provide a warm, conversational spoken response (1 to 2 sentences MAX) directly addressing how they feel and encouraging them.
2. Select 3 to 5 exercises from the provided EXERCISE_DATABASE that BEST match their mood, physical state, and target.
   - If stressed / tight: recommend stretching, yoga, and spinal mobility.
   - If sore / recovering: choose low-impact restorative movements avoiding injured areas.
   - If energetic / motivated: choose compound strength, HIIT, or bodyweight burn.
   - If short on time: select effective compound exercises.
3. Only use exercises that exist in EXERCISE_DATABASE. Never invent IDs or exercise names.
4. Output STRICT JSON conforming to the schema below.

OUTPUT JSON SCHEMA:
{
  "spokenCoachResponse": "string - 1 to 2 short conversational sentences to be read aloud by the assistant",
  "workoutTitle": "string - e.g. Stressed Neck & Back Relief Routine",
  "reason": "string - one concise sentence explaining why this routine fits their state",
  "exercises": [
    {
      "exerciseId": "string - exact match to id in database",
      "name": "string - exact match to database name",
      "sets": 3,
      "reps": "string - e.g. 10 reps or 45 sec",
      "restSeconds": 20,
      "coachTip": "string - max 12 words form cue"
    }
  ]
}`;

      const userContent = `User Request / Feeling: "${userQuery}"
User Profile Goal: ${userGoal}, Weight: ${userWeight}kg
EXERCISE_DATABASE:
${JSON.stringify(exerciseDBForGemini)}`;

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          contents: [{
            role: 'user',
            parts: [{ text: userContent }]
          }],
          generationConfig: {
            responseMimeType: 'application/json'
          }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${errText}`);
      }

      const resJson = await response.json();
      let rawText = resJson.candidates[0].content.parts[0].text;
      rawText = rawText.replace(/^```json\n?/i, '').replace(/\n?```$/i, '').trim();
      const plan = JSON.parse(rawText);

      const matchedExercises = (plan.exercises || []).map(aiEx => {
        const full = candidates.find(c => c.exerciseId === aiEx.exerciseId || c.name.toLowerCase() === aiEx.name.toLowerCase());
        if (!full) return null;
        return {
          ...full,
          aiSets: aiEx.sets || 3,
          aiReps: aiEx.reps || "10-12 reps",
          aiRest: aiEx.restSeconds || 20,
          aiTip: aiEx.coachTip || "Maintain steady breath and proper posture."
        };
      }).filter(Boolean);

      if (matchedExercises.length === 0) {
        throw new Error("No matching exercises found from database.");
      }

      this.currentRoutine = plan;
      this.currentExercises = matchedExercises;

      this.renderRecommendations(plan, matchedExercises);
      this.updateOrbState('speaking');
      this.setStatus('Here are your personalized exercises:');

      if (plan.spokenCoachResponse) {
        this.speak(plan.spokenCoachResponse);
      }

    } catch (err) {
      console.error("Gemini assistant error:", err);
      this.updateOrbState('idle');
      this.setStatus("Couldn't connect to AI Coach. Check your connection or API key.");
      this.renderFallbackRecommendations(userQuery);
    } finally {
      this.showLoading(false);
    }
  },

  async fetchExercisePool() {
    try {
      const res = await fetch('https://oss.exercisedb.dev/api/v1/exercises?limit=150');
      const json = await res.json();
      return json.data || json || [];
    } catch (e) {
      console.warn("ExerciseDB live fetch failed, using local fallback", e);
      if (typeof exerciseDB !== 'undefined' && Array.isArray(exerciseDB)) {
        return exerciseDB.map(ex => ({
          exerciseId: ex.id,
          name: ex.name,
          gifUrl: '',
          targetMuscles: ex.primaryMuscles || [],
          bodyParts: [ex.category || 'general'],
          equipments: [ex.equipment || 'bodyweight']
        }));
      }
      return [];
    }
  },

  renderRecommendations(plan, exercises) {
    const container = document.getElementById('voice-results-container');
    if (!container) return;

    container.style.display = 'block';

    let exercisesHtml = exercises.map((ex, i) => `
      <div class="voice-exercise-card" onclick="VoiceAssistant.openExercise('${ex.exerciseId}')" style="cursor:pointer; display:flex; gap:14px; background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:12px; align-items:center; box-shadow:0 2px 6px rgba(0,0,0,0.03); margin-bottom:12px;">
        <div style="width:68px; height:68px; border-radius:10px; overflow:hidden; background:#f1f5f9; flex-shrink:0;">
          <img src="${ex.gifUrl || ''}" alt="${ex.name}" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'68\\' height=\\'68\\' fill=\\'%23e2e8f0\\'><rect width=\\'100%\\' height=\\'100%\\'/></svg>'">
        </div>
        <div style="flex:1; min-width:0;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.75rem; font-weight:700; color:var(--purple); text-transform:uppercase;">Exercise ${i + 1}</span>
            <span style="font-size:0.75rem; color:#64748b; font-weight:600;">${ex.aiSets} sets × ${ex.aiReps}</span>
          </div>
          <h4 style="margin:2px 0 4px; font-size:1rem; color:#001F3F; text-transform:capitalize; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${ex.name}</h4>
          <p style="margin:0; font-size:0.8rem; color:#64748b; font-style:italic;">💡 ${ex.aiTip}</p>
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    `).join('');

    container.innerHTML = `
      <div style="background:linear-gradient(135deg, #001F3F, #1E3A8A); border-radius:16px; padding:18px; color:#fff; margin-bottom:20px; box-shadow:0 8px 24px rgba(0,31,63,0.2);">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
          <span style="font-size:1.2rem;">🎙️</span>
          <span style="font-size:0.8rem; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#93C5FD;">Smart Coach Advice</span>
        </div>
        <p style="margin:0 0 10px; font-size:1.05rem; font-weight:600; line-height:1.4;">"${plan.spokenCoachResponse || plan.reason}"</p>
        <div style="font-size:0.85rem; color:#E0E7FF; opacity:0.9;"><strong>Routine:</strong> ${plan.workoutTitle}</div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h3 style="margin:0; font-size:1.15rem; color:#001F3F; font-weight:800;">Recommended Exercises (${exercises.length})</h3>
        <button onclick="VoiceAssistant.startRoutine()" style="background:#001F3F; color:#fff; border:none; padding:8px 16px; border-radius:8px; font-weight:700; font-size:0.85rem; cursor:pointer; display:flex; align-items:center; gap:6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Start Routine
        </button>
      </div>

      <div class="voice-exercise-list">
        ${exercisesHtml}
      </div>

      <button onclick="VoiceAssistant.startRoutine()" style="width:100%; padding:14px; background:linear-gradient(135deg, #001F3F, #3B82F6); color:#fff; border:none; border-radius:12px; font-weight:800; font-size:1.05rem; cursor:pointer; box-shadow:0 4px 14px rgba(0,31,63,0.25); margin-top:8px;">
        Start Complete Routine Now
      </button>
    `;

    setTimeout(() => {
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
  },

  renderFallbackRecommendations(userQuery) {
    const container = document.getElementById('voice-results-container');
    if (!container) return;

    container.style.display = 'block';
    container.innerHTML = `
      <div style="background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:18px; text-align:center;">
        <h4 style="color:#001F3F; margin:0 0 8px;">AI Key Required</h4>
        <p style="color:#64748b; font-size:0.9rem; margin-bottom:14px;">To get custom AI exercise recommendations based on how you feel, please enter your API key.</p>
        <button onclick="VoiceAssistant.promptApiKey()" style="background:#001F3F; color:#fff; border:none; padding:10px 20px; border-radius:8px; font-weight:700; cursor:pointer;">Enter API Key</button>
      </div>
    `;
  },

  openExercise(id) {
    const ex = this.currentExercises.find(e => e.exerciseId === id);
    if (ex && typeof openExerciseDetail === 'function') {
      openExerciseDetail(ex);
      navigate('workout-detail');
    }
  },

  startRoutine() {
    if (!this.currentExercises || this.currentExercises.length === 0) return;
    const title = (this.currentRoutine && this.currentRoutine.workoutTitle) || "AI Voice Routine";
    
    if (typeof showRoutinePreview === 'function') {
      showRoutinePreview({
        workoutTitle: title,
        estimatedDurationMinutes: this.currentExercises.length * 4,
        moodMatch: (this.currentRoutine && this.currentRoutine.spokenCoachResponse) || "Personalized voice routine."
      }, this.currentExercises);
    } else if (typeof startRoutine === 'function') {
      startRoutine(title, this.currentExercises);
    }
  },

  speak(text) {
    if (window.VoiceGuideService && typeof window.VoiceGuideService.speak === 'function') {
      VoiceGuideService.speak(text, 'high');
    } else if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  },

  stopSpeaking() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.updateOrbState('idle');
  },

  updateOrbState(state) {
    const orb = document.getElementById('voice-orb');
    if (!orb) return;
    orb.className = 'voice-orb voice-orb--' + state;
  },

  setStatus(text) {
    const statusEl = document.getElementById('voice-status-text');
    if (statusEl) statusEl.innerText = text;
  },

  showLoading(show) {
    const overlay = document.getElementById('voice-loading-overlay');
    if (overlay) overlay.style.display = show ? 'flex' : 'none';
  },

  promptApiKey() {
    const existing = localStorage.getItem('gemini_api_key') || '';
    const key = prompt('Enter your AI Assistant API Key:', existing);
    if (key !== null) {
      localStorage.setItem('gemini_api_key', key.trim());
      this.updateKeyBadge();
      alert(key.trim() ? "AI API Key saved!" : "API Key cleared.");
    }
  },

  updateKeyBadge() {
    const badge = document.getElementById('voice-api-badge');
    if (!badge) return;
    const key = localStorage.getItem('gemini_api_key');
    if (key) {
      badge.innerHTML = `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10B981;"></span> AI Coach`;
      badge.style.borderColor = '#10B981';
      badge.style.color = '#065F46';
    } else {
      badge.innerHTML = `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#F59E0B;"></span> Set AI Key`;
      badge.style.borderColor = '#F59E0B';
      badge.style.color = '#92400E';
    }
  }
};

window.VoiceAssistant = VoiceAssistant;
document.addEventListener('DOMContentLoaded', () => {
  VoiceAssistant.init();
});
