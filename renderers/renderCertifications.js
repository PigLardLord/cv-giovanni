export function renderCertifications(root, data) {
  const certList = root.getElementById('certifications');
  if (!certList || !data.certifications) return;

  data.certifications.forEach(cert => {
    const li = root.createElement('li');
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
}