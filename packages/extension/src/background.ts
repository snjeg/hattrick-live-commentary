/**
 * MV3 service worker. It sleeps and cannot play audio, so it only opens (or focuses) the
 * extension page, which does the polling, speaking and mixing.
 */
import { openOrFocusPage } from './open-page.js';

chrome.action.onClicked.addListener(() => {
  void openOrFocusPage(chrome);
});
