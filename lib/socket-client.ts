// socket-client.ts — no-op shim (socket.io removed; using polling instead)
// This prevents crashes if any component still imports this module.
const noop = (..._args: any[]) => {};

export const socket = {
  on: noop,
  off: noop,
  emit: noop,
  connect: noop,
  disconnect: noop,
  connected: false,
};