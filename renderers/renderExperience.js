export function renderExperience(root, data) {
  const expDiv = root.getElementById('experience');
  if (!expDiv || !data.relevant_experience) return;

  data.relevant_experience.forEach(job => {
    const jobEntry = root.createElement('div');
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
}