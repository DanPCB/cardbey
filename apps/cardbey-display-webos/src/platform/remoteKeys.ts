export type RemoteKeyAction =
  | 'back'
  | 'ok'
  | 'info'
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'play'
  | 'pause'
  | 'stop'
  | 'other';

export type RemoteKeyHandler = (action: RemoteKeyAction, event: KeyboardEvent) => void;

/**
 * Map LG remote / keyboard events to shell actions.
 * Back is consumed by default so the app does not exit unexpectedly (signage-safe).
 */
export function mapKeyToAction(event: KeyboardEvent): RemoteKeyAction {
  const key = event.key;
  const code = event.keyCode || event.which;

  if (key === 'Backspace' || key === 'Escape' || code === 461 || code === 8 || code === 27) {
    return 'back';
  }
  if (key === 'Enter' || code === 13) return 'ok';
  if (key === 'Info' || key === 'i' || key === 'I' || code === 457) return 'info';
  if (key === 'ArrowLeft' || code === 37) return 'left';
  if (key === 'ArrowRight' || code === 39) return 'right';
  if (key === 'ArrowUp' || code === 38) return 'up';
  if (key === 'ArrowDown' || code === 40) return 'down';
  if (key === 'MediaPlay' || key === 'Play') return 'play';
  if (key === 'MediaPause' || key === 'Pause') return 'pause';
  if (key === 'MediaStop' || key === 'Stop') return 'stop';
  return 'other';
}

export function bindRemoteKeys(handler: RemoteKeyHandler): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    const action = mapKeyToAction(event);
    if (action === 'back' || action === 'ok' || action === 'info') {
      event.preventDefault();
      event.stopPropagation();
    }
    handler(action, event);
  };
  window.addEventListener('keydown', onKeyDown, true);
  return () => window.removeEventListener('keydown', onKeyDown, true);
}
