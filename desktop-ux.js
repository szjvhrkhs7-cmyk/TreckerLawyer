(() => {
  'use strict';

  const isTypingTarget = target => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
  };

  const visibleOverlay = () => {
    const overlays = [...document.querySelectorAll('.overlay.show')];
    return overlays.length ? overlays[overlays.length - 1] : null;
  };

  const currentSearch = () => document.querySelector(
    '#page input[type="search"], #page .search, #page input[placeholder*="Поиск"]'
  );

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      const overlay = visibleOverlay();
      if (!overlay) return;
      event.preventDefault();
      if (typeof hideOverlay === 'function') hideOverlay(overlay);
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      const search = currentSearch();
      if (!search) return;
      event.preventDefault();
      search.focus({ preventScroll: false });
      if (typeof search.select === 'function') search.select();
      return;
    }

    if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget(event.target)) {
      const search = currentSearch();
      if (!search) return;
      event.preventDefault();
      search.focus({ preventScroll: false });
      return;
    }
  });

  const tabs = document.getElementById('tabs');
  tabs?.addEventListener('keydown', event => {
    const current = event.target.closest('.tab');
    if (!current) return;

    const items = [...tabs.querySelectorAll('.tab:not([disabled])')];
    const index = items.indexOf(current);
    if (index < 0) return;

    const vertical = window.matchMedia('(min-width: 900px)').matches;
    const previousKey = vertical ? 'ArrowUp' : 'ArrowLeft';
    const nextKey = vertical ? 'ArrowDown' : 'ArrowRight';
    let nextIndex = null;

    if (event.key === previousKey) nextIndex = (index - 1 + items.length) % items.length;
    if (event.key === nextKey) nextIndex = (index + 1) % items.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = items.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    items[nextIndex].focus();
    items[nextIndex].click();
  });
})();