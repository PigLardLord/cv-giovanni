import { renderHeader } from './renderers/renderHeader.js';

fetch('cv-data.json')
  .then(response => response.json())
  .then(data => {
    renderHeader(document, data);

    const socialLinks = document.querySelector('.social-links');
    if (data.social && socialLinks) {
      data.social.forEach(link => {
        const a = document.createElement('a');
        a.href = link.url;
        a.textContent = `${link.platform}: ${link.url}`;
        a.target = '_blank';
        socialLinks.appendChild(a);
        socialLinks.appendChild(document.createElement('br'));
      });
    }

    document.getElementById('profile').textContent = data.profile;

    const expDiv = document.getElementById('experience');
    data.relevant_experience.forEach(job => {
      const section = document.createElement('div');
      section.classList.add('job-entry');
      section.innerHTML = `
        <strong>${job.title}</strong> at ${job.company}, ${job.location}<br>
        <em>${job.period}</em>
        <p class="job-description">${job.description}</p>
      `;
      expDiv.appendChild(section);
    });

    const eduDiv = document.getElementById('education');
    data.education.forEach(edu => {
      const section = document.createElement('div');
      section.innerHTML = `<strong>${edu.degree}</strong><br>${edu.school} (${edu.period})<br><p class="edu-description">${edu.description}</p>`;      
      eduDiv.appendChild(section);
    });

    const skillsList = document.getElementById('skills');
    data.skills.forEach(skill => {
        const li = document.createElement('li');
      
        const total = 5;
        const filled = '●'.repeat(skill.level);
        const empty = '○'.repeat(total - skill.level);
      
        li.innerHTML = `<strong>${skill.name}:</strong> <span class="skill-level">${filled}${empty}</span>`;
        skillsList.appendChild(li);
      });

    const langList = document.getElementById('languages');
    data.languages.forEach(lang => {
      const li = document.createElement('li');
      li.textContent = `${lang.name}: ${lang.level}`;
      langList.appendChild(li);
    });

    const interestContainer = document.getElementById('interests');
    data.interests.forEach(interest => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = interest;
      interestContainer.appendChild(tag);
    });
    const certList = document.getElementById('certifications');
    data.certifications.forEach(cert => {
      const li = document.createElement('li');
      let certHTML = '';
      if (cert.url) {
        certHTML += `<a href="${cert.url}" target="_blank"><strong>${cert.name}</strong></a>`;
      } else {
        certHTML += `<strong>${cert.name}</strong>`;
      }
      certHTML += ` – ${cert.issuer} (${cert.year})`;
      if (cert.description) {
        certHTML += `<br><span class="cert-description">${cert.description}</span>`;
      }
      li.innerHTML = certHTML;
      certList.appendChild(li);
    });
  });

  const socialLinks = document.querySelector('.social-links');
  if (data.social && socialLinks) {
    data.social.forEach(link => {
      const a = document.createElement('a');
      a.href = link.url;
      a.textContent = link.platform;
      a.target = '_blank';
      socialLinks.appendChild(a);

      if (link !== data.social[data.social.length - 1]) {
        const separator = document.createTextNode(' · ');
        socialLinks.appendChild(separator);
      }
    });
  }
  
  