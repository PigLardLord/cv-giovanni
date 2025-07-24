import { renderHeader } from './renderers/renderHeader.js';
import { renderSocialLinks } from './renderers/renderSocialLinks.js';

fetch('cv-data.json')
  .then(response => response.json())
  .then(data => {
    renderHeader(document, data);
    renderSocialLinks(document, data);

    // Render profile summary
    document.getElementById('profile').textContent = data.profile;

    // Render experience section
    const expDiv = document.getElementById('experience');
    data.relevant_experience.forEach(job => {
      const jobEntry = document.createElement('div');
      jobEntry.classList.add('job-entry');
      
      jobEntry.innerHTML = `
        <div class="job-header">
          <span class="job-title">${job.title}</span> at 
          <span class="job-company">${job.company}</span>, ${job.location}
        </div>
        <div class="job-period">${job.period}</div>
        <p class="job-description">${job.description}</p>
      `;
      expDiv.appendChild(jobEntry);
    });

    // Render education section
    const eduDiv = document.getElementById('education');
    data.education.forEach(edu => {
      const eduEntry = document.createElement('div');
      eduEntry.classList.add('edu-entry');
      
      eduEntry.innerHTML = `
        <div class="edu-degree">${edu.degree}</div>
        <div>
          <span class="edu-school">${edu.school}</span> 
          <span class="edu-period">(${edu.period})</span>
        </div>
        <p class="edu-description">${edu.description}</p>
      `;
      eduDiv.appendChild(eduEntry);
    });

    // Render certifications
    const certList = document.getElementById('certifications');
    data.certifications.forEach(cert => {
      const li = document.createElement('li');
      let certHTML = '';
      
      if (cert.url) {
        certHTML += `<a href="${cert.url}" target="_blank" rel="noopener noreferrer"><strong>${cert.name}</strong></a>`;
      } else {
        certHTML += `<strong>${cert.name}</strong>`;
      }
      
      certHTML += ` – ${cert.issuer} (${cert.year})`;
      
      if (cert.description) {
        certHTML += `<span class="cert-description">${cert.description}</span>`;
      }
      
      li.innerHTML = certHTML;
      certList.appendChild(li);
    });

    // Render skills with improved layout
    const skillsList = document.getElementById('skills');
    data.skills.forEach(skill => {
      const li = document.createElement('li');
      
      const total = 5;
      const filled = '●'.repeat(skill.level);
      const empty = '○'.repeat(total - skill.level);
      
      li.innerHTML = `
        <span class="skill-name">${skill.name}</span>
        <span class="skill-level">${filled}${empty}</span>
      `;
      skillsList.appendChild(li);
    });

    // Render languages
    const langList = document.getElementById('languages');
    data.languages.forEach(lang => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${lang.name}:</strong> ${lang.level}`;
      langList.appendChild(li);
    });

    // Render interests as tags
    const interestContainer = document.getElementById('interests');
    data.interests.forEach(interest => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = interest;
      interestContainer.appendChild(tag);
    });
  })
  .catch(error => {
    console.error('Error loading CV data:', error);
    document.body.innerHTML = '<div style="text-align: center; padding: 50px; color: #666;">Error loading CV data. Please check the console for details.</div>';
  });