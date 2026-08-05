/*
 * Injects the shared /header.html at the exact point this script is loaded.
 * Uses a synchronous XHR + document.write so the header is in the DOM before
 * the parser continues (this must run as a plain, non-deferred, non-async
 * <script src="/js/include-header.js"> placed where <header> used to live —
 * do not move it to <head> or add async/defer, or the timing breaks).
 *
 * Why not fetch()? fetch() is async, so it would insert the header after
 * jQuery's $(document).ready in main.js has already run and looked for
 * .menu-toggle / .site-nav — the mobile menu button would silently stop
 * working. Synchronous XHR blocks parsing just long enough to avoid that.
 *
 * To change the nav for the whole site, edit /header.html, not this file
 * or any individual page.
 */
(function () {
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/header.html', false);
    xhr.send(null);
    if (xhr.status === 200 || xhr.status === 0) {
      document.write(xhr.responseText);
    } else {
      console.error('include-header.js: failed to load /header.html (status ' + xhr.status + ')');
    }
  } catch (e) {
    console.error('include-header.js: error loading /header.html', e);
  }
})();
