const ICONS = {
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="#f44336" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="#ff9800" stroke-width="2"><path d="M12 2L2 19h20L12 2z"/><path d="M12 9v4"/><circle cx="12" cy="16" r="1"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="#2196f3" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>'
};

const containerId = 'notification-container';

function getContainer() {
  let el = document.getElementById(containerId);
  if (!el) {
    el = document.createElement('div');
    el.id = containerId;
    el.className = 'notification-container';
    document.body.appendChild(el);
  }
  return el;
}

export function showNotification(message, type = 'info', title = null) {
  const titles = {
    success: 'Success',
    error: 'Error',
    warning: 'Warning',
    info: 'Info'
  };

  const container = getContainer();
  const notif = document.createElement('div');
  notif.className = `notification ${type}`;
  notif.innerHTML = `
    <div class="icon">${ICONS[type] || ICONS.info}</div>
    <div class="content">
      <div class="title">${title || titles[type] || 'Info'}</div>
      <div class="message">${escapeHtml(message)}</div>
    </div>
    <button class="close-btn">&times;</button>
  `;

  const closeBtn = notif.querySelector('.close-btn');
  closeBtn.addEventListener('click', () => remove(notif));

  container.appendChild(notif);

  setTimeout(() => remove(notif), type === 'error' ? 8000 : 5000);

  return notif;
}

function remove(el) {
  if (el.classList.contains('removing')) return;
  el.classList.add('removing');
  setTimeout(() => {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 250);
}

function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(str).replace(/[&<>"']/g, c => map[c]);
}

export function clearNotifications() {
  const container = getContainer();
  container.innerHTML = '';
}
