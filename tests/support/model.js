import { CvDocument } from '../../domain/CvDocument.js';

/**
 * Whatever a proxied method returns, bound to the object itself, so a method calling another through
 * `this` never meets the proxy again.
 */
const forward = (target, key) => {
  const value = Reflect.get(target, key);
  return typeof value === 'function' ? value.bind(target) : value;
};

/**
 * A renderer fed the way the page feeds it: the model `CVApplication` builds from the profile, never the
 * profile itself (#81). Tests keep writing profile JSON, the input a person writes.
 * @param {object} renderer - A renderer
 * @returns {object} The same renderer, whose `render` receives `new CvDocument(profile)`
 */
export const fedTheModel = (renderer) =>
  new Proxy(renderer, {
    get: (target, key) =>
      key === 'render'
        ? (root, profile) => target.render(root, new CvDocument(profile))
        : forward(target, key)
  });

/**
 * A layout composing from the model built from the profile a test writes, as `SourceRenderer` hands it.
 * @param {object} layout - A layout with `compose(model, options)`
 * @returns {object} The same layout, whose `compose` receives `new CvDocument(profile)`
 */
export const composingTheModel = (layout) =>
  new Proxy(layout, {
    get: (target, key) =>
      key === 'compose'
        ? (profile, options) => target.compose(new CvDocument(profile), options)
        : forward(target, key)
  });
