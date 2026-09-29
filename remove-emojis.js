const fs = require('fs');
let html = fs.readFileSync('d:/Gym/index.html', 'utf8');

// Replace mini stats
html = html.replace(/<span class="mini-stat-icon">🏃<\/span>/g, '<span class="mini-stat-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 4v16M17 8l-4-4-4 4"/></svg></span>');
html = html.replace(/<span class="mini-stat-icon">⏱<\/span>/g, '<span class="mini-stat-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>');
html = html.replace(/<span class="mini-stat-icon">💧<\/span>/g, '<span class="mini-stat-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg></span>');

// Replace Quick Actions
html = html.replace(/<div class="quick-card-icon">🧘<\/div>/g, '<div class="quick-card-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>');
html = html.replace(/<div class="quick-card-icon">⚡<\/div>/g, '<div class="quick-card-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div>');
html = html.replace(/<div class="quick-card-icon">🏋️<\/div>/g, '<div class="quick-card-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></div>');
html = html.replace(/<div class="quick-card-icon">🌿<\/div>/g, '<div class="quick-card-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/></svg></div>');

// Remove thumb emojis entirely
html = html.replace(/<span class="thumb-emoji">.*?<\/span>/g, '');
html = html.replace(/<div class="pose-emoji-wrap">.*?<\/div>/g, '');

// Ratings
html = html.replace(/⭐/g, '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>');

// Complete screen
html = html.replace(/<div class="complete-icon">🎉<\/div>/g, '<div class="complete-icon" style="background:var(--purple); color:#fff; border-radius:50%; width:80px; height:80px; display:flex; align-items:center; justify-content:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></div>');
html = html.replace(/🔥 15/g, '15 kcal');
html = html.replace(/🔥 14/g, '14 days');

// Mood buttons - Keep text only or simple SVGs, actually let's use text
html = html.replace(/<button class="mood-btn" aria-label="Amazing">😄<\/button>/g, '<button class="mood-btn" style="font-size:0.8rem; padding:8px 12px; border-radius:8px; border:1px solid var(--border);">Great</button>');
html = html.replace(/<button class="mood-btn" aria-label="Good">🙂<\/button>/g, '<button class="mood-btn" style="font-size:0.8rem; padding:8px 12px; border-radius:8px; border:1px solid var(--border);">Good</button>');
html = html.replace(/<button class="mood-btn" aria-label="Tired">😐<\/button>/g, '<button class="mood-btn" style="font-size:0.8rem; padding:8px 12px; border-radius:8px; border:1px solid var(--border);">Okay</button>');
html = html.replace(/<button class="mood-btn" aria-label="Exhausted">😓<\/button>/g, '<button class="mood-btn" style="font-size:0.8rem; padding:8px 12px; border-radius:8px; border:1px solid var(--border);">Tired</button>');

// Stat cards
html = html.replace(/<span class="stat-card-icon">.*?<\/span>/g, '<span class="stat-card-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></span>');

// Badges
html = html.replace(/<div class="badge-icon">.*?<\/div>/g, '<div class="badge-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15l-3 3-3-3"/><path d="M9 18v-6a3 3 0 0 1 3-3h0a3 3 0 0 1 3 3v6"/><path d="M15 18l3-3 3 3"/></svg></div>');

// Profile
html = html.replace(/✏️/g, '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>');
html = html.replace(/🌟 Intermediate/g, 'Intermediate');

// Settings items
html = html.replace(/<span class="settings-item-icon">🎯<\/span>/g, '<span class="settings-item-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></span>');
html = html.replace(/<span class="settings-item-icon">📅<\/span>/g, '<span class="settings-item-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>');
html = html.replace(/<span class="settings-item-icon">🔔<\/span>/g, '<span class="settings-item-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></span>');
html = html.replace(/<span class="settings-item-icon">🌐<\/span>/g, '<span class="settings-item-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></span>');
html = html.replace(/<span class="settings-item-icon">📊<\/span>/g, '<span class="settings-item-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></span>');
html = html.replace(/<span class="settings-item-icon">🚪<\/span>/g, '<span class="settings-item-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span>');

fs.writeFileSync('d:/Gym/index.html', html);
console.log('Emojis replaced.');
