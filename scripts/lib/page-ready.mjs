/**
 * Resolves once the layout has rendered the profile: the layout applied, the language resolved, the
 * candidate's name inside the CV's first element, and the fonts arrived. Text alone was not enough —
 * the masthead holds a static pin before any profile has loaded.
 */
export const rendered = (layout, start, name, locale) => `new Promise((resolve) => {
  const wait = () => {
    const ready =
      document.body.dataset.layout === ${JSON.stringify(layout)} &&
      (document.documentElement.lang || '').startsWith(${JSON.stringify(locale)}) &&
      (document.querySelector(${JSON.stringify(start)})?.textContent || '').includes(${JSON.stringify(name)});
    if (ready) document.fonts.ready.then(() => setTimeout(resolve, 500));
    else setTimeout(wait, 100);
  };
  wait();
})`;

/**
 * Resolves once the page reveals itself. script.js holds the first paint until the CV is in the page and the
 * downloads are offered (#74), so nothing is selected, measured or tabbed to on a page still hidden.
 */
export const revealed = `new Promise((resolve) => {
  const wait = () => (document.body.hasAttribute('data-rendered') ? resolve() : setTimeout(wait, 50));
  wait();
})`;
