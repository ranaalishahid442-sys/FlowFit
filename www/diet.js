const DietService = {
  profile: { age: 30, gender: 'male', height: 175, weight: 75, targetWeight: 68, activity: 'active', goal: 'lose', dailyCalorieTarget: 2200 },
  weightHistory: [],
  dietLog: [],
  currentScanData: null,
  currentScanBase64: null,

  init() {
    // Load data
    const p = localStorage.getItem('fitly_profile');
    if (p) {
      try { this.profile = JSON.parse(p); } catch (e) {}
    }
    
    const w = localStorage.getItem('fitly_weights');
    if (w) {
      try { this.weightHistory = JSON.parse(w); } catch (e) {}
    } else {
      this.weightHistory = [{ date: new Date().toISOString(), weight: this.profile.weight }];
    }
    
    const d = localStorage.getItem('fitly_diet');
    if (d) {
      try { this.dietLog = JSON.parse(d); } catch (e) {}
    }

    // Populate UI Profile safely
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined) el.value = val;
    };
    setVal('prof-age', this.profile.age);
    setVal('prof-gender', this.profile.gender);
    setVal('prof-height', this.profile.height);
    setVal('prof-target', this.profile.targetWeight);
    setVal('prof-activity', this.profile.activity);
    setVal('prof-goal', this.profile.goal);

    DietUI.renderDashboard();
    DietUI.renderWeightChart();
  },

  updateProfile() {
    const getVal = (id, fallback) => {
      const el = document.getElementById(id);
      return el ? el.value : fallback;
    };

    this.profile.age = parseInt(getVal('prof-age', this.profile.age)) || 30;
    this.profile.gender = getVal('prof-gender', this.profile.gender) || 'male';
    this.profile.height = parseInt(getVal('prof-height', this.profile.height)) || 175;
    this.profile.targetWeight = parseInt(getVal('prof-target', this.profile.targetWeight)) || 68;
    this.profile.activity = getVal('prof-activity', this.profile.activity) || 'active';
    this.profile.goal = getVal('prof-goal', this.profile.goal) || 'lose';

    // Latest weight from history if exists
    if (this.weightHistory && this.weightHistory.length > 0) {
      this.profile.weight = this.weightHistory[this.weightHistory.length - 1].weight;
    }

    // BMR Calculation (Mifflin-St Jeor)
    let bmr = (10 * this.profile.weight) + (6.25 * this.profile.height) - (5 * this.profile.age);
    bmr += (this.profile.gender === 'male') ? 5 : -161;

    const mults = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very: 1.9 };
    let tdee = bmr * (mults[this.profile.activity] || 1.2);

    if (this.profile.goal === 'lose') tdee -= 500;
    if (this.profile.goal === 'gain') tdee += 300;

    this.profile.dailyCalorieTarget = Math.max(1200, Math.round(tdee));
    localStorage.setItem('fitly_profile', JSON.stringify(this.profile));
    
    DietUI.renderDashboard();
    DietUI.renderWeightChart();
    if (window.AppDataUI) {
      if (typeof window.AppDataUI.renderHome === 'function') window.AppDataUI.renderHome();
      if (typeof window.AppDataUI.renderProfile === 'function') window.AppDataUI.renderProfile();
    }
  },

  saveWeight() {
    const w = parseFloat(document.getElementById('weight-input').value);
    if (!w) return;
    this.weightHistory.push({ date: new Date().toISOString(), weight: w });
    localStorage.setItem('fitly_weights', JSON.stringify(this.weightHistory));
    document.getElementById('weight-modal').style.display = 'none';
    this.updateProfile(); // recalculates macros with new weight & syncs UI
    DietUI.renderWeightChart();
    if (window.AppDataUI && typeof window.AppDataUI.showSyncToast === 'function') {
      window.AppDataUI.showSyncToast('✓ Weight logged & synced');
    }
  },

  async handleScan(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // Read to Base64
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64Str = ev.target.result.split(',')[1];
      this.currentScanBase64 = ev.target.result;
      document.getElementById('scan-preview-img').src = ev.target.result;
      
      navigate('diet-scan');
      document.getElementById('diet-loading-overlay').style.display = 'flex';
      
      await this.processImage(base64Str, file.type);
    };
    reader.readAsDataURL(file);
  },

  async processImage(base64, mimeType) {
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
      alert("Please add your AI Assistant API Key in Profile or Voice Assistant settings first.");
      document.getElementById('diet-loading-overlay').style.display = 'none';
      return navigate('diet');
    }

    const prompt = `Analyze this food image. Identify each distinct food item visible and estimate its portion size and nutritional content. Be conservative and note that portion size from an image is an estimate, not exact. Return ONLY valid JSON in this schema, no extra text:
{
  "items": [
    {
      "name": "string",
      "estimatedPortion": "string (e.g. 1 cup, 150g)",
      "calories": 0,
      "proteinGrams": 0,
      "carbsGrams": 0,
      "fatGrams": 0,
      "confidence": "low|medium|high"
    }
  ],
  "totalCalories": 0,
  "note": "string - one short note if anything is uncertain"
}`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: prompt },
              { inlineData: { mimeType: mimeType, data: base64 } }
            ]
          }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      if (!response.ok) throw new Error("API Error: " + response.status);
      const data = await response.json();
      
      let rawJson = data.candidates[0].content.parts[0].text;
      rawJson = rawJson.replace(/^```json\n?/i, '').replace(/\n?```$/i, '').trim();
      
      this.currentScanData = JSON.parse(rawJson);
      DietUI.renderScanResults(this.currentScanData);

    } catch(e) {
      alert("Failed to analyze image. Please try again or use manual entry.\n" + e.message);
      navigate('diet');
    } finally {
      document.getElementById('diet-loading-overlay').style.display = 'none';
      // clear input so it triggers change again if same file selected
      document.getElementById('diet-file-input').value = ""; 
    }
  },

  confirmLog() {
    if (!this.currentScanData) return;
    
    // Read edited values from UI
    const items = [];
    let totalCal = 0, totalPro = 0, totalCarb = 0, totalFat = 0;
    
    document.querySelectorAll('.food-item-edit').forEach((el, idx) => {
      const orig = this.currentScanData.items[idx];
      const scale = parseFloat(el.querySelector('.portion-slider').value);
      const name = el.querySelector('.item-name').value;
      
      const cal = Math.round(orig.calories * scale);
      const pro = Math.round(orig.proteinGrams * scale);
      const car = Math.round(orig.carbsGrams * scale);
      const fat = Math.round(orig.fatGrams * scale);
      
      totalCal += cal; totalPro += pro; totalCarb += car; totalFat += fat;
      
      items.push({ name, portion: `x${scale.toFixed(1)} ${orig.estimatedPortion}`, calories: cal, proteinGrams: pro, carbsGrams: car, fatGrams: fat });
    });

    const logEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      thumbnail: this.currentScanBase64,
      items,
      totalCalories: totalCal,
      totalPro, totalCarb, totalFat,
      tip: "Analyzing meal..."
    };

    this.dietLog.push(logEntry);
    localStorage.setItem('fitly_diet', JSON.stringify(this.dietLog));
    
    navigate('diet');
    DietUI.renderDashboard();
    if (window.AppDataUI && typeof window.AppDataUI.renderHome === 'function') {
      window.AppDataUI.renderHome();
    }

    // Trigger background tip generation
    this.fetchAiTip(logEntry);
  },

  async fetchAiTip(entry) {
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) return;

    // Calculate remaining
    const today = new Date().toDateString();
    const todaysLogs = this.dietLog.filter(l => new Date(l.timestamp).toDateString() === today);
    const consumed = todaysLogs.reduce((s, l) => s + (l.totalCalories || 0), 0);
    const remaining = Math.max(0, this.profile.dailyCalorieTarget - consumed);

    const prompt = `Given the user's remaining daily calorie budget (${remaining} kcal) and goal (${this.profile.goal} weight), and the meal they just logged (${entry.totalCalories} kcal, Pro: ${entry.totalPro}g, Carbs: ${entry.totalCarb}g, Fat: ${entry.totalFat}g), give ONE short, encouraging, practical nutrition suggestion for their next meal today. Do not give medical advice, do not suggest restrictive or extreme diets, keep it strictly UNDER 30 words.`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await response.json();
      const tip = data.candidates[0].content.parts[0].text;
      
      entry.tip = tip;
      localStorage.setItem('fitly_diet', JSON.stringify(this.dietLog));
      DietUI.renderDashboard(); // refresh to show tip
    } catch(e) {
      console.log("Tip fetch failed", e);
    }
  }
};

