/// <reference types="vite/client" />

import type { WxadApi } from "../electron/preload/preload.cjs";

declare global {
  interface Window {
    wxad: WxadApi;
  }
}

export {};
