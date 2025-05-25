export function renderHeader(root, data) {
  root.getElementById('name').textContent = data.name;
  root.getElementById('title').textContent = data.title;
  root.getElementById('location').textContent = data.location;
  root.getElementById('contacts').innerHTML = `
    <strong>Email:</strong> ${data.email}<br>
    <strong>Phone:</strong> ${data.phone}
  `;
}