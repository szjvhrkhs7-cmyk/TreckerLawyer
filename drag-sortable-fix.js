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
    const supportsPointer = typeof window.PointerEvent === 'function';
    const layoutAnimations = new WeakMap();
    const persist = () => globalThis.persistSortableOrder?.(
      kind,
      [...list.querySelectorAll('[data-sort-id]')].map(item => item.dataset.sortId)
    );

    const sortableChildren = () => [...list.children].filter(element => element.matches?.('[data-sort-id]'));

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
            { duration: 175, easing: 'cubic-bezier(.2,.8,.2,1)' }
          );
          layoutAnimations.set(element, animation);
          animation.onfinish = () => {
            if (layoutAnimations.get(element) === animation) layoutAnimations.delete(element);
          };
          animation.oncancel = () => {
            if (layoutAnimations.get(element) === animation) layoutAnimations.delete(element);
          };
          return;
        }

        element.style.transition = 'none';
        element.style.transform = `translate3d(0,${delta}px,0)`;
        void element.offsetHeight;
        element.style.transition = 'transform 175ms cubic-bezier(.2,.8,.2,1)';
        element.style.transform = '';
        setTimeout(() => {
          element.style.transition = '';
          element.style.transform = '';
        }, 195);
      });
    };

    list.querySelectorAll('[data-drag-handle]').forEach(handle => {
      const item = handle.closest('[data-sort-id]');
      if (!item || handle.dataset.safeDragBound === '1') return;
      handle.dataset.safeDragBound = '1';

      let dragging = false;
      let pointerId = null;
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

      const positionFloating = (clientX, clientY) => {
        if (!floating || !originRect) return;
        const dx = clientX - startX;
        const dy = clientY - startY;
        floating.style.transform = `translate3d(${dx}px,${dy}px,0) scale(1.012)`;
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
        if (clientY < edge) scrollSpeed = -Math.ceil((edge - clientY) / 7);
        else if (clientY > window.innerHeight - edge) scrollSpeed = Math.ceil((clientY - (window.innerHeight - edge)) / 7);
        scrollSpeed = Math.max(-12, Math.min(12, scrollSpeed));
        if (scrollSpeed) window.scrollBy(0, scrollSpeed);

        const items = sortableChildren();
        const index = items.indexOf(item);
        if (index < 0) return scrollSpeed !== 0;

        const dragCenterY = originRect.top + dy + originRect.height / 2;
        const previous = items[index - 1];
        const next = items[index + 1];
        const hysteresis = 8;
        let changed = false;

        if (previous) {
          const rect = previous.getBoundingClientRect();
          const threshold = rect.top + rect.height / 2 - hysteresis;
          if (dragCenterY < threshold) {
            const before = snapshotPositions(item);
            list.insertBefore(item, previous);
            animateLayout(item, before);
            changed = true;
          }
        }

        if (!changed && next) {
          const rect = next.getBoundingClientRect();
          const threshold = rect.top + rect.height / 2 + hysteresis;
          if (dragCenterY > threshold) {
            const before = snapshotPositions(item);
            list.insertBefore(item, next.nextSibling);
            animateLayout(item, before);
            changed = true;
          }
        }

        return scrollSpeed !== 0 || changed;
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
        event?.preventDefault?.();
        pendingPoint = { clientX, clientY };
        if (!frameId) frameId = requestFrame(drawFrame);
      };

      const releasePoint = event => {
        if (Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)) {
          return { clientX: event.clientX, clientY: event.clientY };
        }
        const touch = event?.changedTouches?.[0];
        if (touch) return { clientX: touch.clientX, clientY: touch.clientY };
        return lastPoint;
      };

      const pointInsideList = point => {
        if (!point) return false;
        const rect = list.getBoundingClientRect();
        const tolerance = 24;
        return point.clientX >= rect.left - tolerance && point.clientX <= rect.right + tolerance &&
          point.clientY >= rect.top - tolerance && point.clientY <= rect.bottom + tolerance;
      };

      const restoreOriginal = () => {
        const before = snapshotPositions(item);
        if (originNextSibling && originNextSibling.parentNode === list) list.insertBefore(item, originNextSibling);
        else list.append(item);
        animateLayout(item, before);
      };

      const onPointerMove = event => {
        if (pointerId !== null && event.pointerId !== pointerId) return;
        if (event.pointerType === 'mouse' && event.buttons === 0) {
          finish({ type: 'pointercancel', pointerId: event.pointerId }, true);
          return;
        }
        queueMove(event.clientX, event.clientY, event);
      };

      const onTouchMove = event => {
        const touch = event.touches[0];
        if (touch) queueMove(touch.clientX, touch.clientY, event);
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
      const onLostPointerCapture = event => {
        if (pointerId !== null && event?.pointerId !== undefined && event.pointerId !== pointerId) return;
        setTimeout(() => {
          if (dragging) finish({ type: 'lostpointercapture' }, true);
        }, 0);
      };

      const removeGlobalListeners = () => {
        window.removeEventListener('pointermove', onPointerMove, true);
        window.removeEventListener('pointerup', finish, true);
        window.removeEventListener('pointercancel', finish, true);
        window.removeEventListener('touchmove', onTouchMove, true);
        window.removeEventListener('touchend', finish, true);
        window.removeEventListener('touchcancel', finish, true);
        window.removeEventListener('blur', onWindowBlur, true);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        document.removeEventListener('keydown', onEscape, true);
        handle.removeEventListener('lostpointercapture', onLostPointerCapture);
      };

      function finish(event, forceCancel = false) {
        if (!dragging) return;
        if (pointerId !== null && event?.pointerId !== undefined && event.pointerId !== pointerId) return;

        if (frameId) {
          cancelFrame(frameId);
          frameId = 0;
        }

        const hardCancel = forceCancel || ['pointercancel', 'touchcancel', 'blur', 'visibilitychange', 'lostpointercapture', 'escape'].includes(event?.type);
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
        pointerId = null;
        lastPoint = null;
        removeGlobalListeners();
        list.classList.remove('is-sorting');
        document.body.classList.remove('drag-reordering');
        handle.setAttribute('aria-pressed', 'false');

        if (changed) persist();

        if (floating && originRect && !hardCancel) {
          const target = item.getBoundingClientRect();
          const dx = target.left - originRect.left;
          const dy = target.top - originRect.top;
          const stale = floating;
          stale.style.transition = 'transform 145ms cubic-bezier(.2,.8,.2,1), opacity 145ms ease';
          stale.style.transform = `translate3d(${dx}px,${dy}px,0) scale(1)`;
          stale.style.opacity = '0.92';
          setTimeout(() => {
            stale.remove();
            if (floating === stale) floating = null;
            item.classList.remove('dragging', 'drag-placeholder');
          }, 165);
        } else {
          floating?.remove();
          floating = null;
          item.classList.remove('dragging', 'drag-placeholder');
        }
      }

      const begin = (clientX, clientY, id, event) => {
        if (dragging) {
          event.preventDefault();
          return;
        }
        if (event.type === 'pointerdown' && event.button !== undefined && event.button !== 0) return;

        event.preventDefault();
        dragging = true;
        pointerId = id ?? null;
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

        if (supportsPointer) {
          try { handle.setPointerCapture?.(id); } catch {}
          handle.addEventListener('lostpointercapture', onLostPointerCapture);
          window.addEventListener('pointermove', onPointerMove, { passive: false, capture: true });
          window.addEventListener('pointerup', finish, true);
          window.addEventListener('pointercancel', finish, true);
        } else {
          window.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
          window.addEventListener('touchend', finish, true);
          window.addEventListener('touchcancel', finish, true);
        }
      };

      if (supportsPointer) {
        handle.addEventListener('pointerdown', event => begin(event.clientX, event.clientY, event.pointerId, event));
      } else {
        handle.addEventListener('touchstart', event => {
          const touch = event.touches[0];
          if (touch) begin(touch.clientX, touch.clientY, null, event);
        }, { passive: false });
      }

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
