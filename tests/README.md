# Custom target amount tests

Run from the extension's `tests` directory:

```sh
node controller-tests.cjs
node panel-tests.cjs
node browser-tests.cjs
```

Each accepts an optional source path as its first argument. Default source is `../content.js`; while tests are outside the extension directory the development fallback is `../jd-helper-custom/content.js`.

`controller-tests.cjs` executes the actual money functions, actual `rowOf` parsing and actual controller in Node's VM. Table discovery / DOM traversal / layout are stubbed. Synthetic reduction inputs use a prototype property setter and input/change events; their displayed amounts are recomputed in integer cents. This verifies controller and money behavior; it is not a real DOM or browser test.

`panel-tests.cjs` executes the actual `mountPanel`, `render` and event handlers with a minimal document/element/event stub. It verifies target input, ±0.01 buttons, disabled states, dynamic preview and action-time rereading of the input. It does not verify CSS or actual browser layout.

`browser-tests.cjs` is a prepared synthetic HTML browser fixture suite for the complete content script (same table, split header/body, hidden repeated header, and display:contents role rows). Requires an existing Playwright Chromium binary and Playwright installation. It reports missing browser binaries separately and does not download them. In the supplied test environment this suite was **not executed**, because Chromium is absent.

No live Jingmai account, order, website, or API is contacted. Results from the suites are written in this directory.
