/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_USE_MOCKS?: string;
  readonly VITE_MOCK_FALLBACK_TOAST?: string;
  readonly VITE_ACO_PRESET_DEFAULT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
