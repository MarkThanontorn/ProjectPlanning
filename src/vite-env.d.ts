/// <reference types="vite/client" />

/** App version from package.json (injected by vite.config.ts). */
declare const __APP_VERSION__: string;
/** True for the hosted build (installable app + offline); false for the single-file build. */
declare const __PWA__: boolean;
