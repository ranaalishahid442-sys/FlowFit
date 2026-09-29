const AiWorkoutUI = {
  preferences: {
    mood: 'weight loss', // Actually default active is 'weight loss' for target
    time: 30,
    target: 'weight loss',
    equipment: ['body weight'],
    avoid: ''
  },
  
  select(btn, category, value) {
    const parent = btn.parentElement;
    parent.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--active'));
    btn.classList.add('chip--active');
    this.preferences[category] = value;
  },

  toggleMulti(btn, value) {
    btn.classList.toggle('chip--active');
    if (btn.classList.contains('chip--active')) {
      if (!this.preferences.equipment.includes(value)) {
        this.preferences.equipment.push(value);
      }
    } else {
      this.preferences.equipment = this.preferences.equipment.filter(e => e !== value);
    }
  },

  getPreferences() {
    this.preferences.avoid = document.getElementById('ai-avoid-input').value.trim();
    this.preferences.prompt = document.getElementById('ai-prompt-input').value.trim();
    return this.preferences;
  },

  showLoading(show) {
    document.getElementById('ai-loading-overlay').style.display = show ? 'flex' : 'none';
  }
};

// Default static routine in case API fails
const FALLBACK_ROUTINE = {
  workoutTitle: "Quick Bodyweight Blast",
  exercises: [
    { exerciseId: "3220", name: "skater hops", sets: 3, reps: "15 reps", restSeconds: 15, coachTip: "Keep your chest up and push off side to side." },
    { exerciseId: "3223", name: "star jump", sets: 3, reps: "12 reps", restSeconds: 15, coachTip: "Explode up and land softly." },
    { exerciseId: "3235", name: "v-up", sets: 3, reps: "10 reps", restSeconds: 15, coachTip: "Keep legs straight and reach for toes." }
  ]
};

const AiWorkoutService = {
  async getApiKey() {
    let key = localStorage.getItem('gemini_api_key');
    if (!key) {
      key = prompt('Please enter your AI Assistant API Key to use the AI Workout Generator:');
      if (key) {
        localStorage.setItem('gemini_api_key', key);
      }
    }
    return key;
  },

  async fetchCandidateExercises(preferences) {
    // Fetch a solid chunk of exercises to give Gemini options
    const url = 'https://oss.exercisedb.dev/api/v1/exercises?limit=150';
    try {
      const response = await fetch(url);
      const json = await response.json();
      let exercises = json.data || json; 
      
      if (preferences.equipment.length > 0) {
        exercises = exercises.filter(ex => 
          ex.equipments.some(eq => preferences.equipment.includes(eq.toLowerCase()))
        );
      }
      
      // Shuffle slightly and pick 80
      return exercises.sort(() => 0.5 - Math.random()).slice(0, 80);
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  async generate() {
    const apiKey = await this.getApiKey();
    if (!apiKey) return alert('API Key is required.');

    const prefs = AiWorkoutUI.getPreferences();
    if (prefs.equipment.length === 0) return alert('Please select at least one equipment type.');

    AiWorkoutUI.showLoading(true);

    try {
      const candidates = await this.fetchCandidateExercises(prefs);
      if (candidates.length === 0) throw new Error("No exercises found for your equipment.");

      const exerciseDBForGemini = candidates.map(c => ({
        id: c.exerciseId,
        name: c.name,
        target: c.targetMuscles.join(', '),
        equipment: c.equipments.join(', '),
      }));

      const promptText = `User Preferences:\n- Mood: ${prefs.mood || 'energetic'}\n- Time Available: ${prefs.time} minutes\n- Target: ${prefs.target}\n- Equipment: ${prefs.equipment.join(', ')}\n- Avoid: ${prefs.avoid || 'None'}
- Custom User Request: ${prefs.prompt || 'None'}\n\nEXERCISE_DATABASE:\n${JSON.stringify(exerciseDBForGemini)}`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: "You are a fitness workout planner for a mobile workout and yoga app.\nYour job is to generate a personalized workout routine using ONLY\nexercises from the provided exercise database below.\n\nSTRICT RULES:\n1. Only select exercises that exist in the EXERCISE_DATABASE list\n   provided in the user message. Never invent exercise names, IDs, or\n   instructions that are not in that list.\n2. Match the total workout duration to the user's available time\n   (including estimated rest periods between exercises).\n3. Adjust intensity based on the user's mood:\n   - energetic or motivated: higher intensity, more compound/strength moves\n   - tired or low energy: lighter, shorter sets, more mobility/yoga\n   - stressed: favor yoga, stretching, breathing-focused exercises\n   - sore or recovering: low-impact, avoid the specified sore muscle group\n4. Prioritize exercises that match the user's stated target.\n5. Only use exercises whose equipment field matches what the user has available.\n6. Return ONLY valid JSON matching the exact schema below. No extra text,\n   no markdown, no explanation outside the JSON.\n\nOUTPUT SCHEMA:\n{\n  \"workoutTitle\": \"string\",\n  \"estimatedDurationMinutes\": 0,\n  \"moodMatch\": \"string - one sentence on why this fits their mood/goal\",\n  \"exercises\": [\n    {\n      \"exerciseId\": \"string - must match an id from EXERCISE_DATABASE\",\n      \"name\": \"string - must match the database name exactly\",\n      \"sets\": 0,\n      \"reps\": \"string\",\n      \"restSeconds\": 0,\n      \"order\": 0,\n      \"coachTip\": \"string - max 15 words\"\n    }\n  ]\n}" }]
          },
          contents: [{
            role: "user",
            parts: [{ text: promptText }]
          }],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      });

      if (!response.ok) { const errBody = await response.text(); throw new Error(`API Error: ${response.status} - ${errBody}`); }

      const aiData = await response.json();
      let contentText = aiData.candidates[0].content.parts[0].text;
      contentText = contentText.replace(/^```json\n?/i, "").replace(/\n?```$/i, "").trim();
      const routine = JSON.parse(contentText);

      const validExercises = routine.exercises.map(aiEx => {
        const fullEx = candidates.find(c => c.exerciseId === aiEx.exerciseId);
        if (!fullEx) return null;
        return { ...fullEx, aiSets: aiEx.sets, aiReps: aiEx.reps, aiRest: aiEx.restSeconds, aiTip: aiEx.coachTip };
      }).filter(Boolean);

      if (validExercises.length === 0) throw new Error("AI returned invalid exercises.");

      // Defined in app.js
      if (typeof startRoutine === 'function') {
        showRoutinePreview(routine, validExercises);
      } else {
        alert("Routine ready, but startRoutine not hooked up!");
      }

    } catch (e) {
      console.error(e);
      alert("AI generation failed:\n" + e.message + "\n\nFalling back to default routine.");
      
      // Fallback
      const fallbackUrl = 'https://oss.exercisedb.dev/api/v1/exercises?limit=150';
      const fRes = await fetch(fallbackUrl);
      const fJson = await fRes.json();
      const db = fJson.data || fJson;
      const fallbackExs = (db || []).slice(0, 3).map(ex => ({
  ...ex,
  aiSets: 3,
  aiReps: "10-15 reps",
  aiRest: 15,
  aiTip: "Focus on form and breathe."
}));
      
      if (fallbackExs.length > 0 && typeof startRoutine === 'function') {
         showRoutinePreview({ workoutTitle: FALLBACK_ROUTINE.workoutTitle, estimatedDurationMinutes: 15, moodMatch: "A quick fallback routine built from local exercises." }, fallbackExs);
      }
    } finally {
      AiWorkoutUI.showLoading(false);
    }
  }
};