const DietUI = {
  openWeightModal() {
    document.getElementById('weight-modal').style.display = 'flex';
  },

  currentManualMealType: 'Breakfast',
  currentManualNutrition: null,

  showManualEntry() {
    const modal = document.getElementById('manual-diet-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    
    // Reset state
    this.currentManualNutrition = null;
    const nameInput = document.getElementById('manual-food-name');
    if (nameInput) {
      nameInput.value = '';
      setTimeout(() => nameInput.focus(), 100);
    }
    const weightInput = document.getElementById('manual-food-weight');
    if (weightInput) weightInput.value = '150';
    
    const unitSelect = document.getElementById('manual-food-unit');
    if (unitSelect) unitSelect.value = 'grams';

    const resCard = document.getElementById('manual-calc-result');
    if (resCard) resCard.style.display = 'none';

    const calcBtn = document.getElementById('manual-calc-btn');
    if (calcBtn) {
      calcBtn.disabled = false;
      calcBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
        <span id="manual-calc-btn-text">Calculate Calories with AI</span>
      `;
    }
  },

  closeManualEntry() {
    const modal = document.getElementById('manual-diet-modal');
    if (modal) modal.style.display = 'none';
  },

  setManualMealType(type, btn) {
    this.currentManualMealType = type;
    document.querySelectorAll('.mdm-meal-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
  },

  setQuickFood(name, weight, unit) {
    const nameInput = document.getElementById('manual-food-name');
    if (nameInput) nameInput.value = name;
    
    if (weight) {
      const weightInput = document.getElementById('manual-food-weight');
      if (weightInput) weightInput.value = weight;
    }
    if (unit) {
      const unitSelect = document.getElementById('manual-food-unit');
      if (unitSelect) unitSelect.value = unit;
    }
    this.calculateManualNutrition();
  },

  setQuickWeight(weight) {
    const weightInput = document.getElementById('manual-food-weight');
    if (weightInput) weightInput.value = weight;
    const unitSelect = document.getElementById('manual-food-unit');
    if (unitSelect) unitSelect.value = 'grams';
    
    const nameInput = document.getElementById('manual-food-name');
    if (nameInput && nameInput.value.trim().length > 1) {
      this.calculateManualNutrition();
    }
  },

  onManualInputChange() {
    const calcBtnText = document.getElementById('manual-calc-btn-text');
    if (calcBtnText && this.currentManualNutrition) {
      calcBtnText.innerText = 'Recalculate with AI';
    }
  },

  estimateNutritionFallback(foodName, weight, unit) {
    // Intelligent heuristic fallback dictionary per 100g
    const db = [
      { key: 'chicken', cal: 165, pro: 31, car: 0, fat: 3.6, note: 'High lean protein source' },
      { key: 'breast', cal: 165, pro: 31, car: 0, fat: 3.6, note: 'High lean protein source' },
      { key: 'beef', cal: 250, pro: 26, car: 0, fat: 15, note: 'Rich in protein and iron' },
      { key: 'egg', cal: 143, pro: 13, car: 0.7, fat: 9.5, note: 'Complete bioavailable protein' },
      { key: 'rice', cal: 130, pro: 2.7, car: 28, fat: 0.3, note: 'Clean carbohydrate energy' },
      { key: 'biryani', cal: 180, pro: 8, car: 24, fat: 6, note: 'Flavorful spiced rice dish' },
      { key: 'salmon', cal: 208, pro: 20, car: 0, fat: 13, note: 'Rich in Omega-3 fatty acids' },
      { key: 'fish', cal: 120, pro: 22, car: 0, fat: 3, note: 'Lean aquatic protein' },
      { key: 'oat', cal: 150, pro: 5, car: 27, fat: 2.5, note: 'High soluble fiber grain' },
      { key: 'yogurt', cal: 97, pro: 9, car: 4, fat: 5, note: 'Probiotic protein snack' },
      { key: 'milk', cal: 60, pro: 3.2, car: 4.8, fat: 3.3, note: 'Calcium and protein beverage' },
      { key: 'bread', cal: 265, pro: 9, car: 49, fat: 3.2, note: 'Complex carbohydrate staple' },
      { key: 'apple', cal: 52, pro: 0.3, car: 14, fat: 0.2, note: 'Natural fruit sugar & pectin' },
      { key: 'banana', cal: 89, pro: 1.1, car: 23, fat: 0.3, note: 'Potassium-rich energy source' },
      { key: 'salad', cal: 45, pro: 1.5, car: 6, fat: 2, note: 'Nutrient-dense leafy greens' },
      { key: 'pasta', cal: 157, pro: 5.8, car: 31, fat: 0.9, note: 'Classic carbohydrate meal' },
      { key: 'pizza', cal: 266, pro: 11, car: 33, fat: 10, note: 'Calorie dense comfort meal' },
      { key: 'burger', cal: 250, pro: 13, car: 25, fat: 11, note: 'Savory protein sandwich' }
    ];

    const lower = foodName.toLowerCase();
    const match = db.find(item => lower.includes(item.key)) || {
      cal: 150, pro: 8, car: 20, fat: 5, note: 'Balanced nutritional profile estimate'
    };

    let grams = parseFloat(weight) || 100;
    if (unit === 'oz') grams *= 28.35;
    if (unit === 'pieces') grams *= 60;
    if (unit === 'cups') grams *= 200;
    if (unit === 'servings') grams *= 150;
    if (unit === 'ml') grams *= 1.0;

    const mult = Math.max(0.1, grams / 100);
    return {
      foodName,
      portion: `${weight} ${unit}`,
      calories: Math.max(10, Math.round(match.cal * mult)),
      proteinGrams: Math.round(match.pro * mult),
      carbsGrams: Math.round(match.car * mult),
      fatGrams: Math.round(match.fat * mult),
      note: match.note
    };
  },

  async calculateManualNutrition() {
    const nameInput = document.getElementById('manual-food-name');
    const weightInput = document.getElementById('manual-food-weight');
    const unitSelect = document.getElementById('manual-food-unit');

    const foodName = nameInput ? nameInput.value.trim() : '';
    const weight = weightInput ? parseFloat(weightInput.value) || 100 : 100;
    const unit = unitSelect ? unitSelect.value : 'grams';

    if (!foodName) {
      if (nameInput) {
        nameInput.focus();
        nameInput.style.borderColor = '#EF4444';
        setTimeout(() => nameInput.style.borderColor = '', 1500);
      }
      return;
    }

    const calcBtn = document.getElementById('manual-calc-btn');
    if (calcBtn) {
      calcBtn.disabled = true;
      calcBtn.innerHTML = `
        <div class="spinner" style="width:16px; height:16px; border:2px solid #fff; border-top:2px solid transparent; border-radius:50%; animation:spin 1s linear infinite;"></div>
        <span>Calculating with AI...</span>
      `;
    }

    const apiKey = localStorage.getItem('gemini_api_key');
    let result = null;

    if (apiKey && apiKey.trim().length > 0) {
      const prompt = `You are a certified sports nutritionist. Calculate the accurate calories and macronutrients for this eaten food:
Food Item: "${foodName}"
Portion / Quantity: "${weight} ${unit}"
Meal: "${this.currentManualMealType || 'Meal'}"

Return ONLY valid JSON matching this schema exactly (no markdown backticks, no explanatory text):
{
  "foodName": "${foodName}",
  "portion": "${weight} ${unit}",
  "calories": 0,
  "proteinGrams": 0,
  "carbsGrams": 0,
  "fatGrams": 0,
  "note": "Short 1-sentence nutritional highlight"
}`;

      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
          })
        });

        if (response.ok) {
          const data = await response.json();
          let raw = data.candidates[0].content.parts[0].text;
          raw = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
          result = JSON.parse(raw);
        } else {
          console.warn('Gemini API call returned status', response.status);
        }
      } catch (err) {
        console.warn('AI calculation online failed, using intelligent estimate', err);
      }
    }

    // Fallback if no API key or API call failed
    if (!result || !result.calories) {
      result = this.estimateNutritionFallback(foodName, weight, unit);
    }

    // Save to instance
    this.currentManualNutrition = {
      foodName: result.foodName || foodName,
      portion: `${weight} ${unit}`,
      calories: Math.max(1, Math.round(result.calories || 100)),
      protein: Math.max(0, Math.round(result.proteinGrams || 0)),
      carbs: Math.max(0, Math.round(result.carbsGrams || 0)),
      fat: Math.max(0, Math.round(result.fatGrams || 0)),
      note: result.note || 'Nutritional breakdown estimated'
    };

    // Render result card in modal
    const resCard = document.getElementById('manual-calc-result');
    if (resCard) {
      resCard.style.display = 'flex';
      const elCals = document.getElementById('manual-res-cals');
      if (elCals) elCals.innerText = this.currentManualNutrition.calories;

      const elPro = document.getElementById('manual-res-pro');
      if (elPro) elPro.innerText = this.currentManualNutrition.protein + 'g';

      const elCar = document.getElementById('manual-res-car');
      if (elCar) elCar.innerText = this.currentManualNutrition.carbs + 'g';

      const elFat = document.getElementById('manual-res-fat');
      if (elFat) elFat.innerText = this.currentManualNutrition.fat + 'g';

      const elNote = document.getElementById('manual-res-note');
      if (elNote) elNote.innerText = this.currentManualNutrition.note;
    }

    if (calcBtn) {
      calcBtn.disabled = false;
      calcBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34D399" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        <span id="manual-calc-btn-text">✓ Nutrition Calculated</span>
      `;
    }
  },

  async saveManualDietEntry() {
    // If not calculated yet, compute it now
    if (!this.currentManualNutrition) {
      await this.calculateManualNutrition();
    }

    if (!this.currentManualNutrition) return;

    const data = this.currentManualNutrition;
    const logEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      mealType: this.currentManualMealType || 'Meal',
      thumbnail: '',
      items: [{
        name: data.foodName,
        portion: data.portion,
        calories: data.calories,
        proteinGrams: data.protein,
        carbsGrams: data.carbs,
        fatGrams: data.fat
      }],
      totalCalories: data.calories,
      totalPro: data.protein,
      totalCarb: data.carbs,
      totalFat: data.fat,
      tip: data.note || `${data.foodName} (${data.portion})`
    };

    DietService.dietLog.push(logEntry);
    localStorage.setItem('fitly_diet', JSON.stringify(DietService.dietLog));

    this.closeManualEntry();
    this.renderDashboard();

    if (window.AppDataUI) {
      if (typeof window.AppDataUI.renderHome === 'function') {
        window.AppDataUI.renderHome();
      }
      if (typeof window.AppDataUI.showSyncToast === 'function') {
        window.AppDataUI.showSyncToast(`✓ Logged ${data.foodName} (${data.calories} kcal)`);
      }
    }
  },

  deleteEntry(id) {
    if(!confirm("Delete this entry?")) return;
    DietService.dietLog = DietService.dietLog.filter(l => l.id !== id);
    localStorage.setItem('fitly_diet', JSON.stringify(DietService.dietLog));
    this.renderDashboard();
    if (window.AppDataUI && typeof window.AppDataUI.renderHome === 'function') {
      window.AppDataUI.renderHome();
    }
  },

  renderDashboard() {
    const today = new Date().toDateString();
    const todaysLogs = (DietService.dietLog || []).filter(l => {
      try {
        const d = l.timestamp || l.date || l.dateISO;
        return d && new Date(d).toDateString() === today;
      } catch (e) {
        return false;
      }
    });
    
    let eaten = 0, pro = 0, car = 0, fat = 0;
    todaysLogs.forEach(l => {
      eaten += Math.max(0, Number(l.totalCalories) || 0);
      pro += Math.max(0, Number(l.totalPro) || 0);
      car += Math.max(0, Number(l.totalCarb) || 0);
      fat += Math.max(0, Number(l.totalFat) || 0);
    });

    const target = (DietService.profile && Number(DietService.profile.dailyCalorieTarget)) || 2000;
    
    const elEaten = document.getElementById('diet-cal-eaten');
    if (elEaten) elEaten.innerText = eaten;
    const elTarget = document.getElementById('diet-cal-target');
    if (elTarget) elTarget.innerText = target;
    
    const ring = document.getElementById('diet-cal-ring');
    if (ring) {
      const c = 339; // dasharray
      const pct = Math.min(eaten / (target || 1), 1);
      ring.style.strokeDashoffset = c - (c * pct);
      ring.style.stroke = pct >= 1 ? '#f59e0b' : '#001F3F'; // orange if over target
    }

    // Macros approx targets (Rule of thumb: 30% pro, 40% carb, 30% fat)
    const proTarget = Math.round((target * 0.3) / 4);
    const carTarget = Math.round((target * 0.4) / 4);
    const fatTarget = Math.round((target * 0.3) / 9);

    const elProText = document.getElementById('diet-pro-text');
    if (elProText) elProText.innerText = `${pro}g / ${proTarget}g`;
    const elCarText = document.getElementById('diet-car-text');
    if (elCarText) elCarText.innerText = `${car}g / ${carTarget}g`;
    const elFatText = document.getElementById('diet-fat-text');
    if (elFatText) elFatText.innerText = `${fat}g / ${fatTarget}g`;

    const elProBar = document.getElementById('diet-pro-bar');
    if (elProBar) elProBar.style.width = Math.min((pro / (proTarget || 1)) * 100, 100) + '%';
    const elCarBar = document.getElementById('diet-car-bar');
    if (elCarBar) elCarBar.style.width = Math.min((car / (carTarget || 1)) * 100, 100) + '%';
    const elFatBar = document.getElementById('diet-fat-bar');
    if (elFatBar) elFatBar.style.width = Math.min((fat / (fatTarget || 1)) * 100, 100) + '%';

    // List
    const listEl = document.getElementById('diet-log-list');
    listEl.innerHTML = '';
    
    if (todaysLogs.length === 0) {
      listEl.innerHTML = `<p style="color:#94a3b8; font-size:0.9rem; text-align:center; padding:20px;">No meals logged today yet.</p>`;
    }
    
    todaysLogs.slice().reverse().forEach(log => {
      const div = document.createElement('div');
      div.style.cssText = 'background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:14px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);';
      
      const mealIcons = {
        'Breakfast': '🌅',
        'Lunch': '☀️',
        'Dinner': '🌙',
        'Snack': '🥪'
      };
      const mealEmoji = mealIcons[log.mealType] || '🍽️';

      const itemsList = Array.isArray(log.items) ? log.items : [];
      const names = itemsList.map(i => {
        const portionStr = i.portion ? ` <span style="font-weight:500; font-size:0.8rem; color:#64748b;">(${i.portion})</span>` : '';
        return `${i.name || 'Food'}${portionStr}`;
      }).join(', ') || (log.tip || 'Meal');

      const thumbHtml = log.thumbnail ? 
        `<img src="${log.thumbnail}" style="width:52px; height:52px; border-radius:12px; object-fit:cover; flex-shrink:0;">` : 
        `<div style="width:52px; height:52px; border-radius:12px; background:linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%); display:flex; align-items:center; justify-content:center; font-size:1.6rem; flex-shrink:0; border:1px solid #E2E8F0;">${mealEmoji}</div>`;
      
      div.innerHTML = `
        <div style="display:flex; gap:12px; align-items:center;">
          ${thumbHtml}
          <div style="flex:1; min-width:0;">
            <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">
              ${log.mealType ? `<span style="font-size:0.68rem; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; background:rgba(0,31,63,0.06); color:#001F3F; padding:2px 7px; border-radius:4px;">${log.mealType}</span>` : ''}
            </div>
            <div style="display:flex; justify-content:space-between; align-items:baseline; gap:8px;">
              <h4 style="margin:0; color:#001F3F; font-size:0.95rem; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${names}</h4>
              <span style="font-weight:800; color:#001F3F; font-size:0.95rem; white-space:nowrap;">${log.totalCalories || 0} kcal</span>
            </div>
            <p style="margin:4px 0 0; color:#64748b; font-size:0.78rem;">Pro: <b>${log.totalPro || 0}g</b> • Carbs: <b>${log.totalCarb || 0}g</b> • Fat: <b>${log.totalFat || 0}g</b></p>
          </div>
          <button onclick="DietUI.deleteEntry('${log.id}')" style="background:none; border:none; color:#94a3b8; padding:8px; cursor:pointer; border-radius:8px; display:flex; align-items:center; justify-content:center;" title="Delete">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
        ${log.tip ? `<div style="margin-top:10px; padding:8px 12px; background:#F8FAFC; border-left:3px solid #3B82F6; border-radius:6px; font-size:0.8rem; color:#475569; font-style:italic;">"${log.tip}"</div>` : ''}
      `;
      listEl.appendChild(div);
    });

    if (window.AppDataUI && typeof window.AppDataUI.renderHome === 'function') {
      window.AppDataUI.renderHome();
    }
  },

  renderScanResults(data) {
    const container = document.getElementById('scan-items-container');
    container.innerHTML = '';
    
    if (data.note) {
      container.innerHTML += `<div style="background:#fff3cd; color:#856404; padding:12px; border-radius:8px; font-size:0.85rem; margin-bottom:8px;"><b>AI Note:</b> ${data.note}</div>`;
    }

    data.items.forEach((item, idx) => {
      const div = document.createElement('div');
      div.className = 'food-item-edit';
      div.style.cssText = 'background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:16px; box-shadow:0 2px 4px rgba(0,0,0,0.02);';
      div.dataset.index = idx;
      
      div.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:12px;">
          <input type="text" class="item-name" value="${item.name}" style="font-size:1.1rem; font-weight:700; color:#001F3F; border:none; border-bottom:1px dashed #cbd5e1; padding-bottom:4px; outline:none;">
          <div style="display:flex; justify-content:space-between; color:#64748b; font-size:0.9rem;">
            <span>Estimated: ${item.estimatedPortion}</span>
            <span style="font-weight:700; color:#0f172a;"><span class="dyn-cal">${item.calories}</span> kcal</span>
          </div>
          <div>
            <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:0.85rem; font-weight:600; color:#001F3F;">
              <span>Adjust Portion: <span class="scale-lbl">1.0x</span></span>
            </div>
            <input type="range" class="portion-slider" min="0.1" max="3" step="0.1" value="1" oninput="DietUI.recalcScanTotals()" style="width:100%; accent-color:#001F3F;">
          </div>
          <div style="display:flex; gap:12px; font-size:0.8rem; color:#64748b; justify-content:space-between; background:#f8fafc; padding:8px; border-radius:6px;">
            <span>Pro: <span class="dyn-pro">${item.proteinGrams}</span>g</span>
            <span>Carbs: <span class="dyn-car">${item.carbsGrams}</span>g</span>
            <span>Fat: <span class="dyn-fat">${item.fatGrams}</span>g</span>
          </div>
        </div>
      `;
      container.appendChild(div);
    });
    
    this.recalcScanTotals();
  },

  recalcScanTotals() {
    if (!DietService.currentScanData) return;
    
    let totalCal = 0;
    document.querySelectorAll('.food-item-edit').forEach((el, idx) => {
      const orig = DietService.currentScanData.items[idx];
      const scale = parseFloat(el.querySelector('.portion-slider').value);
      
      el.querySelector('.scale-lbl').innerText = scale.toFixed(1) + 'x';
      
      const c = Math.round(orig.calories * scale);
      const p = Math.round(orig.proteinGrams * scale);
      const cb = Math.round(orig.carbsGrams * scale);
      const f = Math.round(orig.fatGrams * scale);
      
      el.querySelector('.dyn-cal').innerText = c;
      el.querySelector('.dyn-pro').innerText = p;
      el.querySelector('.dyn-car').innerText = cb;
      el.querySelector('.dyn-fat').innerText = f;
      
      totalCal += c;
    });
    
    document.getElementById('scan-total-cal').innerText = totalCal + ' kcal';
  },

  renderWeightChart() {
    const svg = document.getElementById('weight-chart');
    if (!svg || DietService.weightHistory.length === 0) return;
    
    const w = svg.clientWidth || svg.getBoundingClientRect().width || 300;
    const h = 100;
    
    let pts = DietService.weightHistory.map(entry => entry.weight);
    if (pts.length === 1) pts.push(pts[0]); // need 2 pts for a line
    
    const min = Math.min(...pts, DietService.profile.targetWeight) - 2;
    const max = Math.max(...pts, DietService.profile.targetWeight) + 2;
    
    const targetY = h - ((DietService.profile.targetWeight - min) / (max - min) * h);
    
    let polyPoints = pts.map((val, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = h - ((val - min) / (max - min) * h);
      return `${x},${y}`;
    }).join(' ');

    svg.innerHTML = `
      <line x1="0" y1="${targetY}" x2="${w}" y2="${targetY}" stroke="#e2e8f0" stroke-width="2" stroke-dasharray="5,5" />
      <text x="5" y="${Math.max(15, targetY - 5)}" fill="#94a3b8" font-size="10" font-weight="600">Target ${DietService.profile.targetWeight}</text>
      <polyline points="${polyPoints}" fill="none" stroke="#001F3F" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    `;
    
    // Add dots
    pts.forEach((val, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = h - ((val - min) / (max - min) * h);
      svg.innerHTML += `<circle cx="${x}" cy="${y}" r="4" fill="#fff" stroke="#001F3F" stroke-width="2"/>`;
    });
  }
};

// Expose globally to window
window.DietService = DietService;
window.DietUI = DietUI;

// Hook into app load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { DietService.init(); });
} else {
  DietService.init();
}

