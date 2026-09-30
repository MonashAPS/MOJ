type ConnectionState = { isWebSocketConnected: boolean };

type ConnectionSource = {
  connectionState: () => ConnectionState;
  subscribeToConnectionState: (callback: (state: ConnectionState) => void) => () => void;
};

/** Allow startup and brief reconnects to settle, but still report an initial
 * connection that never succeeds. Repeated offline updates must not reset it. */
export function watchDisconnection(source: ConnectionSource, onChange: (down: boolean) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clear = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  const apply = ({ isWebSocketConnected }: ConnectionState) => {
    if (isWebSocketConnected) {
      clear();
      onChange(false);
    } else if (timer === undefined) {
      timer = setTimeout(() => onChange(true), 3000);
    }
  };

  const unsubscribe = source.subscribeToConnectionState(apply);
  apply(source.connectionState());

  return () => {
    unsubscribe();
    clear();
  };
}
