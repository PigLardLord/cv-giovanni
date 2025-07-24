export function renderInterests(root, data) {
  const interestContainer = root.getElementById('interests');
  if (!interestContainer || !data.interests) return;

  data.interests.forEach(interest => {
    const tag = root.createElement('span');
    tag.className = 'tag';
    tag.textContent = interest;
    interestContainer.appendChild(tag);
  });
}