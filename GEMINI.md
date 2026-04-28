
# Health Report Project - GEMINI.md

## Project Overview

This project is a React Native application built using Expo and Expo Router. It follows a modular structure with dedicated directories for components, constants, hooks, and assets. The application utilizes TypeScript for type safety and ESLint with Expo's configuration for code quality. Expo Router is employed for file-based routing, simplifying navigation within the application.

## Project Type

This is a **Code Project**: A React Native application.

## Technologies

*   **Framework:** Expo
*   **Runtime:** React Native
*   **Routing:** Expo Router
*   **Language:** TypeScript
*   **Linting:** ESLint with `eslint-config-expo`
*   **Package Manager:** npm

## Building and Running

### Installation

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

### Running the Application

*   **Start Development Server:**
    ```bash
    npm start
    # or
    npx expo start
    ```
    This command starts the Expo development server, providing options to run the app on various platforms.

*   **Run on Specific Platforms:**
    *   **Android:**
        ```bash
        npm run android
        # or
        npx expo start --android
        ```
    *   **iOS:**
        ```bash
        npm run ios
        # or
        npx expo start --ios
        ```
    *   **Web:**
        ```bash
        npm run web
        # or
        npx expo start --web
        ```

### Linting

*   **Run Linters:**
    ```bash
    npm run lint
    # or
    npx expo lint
    ```

### Project Reset

*   **Reset Project (to starter template):**
    ```bash
    npm run reset-project
    ```
    This command, as described in `README.md`, resets the project to its initial state by moving the starter code to `app-example` and creating a blank `app` directory.

## Development Conventions

*   **TypeScript:** The project enforces strict TypeScript (`"strict": true`).
*   **Path Aliases:** TypeScript path aliases are configured, allowing imports like `@/*` to refer to the project root.
*   **File-Based Routing:** Expo Router is used, meaning the `app/` directory structure defines the application's routes.
*   **Code Quality:** ESLint with `eslint-config-expo` is used to maintain code consistency and catch potential errors.
*   **Project Structure:** Adheres to a standard Expo project structure with dedicated folders for `assets/`, `components/`, `constants/`, `hooks/`, and `app/`.
*   **Expo Configuration:** `app.json` contains core application settings, including name, version, icons, splash screen configuration, and platform-specific settings.
*   **Modern Expo Features:** Experiments like `typedRoutes` and `reactCompiler` are enabled in `app.json`.
