# FlowFit 🏋️‍♂️

A modern, full-featured fitness and workout tracking mobile application built with HTML5, CSS3, Vanilla JavaScript, and Apache Capacitor for native Android deployment.

---

## ✨ Features

- **Workout Tracking & Exercises**: Pre-loaded exercise library with detailed animations, muscle engagement mapping, set/rep counters, and rest timers.
- **Smart Diet & Calorie Manager**: Automatic macro and metabolic calculation based on user weight, activity level, and goals.
- **Jamendo Music Player**: Integrated background workout audio powered by Jamendo API with Dynamic Island / status bar controls.
- **Custom Profile Avatars**: 5 curated 3D fitness persona avatars with automatic assignment and custom photo upload/cropping.
- **Clean Navy & Slate Design**: Sleek, mobile-first design system with zero lag and offline-first persistence.
- **Capacitor Android Integration**: Cross-platform architecture configured for Android deployment.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- [Android Studio](https://developer.android.com/studio) (for native Android builds)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ranaalishahid442-sys/FlowFit.git
   cd FlowFit
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Sync web assets with Capacitor Android:
   ```bash
   npx cap sync
   ```

4. Run or open in Android Studio:
   ```bash
   npx cap open android
   ```

---

## 📁 Project Structure

```
Gym/
├── android/               # Native Android project files
├── www/                   # Web application source files
│   ├── avatars/           # Preset 3D fitness profile avatars
│   ├── index.html         # Main application shell & screens
│   ├── styles.css         # Design system & responsive styles
│   ├── app.js             # Core navigation & app lifecycle
│   ├── app-data.js        # Workout & profile data persistence
│   ├── avatar-service.js  # Avatar selection & image cropper
│   ├── diet.js            # Diet & calorie calculations
│   ├── exercise-data.js   # Exercise database & instructions
│   └── music-service.js   # Jamendo API music player
├── capacitor.config.json  # Capacitor configuration
└── package.json           # Node dependencies & project scripts
```

---

## 📄 License

This project is licensed under the ISC License.
