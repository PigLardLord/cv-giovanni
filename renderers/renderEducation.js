export function renderEducation(root, data) {
  const eduDiv = root.getElementById('education');
  if (!eduDiv || !data.education) return;

  data.education.forEach(edu => {
    const eduEntry = root.createElement('div');
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
}