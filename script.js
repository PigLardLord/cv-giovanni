import { renderHeader } from './renderers/renderHeader.js';
import { renderSocialLinks } from './renderers/renderSocialLinks.js';
import { renderProfile } from './renderers/renderProfile.js';
import { renderExperience } from './renderers/renderExperience.js';
import { renderEducation } from './renderers/renderEducation.js';
import { renderCertifications } from './renderers/renderCertifications.js';
import { renderSkills } from './renderers/renderSkills.js';
import { renderLanguages } from './renderers/renderLanguages.js';
import { renderInterests } from './renderers/renderInterests.js';

fetch('cv-data.json')
  .then(response => response.json())
  .then(data => {
    renderHeader(document, data);
    renderSocialLinks(document, data);
    renderProfile(document, data);
    renderExperience(document, data);
    renderEducation(document, data);
    renderCertifications(document, data);
    renderSkills(document, data);
    renderLanguages(document, data);
    renderInterests(document, data);
  })
  .catch(error => {
    console.error('Error loading CV data:', error);
    document.body.innerHTML = '<div style="text-align: center; padding: 50px; color: #666;">Error loading CV data. Please check the console for details.</div>';
  });