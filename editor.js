import { EditorPage } from './editor/EditorPage.js';

// The editor page's entry (#23): everything it does is in editor/EditorPage.js.
new EditorPage({ document, window, fetch: (...request) => window.fetch(...request) }).start();
