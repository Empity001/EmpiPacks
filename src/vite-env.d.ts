/// <reference types="vite/client" />

import type { StudioBridge } from './types'

declare global {
  interface Window {
    studio: StudioBridge
  }
}

export {}
