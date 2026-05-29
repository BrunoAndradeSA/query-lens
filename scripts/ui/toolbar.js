const SVG_ICONS = {
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  format: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h10M4 18h6"/><path d="M18 14l4-4-4-4"/><path d="M18 22V10"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  clear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  zoomIn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
  zoomOut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
  fit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
  layout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>'
};

export function createToolbar(container, actions = {}) {
  const groups = {
    editor: [
      {
        id: 'run',
        label: 'Run',
        icon: SVG_ICONS.play,
        action: actions.onRun,
        primary: true
      },
      {
        id: 'format',
        label: 'Format SQL',
        icon: SVG_ICONS.format,
        action: actions.onFormat
      },
      {
        id: 'validate',
        label: 'Validate',
        icon: SVG_ICONS.check,
        action: actions.onValidate
      },
      {
        id: 'clear',
        label: 'Clear',
        icon: SVG_ICONS.clear,
        action: actions.onClear
      }
    ],
    graph: [
      {
        id: 'fit',
        label: 'Fit',
        icon: SVG_ICONS.fit,
        action: actions.onFit
      },
      {
        id: 'layout',
        label: 'Re-layout',
        icon: SVG_ICONS.layout,
        action: actions.onRelayout
      },
      {
        id: 'export',
        label: 'Export',
        icon: SVG_ICONS.download,
        action: actions.onExport
      }
    ]
  };

  const LAYOUT_NAMES = [
    { value: 'cose', label: 'Force-directed' },
    { value: 'grid', label: 'Grid' },
    { value: 'circle', label: 'Circle' },
    { value: 'concentric', label: 'Concentric' },
    { value: 'breadthfirst', label: 'Breadth-first' }
  ];

  const toolbarEl = document.createElement('div');
  toolbarEl.className = 'toolbar';

  const leftGroup = document.createElement('div');
  leftGroup.className = 'toolbar-group';

  let first = true;
  for (const btn of groups.editor) {
    if (!first) {
      leftGroup.appendChild(createDivider());
    }
    first = false;
    leftGroup.appendChild(createButton(btn));
  }

  const rightGroup = document.createElement('div');
  rightGroup.className = 'toolbar-group';

  const layoutSelect = document.createElement('select');
  layoutSelect.className = 'layout-select';
  layoutSelect.title = 'Graph layout';
  for (const opt of LAYOUT_NAMES) {
    const el = document.createElement('option');
    el.value = opt.value;
    el.textContent = opt.label;
    layoutSelect.appendChild(el);
  }
  layoutSelect.value = 'cose';
  if (actions.onLayoutChange) {
    layoutSelect.addEventListener('change', () => actions.onLayoutChange(layoutSelect.value));
  }
  rightGroup.appendChild(layoutSelect);

  first = true;
  for (const btn of groups.graph) {
    if (!first) {
      rightGroup.appendChild(createDivider());
    }
    first = false;
    rightGroup.appendChild(createButton(btn));
  }

  toolbarEl.appendChild(leftGroup);

  const spacer = document.createElement('div');
  spacer.style.flex = '1';
  toolbarEl.appendChild(spacer);

  toolbarEl.appendChild(rightGroup);
  container.appendChild(toolbarEl);

  return {
    setButtonEnabled(id, enabled) {
      const btn = toolbarEl.querySelector(`[data-id="${id}"]`);
      if (btn) {
        btn.disabled = !enabled;
        btn.style.opacity = enabled ? '1' : '0.4';
        btn.style.pointerEvents = enabled ? 'auto' : 'none';
      }
    },
    getLayout() {
      return layoutSelect.value;
    },
    setLayout(name) {
      layoutSelect.value = name;
    }
  };
}

function createButton(config) {
  const btn = document.createElement('button');
  btn.className = `btn${config.primary ? ' btn-primary' : ''}`;
  btn.setAttribute('data-id', config.id);
  btn.title = config.label;
  btn.innerHTML = `${config.icon || ''} <span class="btn-label">${config.label}</span>`;

  if (config.action) {
    btn.addEventListener('click', config.action);
  }

  return btn;
}

function createDivider() {
  const div = document.createElement('div');
  div.className = 'toolbar-divider';
  return div;
}
