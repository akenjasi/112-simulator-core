import '@testing-library/jest-dom/vitest';

class DefaultMockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = 1;
  send() {}
  close() {}
  onopen: any = null;
  onclose: any = null;
  onerror: any = null;
  onmessage: any = null;
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {
    return true;
  }
}

global.WebSocket = DefaultMockWebSocket as any;
