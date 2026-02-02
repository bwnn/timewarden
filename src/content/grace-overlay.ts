/**
 * Grace Period Overlay — Content Script
 *
 * Injected into pages when a domain's time limit is reached.
 * Shows a 60-second countdown overlay before the page is blocked.
 *
 * This is a plain TypeScript file (no Svelte) that creates DOM elements
 * with inline styles, since content scripts run in the page context.
 *
 * Receives a GRACE_PERIOD_START message from the background script
 * with the countdown duration. Displays a full-page semi-transparent
 * overlay with a countdown timer.
 */

// Prevent double-injection
if (!(window as unknown as Record<string, boolean>).__timewardenGraceOverlay) {
  (window as unknown as Record<string, boolean>).__timewardenGraceOverlay = true;

  // ============================================================
  // Create Overlay DOM
  // ============================================================

  const overlay = document.createElement('div');
  overlay.id = 'timewarden-grace-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #ffffff;
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: all;
  `;

  const container = document.createElement('div');
  container.style.cssText = `
    text-align: center;
    max-width: 400px;
    padding: 40px;
  `;

  const title = document.createElement('h1');
  title.textContent = "Time's Up";
  title.style.cssText = `
    font-size: 36px;
    font-weight: 700;
    margin: 0 0 12px 0;
    color: #f87171;
  `;

  const subtitle = document.createElement('p');
  subtitle.style.cssText = `
    font-size: 16px;
    margin: 0 0 32px 0;
    color: #d1d5db;
    line-height: 1.5;
  `;

  const countdownContainer = document.createElement('div');
  countdownContainer.style.cssText = `
    margin: 0 0 24px 0;
  `;

  const countdownLabel = document.createElement('p');
  countdownLabel.textContent = 'Page will be blocked in';
  countdownLabel.style.cssText = `
    font-size: 14px;
    margin: 0 0 8px 0;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 1px;
  `;

  const countdownNumber = document.createElement('div');
  countdownNumber.style.cssText = `
    font-size: 72px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: #ffffff;
    line-height: 1;
  `;

  const progressBarOuter = document.createElement('div');
  progressBarOuter.style.cssText = `
    width: 200px;
    height: 4px;
    background: #374151;
    border-radius: 2px;
    margin: 24px auto 0 auto;
    overflow: hidden;
  `;

  const progressBarInner = document.createElement('div');
  progressBarInner.style.cssText = `
    width: 100%;
    height: 100%;
    background: #f87171;
    border-radius: 2px;
    transition: width 1s linear;
  `;

  progressBarOuter.appendChild(progressBarInner);
  countdownContainer.appendChild(countdownLabel);
  countdownContainer.appendChild(countdownNumber);
  countdownContainer.appendChild(progressBarOuter);

  container.appendChild(title);
  container.appendChild(subtitle);
  container.appendChild(countdownContainer);

  overlay.appendChild(container);

  // ============================================================
  // Countdown Logic
  // ============================================================

  let countdownInterval: ReturnType<typeof setInterval> | null = null;
  let remainingSeconds = 0;
  let totalSeconds = 0;

  function updateCountdown(): void {
    countdownNumber.textContent = String(remainingSeconds);

    // Update progress bar
    const progress = totalSeconds > 0 ? (remainingSeconds / totalSeconds) * 100 : 0;
    progressBarInner.style.width = `${progress}%`;

    // Color transitions
    if (remainingSeconds <= 10) {
      countdownNumber.style.color = '#f87171';
    } else if (remainingSeconds <= 30) {
      countdownNumber.style.color = '#fbbf24';
    } else {
      countdownNumber.style.color = '#ffffff';
    }
  }

  function startCountdown(durationSeconds: number, domain: string): void {
    remainingSeconds = durationSeconds;
    totalSeconds = durationSeconds;

    subtitle.textContent = `Your daily limit for ${domain} has been reached.`;

    // Add to DOM
    document.body.appendChild(overlay);

    // Fade in
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });

    // Initial render
    updateCountdown();

    // Tick every second
    countdownInterval = setInterval(() => {
      remainingSeconds--;

      if (remainingSeconds <= 0) {
        // Grace period over — the background will redirect the tab
        if (countdownInterval) clearInterval(countdownInterval);
        countdownNumber.textContent = '0';
        progressBarInner.style.width = '0%';
        countdownNumber.style.color = '#f87171';
        return;
      }

      updateCountdown();
    }, 1000);
  }

  function removeOverlay(): void {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    const existing = document.getElementById('timewarden-grace-overlay');
    if (existing) {
      existing.style.opacity = '0';
      setTimeout(() => existing.remove(), 300);
    }
  }

  // ============================================================
  // Message Listener
  // ============================================================

  browser.runtime.onMessage.addListener(
    (message: unknown): undefined => {
      const msg = message as { type: string; domain?: string; durationSeconds?: number };

      if (msg.type === 'GRACE_PERIOD_START' && msg.domain && msg.durationSeconds) {
        startCountdown(msg.durationSeconds, msg.domain);
      } else if (msg.type === 'GRACE_PERIOD_CANCEL') {
        removeOverlay();
      }

      return undefined;
    }
  );

  console.log('[TimeWarden] Grace overlay content script loaded');
}
