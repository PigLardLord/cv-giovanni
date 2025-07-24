export function renderProfile(root, data) {
  const profileElement = root.getElementById('profile');
  if (profileElement) {
    profileElement.textContent = data.profile || '';
  }
}