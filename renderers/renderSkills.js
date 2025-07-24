export function renderSkills(root, data) {
  const skillsList = root.getElementById('skills');
  if (!skillsList || !data.skills) return;

  data.skills.forEach(skill => {
    const li = root.createElement('li');
    
    const total = 5;
    const filled = '●'.repeat(skill.level);
    const empty = '○'.repeat(total - skill.level);
    
    li.innerHTML = `
      <span class="skill-name">${skill.name}</span>
      <span class="skill-level">${filled}${empty}</span>
    `;
    skillsList.appendChild(li);
  });
}