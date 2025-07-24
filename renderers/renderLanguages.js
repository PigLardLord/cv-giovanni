export function renderLanguages(root, data) {
  const langList = root.getElementById('languages');
  if (!langList || !data.languages) return;

  data.languages.forEach(lang => {
    const li = root.createElement('li');
    li.innerHTML = `<strong>${lang.name}:</strong> ${lang.level}`;
    langList.appendChild(li);
  });
}