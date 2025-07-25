import { CVApplication } from './core/CVApplication.js';
import { HeaderRenderer } from './renderers/HeaderRenderer.js';
import { ProfileRenderer } from './renderers/ProfileRenderer.js';
import { ExperienceRenderer } from './renderers/ExperienceRenderer.js';
import { EducationRenderer } from './renderers/EducationRenderer.js';
import { SkillsRenderer } from './renderers/SkillsRenderer.js';
import { LanguagesRenderer } from './renderers/LanguagesRenderer.js';
import { CertificationsRenderer } from './renderers/CertificationsRenderer.js';
import { SocialLinksRenderer } from './renderers/SocialLinksRenderer.js';
import { InterestsRenderer } from './renderers/InterestsRenderer.js';

// Initialize application
const app = new CVApplication();

// Register all renderers
app.registerRenderer('header', new HeaderRenderer());
app.registerRenderer('socialLinks', new SocialLinksRenderer());
app.registerRenderer('profile', new ProfileRenderer());
app.registerRenderer('experience', new ExperienceRenderer());
app.registerRenderer('education', new EducationRenderer());
app.registerRenderer('certifications', new CertificationsRenderer());
app.registerRenderer('skills', new SkillsRenderer());
app.registerRenderer('languages', new LanguagesRenderer());
app.registerRenderer('interests', new InterestsRenderer());

// Start application
app.initialize(document);