fetch('cv-data.json')
  .then(response => response.json())
  .then(data => {
    document.getElementById('name').textContent = data.name;
    document.getElementById('title').textContent = data.title;
    document.getElementById('location').textContent = data.location;
    document.getElementById('contacts').innerHTML = `<strong>Email:</strong> ${data.email}<br><strong>Phone:</strong> ${data.phone}`;
    document.getElementById('portfolio').href = data.portfolio;

    document.getElementById('profile').textContent = data.profile;

    const expDiv = document.getElementById('experience');
    data.experience.forEach(job => {
      const section = document.createElement('div');
      section.innerHTML = `<strong>${job.title}</strong> – ${job.company} (${job.period})<br><ul>${job.details.map(d => `<li>${d}</li>`).join('')}</ul>`;
      expDiv.appendChild(section);
    });

    const eduDiv = document.getElementById('education');
    data.education.forEach(edu => {
      const section = document.createElement('div');
      section.innerHTML = `<strong>${edu.degree}</strong><br>${edu.school} (${edu.period})`;
      eduDiv.appendChild(section);
    });

    const skillsList = document.getElementById('skills');
    data.skills.forEach(skill => {
      const li = document.createElement('li');
      li.textContent = skill;
      skillsList.appendChild(li);
    });

    const langList = document.getElementById('languages');
    data.languages.forEach(lang => {
      const li = document.createElement('li');
      li.textContent = `${lang.name}: ${lang.level}`;
      langList.appendChild(li);
    });
  });

document.getElementById('download').addEventListener('click', () => {
  import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js').then(jsPDF => {
    const { jsPDF: PDF } = jsPDF;
    const pdf = new PDF();
    pdf.html(document.body, {
      callback: () => {
        pdf.save('Giovanni_Trovato_CV.pdf');
      }
    });
  });
});