import { CVApplication } from './core/CVApplication.js';
import { DataLoader } from './core/DataLoader.js';
import { RendererContainer } from './core/RendererContainer.js';
import { LocaleResolver } from './core/LocaleResolver.js';
import { I18nService } from './core/I18nService.js';
import { DocumentLocalizer } from './core/DocumentLocalizer.js';
import { ProfileResolver } from './core/ProfileResolver.js';
import { HeaderRenderer } from './renderers/HeaderRenderer.js';
import { ProfileRenderer } from './renderers/ProfileRenderer.js';
import { ExperienceRenderer } from './renderers/ExperienceRenderer.js';
import { EducationRenderer } from './renderers/EducationRenderer.js';
import { SkillsRenderer } from './renderers/SkillsRenderer.js';
import { LanguagesRenderer } from './renderers/LanguagesRenderer.js';
import { CertificationsRenderer } from './renderers/CertificationsRenderer.js';
import { SocialLinksRenderer } from './renderers/SocialLinksRenderer.js';
import { InterestsRenderer } from './renderers/InterestsRenderer.js';

const resolver = new LocaleResolver();
const locale = resolver.resolve({
  search: location.search,
  stored: localStorage.getItem('cv-locale'),
  browserLanguages: navigator.languages
});
const i18n = await new I18nService().initialize(locale);
const localizer = new DocumentLocalizer(i18n);
let profileSelection;
try {
  profileSelection = await new ProfileResolver().resolveRequested({
    search: location.search,
    locale
  });
} catch (error) {
  localizer.apply(document);
  new CVApplication(undefined, undefined, localizer, i18n).handleError(document, error);
  throw error;
}
const app = new CVApplication(
  new DataLoader(profileSelection.dataUrl), new RendererContainer(), localizer, i18n
);

// Register all renderers
app.registerRenderer('header', new HeaderRenderer());
app.registerRenderer('socialLinks', new SocialLinksRenderer());
app.registerRenderer('profile', new ProfileRenderer());
app.registerRenderer('experience', new ExperienceRenderer(i18n));
app.registerRenderer('education', new EducationRenderer());
app.registerRenderer('certifications', new CertificationsRenderer());
app.registerRenderer('skills', new SkillsRenderer());
app.registerRenderer('languages', new LanguagesRenderer());
app.registerRenderer('interests', new InterestsRenderer());

// Start application
app.initialize(document);

window.cvApp = app;
window.cvI18n = i18n;
window.cvSelection = profileSelection;
