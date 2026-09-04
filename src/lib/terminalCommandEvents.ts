const TERMINAL_COMMAND_SUBMITTED_EVENT = "niceterm:terminal-command-submitted";

interface TerminalCommandSubmittedDetail {
  sessionId: string;
}

/**
 * Notifies listeners (e.g. the file explorer tree) that a command was just
 * submitted to a terminal session, so they can re-check the terminal cwd
 * and refresh their view.
 */
export function notifyTerminalCommandSubmitted(sessionId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<TerminalCommandSubmittedDetail>(
      TERMINAL_COMMAND_SUBMITTED_EVENT,
      { detail: { sessionId } },
    ),
  );
}

export function listenTerminalCommandSubmitted(
  handler: (sessionId: string) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<TerminalCommandSubmittedDetail>;
    if (!customEvent.detail?.sessionId) return;
    handler(customEvent.detail.sessionId);
  };

  window.addEventListener(TERMINAL_COMMAND_SUBMITTED_EVENT, listener);
  return () => {
    window.removeEventListener(TERMINAL_COMMAND_SUBMITTED_EVENT, listener);
  };
}
