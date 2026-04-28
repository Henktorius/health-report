# Medical Report Assistant

An AI-powered mobile application designed to help non-technical users decipher and manage their medical reports. By leveraging Gemini's structured reasoning and on-device OCR, this app transforms complex lab results into plain-language summaries and actionable medication schedules.

## Team Members

* Oscar Arranz
* Marco Garcia
* Carlos Ocaña

## Demo Video

https://github.com/user-attachments/assets/236c3b41-e24f-416d-ae76-574f8400b969

## 🚀 Key Features

* **Intelligent Summarization:** Upload a photo of a lab report and receive a structured, easy-to-understand breakdown of key results, flags, and actionable insights.
* **Contextual Chat:** Engage in a multi-turn, persistent chat grounded in your specific report to ask follow-up questions.
* **Smart Medication Tracking:** The app automatically derives dosage schedules from report text, providing medication reminders, dose counters, and a simple "Track" interface.
* **Privacy-First Design:** Your API keys are stored securely on-device using Keychain/Keystore. All medical history and conversations are persisted locally.

## 🛠 Tech Stack

* **Framework:** React Native 0.81 + Expo SDK 54 (`expo-router`).
* **Architecture:** Enabled New Architecture (Fabric/TurboModules) + React Compiler.
* **AI:** Google Gemini API (structured JSON output).
* **OCR:** On-device Google ML Kit via `@react-native-ml-kit/text-recognition`.
* **Persistence:** `expo-secure-store` (credentials) & `async-storage` (data).

## ⚙️ Development

This project uses a **Development Build** workflow. It does *not* support Expo Go.

### Prerequisites
* Node.js (latest LTS recommended).
* Configured React Native development environment (Android Studio / Xcode).

### Setup
1.  **Clone the repository.**
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Run the app:**
    * For Android: `npm run android`
    * For iOS: `npm run ios`

*Note: Adding native modules requires running `expo prebuild`.*

