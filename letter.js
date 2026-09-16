import { CVApplication } from './core/CVApplication.js';
import { DataLoader } from './core/DataLoader.js';
import { RendererContainer } from './core/RendererContainer.js';
import { LocaleResolver } from './core/LocaleResolver.js';
import { I18nService } from './core/I18nService.js';
import { DocumentLocalizer } from './core/DocumentLocalizer.js';
import { ProfileResolver } from './core/ProfileResolver.js';
import { LayoutResolver } from './core/LayoutResolver.js';
import { LetterContent } from './core/LetterContent.js';
import { ErrorRenderer } from './renderers/ErrorRenderer.js';
import { LetterRenderer } from './renderers/LetterRenderer.js';

/**
 * The cover letter's page (#151): the profile, language and layout the address names, resolved the way
 * `script.js` resolves the CV's, and the letter's words from `LetterContent` written by `LetterRenderer`.
 * `npm run build:pdf` prints it with a headless Chrome once `data-rendered` is set, beside the CV.
 */
const reveal = async () => {
  void document.body.offsetHeight;
  await document.fonts.ready;
  document.body.dataset.rendered = '';
};

const profiles = new ProfileResolver();
const manifest = await profiles.loadManifest().catch((error) => error);
const locale = new LocaleResolver().resolve({
  search: location.search,
  stored: localStorage.getItem('cv-locale'),
  browserLanguages: navigator.languages,
  published: manifest instanceof Error ? null : profiles.publishedLocales(manifest, location.search)
});
const i18n = await new I18nService().initialize(locale);
const localizer = new DocumentLocalizer(i18n);
// The letter takes the layout of the CV it travels with: the typeface of the name follows it.
const layout = new LayoutResolver().resolve(location.search);
document.body.dataset.layout = layout;

let selection;
try {
  if (manifest instanceof Error) throw manifest;
  selection = profiles.resolve(manifest, { search: location.search, locale });
} catch (error) {
  localizer.apply(document);
  new CVApplication(undefined, undefined, localizer, i18n).handleError(document, error);
  await reveal();
  throw error;
}

const app = new CVApplication(
  new DataLoader(selection.dataUrl),
  new RendererContainer(),
  localizer,
  i18n,
  new ErrorRenderer(),
  (data) => LetterContent.of(data, { t: (key, values) => i18n.t(key, values), locale })
);
app.registerRenderer('letter', new LetterRenderer());
await app.initialize(document);
await reveal();
