import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchDisconnection } from "./disconnection";

function setup(connected = false) {
  let state = { isWebSocketConnected: connected };
  let listener = (_state: typeof state) => {};

  const unsubscribe = vi.fn();
  const onChange = vi.fn();

  const stop = watchDisconnection(
    {
      connectionState: () => state,
      subscribeToConnectionState: (callback) => {
        listener = callback;

        return unsubscribe;
      },
    },
    onChange,
  );

  return {
    onChange,
    stop,
    unsubscribe,
    update(connected: boolean) {
      state = { isWebSocketConnected: connected };
      listener(state);
    },
  };
}

describe("disconnection warning", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not flash during a successful initial connection", () => {
    const { onChange, update } = setup();
    vi.advanceTimersByTime(1000);
    expect(onChange).not.toHaveBeenCalled();
    update(true);
    vi.advanceTimersByTime(5000);
    expect(onChange.mock.calls).toEqual([[false]]);
  });

  it("reports an initial failure even with repeated disconnected updates", () => {
    const { onChange, update } = setup();
    vi.advanceTimersByTime(2000);
    update(false);
    vi.advanceTimersByTime(999);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenLastCalledWith(true);
    update(true);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("ignores brief reconnects and gives each outage its own grace period", () => {
    const { onChange, update } = setup(true);
    update(false);
    vi.advanceTimersByTime(2000);
    update(true);
    vi.advanceTimersByTime(2000);
    expect(onChange).not.toHaveBeenCalledWith(true);
    update(false);
    vi.advanceTimersByTime(2999);
    expect(onChange).not.toHaveBeenCalledWith(true);
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenLastCalledWith(true);
  });

  it("cancels pending warnings and unsubscribes on cleanup", () => {
    const { onChange, stop, unsubscribe } = setup();
    stop();
    vi.advanceTimersByTime(5000);
    expect(onChange).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
