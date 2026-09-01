(() => {
  'use strict';

  const cleanupStaleDragUi = () => {
    document.querySelectorAll('.drag-floating').forEach(node => node.remove());
    document.querySelectorAll('.dragging,.drag-placeholder').forEach(node => node.classList.remove('dragging', 'drag-placeholder'));
    document.querySelectorAll('.is-sorting').forEach(node => node.classList.remove('is-sorting'));
    document.body.classList.remove('drag-reordering');
  };

  function smoothBindSortable(root, kind) {
    const list = root?.matches?.('.list') ? root : root?.querySelector?.('.list');
    if (!list || list.querySelectorAll('[data-sort-id]').length < 2) return;

    const requestFrame = window.requestAnimationFrame?.bind(window) || (callback => setTimeout(callback, 16));
    const cancelFrame = window.cancelAnimationFrame?.bind(window) || clearTimeout;
    const layoutAnimations = new WeakMap();

    const sortableChildren = () => [...list.children].filter(element => element.matches?.('[data-sort-id]'));
    const persist = () => globalThis.persistSortableOrder?.(
      kind,
      sortableChildren().map(item => item.dataset.sortId)
    );

    const stopLayoutAnimation = element => {
      const animation = layoutAnimations.get(element);
      animation?.cancel?.();
      layoutAnimations.delete(element);
      element.style.transform = '';
      element.style.transition = '';
    };

    const snapshotPositions = activeItem => {
      const positions = new Map();
      sortableChildren().forEach(element => {
        if (element === activeItem) return;
        stopLayoutAnimation(element);
        positions.set(element, element.getBoundingClientRect().top);
      });
      return positions;
    };

    const animateLayout = (activeItem, before) => {
      sortableChildren().forEach(element => {
        if (element === activeItem) return;
        const oldTop = before.get(element);
        const newTop = element.getBoundingClientRect().top;
        const delta = oldTop === undefined ? 0 : oldTop - newTop;
        if (Math.abs(delta) < 0.5) return;

        if (typeof element.animate === 'function') {
          const animation = element.animate(
            [{ transform: `translate3d(0,${delta}px,0)` }, { transform: 'translate3d(0,0,0)' }],
            { duration: 165, easing: 'cubic-bezier(.2,.8,.2,1)' }
          );
          layoutAnimations.set(element, animation);
          const clear = () => {
            if (layoutAnimations.get(element) === animation) layoutAnimations.delete(element);
          };
          animation.onfinish = clear;
          animation.oncancel = clear;
          return;
        }

        element.style.transition = 'none';
        element.style.transform = `translate3d(0,${delta}px,0)`;
        void element.offsetHeight;
        element.style.transition = 'transform 165ms cubic-bezier(.2,.8,.2,1)';
        element.style.transform = '';
        setTimeout(() => {
          element.style.transition = '';
          element.style.transform = '';
        }, 185);
      });
    };

    list.querySelectorAll('[data-drag-handle]').forEach(handle => {
      const item = handle.closest('[data-sort-id]');
      if (!item || handle.dataset.safeDragBound === '1') return;
      handle.dataset.safeDragBound = '1';
      handle.dataset.safeDragInput = 'touch-mouse';

      let dragging = false;
      let inputType = null;
      let touchId = null;
      let moved = false;
      let startX = 0;
      let startY = 0;
      let originRect = null;
      let originNextSibling = null;
      let originIndex = -1;
      let floating = null;
      let frameId = 0;
      let pendingPoint = null;
      let lastPoint = null;
      let suppressClick = false;
      let lastTouchAt = 0;

      const positionFloating = (clientX, clientY) => {
        if (!floating || !originRect) return;
        floating.style.transform = `translate3d(${clientX - startX}px,${clientY - startY}px,0) scale(1.012)`;
      };

      const maybeReorder = (clientX, clientY) => {
        if (!dragging || !originRect) return false;

        const dx = clientX - startX;
        const dy = clientY - startY;
        if (Math.hypot(dx, dy) > 4) {
          moved = true;
          suppressClick = true;
        }
        positionFloating(clientX, clientY);

        const edge = 82;
        let scrollSpeed = 0;
        if (clientY < edge) scrollSpeed = -Math.ceil((edge - clientY) / 8);
        else if (clientY > window.innerHeight - edge) scrollSpeed = Math.ceil((clientY - (window.innerHeight - edge)) / 8);
        scrollSpeed = Math.max(-10, Math.min(10, scrollSpeed));
        if (scrollSpeed) window.scrollBy(0, scrollSpeed);

        const items = sortableChildren();
        const index = items.indexOf(item);
        if (index < 0) return scrollSpeed !== 0;

        const grabOffsetFromCenter = startY - (originRect.top + originRect.height / 2);
        const dragCenterY = clientY - grabOffsetFromCenter;
        const previous = items[index - 1];
        const next = items[index + 1];
        const hysteresis = 7;

        if (previous) {
          const rect = previous.getBoundingClientRect();
          if (dragCenterY < rect.top + rect.height / 2 - hysteresis) {
            const before = snapshotPositions(item);
            list.insertBefore(item, previous);
            animateLayout(item, before);
            return true;
          }
        }

        if (next) {
          const rect = next.getBoundingClientRect();
          if (dragCenterY > rect.top + rect.height / 2 + hysteresis) {
            const before = snapshotPositions(item);
            list.insertBefore(item, next.nextSibling);
            animateLayout(item, before);
            return true;
          }
        }

        return scrollSpeed !== 0;
      };

      const drawFrame = () => {
        frameId = 0;
        if (!dragging) return;
        const point = pendingPoint || lastPoint;
        pendingPoint = null;
        if (!point) return;
        lastPoint = point;
        const keepAnimating = maybeReorder(point.clientX, point.clientY);
        if (keepAnimating && dragging) frameId = requestFrame(drawFrame);
      };

      const queueMove = (clientX, clientY, event) => {
        if (!dragging) return;
        if (event?.cancelable) event.preventDefault();
        pendingPoint = { clientX, clientY };
        if (!frameId) frameId = requestFrame(drawFrame);
      };

      const findTouch = touches => {
        if (!touches) return null;
        for (let index = 0; index < touches.length; index += 1) {
          const touch = touches[index];
          if (touchId === null || touch.identifier === touchId) return touch;
        }
        return null;
      };

      const releasePoint = event => {
        if (Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)) {
          return { clientX: event.clientX, clientY: event.clientY };
        }
        const touch = findTouch(event?.changedTouches);
        if (touch) return { clientX: touch.clientX, clientY: touch.clientY };
        return lastPoint;
      };

      const pointInsideList = point => {
        if (!point) return false;
        const rect = list.getBoundingClientRect();
        const tolerance = 40;
        return point.clientX >= rect.left - tolerance && point.clientX <= rect.right + tolerance &&
          point.clientY >= rect.top - tolerance && point.clientY <= rect.bottom + tolerance;
      };

      const restoreOriginal = () => {
        const before = snapshotPositions(item);
        if (originNextSibling && originNextSibling.parentNode === list) list.insertBefore(item, originNextSibling);
        else list.append(item);
        animateLayout(item, before);
      };

      const onTouchMove = event => {
        const touch = findTouch(event.touches);
        if (touch) queueMove(touch.clientX, touch.clientY, event);
      };

      const onMouseMove = event => {
        if (event.buttons === 0) {
          finish({ type: 'mousecancel', clientX: event.clientX, clientY: event.clientY }, true);
          return;
        }
        queueMove(event.clientX, event.clientY, event);
      };

      const onWindowBlur = () => finish({ type: 'blur' }, true);
      const onVisibilityChange = () => {
        if (document.visibilityState === 'hidden') finish({ type: 'visibilitychange' }, true);
      };
      const onEscape = event => {
        if (event.key === 'Escape' && dragging) {
          event.preventDefault();
          finish({ type: 'escape' }, true);
        }
      };

      const removeGlobalListeners = () => {
        window.removeEventListener('touchmove', onTouchMove, true);
        window.removeEventListener('touchend', finish, true);
        window.removeEventListener('touchcancel', finish, true);
        window.removeEventListener('mousemove', onMouseMove, true);
        window.removeEventListener('mouseup', finish, true);
        window.removeEventListener('blur', onWindowBlur, true);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        document.removeEventListener('keydown', onEscape, true);
      };

      function finish(event, forceCancel = false) {
        if (!dragging) return;
        if (inputType === 'touch' && event?.changedTouches && !findTouch(event.changedTouches)) return;

        if (frameId) {
          cancelFrame(frameId);
          frameId = 0;
        }

        const hardCancel = forceCancel || ['touchcancel', 'mousecancel', 'blur', 'visibilitychange', 'escape'].includes(event?.type);
        if (!hardCancel && pendingPoint) {
          const point = pendingPoint;
          pendingPoint = null;
          maybeReorder(point.clientX, point.clientY);
        } else {
          pendingPoint = null;
        }

        const point = releasePoint(event);
        const validDrop = !hardCancel && moved && pointInsideList(point);
        if (!validDrop) restoreOriginal();

        const currentIndex = sortableChildren().indexOf(item);
        const changed = validDrop && currentIndex !== originIndex;

        dragging = false;
        inputType = null;
        touchId = null;
        lastPoint = null;
        removeGlobalListeners();
        list.classList.remove('is-sorting');
        document.body.classList.remove('drag-reordering');
        handle.setAttribute('aria-pressed', 'false');

        if (changed) persist();

        if (floating && originRect && !hardCancel) {
          const target = item.getBoundingClientRect();
          const stale = floating;
          stale.style.transition = 'transform 140ms cubic-bezier(.2,.8,.2,1), opacity 140ms ease';
          stale.style.transform = `translate3d(${target.left - originRect.left}px,${target.top - originRect.top}px,0) scale(1)`;
          stale.style.opacity = '0.92';
          setTimeout(() => {
            stale.remove();
            if (floating === stale) floating = null;
            item.classList.remove('dragging', 'drag-placeholder');
          }, 160);
        } else {
          floating?.remove();
          floating = null;
          item.classList.remove('dragging', 'drag-placeholder');
        }
      }

      const begin = (clientX, clientY, source, event, identifier = null) => {
        if (dragging) {
          if (event.cancelable) event.preventDefault();
          return;
        }
        if (source === 'mouse' && event.button !== 0) return;

        if (event.cancelable) event.preventDefault();
        dragging = true;
        inputType = source;
        touchId = identifier;
        moved = false;
        suppressClick = false;
        startX = clientX;
        startY = clientY;
        originRect = item.getBoundingClientRect();
        originNextSibling = item.nextElementSibling;
        originIndex = sortableChildren().indexOf(item);
        lastPoint = { clientX, clientY };
        pendingPoint = null;

        floating = item.cloneNode(true);
        floating.classList.add('drag-floating');
        floating.classList.remove('dragging', 'drag-placeholder');
        floating.setAttribute('aria-hidden', 'true');
        floating.style.left = `${originRect.left}px`;
        floating.style.top = `${originRect.top}px`;
        floating.style.width = `${originRect.width}px`;
        floating.style.height = `${originRect.height}px`;
        floating.style.transform = 'translate3d(0,0,0) scale(1.012)';
        floating.style.transformOrigin = 'center center';
        floating.style.transition = 'none';
        floating.style.willChange = 'transform';
        document.body.append(floating);

        item.classList.add('dragging', 'drag-placeholder');
        list.classList.add('is-sorting');
        document.body.classList.add('drag-reordering');
        handle.setAttribute('aria-pressed', 'true');

        window.addEventListener('blur', onWindowBlur, true);
        document.addEventListener('visibilitychange', onVisibilityChange);
        document.addEventListener('keydown', onEscape, true);

        if (source === 'touch') {
          window.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
          window.addEventListener('touchend', finish, true);
          window.addEventListener('touchcancel', finish, true);
        } else {
          window.addEventListener('mousemove', onMouseMove, { passive: false, capture: true });
          window.addEventListener('mouseup', finish, true);
        }
      };

      handle.addEventListener('touchstart', event => {
        const touch = event.changedTouches?.[0] || event.touches?.[0];
        if (!touch) return;
        lastTouchAt = Date.now();
        begin(touch.clientX, touch.clientY, 'touch', event, touch.identifier);
      }, { passive: false });

      handle.addEventListener('mousedown', event => {
        if (Date.now() - lastTouchAt < 750) return;
        begin(event.clientX, event.clientY, 'mouse', event);
      });

      handle.addEventListener('click', event => {
        if (suppressClick) {
          event.preventDefault();
          event.stopPropagation();
        }
        suppressClick = false;
      });

      handle.addEventListener('keydown', event => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        const items = sortableChildren();
        const index = items.indexOf(item);
        const target = items[index + (event.key === 'ArrowUp' ? -1 : 1)];
        if (!target) return;
        const before = snapshotPositions(item);
        if (event.key === 'ArrowUp') list.insertBefore(item, target);
        else list.insertBefore(item, target.nextSibling);
        animateLayout(item, before);
        persist();
        handle.focus();
      });
    });
  }

  cleanupStaleDragUi();
  globalThis.bindSortable = smoothBindSortable;
  if (typeof globalThis.render === 'function') globalThis.render();
})();
