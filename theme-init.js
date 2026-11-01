document.documentElement.dataset.theme='dark';
document.documentElement.style.colorScheme='dark';

// WebKit can focus-zoom even with 16px controls after restoring a page.
// Apply the scale hint only to iOS; Safari still permits intentional pinch zoom.
// https://webkit.org/blog/7367/new-interaction-behaviors-in-ios-10/
(() => {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const viewport = document.querySelector('meta[name="viewport"]');
  if (ios && viewport && !/maximum-scale\s*=/.test(viewport.content)) {
    viewport.content += ', maximum-scale=1';
  }
})();
