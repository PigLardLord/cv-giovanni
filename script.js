import { CVApplication } from './core/CVApplication.js';
import { HeaderRenderer } from './renderers/HeaderRenderer.js';

// Legacy function renderers (temporarily keeping for compatibility)
import { renderSocialLinks } from './renderers/renderSocialLinks.js';
import { renderProfile } from './renderers/renderProfile.js';
import { renderExperience } from './renderers/renderExperience.js';
import { renderEducation } from './renderers/renderEducation.js';
import { renderCertifications } from './renderers/renderCertifications.js';
import { renderSkills } from './renderers/renderSkills.js';
import { renderLanguages } from './renderers/renderLanguages.js';
import { renderInterests } from './renderers/renderInterests.js';

// Legacy renderer wrapper to adapt function renderers to class interface
class LegacyRendererAdapter {
  constructor(renderFunction) {
    this.renderFunction = renderFunction;
  }
  
  render(root, data) {
    this.renderFunction(root, data);
  }
}

// Initialize application
const app = new CVApplication();

// Register renderers
app.registerRenderer('header', new HeaderRenderer());
app.registerRenderer('socialLinks', new LegacyRendererAdapter(renderSocialLinks));
app.registerRenderer('profile', new LegacyRendererAdapter(renderProfile));
app.registerRenderer('experience', new LegacyRendererAdapter(renderExperience));
app.registerRenderer('education', new LegacyRendererAdapter(renderEducation));
app.registerRenderer('certifications', new LegacyRendererAdapter(renderCertifications));
app.registerRenderer('skills', new LegacyRendererAdapter(renderSkills));
app.registerRenderer('languages', new LegacyRendererAdapter(renderLanguages));
app.registerRenderer('interests', new LegacyRendererAdapter(renderInterests));

// Start application
app.initialize(document);