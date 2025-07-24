export function renderSocialLinks(root, data) {
  const socialLinksContainer = root.querySelector('.social-links');
  
  if (data.social && socialLinksContainer) {
    data.social.forEach((link) => {
      const a = root.createElement('a');
      a.href = link.url;
      a.textContent = link.platform;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      socialLinksContainer.appendChild(a);
    });
  }
}