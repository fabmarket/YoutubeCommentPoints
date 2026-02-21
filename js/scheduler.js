/**
 * scheduler.js — Browser-side auto-check scheduler.
 * Used by admin.html to schedule periodic comment checks.
 * Persists last-run time in localStorage; when admin opens the panel
 * and the interval has elapsed, it triggers a check automatically.
 */

const LS_LAST_CHECK = 'ytcp_last_check';
const LS_INTERVAL = 'ytcp_interval_hours';

let schedulerTimer = null;

/** Start the scheduler. checkFn is an async function that performs the check. */
function startScheduler(checkFn, intervalHours, onStatus) {
    stopScheduler();
    const intervalMs = intervalHours * 60 * 60 * 1000;
    localStorage.setItem(LS_INTERVAL, String(intervalHours));

    const tick = async () => {
        const lastCheck = parseInt(localStorage.getItem(LS_LAST_CHECK) || '0', 10);
        const now = Date.now();
        if (now - lastCheck >= intervalMs) {
            onStatus(`⏰ Otomatik kontrol tetiklendi (${new Date().toLocaleString('tr-TR')})`);
            await checkFn();
            localStorage.setItem(LS_LAST_CHECK, String(Date.now()));
        } else {
            const nextMs = intervalMs - (now - lastCheck);
            const nextMin = Math.round(nextMs / 60000);
            onStatus(`⏳ Sonraki otomatik kontrol: ~${nextMin} dakika sonra`);
        }
    };

    // Check immediately on start
    tick();

    // Then check every 5 minutes (tick decides if action needed based on interval)
    schedulerTimer = setInterval(tick, 5 * 60 * 1000);
}

function stopScheduler() {
    if (schedulerTimer !== null) {
        clearInterval(schedulerTimer);
        schedulerTimer = null;
    }
}

function isSchedulerRunning() {
    return schedulerTimer !== null;
}

function getLastCheckTime() {
    const ts = parseInt(localStorage.getItem(LS_LAST_CHECK) || '0', 10);
    return ts ? new Date(ts) : null;
}

function markCheckDone() {
    localStorage.setItem(LS_LAST_CHECK, String(Date.now()));
}
