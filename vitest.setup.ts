// vitest.setup.ts
import { vi } from "vitest";

vi.stubGlobal("chrome", {
  storage: { local: { get: vi.fn(), set: vi.fn() } },
  runtime: { 
    getURL: vi.fn((path: string) => `chrome-extension://test-extension-id/${path}`),
    sendMessage: vi.fn(), 
    id: "test"
  },
});