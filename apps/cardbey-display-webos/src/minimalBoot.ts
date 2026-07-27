/**
 * Minimal Chrome 68 isolation entry.
 * Enabled only when VITE_MINIMAL_BOOT=true during build.
 */
(function () {
  if (window.__cardbeyBootStage) {
    window.__cardbeyBootStage('APP_ENTRY_EXECUTING', 'minimal');
  }

  var root = document.getElementById('app');
  if (!root) {
    if (window.__cardbeyBootStage) {
      window.__cardbeyBootStage('ROOT_ELEMENT_NOT_FOUND', '#app');
    }
    throw new Error('ROOT_NOT_FOUND');
  }

  if (window.__cardbeyBootStage) {
    window.__cardbeyBootStage('ROOT_FOUND', '#app');
    window.__cardbeyBootStage('MOUNT_STARTED', 'minimal');
  }

  root.innerHTML =
    '<div style="padding:60px;color:white;background:#123;width:100%;height:100%;box-sizing:border-box;">' +
    '<h1>JavaScript bundle executed</h1>' +
    '<p>Chrome 68 compatibility test passed.</p>' +
    '<p>Build: ' +
    String(window.__CARDBEY_BUILD_ID__ || 'unknown') +
    '</p>' +
    '</div>';

  if (window.__cardbeyBootStage) {
    window.__cardbeyBootStage('MOUNT_COMPLETE', 'minimal');
    window.__cardbeyBootStage('MINIMAL_BUNDLE_EXECUTED');
    window.__cardbeyBootStage('SHELL_VISIBLE', 'minimal');
  }

  if (window.__cardbeyBoot && typeof window.__cardbeyBoot.hide === 'function') {
    window.__cardbeyBoot.hide();
  }
})();
